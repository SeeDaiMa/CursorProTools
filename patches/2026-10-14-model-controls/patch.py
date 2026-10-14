#!/usr/bin/env python3
"""Prepare/install/restore exact Cursor UI patches; never read account data."""
import argparse
import base64
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
GLASS = 'out/vs/workbench/workbench.glass.main.js'
CHECKSUM = 'vs/workbench/workbench.glass.main.js'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def spec(name):
    return json.loads((ROOT / 'manifests' / (name + '.json')).read_text())


def transform(data, patch, reverse=False):
    expected = patch['patchedSha256' if reverse else 'originalSha256']
    wanted = patch['originalSha256' if reverse else 'patchedSha256']
    if digest(data) != expected:
        raise RuntimeError('Unknown input for ' + patch['scope'] + '; refusing to overwrite')
    text = data.decode('utf-8')
    for change in reversed(patch['changes']) if reverse else patch['changes']:
        old, new = (change['new'], change['old']) if reverse else (change['old'], change['new'])
        if text.count(old) != 1:
            raise RuntimeError('Ambiguous source boundary: ' + change['label'])
        text = text.replace(old, new, 1)
    result = text.encode('utf-8')
    if digest(result) != wanted:
        raise RuntimeError('Output digest mismatch: ' + patch['scope'])
    return result


def stages(data):
    errors, maximum = spec('model-errors'), spec('max-visibility')
    current = digest(data)
    if current == maximum['patchedSha256']:
        intermediate = transform(data, maximum, reverse=True)
        original = transform(intermediate, errors, reverse=True)
    elif current == errors['patchedSha256']:
        intermediate = data
        original = transform(data, errors, reverse=True)
    elif current == errors['originalSha256']:
        original = data
        intermediate = transform(data, errors)
    else:
        raise RuntimeError('Unknown Cursor Agents baseline; no files changed')
    return original, intermediate, transform(intermediate, maximum)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def regular(path):
    if path.is_symlink() or not path.is_file():
        raise RuntimeError('Expected a regular non-symlink file: ' + str(path))
    return path.read_bytes()


