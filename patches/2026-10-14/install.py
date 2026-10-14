#!/usr/bin/env python3
"""Install the reviewed app patches and align only the currently selected account.

Application backups contain code only. Credential rollback snapshots stay in
memory; no token, account identity or machine identifier is printed or logged.
"""
import argparse
import base64
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / 'install-manifest.json'
def tools_app():
    return Path(json.loads(MANIFEST.read_text())['tools_app'])


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_optional(path):
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


def object_json(path):
    data = read_optional(path)
    if data is None:
        return {}
    value = json.loads(data)
    if not isinstance(value, dict):
        raise RuntimeError('共享账号配置不是 JSON 对象，停止以保留原数据')
    return value


def token_subject(token):
    if not isinstance(token, str):
        return None, None
    try:
        value = token.rsplit('::', 1)[-1]
        segment = value.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(segment + '=' * (-len(segment) % 4)))
        if not isinstance(claims, dict):
            return None, None
        return claims.get('sub'), claims.get('exp')
    except (ValueError, IndexError, TypeError):
        return None, None


def text(value):
    return value.decode('utf-8') if isinstance(value, bytes) else value


def uuid(seed):
    digits = list(hashlib.sha256(seed.encode()).hexdigest()[:32])
    digits[12] = '4'
    digits[16] = format((int(digits[16], 16) & 3) | 8, 'x')
    value = ''.join(digits)
    return '-'.join((value[:8], value[8:12], value[12:16], value[16:20], value[20:]))


def account_plan(home):
    """Read a consistent local snapshot; refuse an unknown account choice."""
    data = home / 'Library/Application Support/Cursor'
    state_path = data / 'User/globalStorage/state.vscdb'
    tools_path = home / 'Library/Application Support/cursor-pro-tools/accounts.db'
    with closing(sqlite3.connect(state_path.as_uri() + '?mode=ro', uri=True)) as cursor:
        keys = ['cursorAuth/accessToken', 'cursorAuth/refreshToken', 'cursorAuth/cachedEmail', 'WorkosCursorSessionToken']
        values = {key: text(value) for key, value in cursor.execute(
            'SELECT key,value FROM ItemTable WHERE key IN (?,?,?,?)', keys)}
    with closing(sqlite3.connect(tools_path.as_uri() + '?mode=ro', uri=True)) as tools:
        tools.row_factory = sqlite3.Row
        accounts = tools.execute('SELECT id,email,access_token,session_token,machine_id FROM accounts WHERE is_current=1').fetchall()
        row = tools.execute("SELECT value FROM config WHERE key='seamless.currentAccountId'").fetchone()
    if len(accounts) != 1 or row is None or accounts[0]['id'] != row['value']:
        raise RuntimeError('ProTools 当前账号选择不明确；停止，未选择其它账号')
    selected = accounts[0]
    access = values.get('cursorAuth/accessToken') or ''
    refresh = values.get('cursorAuth/refreshToken') or ''
    current_subject, expires = token_subject(access)
    selected_subject, _ = token_subject(selected['access_token'] or selected['session_token'] or '')
    if not current_subject or current_subject != selected_subject:
        raise RuntimeError('Cursor 数据库与 ProTools 当前选中账号不一致；停止，避免同步错账号')
    if not isinstance(expires, (float, int)) or expires <= time.time():
        raise RuntimeError('当前凭证过期或有效期未知；请先在修复后的 ProTools 使用当前账号登录')
    if not refresh:
        raise RuntimeError('当前账号缺少 refreshToken；停止，避免借用旧账号凭证')
    refresh_subject, _ = token_subject(refresh)
    if refresh_subject and refresh_subject != current_subject:
        raise RuntimeError('当前 refreshToken 属于其它账号；停止，需在修复后的入口重新登录')
    email = values.get('cursorAuth/cachedEmail') or ''
    if not email or email.lower() != selected['email'].lower():
        raise RuntimeError('当前账号邮箱元数据不一致；停止以保留原状态')
    renewal = home / '.cursor-renewal'
    state = object_json(renewal / 'seamless_state.json')
    override = object_json(renewal / 'machine_id_override')
    storage = object_json(data / 'User/globalStorage/storage.json')
    machine = selected['machine_id'] or storage.get('telemetry.machineId')
    if not isinstance(machine, str) or not machine:
        raise RuntimeError('当前账号机器标识未知；停止，不生成新的标识')
    target = {'machineId': machine, 'macMachineId': uuid('mac:' + machine),
              'devDeviceId': uuid('dev:' + machine), 'sqmId': '{' + uuid('sqm:' + machine).upper() + '}'}
    mappings = override.get('mappings', [])
    if not isinstance(mappings, list):
        raise RuntimeError('机器映射格式未知；停止以保留原数据')
    selected_mappings = {}
    for key, new in target.items():
        old = storage.get('telemetry.' + key)
        if not old:
            continue
        if old in selected_mappings and selected_mappings[old] != new:
            raise RuntimeError('机器映射身份冲突；停止，避免使用不明确的映射')
        selected_mappings[old] = new
    preserved = [item for item in mappings if not isinstance(item, dict) or item.get('old') not in selected_mappings]
    preserved.extend({'old': old, 'new': new} for old, new in selected_mappings.items() if old != new)
    override.update(machineId=target['machineId'], macMachineId=target['macMachineId'], mappings=preserved[-200:])
    state.update(accessToken=access, refreshToken=refresh, email=email, is_new=False, machineIds=target)
    payloads = {
        renewal / 'active_token': access.encode(),
        renewal / 'seamless_state.json': (json.dumps(state, ensure_ascii=False, indent=1) + '\n').encode(),
        renewal / 'machine_id_override': (json.dumps(override, ensure_ascii=False, indent=1) + '\n').encode(),
        data / 'wx_mid.json': (json.dumps({'machineId': target['machineId'], 'macMachineId': target['macMachineId']}, indent=1) + '\n').encode(),
    }
    current_session = values.get('WorkosCursorSessionToken')
    session_subject, _ = token_subject(current_session or '')
    session_change = bool(session_subject and session_subject != current_subject)
    replacement_session = selected['session_token']
    replacement_subject, _ = token_subject(replacement_session or '')
    if replacement_subject != current_subject:
        replacement_session = None
    return {'payloads': payloads, 'state_path': state_path, 'access': access,
            'session_change': session_change, 'old_session_present': 'WorkosCursorSessionToken' in values,
            'old_session': current_session, 'new_session': replacement_session}


