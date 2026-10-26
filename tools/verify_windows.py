"""Verify PE windowed subsystem, launch the frozen GUI twice, check saved evidence."""
from pathlib import Path
import json
import struct
import subprocess
import sys

def main():
    if sys.platform!='win32': raise SystemExit('Windows execution required')
    exe=Path('dist/RPGMakerExtractor/RPGMakerExtractor.exe').resolve()
    with exe.open('rb') as f:
        assert f.read(2)==b'MZ';f.seek(0x3c);offset=struct.unpack('<I',f.read(4))[0]
        f.seek(offset);assert f.read(4)==b'PE\0\0'
        f.seek(offset+24+68);assert struct.unpack('<H',f.read(2))[0]==2,'Console subsystem detected'
    for i in range(2):
        report=Path(f'build/windows-evidence/launch-{i}.json').resolve()
        proc=subprocess.run([str(exe),'--gui-smoke-test',str(Path('build/smoke-inputs/config.json').resolve()),str(report)],timeout=420)
        assert proc.returncode==0, f'Frozen GUI failed: {proc.returncode}'
        evidence=json.loads(report.read_text(encoding='utf-8'))
        assert evidence['success'] and evidence['frozen'] and not evidence['console_attached']
        assert len(evidence['cases'])==4
    print('Windowed PE + packaged GUI + extraction + schema + folder open + relaunch passed')
if __name__=='__main__':main()
