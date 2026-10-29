"""Windowless, local-only importer backend; never execute game code."""
import argparse,json,sys
from pathlib import Path
from rpgextractor.pipeline import Extractor,Options
from rpgextractor.discovery import discover
from rpgextractor.io import write_json,load_json

def main():
 if len(sys.argv)==4 and sys.argv[1]=='--attach-settings':
  import zipfile
  archive,settings=Path(sys.argv[2]),Path(sys.argv[3])
  if settings.stat().st_size>24_000_000:raise ValueError('개인 설정 크기 제한')
  data=json.loads(settings.read_text(encoding='utf-8'))
  with zipfile.ZipFile(archive,'a',compression=zipfile.ZIP_DEFLATED,allowZip64=True) as z:
   manifest=json.loads(z.read('manifest.json'))
   if data.get('package_id')!=manifest['package_id']:raise ValueError('패키지 식별 정보 불일치')
   if 'player/settings.json' in z.namelist():raise ValueError('개인 설정 중복')
   z.writestr('player/settings.json',json.dumps(data,ensure_ascii=False))
  return 0
 p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);p.add_argument('--result',required=True);p.add_argument('--progress',required=True);p.add_argument('--candidate',type=int);a=p.parse_args()
 def progress(stage,current,total,errors):
  # Progress polling must never turn a transient Windows file lock into data loss.
  try:write_json(Path(a.progress),dict(stage=stage,current=current,total=total,errors=errors))
  except OSError:pass
 try:
  candidates=discover(Path(a.input));candidate=None
  if a.candidate is not None:
   if not 0<=a.candidate<len(candidates):raise ValueError('데이터 후보를 다시 선택하세요.')
   candidate=candidates[a.candidate]
  elif len(candidates)>1:
   write_json(Path(a.result),{'candidates':[dict(name=c.title or c.root.name,engine=c.engine,maps=c.map_files,path=str(c.data_dir)) for c in candidates]});return 0
  result=Extractor(Options.story(),progress=progress).run(Path(a.input),Path(a.output),candidate)
  if result['state'] in ('failed','invalid','cancelled') or not result['output_counts']['events']:raise ValueError('감상 가능한 게임 데이터를 등록하지 못했습니다. 추출 결과 보고서를 확인하세요.')
  archive=Path(result['output_folder'])/'Game.zip'
  if not archive.is_file():
   issues=load_json(Path(result['output_folder'])/'reports/warnings.json')['data']
   write_json(Path(a.result),{'error':'감상 패키지를 만들지 못했습니다. 남은 추출 자료와 보고서는 보존했습니다.','report':result,'issues':issues});return 1
  write_json(Path(a.result),{'archive':str(archive),'report':result});return 0
 except Exception as e:
  write_json(Path(a.result),{'error':str(e) if isinstance(e,ValueError) else '게임 읽기 또는 저장에 실패했습니다. 접근 권한과 저장 공간을 확인하세요.'});return 1
if __name__=='__main__':sys.exit(main())
