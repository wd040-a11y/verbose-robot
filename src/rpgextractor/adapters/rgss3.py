"""Bounded RGSSAD version 3 archive reader. No code execution, no path overwrite."""
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import re
import struct
from ..io import reject_links

@dataclass
class Entry:
    name:str
    offset:int
    size:int
    key:int

def entries(path,cancel=lambda:None):
    reject_links(path); size=path.stat().st_size
    result=[]; names=set(); total=0
    with path.open('rb') as f:
        def uint():
            b=f.read(4)
            if len(b)!=4: raise ValueError('손상된 RGSS3 아카이브 헤더')
            return struct.unpack('<I',b)[0]
        if f.read(8)!=b'RGSSAD\x00\x03': raise ValueError('표준 RGSSAD v3 아카이브가 아닙니다.')
        key=(uint()*9+3)&0xffffffff; kb=struct.pack('<I',key)
        for _ in range(100000):
            cancel(); off=uint()^key
            if not off: break
            length=uint()^key; filekey=uint()^key; namelen=uint()^key
            if namelen>4096 or not namelen or length>512*1024*1024 or off+length>size: raise ValueError('아카이브 항목 범위/크기 오류')
            raw=f.read(namelen)
            if len(raw)!=namelen: raise ValueError('아카이브 파일명 손상')
            raw=bytes(v^kb[i%4] for i,v in enumerate(raw))
            try: name=raw.decode('utf-8')
            except UnicodeError: name=raw.decode('cp932')
            name=name.replace('\\','/'); p=PurePosixPath(name)
            if p.is_absolute() or any(x in ('','..','.') or ':' in x or x.endswith((' ','.')) or re.match(r'(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)',x) for x in name.split('/')): raise ValueError('안전하지 않은 아카이브 경로')
            if name.casefold() in names: raise ValueError('중복 아카이브 경로')
            names.add(name.casefold()); total+=length
            if total>16*1024**3: raise ValueError('아카이브 총 크기 제한 16 GiB')
            result.append(Entry(name,off,length,filekey))
        else: raise ValueError('아카이브 항목 개수 제한')
        end=f.tell()
    last=end
    for e in sorted(result,key=lambda e:e.offset):
        if e.offset<last: raise ValueError('아카이브 영역 겹침')
        last=e.offset+e.size
    return result

def unpack(path,target,cancel=lambda:None):
    records=entries(path,cancel)
    with path.open('rb') as f:
        for e in records:
            cancel(); dest=target/Path(e.name); dest.parent.mkdir(parents=True,exist_ok=True)
            reject_links(dest); f.seek(e.offset); left=e.size; key=e.key
            with dest.open('xb') as out:
                while left:
                    cancel(); block=f.read(min(left,65536))
                    if not block: raise ValueError('아카이브 데이터 손상')
                    decrypted=bytearray(len(block))
                    for i in range(0,len(block),4):
                        part=block[i:i+4]; kb=struct.pack('<I',key)
                        decrypted[i:i+len(part)]=bytes(a^b for a,b in zip(part,kb))
                        key=(key*7+3)&0xffffffff
                    out.write(decrypted); left-=len(block)
    return records
