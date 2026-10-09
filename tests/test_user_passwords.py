import sys
import unittest
from pathlib import Path
from queue import Queue
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.user_passwords import change_password, list_accounts


class User:
    Имя = 'Target'
    ПолноеИмя = 'Target user'
    АутентификацияСтандартная = True
    writes = 0
    def Записать(self): self.writes += 1


class PasswordTests(unittest.TestCase):
    def setUp(self):
        self.user = User()
        self.manager = SimpleNamespace(
            НайтиПоИмени=lambda name: self.user if name == 'Target' else None,
            ПолучитьПользователей=lambda: [self.user],
            ТекущийПользователь=lambda: SimpleNamespace(Имя='Admin'))
        self.conn = SimpleNamespace(ПользователиИнформационнойБазы=self.manager,
                                   ПравоДоступа=lambda right, metadata: True, Метаданные=object())
        self.payload = dict(server='Test1C', ref='Aztrade_test3', target_user='Target',
                            new_password='unit-test-only-secret', confirm_password='unit-test-only-secret')

    def test_only_exact_target_is_written_once(self):
        result = Queue()
        change_password(self.conn, self.payload, '', result)
        self.assertEqual(self.user.writes, 1)
        self.assertEqual(self.user.Пароль, self.payload['new_password'])
        self.assertNotIn('password', str(result.get()))

    def test_other_database_is_rejected_before_access(self):
        with self.assertRaises(ValueError):
            change_password(None, dict(self.payload, ref='RealBase'), '', Queue())
        self.assertEqual(self.user.writes, 0)

    def test_non_admin_cannot_change_any_password(self):
        self.conn.ПравоДоступа = lambda *args: False
        with self.assertRaises(PermissionError): change_password(self.conn, self.payload, '', Queue())
        self.assertEqual(self.user.writes, 0)

    def test_mismatch_and_unknown_account_do_not_write(self):
        for changes in ({'confirm_password':'different'}, {'target_user':'Unknown'}):
            with self.assertRaises(ValueError): change_password(self.conn, dict(self.payload, **changes), '', Queue())
        self.assertEqual(self.user.writes, 0)

    def test_os_only_account_is_not_enabled_or_changed(self):
        self.user.АутентификацияСтандартная = False
        with self.assertRaises(ValueError): change_password(self.conn, self.payload, '', Queue())
        self.assertEqual(self.user.writes, 0)
        self.assertFalse(self.user.АутентификацияСтандартная)

    def test_account_listing_never_reads_password(self):
        result = Queue()
        list_accounts(self.conn, self.payload, '', result)
        data = result.get()[1]
        self.assertEqual(data['accounts'][0]['name'], 'Target')
        self.assertNotIn('password', str(data))


if __name__ == '__main__': unittest.main()
