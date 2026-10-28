"""Local timing and process peak RSS, with no game content or keys."""
from contextlib import contextmanager
import time,sys

def peak_memory():
    if sys.platform=='win32':
        try:
            import ctypes
            from ctypes import wintypes
            class Counters(ctypes.Structure):
                _fields_=[('cb',wintypes.DWORD),('faults',wintypes.DWORD)]+[(n,ctypes.c_size_t) for n in ('peak','working','peakPaged','paged','peakNonPaged','nonPaged','pagefile','peakPagefile')]
            c=Counters();c.cb=ctypes.sizeof(c)
            kernel=ctypes.windll.kernel32;kernel.GetCurrentProcess.restype=wintypes.HANDLE
            read=ctypes.windll.psapi.GetProcessMemoryInfo;read.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD];read.restype=wintypes.BOOL
            if read(kernel.GetCurrentProcess(),ctypes.byref(c),c.cb):return c.peak
        except (OSError,AttributeError,OverflowError,TypeError):pass
    else:
        try:
            import resource
            n=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            return n if sys.platform=='darwin' else n*1024
        except (ImportError,OSError):pass
    return None

class Metrics:
    def __init__(self):self.started=time.perf_counter();self.stages={}
    @contextmanager
    def stage(self,name,files=0,bytes=0):
        start=time.perf_counter()
        row=self.stages.setdefault(name,{'seconds':0,'files':0,'bytes':0,'peak_rss_bytes':None})
        try:yield row
        finally:
            row['seconds']+=time.perf_counter()-start;row['files']+=files;row['bytes']+=bytes;row['peak_rss_bytes']=peak_memory()
    def report(self):return {'total_seconds':time.perf_counter()-self.started,'peak_rss_bytes':peak_memory(),'stages':self.stages,'timing_policy':'extraction includes output/resources; nested timings are not additive. RSS is process high-water mark, not stage allocation.'}
