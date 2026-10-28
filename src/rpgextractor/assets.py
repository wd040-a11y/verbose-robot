from __future__ import annotations
import hashlib
import os
import re
import warnings
from pathlib import Path
from PIL import Image
from .io import digest, copy_stream, reject_links

class AssetError(ValueError):
    def __init__(self,code,message):
        self.code=code; super().__init__(message)

ERROR_HINTS={
 'key_missing':'System 데이터에서 유효한 표준 키를 읽지 못했습니다. 올바른 데이터 폴더인지 확인하세요. 키를 추측하지 않습니다.',
 'header_mismatch':'예상 표준 헤더와 다릅니다. 손상 또는 별도 보호 형식일 수 있습니다.',
 'truncated_file':'암호화 파일의 필수 데이터가 잘렸습니다. 정상 원본을 다시 준비하세요.',
 'restored_format_invalid':'표준 복원 후 형식 검증 실패. 키 불일치와 원본 손상 중 어느 원인인지는 미확정입니다.',
 'unsupported_encryption':'지원하지 않는 암호화 형식입니다. 표준 MV/MZ 형식인지 확인하세요.',
 'corrupt_media':'미디어 구조가 손상되었거나 현재 검사기가 지원하지 않는 형식입니다.',
 'source_missing':'읽으려던 원본 파일이 없습니다. 외장 드라이브 연결과 동기화 상태를 확인하세요.',
 'access_denied':'파일 접근 권한이 없습니다. 읽기 가능한 게임 폴더와 쓰기 가능한 출력 위치를 선택하세요.',
 'disk_full':'저장 공간이 부족합니다. 공간을 확보하고 새 폴더로 다시 추출하세요.',
 'io_failed':'파일 읽기 또는 쓰기에 실패했습니다. 권한과 저장 장치를 확인하세요.',
 'copy_disabled':'사용자 옵션으로 바이너리 복사를 제외했습니다. 원본 참조는 유지합니다.',
 'decryption_disabled':'사용자 옵션으로 복원을 제외했습니다.',
}

HEADER = bytes.fromhex("5250474d560000000003010000000000")
ENCRYPTED = {".rpgmvp":".png",".png_":".png",".rpgmvo":".ogg",".ogg_":".ogg",".rpgmvm":".m4a",".m4a_":".m4a"}

def media_type(head: bytes):
    if head.startswith(b"\x89PNG\r\n\x1a\n"): return ".png"
    if head.startswith(b"OggS") and len(head)>=27 and head[4]==0: return ".ogg"
    if len(head)>=12 and head[4:8]==b"ftyp" and head[8:12] in (b"M4A ",b"isom",b"mp42",b"M4B "): return ".m4a"
    if head.startswith(b"\xff\xd8\xff"): return ".jpg"
    if head[:6] in (b"GIF87a",b"GIF89a"): return ".gif"
    if head[:4]==b"RIFF" and head[8:12]==b"WEBP": return ".webp"
    if head.startswith(bytes.fromhex("1a45dfa3")): return ".webm"
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