def atomic_write(path, data, private=False):
    if path.is_symlink():
        raise RuntimeError('目标是符号链接，停止以保留调用者路径语义')
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = 0o600 if private else stat.S_IMODE(path.stat().st_mode)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.repair-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_session(plan, restoring=False):
    if not plan['session_change']:
        return
    with closing(sqlite3.connect(plan['state_path'])) as cursor, cursor:
        if restoring:
            value = plan['old_session']
            exists = plan['old_session_present']
        else:
            value = plan['new_session']
            exists = value is not None
        if exists:
            cursor.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)', ('WorkosCursorSessionToken', value))
        else:
            cursor.execute('DELETE FROM ItemTable WHERE key=?', ('WorkosCursorSessionToken',))


def synchronize(plan):
    originals = {path: read_optional(path) for path in plan['payloads']}
    completed = []
    try:
        for path, data in plan['payloads'].items():
            atomic_write(path, data, private=True)
            completed.append(path)
        write_session(plan)
        with closing(sqlite3.connect(plan['state_path'].as_uri() + '?mode=ro', uri=True)) as cursor:
            actual = text(cursor.execute("SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken'").fetchone()[0])
        if actual != plan['access'] or any(path.read_bytes() != data for path, data in plan['payloads'].items()):
            raise RuntimeError('账号状态写入后核对失败')
    except BaseException:
        failures = []
        for path in reversed(completed):
            try:
                if originals[path] is None:
                    path.unlink(missing_ok=True)
                else:
                    atomic_write(path, originals[path], private=True)
            except OSError:
                failures.append(path.name)
        try:
            write_session(plan, restoring=True)
        except sqlite3.Error:
            failures.append('session')
        if failures:
            raise RuntimeError('账号回退未完成：' + ', '.join(failures))
        raise


def stopped():
    running = []
    for name in ('Cursor', 'CursorProTools'):
        result = subprocess.run(['/usr/bin/pgrep', '-x', name], capture_output=True)
        if result.returncode == 0:
            running.append(name)
    if running:
        raise RuntimeError('请先完全退出 ' + '、'.join(running) + '，再运行安装；关闭窗口不等于退出应用')


