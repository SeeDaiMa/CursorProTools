#!/usr/bin/env python3
"""Install code-only ProTools optimization; no Cursor/credential/config writes."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def stopped():
    if subprocess.run(['/usr/bin/pgrep', '-x', 'CursorProTools'], capture_output=True).returncode == 0:
        raise RuntimeError('请先完全退出 CursorProTools；仅关闭窗口不会退出')


def atomic(path, data):
    if path.is_symlink():
        raise RuntimeError('目标是符号链接，拒绝改变路径语义')
    mode = stat.S_IMODE(path.stat().st_mode)
    descriptor, temporary = tempfile.mkstemp(prefix='.' + path.name + '.lightweight-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as file:
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install():
    stopped()
    manifest = json.loads((ROOT / 'install-manifest.json').read_text())
    app = Path(manifest['app'])
    rows = manifest['targets']
    if all(sha(Path(row['path']).read_bytes()) == row['patched_sha256'] for row in rows):
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)], check=True)
        print(json.dumps({'status': 'already_installed', 'account_or_cursor_writes': False}))
        return
    for row in rows:
        if sha(Path(row['path']).read_bytes()) != row['original_sha256']:
            raise RuntimeError('应用基线已改变；停止以避免覆盖其它修改')
        if sha((ROOT / row['staged']).read_bytes()) != row['patched_sha256']:
            raise RuntimeError('优化副本哈希不匹配')
    signature = subprocess.run(['/usr/bin/codesign', '-dv', '--verbose=2', str(app)], capture_output=True, text=True)
    if 'Signature=adhoc' not in signature.stderr:
        raise RuntimeError('签名类型发生变化；停止以保留原签名策略')
    backup = ROOT / ('backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(mode=0o700)
    files = [Path(row['path']) for row in rows] + [Path(name) for name in manifest['signature_files']]
    snapshots = []
    for index, path in enumerate(files):
        destination = backup / (str(index) + '.original')
        shutil.copy2(path, destination)
        snapshots.append({'path': str(path), 'backup': str(destination)})
    completed = []
    try:
        for row in rows:
            atomic(Path(row['path']), (ROOT / row['staged']).read_bytes())
            completed.append(Path(row['path']))
        subprocess.run(['/usr/bin/codesign', '--force', '--timestamp=none', '--sign', '-', str(app)], check=True)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)], check=True)
        for row in rows:
            if sha(Path(row['path']).read_bytes()) != row['patched_sha256']:
                raise RuntimeError('安装后应用代码哈希不匹配')
    except BaseException:
        failures = []
        for row in reversed(snapshots):
            path = Path(row['path'])
            if path not in completed and path not in [Path(name) for name in manifest['signature_files']]:
                continue
            try:
                if path.read_bytes() != Path(row['backup']).read_bytes():
                    atomic(path, Path(row['backup']).read_bytes())
            except OSError:
                failures.append(path.name)
        if failures:
            raise RuntimeError('回退未完成；保留备份：' + str(backup) + '；失败：' + ', '.join(failures))
        raise
    for row in snapshots:
        row['installed_sha256'] = sha(Path(row['path']).read_bytes())
    audit = {'status': 'installed', 'app': str(app), 'restore_files': snapshots, 'backup': str(backup),
             'account_or_cursor_writes': False}
    (ROOT / 'installed.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps(audit))


def restore():
    stopped()
    audit = json.loads((ROOT / 'installed.json').read_text())
    for row in audit['restore_files']:
        if sha(Path(row['path']).read_bytes()) != row['installed_sha256']:
            raise RuntimeError('安装后已有其它修改；停止恢复')
    for row in reversed(audit['restore_files']):
        atomic(Path(row['path']), Path(row['backup']).read_bytes())
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', audit['app']], check=True)
    print(json.dumps({'status': 'restored', 'account_or_cursor_writes': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['install', 'restore'])
    args = parser.parse_args()
    try:
        install() if args.operation == 'install' else restore()
    except Exception as error:
        parser.exit(1, str(error) + '\n')
