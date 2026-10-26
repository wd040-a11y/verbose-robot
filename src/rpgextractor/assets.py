from __future__ import annotations
import hashlib
import os
import re
import warnings
from pathlib import Path
from PIL import Image
from .io import digest, copy_stream, reject_links

HEADER = bytes.fromhex("5250474d560000000003010000000000")
ENCRYPTED = {".rpgmvp":".png",".png_":".png",".rpgmvo":".ogg",".ogg_":".ogg",".rpgmvm":".m4a",".m4a_":".m4a"}

def media_type(head: bytes):
    if head.startswith(b"\x89PNG\r\n\x1a\n"): return ".png"
    if head.startswith(b"OggS") and len(head)>=27 and head[4]==0: return ".ogg"
    if len(head)>=12 and head[4:8]==b"ftyp" and head[8:12] in (b"M4A ",b"isom",b"mp42",b"M4B "): return ".m4a"
    if head.startswith(b"\xff\xd8\xff"): return ".jpg"
    if head[:6] in (b"GIF87a",b"GIF89a"): return ".gif"
    if head[:4]==b"RIFF" and head[8:12]==b"WEBP": return ".webp"
    return None

def validate_media(path: Path, suffix: str):
    with path.open("rb") as f: head=f.read(64)
    if media_type(head)!=suffix: raise ValueError("복원 결과의 파일 시그니처가 일치하지 않습니다.")
    if suffix in (".png",".jpg",".gif",".webp"):
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                size=list(image.size)
                image.verify()
                return size
    # Structural container checks, not codec decoding. Never load audio into RAM.
    if suffix==".ogg":
        pages=0
        with path.open("rb") as f:
            while True:
                header=f.read(27)
                if not header: break
                if len(header)!=27 or header[:4]!=b"OggS" or header[4]!=0: raise ValueError("손상된 OGG 페이지")
                segments=f.read(header[26])
                if len(segments)!=header[26] or len(f.read(sum(segments)))!=sum(segments): raise ValueError("잘린 OGG 데이터")
                pages+=1
        if not pages: raise ValueError("비어 있는 OGG")
    if suffix==".m4a":
        total=path.stat().st_size; pos=0; boxes=set()
        with path.open("rb") as f:
            while pos<total:
                header=f.read(8)
                if len(header)!=8: raise ValueError("잘린 M4A 박스")
                size=int.from_bytes(header[:4],"big"); minimum=8
                if size==1:
                    extra=f.read(8)
                    if len(extra)!=8: raise ValueError("잘린 확장 M4A 박스")
                    size=int.from_bytes(extra,"big"); minimum=16
                if size==0: size=total-pos
                if size<minimum or pos+size>total: raise ValueError("잘못된 M4A 박스 크기")
                boxes.add(header[4:8]); pos+=size; f.seek(pos)
        if not {b"ftyp",b"moov",b"mdat"}<=boxes: raise ValueError("M4A 필수 박스 누락")
    return None

def decrypt_standard(source: Path, target: Path, key: str, expected: str | None = None, cancel=lambda:None):
    """Strip exact 16-byte header, XOR only next 16 bytes, stream remainder."""
    reject_links(source)
    if not isinstance(key,str) or not re.fullmatch(r"[0-9a-fA-F]{32}",key):
        raise ValueError("System.json에 유효한 표준 암호화 키가 없습니다.")
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_name(target.name+".tmp")
    try:
        with source.open("rb") as src, temp.open("wb") as dst:
            if src.read(16)!=HEADER: raise ValueError("지원하지 않는 암호화 헤더")
            block=src.read(16)
            if len(block)!=16: raise ValueError("암호화 파일이 잘렸습니다.")
            dst.write(bytes(a^b for a,b in zip(block,bytes.fromhex(key))))
            while block:=src.read(1024*1024):
                cancel(); dst.write(block)
        with temp.open("rb") as f: kind=media_type(f.read(64))
        if kind not in (".png",".ogg",".m4a") or (expected and kind!=expected):
            raise ValueError("복원 결과 형식이 표준 PNG/OGG/M4A와 일치하지 않습니다.")
        size=validate_media(temp,kind)
        cancel(); os.replace(temp,target)
        return kind,size
    finally:
        temp.unlink(missing_ok=True)

def logical_path(relative: str):
    p=Path(relative); ext=p.suffix.lower()
    if ext in ENCRYPTED or ext.rstrip("_") in ENCRYPTED:
        return p.with_suffix("").as_posix()
    return p.with_suffix("").as_posix()

def process_asset(source: Path, root: Path, output: Path, system, options, cancel=lambda:None, canonical=None):
    rel=source.relative_to(root).as_posix()
    logical_rel=canonical or rel
    category="images" if logical_rel.startswith("img/") else "audio" if logical_rel.startswith("audio/") else "movies" if logical_rel.startswith("movies/") else "effects" if logical_rel.startswith("effects/") else "other"
    enabled={"images":options.images,"audio":options.audio,"movies":options.movies,"effects":options.images,"other":False}[category]
    record={"id":"asset:"+hashlib.sha256(rel.encode()).hexdigest()[:24],"source_path":rel,
            "original_extension":source.suffix,"size_bytes":source.stat().st_size,"sha256":digest(source,cancel),
            "category":category,"logical_path":logical_path(logical_rel),"status":"indexed","output_path":None,
            "output_sha256":None,"dimensions":None,"detected_format":None}
    with source.open("rb") as f: head=f.read(64)
    encrypted=head[:16]==HEADER
    suffix=source.suffix.lower()
    suspected=suffix in ENCRYPTED or suffix.rstrip("_") in ENCRYPTED or head.startswith(b"RPGMV")
    detected=media_type(head); record["detected_format"]=detected
    # Preserve relative original name in target; appending restored extension avoids collisions.
    # Source-path hash directories prevent suffix and case-only collisions.
    dest=output/"assets"/category/record["id"].split(":",1)[1]/source.name
    if encrypted:
        record["encryption"]="standard"
        if not enabled: record["status"]="copy_disabled"; return record
        if not options.decrypt: record["status"]="decryption_disabled"; return record
        expected=ENCRYPTED.get(suffix,ENCRYPTED.get(suffix.rstrip("_")))
        if expected is None:
            # Probe first block using only the supplied key; never infer a key.
            key=system.get("encryptionKey","")
            if re.fullmatch(r"[a-fA-F0-9]{32}",key or ""):
                expected=media_type(bytes(a^b for a,b in zip(head[16:32],bytes.fromhex(key)))+head[32:])
            if expected not in (".png",".ogg",".m4a"): raise ValueError("표준 헤더지만 내부 형식을 확인할 수 없습니다.")
        dest=dest.with_name(dest.name+expected)
        kind, size=decrypt_standard(source,dest,system.get("encryptionKey",""),expected,cancel)
        record.update(status="decrypted",detected_format=kind,dimensions=size)
    elif suspected and detected is None:
        record.update(status="unsupported_encryption",encryption="unknown"); return record
    else:
        record["encryption"]="none"
        if detected in (".png",".jpg",".gif",".webp"):
            record["dimensions"]=validate_media(source,detected)
        if not enabled: record["status"]="copy_disabled"; return record
        copy_stream(source,dest,cancel); record["status"]="copied"
    record["output_path"]=dest.relative_to(output).as_posix()
    record["output_sha256"]=digest(dest,cancel)
    return record
