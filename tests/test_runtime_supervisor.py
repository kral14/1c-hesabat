import unittest
import managed_runtime

class SupervisorTests(unittest.TestCase):
    def test_only_application_python_files_are_watched(self):
        paths=managed_runtime.source_files()
        self.assertTrue(any(path.name=='app.py' for path in paths))
        self.assertFalse(any('tests' in path.relative_to(managed_runtime.ROOT).parts for path in paths))
        self.assertFalse(any(path.suffix in ('.js','.css','.html') for path in paths))
    def test_runtime_lock_prevents_duplicate_supervisors(self):
        first=managed_runtime.runtime_lock(5999)
        self.assertIsNotNone(first)
        try: self.assertIsNone(managed_runtime.runtime_lock(5999))
        finally: first.close()
        again=managed_runtime.runtime_lock(5999)
        self.assertIsNotNone(again)
        again.close()
    def test_source_syntax_is_valid(self):
        self.assertIsNone(managed_runtime.syntax_error())

if __name__=='__main__': unittest.main()
