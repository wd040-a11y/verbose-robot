"""Sparse ZIP64 fixture: real JSON and media after a >2GiB unused source file."""
from pathlib import Path
import zipfile,zlib
out=Path('.large-test');out.mkdir(exist_ok=True)
size=2**31+1024
crc=0;block=b'\0'*(1024*1024)
for _ in range(size//len(block)):crc=zlib.crc32(block,crc)
crc=zlib.crc32(b'\0'*(size%len(block)),crc)
info=zipfile.ZipInfo('raw/unused-padding.bin');info.file_size=size;info.compress_size=size;info.CRC=crc;info.header_offset=0;info.compress_type=zipfile.ZIP_STORED;info.extract_version=45;info.create_version=45
with (out/'large.zip').open('w+b') as f:
 f.write(info.FileHeader(zip64=True));f.seek(size,1)
 with zipfile.ZipFile(f,'w',allowZip64=True) as z:
  z.filelist.append(info);z.NameToInfo[info.filename]=info
  with zipfile.ZipFile('fixtures/sample.zip') as source:
   for entry in source.infolist():z.writestr(entry.filename,source.read(entry))
  with zipfile.ZipFile('fixtures/images.zip') as source:z.writestr('media/cg.png',source.read('Wrapper/img/pictures/scene.png'))
print((out/'large.zip').stat().st_size)
