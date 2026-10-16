"""Reproduce a live worker retaining the pre-normalization policy module."""
import subprocess
import sys
import unittest
from pathlib import Path


class FilterPolicyReloadTests(unittest.TestCase):
    def test_new_document_handlers_import_with_old_policy_in_memory(self):
        script = '''
import sys
import services.filter_policy as policy
original = policy
for name in ('normalize_filters', 'validate_supported_fields', 'DOCUMENT_FIELDS', 'BASE_FIELDS'):
    delattr(policy, name)
from services.documents import generic, realization, vozvrat, pogruzka, base
assert sys.modules['services.filter_policy'] is original
for module in (generic, realization, vozvrat, pogruzka, base):
    rules = module.normalize_filters([{'field': 'wms_status', 'comparison': 'Равно', 'value': 'Выгружен'}])
    assert rules[0]['fieldKey'] == 'vms_status'
print('Cached old policy recovered without worker restart')
'''
        result = subprocess.run([sys.executable, '-c', script], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_current_policy_does_not_reload(self):
        from unittest.mock import patch
        import services.filter_policy as policy
        from services.filter_policy_loader import current_filter_policy
        with patch('services.filter_policy_loader.reload') as reload:
            self.assertIs(current_filter_policy(), policy)
        reload.assert_not_called()


if __name__ == '__main__': unittest.main()
