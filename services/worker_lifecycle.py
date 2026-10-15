"""A handle to the authenticated worker, never a broad Python/1C process kill."""
import os
import sys


class WorkerHandle:
    def __init__(self,pid):
        self.handle=None
        if os.name != 'nt': return
        import ctypes
        from ctypes import wintypes
        api=ctypes.WinDLL('kernel32',use_last_error=True)
        api.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
        api.OpenProcess.restype=wintypes.HANDLE
        api.QueryFullProcessImageNameW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
        api.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]
        api.TerminateProcess.argtypes=[wintypes.HANDLE,wintypes.UINT]
        api.CloseHandle.argtypes=[wintypes.HANDLE]
        handle=api.OpenProcess(0x00100000|0x00001000|0x00000001,False,int(pid))
        if not handle: raise RuntimeError('COM prosesinə təhlükəsiz idarəetmə çıxışı alınmadı.')
        self.api,self.handle=api,handle
        size=wintypes.DWORD(32768)
        buffer=ctypes.create_unicode_buffer(size.value)
        if not api.QueryFullProcessImageNameW(handle,0,buffer,ctypes.byref(size)) or os.path.normcase(os.path.realpath(buffer.value)) != os.path.normcase(os.path.realpath(sys.executable)):
            self.close()
            raise RuntimeError('COM prosesinin kimliyi uyğun deyil; yenilənmə dayandırıldı.')
    def wait(self,milliseconds):
        return bool(self.handle) and self.api.WaitForSingleObject(self.handle,milliseconds)==0
    def terminate(self):
        if not self.handle: raise RuntimeError('Proses təhlükəsiz dayandırıla bilmədi.')
        if not self.api.TerminateProcess(self.handle,0): raise RuntimeError('COM prosesi dayanmadı.')
        if not self.wait(5000): raise RuntimeError('COM prosesinin dayanması təsdiqlənmədi.')
    def close(self):
        if self.handle:
            self.api.CloseHandle(self.handle)
            self.handle=None
