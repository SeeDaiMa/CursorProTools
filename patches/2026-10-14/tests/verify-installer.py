import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import base64
import time

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('reviewed_installer', root / 'install.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def token(subject):
    data = base64.urlsafe_b64encode(json.dumps({'sub': subject, 'exp': int(time.time()) + 3600}).encode()).decode().rstrip('=')
    return 'synthetic.' + data + '.not-a-real-signature'


with tempfile.TemporaryDirectory(prefix='installer-fixture-', dir=root) as directory:
    home = Path(directory)
    cursor = home / 'Library/Application Support/Cursor/User/globalStorage'
    cursor.mkdir(parents=True)
    tools = home / 'Library/Application Support/cursor-pro-tools'
    tools.mkdir(parents=True)
    renewal = home / '.cursor-renewal'
    renewal.mkdir()
    with sqlite3.connect(cursor / 'state.vscdb') as connection:
        connection.execute('CREATE TABLE ItemTable(key TEXT PRIMARY KEY,value TEXT)')
        connection.executemany('INSERT INTO ItemTable VALUES(?,?)', [
            ('cursorAuth/accessToken', token('selected')),
            ('cursorAuth/refreshToken', token('selected')),
            ('cursorAuth/cachedEmail', 'selected@example.test'),
            ('WorkosCursorSessionToken', 'old::' + token('previous')),
        ])
    with sqlite3.connect(tools / 'accounts.db') as connection:
        connection.execute('CREATE TABLE accounts(id TEXT,email TEXT,access_token TEXT,session_token TEXT,machine_id TEXT,is_current INTEGER)')
        connection.execute('INSERT INTO accounts VALUES(?,?,?,?,?,1)', ('selected', 'selected@example.test', token('selected'), 'selected::' + token('selected'), 'a' * 64))
        connection.execute('CREATE TABLE config(key TEXT,value TEXT)')
        connection.execute('INSERT INTO config VALUES(?,?)', ('seamless.currentAccountId', 'selected'))
    (cursor / 'storage.json').write_text(json.dumps({'telemetry.machineId': 'b' * 64}))
    (renewal / 'active_token').write_text(token('previous'))
    (renewal / 'seamless_state.json').write_text(json.dumps({'config': {'enabled': True, 'custom': 'keep'}, 'auto_switch_enabled': False, 'auto_resume_enabled': False}))
    (renewal / 'machine_id_override').write_text(json.dumps({'mappings': [{'old': 'b' * 64, 'new': 'previous-machine'}, {'old': 'unrelated', 'new': 'keep'}]}))
    plan = module.account_plan(home)
    assert plan['session_change']
    module.synchronize(plan)
    assert (renewal / 'active_token').read_text() == token('selected')
    state = json.loads((renewal / 'seamless_state.json').read_text())
    assert state['config'] == {'enabled': True, 'custom': 'keep'}
    assert state['auto_switch_enabled'] is False and state['auto_resume_enabled'] is False
    mappings = json.loads((renewal / 'machine_id_override').read_text())['mappings']
    assert len([item for item in mappings if item['old'] == 'b' * 64]) == 1
    assert next(item['new'] for item in mappings if item['old'] == 'b' * 64) == 'a' * 64
    with sqlite3.connect(cursor / 'state.vscdb') as connection:
        assert connection.execute("SELECT value FROM ItemTable WHERE key='WorkosCursorSessionToken'").fetchone()[0].startswith('selected::')
    # A partial filesystem failure restores all touched private files.
    plan = module.account_plan(home)
    before = {path: module.read_optional(path) for path in plan['payloads']}
    real_write = module.atomic_write
    failed_once = False
    def fail_once(path, data, private=False):
        global failed_once
        if path.name == 'machine_id_override' and not failed_once:
            failed_once = True
            raise OSError('synthetic failure')
        return real_write(path, data, private)
    module.atomic_write = fail_once
    try:
        module.synchronize(plan)
        raise AssertionError('Expected a simulated write failure')
    except OSError:
        pass
    finally:
        module.atomic_write = real_write
    assert all(module.read_optional(path) == data for path, data in before.items())
    # The repair must not silently choose a different selected account.
    with sqlite3.connect(tools / 'accounts.db') as connection:
        connection.execute('UPDATE accounts SET access_token=?', (token('different'),))
    try:
        module.account_plan(home)
        raise AssertionError('Expected ambiguous identity to fail closed')
    except RuntimeError:
        pass
    assert all(module.read_optional(path) == data for path, data in before.items())
print(json.dumps({'success': True, 'coverage': [
    'Real temporary SQLite/filesystem identity alignment with synthetic credentials',
    'Existing flags, custom state and unrelated mappings preserved',
    'Foreign session corrected without borrowing an account identity',
    'Partial filesystem write failure restores prior state',
    'Different selected identity stops before writes',
], 'real_accounts_or_network': 'not executed'}))
