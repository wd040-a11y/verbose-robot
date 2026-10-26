"""Output selection is a parent directory, never a destructive destination."""
from pathlib import Path
import os
import re
import tempfile
from .io import reject_links

MARKER='.rpgextractor-output'

def default_base():
    roots=[]
    if os.name=='nt':
        import ctypes
        buf=ctypes.create_unicode_buffer(32768)
        if ctypes.windll.shell32.SHGetFolderPathW(None,5,None,0,buf)==0: roots.append(Path(buf.value))
        if os.environ.get('LOCALAPPDATA'): roots.append(Path(os.environ['LOCALAPPDATA']))
    roots.extend([Path.home()/'Documents',Path.home(),Path(tempfile.gettempdir())])
    for root in roots:
        target=root/'RPGMakerExtractor'/'Exports'
        try:
            reject_links(target); target.mkdir(parents=True,exist_ok=True)
            with tempfile.TemporaryFile(dir=target): pass
            return target
        except OSError: continue
    raise OSError('쓸 수 있는 출력 위치를 찾지 못했습니다.')

def allocate(base,game_name):
    base=Path(base) if base else default_base()
    reject_links(base); base=base.resolve(); base.mkdir(parents=True,exist_ok=True)
    stem=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',game_name).strip(' .')[:80] or 'Game'
    for n in range(1,100000):
        dest=base/(f'RPGMakerExtractor_{stem}'+(f'_{n}' if n>1 else ''))
        try: dest.mkdir()
        except FileExistsError: continue
        try: (dest/MARKER).write_text('in_progress',encoding='utf-8')
        except OSError: dest.rmdir(); raise
        return dest
    raise OSError('결과 폴더를 생성하지 못했습니다.')