def prepare(cursor_app, output):
    app = cursor_app.resolve() / 'Contents/Resources/app'
    if json.loads(regular(app / 'package.json'))['version'] != '3.17.19':
        raise RuntimeError('This patch supports Cursor 3.17.19 only')
    if output.exists():
        raise RuntimeError('Output already exists; choose another --output to preserve backups')
    glass_path, product_path = app / GLASS, app / 'product.json'
    glass, product = regular(glass_path), regular(product_path)
    before, middle, final = stages(glass)
    config = json.loads(product)
    checksums = config.get('checksums')
    if not isinstance(checksums, dict) or CHECKSUM not in checksums:
        raise RuntimeError('Expected the existing Agents checksum entry')
    checksums[CHECKSUM] = base64.b64encode(hashlib.sha256(final).digest()).decode().rstrip('=')
    patched_product = (json.dumps(config, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    output.mkdir(parents=True)
    for name, data in [('agents-original.js', glass), ('agents-patched.js', final),
                       ('product-original.json', product), ('product-patched.json', patched_product)]:
        (output / name).write_bytes(data)
    targets = []
    for path, original, patched in [(glass_path, 'agents-original.js', 'agents-patched.js'),
                                    (product_path, 'product-original.json', 'product-patched.json')]:
        targets.append({'path': str(path), 'original': original, 'patched': patched,
                        'original_sha256': digest((output / original).read_bytes()),
                        'patched_sha256': digest((output / patched).read_bytes())})
    write_json(output / 'manifest.json', {'version': '3.17.19', 'targets': targets,
               'prepared_at': datetime.now(timezone.utc).isoformat(),
               'account_data_read_or_written': False})
    # Test inputs are generated locally; complete vendor bundles stay out of Git
    # and the public ZIP. These are only inert replay inputs, never executed whole.
    for name, original, patched in [('model-errors', before, middle), ('max-visibility', middle, final)]:
        directory = output / name
        shutil.copytree(ROOT / 'tests/support' / name, directory)
        (directory / 'agents-original.js').write_bytes(original)
        (directory / 'agents-patched.js').write_bytes(patched)
        if name == 'max-visibility':
            for label, data in [('original', original), ('patched', patched)]:
                source = data.decode('utf-8')
                start = source.index('function zMg(')
                end = source.index('var qMg,GMg', start)
                (directory / ('picker-' + label + '.js')).write_text(source[start:end])
    print(json.dumps({'status': 'prepared', 'directory': str(output.resolve()),
                      'files_to_update': [str(row['path']) for row in targets],
                      'already_patched': digest(glass) == digest(final),
                      'account_data_read_or_written': False}))


def stopped():
    if subprocess.run(['/usr/bin/pgrep', '-x', 'Cursor'], capture_output=True).returncode == 0:
        raise RuntimeError('Save your work and fully quit Cursor before installing or restoring')


def atomic_write(path, data):
    regular(path)
    mode = stat.S_IMODE(path.stat().st_mode)
    descriptor, temporary = tempfile.mkstemp(prefix='.' + path.name + '.model-controls-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def apply(directory, restoring=False):
    stopped()
    manifest = json.loads((directory / 'manifest.json').read_text())
    rows = manifest['targets']
    if len(rows) != 2 or Path(rows[0]['path']).name != 'workbench.glass.main.js' or Path(rows[1]['path']).name != 'product.json':
        raise RuntimeError('Unrecognized target set; refusing to write')
    expected = 'patched_sha256' if restoring else 'original_sha256'
    wanted = 'original_sha256' if restoring else 'patched_sha256'
    output = 'original' if restoring else 'patched'
    current = [regular(Path(row['path'])) for row in rows]
    if all(digest(data) == row[wanted] for row, data in zip(rows, current)):
        print(json.dumps({'status': 'already_restored' if restoring else 'already_installed'}))
        return
    for row, data in zip(rows, current):
        if digest(data) != row[expected]:
            raise RuntimeError('Target changed after preparation: ' + row['path'])
        if digest(regular(directory / row[output])) != row[wanted]:
            raise RuntimeError('Prepared file changed: ' + row[output])
    completed = []
    try:
        for row, data in zip(rows, current):
            path = Path(row['path'])
            atomic_write(path, regular(directory / row[output]))
            completed.append((path, data))
        for row in rows:
            if digest(regular(Path(row['path']))) != row[wanted]:
                raise RuntimeError('Post-write verification failed: ' + row['path'])
    except BaseException as failure:
        failed_cleanup = []
        for path, data in reversed(completed):
            try:
                atomic_write(path, data)
            except OSError:
                failed_cleanup.append(str(path))
        if failed_cleanup:
            raise RuntimeError('Rollback incomplete; preserve ' + str(directory) + '; paths: ' + ', '.join(failed_cleanup)) from failure
        raise
    print(json.dumps({'status': 'restored' if restoring else 'installed',
                      'backup_directory': str(directory.resolve()),
                      'account_data_read_or_written': False,
                      'next_action': 'Reopen Cursor and inspect MAX Mode'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['prepare', 'install', 'restore'])
    parser.add_argument('directory', nargs='?', type=Path)
    parser.add_argument('--cursor-app', type=Path, default=Path('/Applications/Cursor.app'))
    parser.add_argument('--output', type=Path, default=ROOT / 'build')
    arguments = parser.parse_args()
    try:
        if arguments.operation == 'prepare':
            prepare(arguments.cursor_app, arguments.output)
        elif arguments.directory is None:
            parser.error('install and restore require the prepared directory')
        else:
            apply(arguments.directory, arguments.operation == 'restore')
    except Exception as error:
        parser.exit(1, str(error) + '\n')
