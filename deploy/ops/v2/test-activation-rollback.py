"""Exercise the actual activation/rollback AST locally; never runs SSH, systemd or nginx."""
from pathlib import Path
import ast
import datetime
import hashlib
import json
import re
import stat
import types
import unittest


SOURCE = (Path(__file__).parent / 'activation-v2.remote.py.template').read_text(encoding='utf8')
TREE = ast.parse(SOURCE.replace('__CONFIG_JSON__', "'{}'").replace('__PHASE__', "'activate'"))
MAIN = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
START = next(index for index, node in enumerate(MAIN.body)
             if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name)
                                                    and target.id == 'start_attempted' for target in node.targets))
BODY = ast.Module(body=[ast.FunctionDef(name='exercise', args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]),
                                     body=MAIN.body[START:], decorator_list=[])], type_ignores=[])
PROGRAM = compile(ast.fix_missing_locations(BODY), 'actual-activation-rollback', 'exec')


class FakePath:
    def __init__(self, name, data=b'original'):
        self.name, self.data = name, data
    def __truediv__(self, name):
        return FakePath(self.name + '/' + name)
    def __str__(self):
        return self.name
    def read_bytes(self):
        return self.data
    def exists(self):
        return True
    def stat(self):
        return types.SimpleNamespace(st_mode=0o100600, st_uid=77, st_gid=77)


def run_case(fault=None):
    site = FakePath('/isolated/nginx.conf')
    state = {'commands': [], 'running': False, 'loaded': b'original', 'reloads': 0,
             'tests': 0, 'printed': [], 'legacyChecks': 0, 'files': {}}

    def command(args):
        state['commands'].append(tuple(args))
        if args[:2] == ['systemctl', 'start']:
            state['running'] = True
            if fault == 'start-error-after-job':
                raise RuntimeError('start command failed after systemd accepted the job')
        elif args[:2] == ['systemctl', 'stop']:
            assert args[2] == 'pinkuang-deploy-v2.service'
            state['running'] = False
        elif args == ['nginx', '-t']:
            state['tests'] += 1
            if fault == 'config-test' and state['tests'] == 1:
                raise RuntimeError('candidate nginx syntax failure')
        elif args == ['systemctl', 'reload', 'nginx']:
            state['reloads'] += 1
            state['loaded'] = site.data
            if state['reloads'] == 1 and fault in ['reload-error-after-effect', 'reload-error-file-already-restored']:
                if fault == 'reload-error-file-already-restored':
                    site.data = b'original'
                raise RuntimeError('reload command failed after nginx accepted the config')
        elif args == ['ss', '-H', '-ltn']:
            return 'LISTEN 0 511 127.0.0.1:4174 0.0.0.0:*\n'
        return ''

    def verify_http(_manifest, public=False):
        if public and fault in ['https-check', 'concurrent-config']:
            if fault == 'concurrent-config':
                site.data = b'someone-elses-change'
            raise RuntimeError('public HTTP probe failed')

    def assert_legacy(_expected):
        state['legacyChecks'] += 1

    scope = {'site': site, 'backup': FakePath('/isolated/backup'), 'original': b'original',
             'candidate': b'candidate', 'directories': [FakePath('/isolated/journal')],
             'user': types.SimpleNamespace(pw_uid=77, pw_gid=77), 'manifest': {}, 'expected': {},
             'CONFIG': {'artifactDigest': '0x' + 'a' * 64}, 'rid': 'v2-test-only',
             'command': command, 'http': lambda _: (200, b'ok'), 'verify_http': verify_http,
             'assert_legacy': assert_legacy, 'no_links': lambda _: None,
             'replace_site': lambda data, _stat: setattr(site, 'data', data),
             'exclusive': lambda path, data, _mode: state['files'].__setitem__(str(path), data),
             'service': lambda _: {'ActiveState': 'active', 'User': 'pinkuang-v2', 'MainPID': '123'},
             'sha': lambda data: hashlib.sha256(data).hexdigest(),
             'json': json, 'stat': stat, 're': re, 'datetime': datetime,
             'print': lambda value: state['printed'].append(json.loads(value))}
    exec(PROGRAM, scope)
    try:
        scope['exercise']()
    except RuntimeError:
        if fault is None:
            raise
    else:
        assert fault is None, 'Fault did not exercise the actual failure path'
    state['site'] = site.data
    assert all(command != ('systemctl', 'stop', name) for command in state['commands']
               for name in ['pinkuang-deploy.service', 'pinkuang-index.service', 'bem2075-site.service',
                            'sparkdraw-keeper.service', 'sparkdraw-bot.service'])
    return state


class RollbackTests(unittest.TestCase):
    def test_start_failure_after_job_acceptance_stops_the_new_unit(self):
        state = run_case('start-error-after-job')
        self.assertFalse(state['running'])
        self.assertEqual(state['loaded'], b'original')
        self.assertTrue(state['printed'][-1]['rollback']['newServiceStopped'])

    def test_reload_failure_after_effect_restores_and_reloads_original(self):
        state = run_case('reload-error-after-effect')
        self.assertFalse(state['running'])
        self.assertEqual(state['site'], b'original')
        self.assertEqual(state['loaded'], b'original')
        self.assertEqual(state['reloads'], 2)

    def test_original_file_already_restored_still_requires_reload(self):
        state = run_case('reload-error-file-already-restored')
        self.assertEqual(state['site'], b'original')
        self.assertEqual(state['loaded'], b'original')
        self.assertEqual(state['reloads'], 2)

    def test_failed_config_check_never_activates_candidate(self):
        state = run_case('config-test')
        self.assertEqual(state['site'], b'original')
        self.assertEqual(state['loaded'], b'original')
        self.assertEqual(state['reloads'], 0)
        self.assertFalse(state['running'])

    def test_failed_public_probe_rolls_back_and_preserves_journal(self):
        state = run_case('https-check')
        self.assertEqual(state['site'], b'original')
        self.assertEqual(state['loaded'], b'original')
        self.assertFalse(state['running'])
        self.assertTrue(state['printed'][-1]['rollback']['journalPreserved'])

    def test_concurrent_config_change_is_not_overwritten(self):
        state = run_case('concurrent-config')
        self.assertEqual(state['site'], b'someone-elses-change')
        self.assertFalse(state['running'])
        self.assertIn('nginxConcurrentChange', state['printed'][-1]['rollback'])

    def test_success_keeps_new_service_and_changes_only_new_activation(self):
        state = run_case()
        self.assertTrue(state['running'])
        self.assertEqual(state['site'], b'candidate')
        self.assertEqual(state['loaded'], b'candidate')
        self.assertTrue(state['printed'][-1]['activated'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
