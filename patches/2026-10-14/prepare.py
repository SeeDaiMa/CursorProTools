#!/usr/bin/env python3
"""Prepare verified local application patches without changing applications/accounts."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import plistlib
import re
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def manifest(name):
    return json.loads((ROOT / 'manifests' / (name + '.json')).read_text())


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def checked(data, expected, label):
    if sha(data) != expected:
        raise RuntimeError(label + ': baseline/output hash mismatch; no application changes made')
    return data


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise RuntimeError(label + ': ambiguous patch boundary; no application changes made')
    return text.replace(old, new, 1)


def transform(data, spec, reverse=False):
    checked(data, spec['patchedSha256' if reverse else 'originalSha256'], spec['scope'])
    text = data.decode('utf-8')
    for change in reversed(spec['changes']) if reverse else spec['changes']:
        old, new = (change['new'], change['old']) if reverse else (change['old'], change['new'])
        text = replace_once(text, old, new, change['label'])
    return checked(text.encode(), spec['originalSha256' if reverse else 'patchedSha256'], spec['scope'])


def transplant(data, editor):
    spec = manifest('transplant')
    checked(data, spec['originalSha256'], 'Agents before transplant')
    source = checked(editor, spec['editorSha256'], 'Existing Editor injection').decode()
    hook = source[source.index(';/*wxDomS*/'):]
    if source.count('/*wxDomS*/') != 1 or hook.count('/*wxDomE*/') != 1 or not hook.rstrip().endswith('/*wxDomE*/'):
        raise RuntimeError('Editor injection boundaries changed')
    checked(hook.encode(), spec['domHookSha256'], 'Editor DOM hook')
    membership = re.search(r'this\.storeMembershipType=(\w+)=>\{(/\*wxv=[^*]+\*/\1=\x27pro\x27;/\*wxMU\*/)', source)
    if not membership or source.count('/*wxPD*/') != 1 or source.count('/*wxNL*/') != 2:
        raise RuntimeError('Existing Editor membership/logout injection changed')
    text = replace_once(data.decode(), 'this.storeMembershipType=s=>{',
                        'this.storeMembershipType=s=>{' + membership.group(2), 'membership producer')
    text = replace_once(text, 'this.logout=async()=>{',
                        'this.logout=async()=>{/*wxNL*/return;/*wxNL*/', 'logout')
    text = replace_once(text, 'case us.FREE:return"Free Plan";',
                        'case us.FREE:return"Pro Plan"/*wxPD*/;', 'plan display')
    return checked((text + '\n' + hook).encode(), spec['patchedSha256'], 'Agents transplant')


def profile_transform(data, reverse=False):
    spec = manifest('profile')
    checked(data, spec['patchedSha256' if reverse else 'originalSha256'], 'Account profile')
    old, new = spec['change']['before'], spec['change']['after']
    if reverse:
        old, new = new, old
    result = replace_once(data.decode(), old, new, 'Account profile fallback').encode()
    return checked(result, spec['originalSha256' if reverse else 'patchedSha256'], 'Account profile output')


def glass_stages(data, editor):
    first, input_patch, click_patch, profile = [manifest(name) for name in
                                             ('transplant', 'limit-input', 'limit-click', 'profile')]
    known = [first['originalSha256'], first['patchedSha256'], input_patch['patchedSha256'],
             click_patch['patchedSha256'], profile['patchedSha256']]
    try:
        position = known.index(sha(data))
    except ValueError:
        raise RuntimeError('Unknown Cursor Agents baseline; refusing to guess across versions')
    if position == 0:
        data = transplant(data, editor)
        position += 1
    if position == 1:
        data = transform(data, input_patch)
        position += 1
    if position == 2:
        data = transform(data, click_patch)
        position += 1
    if position == 3:
        data = profile_transform(data)
    before_profile = profile_transform(data, reverse=True)
    before_click = transform(before_profile, click_patch, reverse=True)
    before_input = transform(before_click, input_patch, reverse=True)
    return before_input, before_click, before_profile, data


def asar_header(data):
    header_size = struct.unpack_from('<I', data, 4)[0]
    json_size = struct.unpack_from('<I', data, 12)[0]
    if 16 + json_size > 8 + header_size or 8 + header_size > len(data):
        raise RuntimeError('Invalid ASAR header bounds')
    header_bytes = data[16:16 + json_size]
    return json.loads(header_bytes), header_bytes, 8 + header_size


def extract_member(data, member):
    header, _, payload_start = asar_header(data)
    node = header
    for part in member.split('/'):
        node = node['files'][part]
    if node.get('unpacked') or node.get('link'):
        raise RuntimeError('Selected ASAR module is not a packed regular file')
    start = payload_start + int(node['offset'])
    end = start + node['size']
    if start < payload_start or end > len(data):
        raise RuntimeError('Invalid ASAR member bounds')
    return data[start:end]


def extract_tests(directory, before, after, name):
    write_json(directory / 'manifest.json', manifest(name))
    for filename, boundaries in manifest(name + '-extracts').items():
        source = (before if filename.endswith('-original.js') else after).decode()
        prefix, suffix = boundaries['start'], boundaries['end']
        if source.count(prefix) != 1:
            raise RuntimeError('Ambiguous test extraction: ' + filename)
        start = source.index(prefix)
        end = source.index(suffix, start) + len(suffix)
        (directory / filename).write_text(source[start:end])


def prepare(cursor_app, tools_app, output):
    if output.exists():
        raise RuntimeError('Output already exists; preserve backups and choose a new --output directory')
    cursor = cursor_app / 'Contents/Resources/app'
    if json.loads((cursor / 'package.json').read_text())['version'] != '3.17.19':
        raise RuntimeError('This patch set supports Cursor 3.17.19 only')
    glass_path = cursor / 'out/vs/workbench/workbench.glass.main.js'
    editor_path = cursor / 'out/vs/workbench/workbench.desktop.main.js'
    product_path = cursor / 'product.json'
    archive_path = tools_app / 'Contents/Resources/app.asar'
    info_path = tools_app / 'Contents/Info.plist'
    info_bytes = info_path.read_bytes()
    info = plistlib.loads(info_bytes)
    if info.get('CFBundleIdentifier') != 'com.cursor.account.manager' or info.get('CFBundleShortVersionString') != '0.2.19':
        raise RuntimeError('This patch set supports CursorProTools 0.2.19 only')
    spec = manifest('protools')
    archive = archive_path.read_bytes()
    archive_hash = sha(archive)
    if archive_hash not in (spec['archive_sha256'], spec['patched_archive_sha256']):
        raise RuntimeError('Unknown ProTools archive baseline; refusing to overwrite other modifications')
    main = extract_member(archive, spec['member'])
    header_hash = sha(asar_header(archive)[1])
    patch = {'scope': 'ProTools account transaction', 'originalSha256': spec['original_main_sha256'],
             'patchedSha256': spec['patched_main_sha256'], 'changes': spec['changes']}
    if sha(main) == patch['patchedSha256']:
        patched_main, original_main = main, transform(main, patch, reverse=True)
    else:
        original_main, patched_main = main, transform(main, patch)
    original_glass = glass_path.read_bytes()
    stages = glass_stages(original_glass, editor_path.read_bytes())
    product_bytes = product_path.read_bytes()
    initial_hashes = {archive_path: archive_hash, info_path: sha(info_bytes),
                      glass_path: sha(original_glass), product_path: sha(product_bytes)}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='patch-prepare-', dir=output.parent) as temporary:
        stage = Path(temporary)
        for name in ('protools', 'profile', 'limit-input', 'limit-click'):
            (stage / name).mkdir()
        (stage / 'protools/original-main.js').write_bytes(original_main)
        (stage / 'protools/patched-main.js').write_bytes(patched_main)
        write_json(stage / 'protools/manifest.json', {**spec, 'target_archive': str(archive_path)})
        if archive_hash == spec['patched_archive_sha256']:
            # Release ZIPs already contain the verified patched ASAR. Preserve
            # those exact bytes; preparing Cursor fixes requires only Python.
            (stage / 'protools/patched-app.asar').write_bytes(archive)
            write_json(stage / 'protools/package-verification.json', {
                'patched_archive_sha256': archive_hash, 'header_sha256': header_hash,
                'changed_member': spec['member'], 'already_patched': True,
                'original_to_patched_comparison': 'not rerun for already-patched input',
            })
        else:
            subprocess.run(['node', str(ROOT / 'pack.mjs'), str(stage / 'protools')], check=True)
        del archive
        package = json.loads((stage / 'protools/package-verification.json').read_text())
        integrity = info['ElectronAsarIntegrity']
        if integrity.get('algorithm') != 'SHA256':
            raise RuntimeError('Unknown Electron ASAR integrity algorithm')
        integrity['hash'] = package['header_sha256']
        (stage / 'protools/patched-Info.plist').write_bytes(plistlib.dumps(info, fmt=plistlib.FMT_XML, sort_keys=False))
        before_input, before_click, before_profile, final = stages
        extract_tests(stage / 'limit-input', before_input, before_click, 'limit-input')
        extract_tests(stage / 'limit-click', before_click, before_profile, 'limit-click')
        (stage / 'profile/original.js').write_bytes(before_profile)
        (stage / 'profile/patched.js').write_bytes(final)
        write_json(stage / 'profile/manifest.json', manifest('profile'))
        product = json.loads(product_bytes)
        product.setdefault('checksums', {})['vs/workbench/workbench.glass.main.js'] = base64.b64encode(hashlib.sha256(final).digest()).decode().rstrip('=')
        (stage / 'profile/patched-product.json').write_text(json.dumps(product, ensure_ascii=False, indent=2) + '\n')
        targets = []
        for name, path, staged in [
            ('protools_archive', archive_path, 'protools/patched-app.asar'),
            ('protools_info', info_path, 'protools/patched-Info.plist'),
            ('cursor_profile', glass_path, 'profile/patched.js'),
            ('cursor_product', product_path, 'profile/patched-product.json'),
        ]:
            if sha(path.read_bytes()) != initial_hashes[path]:
                raise RuntimeError('Application changed during preparation; refusing an inconsistent baseline')
            targets.append({'name': name, 'path': str(path), 'staged': staged,
                            'original_sha256': initial_hashes[path], 'patched_sha256': sha((stage / staged).read_bytes())})
        executable = tools_app / 'Contents/MacOS' / info['CFBundleExecutable']
        resources = tools_app / 'Contents/_CodeSignature/CodeResources'
        if not executable.is_file() or not resources.is_file():
            raise RuntimeError('Required original signature files are missing')
        write_json(stage / 'install-manifest.json', {'scope': '2026-10-14 verified patch set',
                   'tools_app': str(tools_app), 'targets': targets,
                   'signature_backups': [str(executable), str(resources)],
                   'signing_policy': 'Refresh existing ad-hoc top-level signature; retain nested signatures'})
        shutil.copy2(ROOT / 'install.py', stage / 'install.py')
        shutil.move(str(stage), str(output))
    print(json.dumps({'status': 'prepared', 'directory': str(output), 'application_or_account_writes': False,
                      'cursor_glass_sha256': sha(final), 'protools_archive_sha256': package['patched_archive_sha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cursor-app', type=Path, default=Path('/Applications/Cursor.app'))
    parser.add_argument('--tools-app', type=Path, default=Path('/Applications/CursorProTools.app'))
    parser.add_argument('--output', type=Path, default=ROOT / 'build')
    args = parser.parse_args()
    try:
        prepare(args.cursor_app.resolve(), args.tools_app.resolve(), args.output.resolve())
    except Exception as error:
        parser.exit(1, str(error) + '\n')
