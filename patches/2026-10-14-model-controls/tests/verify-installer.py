#!/usr/bin/env python3
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('model_controls', ROOT / 'patch.py')
patch = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(patch)
patch.stopped = lambda: None  # Fixtures only; never bypass the public install guard.
PREPARED = ROOT / 'build'
original = (PREPARED / 'model-errors/agents-original.js').read_bytes()
middle = (PREPARED / 'model-errors/agents-patched.js').read_bytes()
final = (PREPARED / 'agents-patched.js').read_bytes()


def fixture(directory, source, version='3.17.19'):
    app = directory / 'Cursor.app'
    resources = app / 'Contents/Resources/app'
    glass = resources / patch.GLASS
    glass.parent.mkdir(parents=True)
    glass.write_bytes(source)
    (resources / 'package.json').write_text(json.dumps({'version': version}))
    (resources / 'product.json').write_text(json.dumps({'checksums': {patch.CHECKSUM: 'fixture'}, 'other': 'preserve'}))
    return app


with tempfile.TemporaryDirectory(prefix='cursor-model-controls-test-') as temporary, contextlib.redirect_stdout(io.StringIO()):
    temp = Path(temporary)
    for index, source in enumerate([original, middle, final]):
        parent = temp / str(index)
        app = fixture(parent, source)
        build = parent / 'build'
        patch.prepare(app, build)
        assert (build / 'agents-patched.js').read_bytes() == final
        try:
            patch.prepare(app, build)
        except RuntimeError as error:
            assert 'Output already exists' in str(error)
        else:
            raise AssertionError('Preparation overwrote retained output')
        patch.apply(build)
        patch.apply(build)
        assert (app / 'Contents/Resources/app' / patch.GLASS).read_bytes() == final
        patch.apply(build, True)
        assert (app / 'Contents/Resources/app' / patch.GLASS).read_bytes() == source
        product = app / 'Contents/Resources/app/product.json'
        before = product.read_bytes()
        glass = app / 'Contents/Resources/app' / patch.GLASS
        glass.write_bytes(source + b'\n/* unrelated update */')
        try:
            patch.apply(build)
        except RuntimeError as error:
            assert 'Target changed' in str(error)
        else:
            raise AssertionError('Drift was overwritten')
        assert product.read_bytes() == before

    for label, source, version, message in [('unknown', b'unknown source', '3.17.19', 'Unknown Cursor'),
                                            ('version', original, '3.18.0', '3.17.19 only')]:
        app = fixture(temp / label, source, version)
        output = temp / label / 'output'
        try:
            patch.prepare(app, output)
        except RuntimeError as error:
            assert message in str(error)
        else:
            raise AssertionError('Unsupported input was accepted')
        assert not output.exists()

    # Simulate denial after the first application file was written. The first
    # file must return to the exact pre-install bytes and retain the backup.
    app = fixture(temp / 'partial-failure', original)
    build = temp / 'partial-failure/build'
    patch.prepare(app, build)
    real_write = patch.atomic_write
    calls = 0

    def deny_second(path, data):
        global calls
        calls += 1
        if calls == 2:
            raise PermissionError('fixture application write denial')
        real_write(path, data)

    patch.atomic_write = deny_second
    try:
        patch.apply(build)
    except PermissionError:
        pass
    else:
        raise AssertionError('Expected fixture write denial')
    finally:
        patch.atomic_write = real_write
    assert (app / 'Contents/Resources/app' / patch.GLASS).read_bytes() == original
    assert (build / 'agents-original.js').read_bytes() == original

print(json.dumps({'installer_replay': 'passed', 'accepted_stages': 3,
                  'checks': ['install', 'idempotency', 'restore', 'drift rejection',
                             'output preservation', 'unknown/version rejection', 'partial-write rollback'],
                  'real_application_writes': False, 'account_data_read_or_written': False}))