def install():
    stopped()
    manifest = json.loads(MANIFEST.read_text())
    targets = manifest['targets']
    already_installed = all(sha(Path(row['path']).read_bytes()) == row['patched_sha256'] for row in targets)
    if already_installed:
        try:
            current_plan = account_plan(Path.home())
        except Exception:
            current_plan = None
        aligned = current_plan is not None
        if aligned:
            synchronize(current_plan)
        print(json.dumps({'status': 'already_installed' if aligned else 'already_installed_needs_login', 'current_account_sources_aligned': aligned,
                          'next_action': None if aligned else '在 ProTools 选择目标账号重新登录',
                          'server_entitlement_or_model_request': 'not tested'}))
        return
    for row in targets:
        path = Path(row['path'])
        if sha(path.read_bytes()) != row['original_sha256']:
            raise RuntimeError('安装基线已改变：' + row['name'] + '；停止以避免覆盖其他修改')
        if sha((ROOT / row['staged']).read_bytes()) != row['patched_sha256']:
            raise RuntimeError('修改副本校验失败：' + row['name'])
    # Unknown credentials must not prevent installation of the code that repairs
    # login. They do prevent any automatic account choice or private state write.
    try:
        plan = account_plan(Path.home())
    except Exception:
        plan = None
    signature = subprocess.run(['/usr/bin/codesign', '-dv', '--verbose=2', str(tools_app())], capture_output=True, text=True)
    if 'Signature=adhoc' not in signature.stderr:
        raise RuntimeError('应用签名类型已改变；停止，保留现有签名策略')
    backup = ROOT / ('backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    originals = []
    for row in targets:
        path = Path(row['path'])
        destination = backup / (row['name'] + '.original')
        shutil.copy2(path, destination)
        originals.append((path, destination))
    for index, name in enumerate(manifest['signature_backups']):
        path = Path(name)
        destination = backup / ('signature-' + str(index) + '.original')
        shutil.copy2(path, destination)
        originals.append((path, destination))
    try:
        for row in targets:
            atomic_write(Path(row['path']), (ROOT / row['staged']).read_bytes())
        subprocess.run(['/usr/bin/codesign', '--force', '--timestamp=none', '--sign', '-', str(tools_app())], check=True)
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(tools_app())], check=True)
        for row in targets:
            if sha(Path(row['path']).read_bytes()) != row['patched_sha256']:
                raise RuntimeError('应用安装后哈希不匹配：' + row['name'])
        if plan is not None:
            synchronize(plan)
    except BaseException:
        failures = []
        for path, destination in reversed(originals):
            try:
                atomic_write(path, destination.read_bytes())
            except OSError:
                failures.append(path.name)
        if failures:
            raise RuntimeError('应用回退未完成，备份仍保留于 ' + str(backup) + '；失败项：' + ', '.join(failures))
        raise
    audit = {'status': 'installed' if plan is not None else 'installed_needs_login', 'application_targets_verified': len(targets),
             'current_account_sources_aligned': plan is not None, 'backup_directory': str(backup),
             'next_action': None if plan is not None else '在 ProTools 选择目标账号重新登录',
             'restore_files': [{'path': str(path), 'backup': str(destination),
                                'installed_sha256': sha(path.read_bytes())} for path, destination in originals],
             'server_entitlement_or_model_request': 'not tested'}
    (ROOT / 'installed.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps(audit, ensure_ascii=False))


def restore():
    stopped()
    audit = json.loads((ROOT / 'installed.json').read_text())
    files = audit['restore_files']
    for row in files:
        if sha(Path(row['path']).read_bytes()) != row['installed_sha256']:
            raise RuntimeError('安装后应用已发生其他变化；停止恢复，避免覆盖更新')
    for row in reversed(files):
        atomic_write(Path(row['path']), Path(row['backup']).read_bytes())
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(tools_app())], check=True)
    print(json.dumps({'status': 'code_restored', 'account_credentials': 'left at current selected account'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['install', 'check', 'restore'])
    args = parser.parse_args()
    try:
        if args.operation == 'install':
            install()
        elif args.operation == 'restore':
            restore()
        else:
            plan = account_plan(Path.home())
            print(json.dumps({'identity_preflight': 'passed', 'private_files_to_align': len(plan['payloads']),
                              'legacy_session_needs_update': plan['session_change'], 'writes_performed': False}))
    except Exception as error:
        parser.exit(1, str(error) + '\n')