def decrypt_standard(source: Path, target: Path, key: str, expected: str | None = None, cancel=lambda:None, hashes=False):
    """Strip exact 16-byte header, XOR only next 16 bytes, stream remainder."""
    reject_links(source)
    if not isinstance(key,str) or not re.fullmatch(r"[0-9a-fA-F]{32}",key):
        raise AssetError("key_missing","System 데이터에 유효한 표준 암호화 키가 없습니다.")
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_name(target.name+".tmp")
    source_hash=hashlib.sha256(); output_hash=hashlib.sha256()
    try:
        with source.open("rb") as src, temp.open("wb") as dst:
            header=src.read(16);source_hash.update(header)
            if header!=HEADER: raise AssetError("header_mismatch","표준 암호화 헤더와 다릅니다.")
            block=src.read(16)
            if len(block)!=16: raise AssetError("truncated_file","암호화 파일이 잘렸습니다.")
            source_hash.update(block)
            plain=bytes(a^b for a,b in zip(block,bytes.fromhex(key)));dst.write(plain);output_hash.update(plain)
            while block:=src.read(1024*1024):
                cancel(); dst.write(block);source_hash.update(block);output_hash.update(block)
        with temp.open("rb") as f: kind=media_type(f.read(64))
        if kind not in (".png",".ogg",".m4a") or (expected and kind!=expected):
            raise AssetError("restored_format_invalid","표준 키로 처리했지만 결과 형식이 일치하지 않습니다. 키 불일치 또는 손상 여부는 미확정입니다.")
        try:size=validate_media(temp,kind)
        except (ValueError,OSError,SyntaxError) as error:raise AssetError("restored_format_invalid","복원 결과 파일의 구조 검증에 실패했습니다.") from error
        cancel(); os.replace(temp,target)
        return (kind,size,source_hash.hexdigest(),output_hash.hexdigest()) if hashes else (kind,size)
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
            "original_extension":source.suffix,"size_bytes":source.stat().st_size,"sha256":None,
            "category":category,"logical_path":logical_path(logical_rel),"status":"indexed","output_path":None,
            "output_sha256":None,"dimensions":None,"detected_format":None}
    with source.open("rb") as f: head=f.read(64)
    encrypted=head[:16]==HEADER
    suffix=source.suffix.lower()
    suspected=suffix in ENCRYPTED or suffix.rstrip("_") in ENCRYPTED or head.startswith(b"RPGMV")
    detected=media_type(head)
    if category=="movies" and head[4:8]==b"ftyp": detected=".mp4"
    record["detected_format"]=detected
    # Preserve relative original name in target; appending restored extension avoids collisions.
    # Source-path hash directories prevent suffix and case-only collisions.
    dest=output/"assets"/category/record["id"].split(":",1)[1]/source.name
    if encrypted:
        record["encryption"]="standard"
        if not enabled: record["status"]="copy_disabled";record["sha256"]=digest(source,cancel); return record
        if not options.decrypt: record["status"]="decryption_disabled";record["sha256"]=digest(source,cancel); return record
        if not isinstance(system.get("encryptionKey"),str) or not re.fullmatch(r"[a-fA-F0-9]{32}",system.get("encryptionKey","")):raise AssetError("key_missing","System 데이터에 유효한 표준 암호화 키가 없습니다.")
        expected=ENCRYPTED.get(suffix,ENCRYPTED.get(suffix.rstrip("_")))
        if expected is None:
            # Probe first block using only the supplied key; never infer a key.
            key=system.get("encryptionKey","")
            if re.fullmatch(r"[a-fA-F0-9]{32}",key or ""):
                expected=media_type(bytes(a^b for a,b in zip(head[16:32],bytes.fromhex(key)))+head[32:])
            if expected not in (".png",".ogg",".m4a"): raise AssetError("restored_format_invalid","표준 헤더지만 복원 결과 형식을 확인할 수 없습니다.")
        dest=dest.with_name(dest.name+expected)
        kind,size,record["sha256"],record["output_sha256"]=decrypt_standard(source,dest,system.get("encryptionKey",""),expected,cancel,hashes=True)
        record.update(status="decrypted",detected_format=kind,dimensions=size)
    elif suspected and detected is None:
        record.update(status="unsupported_encryption",encryption="unknown",diagnostic_code="header_mismatch" if head.startswith(b"RPGMV") else "unsupported_encryption",sha256=digest(source,cancel)); return record
    else:
        record["encryption"]="none"
        if detected in (".png",".jpg",".gif",".webp"):
            record["dimensions"]=validate_media(source,detected)
        if not enabled: record["status"]="copy_disabled";record["sha256"]=digest(source,cancel); return record
        record["sha256"]=record["output_sha256"]=copy_stream(source,dest,cancel); record["status"]="copied"
    record["output_path"]=dest.relative_to(output).as_posix()
    return record

