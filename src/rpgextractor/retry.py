"""Retry failed media only, into a new resource ZIP. Never mutate old exports."""
from pathlib import Path
from dataclasses import fields
import json,zipfile
from .io import load_json,write_json,reject_links,digest
from .output import allocate
from .assets import process_asset
from .adapters import adapter_for
from .discovery import discover,preferred
from .metrics import Metrics

def retry_resources(previous,game,options=None,cancel=lambda:None,progress=lambda *args:None):
    from .pipeline import Options
    previous=Path(previous);manifest=load_json(previous/'manifest.json')
    assets=load_json(previous/'normalized/assets.json')['data']
    candidate=preferred(discover(game,cancel=cancel))
    if candidate is None or candidate.archive:raise ValueError('리소스 재시도는 단일 일반 게임 폴더에서 지원합니다. 여러 후보/아카이브는 새 전체 추출을 사용하세요.')
    if candidate.engine!=manifest['engine']:raise ValueError('이전 결과와 현재 게임 엔진이 다릅니다.')
    adapter=adapter_for(candidate.engine)
    # Require the database identity, excluding the encryption key, to match.
    old_system=load_json(previous/'normalized/game.json')['data']['system']
    system=adapter.load(candidate.data_dir/('System'+adapter.extension),cancel)
    if not isinstance(system,dict):raise ValueError('현재 System 데이터를 읽을 수 없습니다.')
    for name in ('gameTitle','versionId','switches','variables'):
        if old_system.get(name)!=system.get(name):raise ValueError('이전 결과와 현재 게임 데이터가 다릅니다. 새 추출을 사용하세요.')
    opts=Options(**{k:v for k,v in manifest['data']['options'].items() if k in {f.name for f in fields(Options)}})
    opts.images=opts.audio=opts.movies=opts.decrypt=True
    output=allocate(previous.parent,previous.name+'_ResourceRetry');metrics=Metrics();results=[]
    failed=[a for a in assets if a['status'] in ('failed','unsupported_encryption','decryption_disabled')]
    write_json(output/'retry-report.json',{'complete':False,'files':[],'previous_export':str(previous)})
    with metrics.stage('resource_retry',files=len(failed)):
        with zipfile.ZipFile(output/'ResourcesRetry.zip','x',compression=zipfile.ZIP_DEFLATED,allowZip64=True) as archive:
            for i,asset in enumerate(failed):
                cancel();rel=asset['source_path'];progress('리소스 재시도 · '+rel,i,len(failed),sum(r['status']=='failed' for r in results))
                row={'source_path':rel,'previous_status':asset['status']}
                try:
                    source=candidate.root/rel
                    if Path(rel).is_absolute() or '..' in Path(rel).parts:raise ValueError('unsafe_path')
                    logical=asset['logical_path']
                    if Path(logical).is_absolute() or '..' in Path(logical).parts or '\\' in logical or ':' in logical:raise ValueError('unsafe_resource_reference')
                    reject_links(source)
                    rec=process_asset(source,candidate.root,output,system,opts,cancel,canonical=asset['logical_path']+source.suffix)
                    row.update(status=rec['status'],diagnostic_code=rec.get('diagnostic_code'),source_changed=rec.get('sha256')!=asset.get('sha256'))
                    if rec.get('output_path'):
                        entry=rec['logical_path']+(rec.get('detected_format') or source.suffix)
                        archive.write(output/rec['output_path'],entry);row['zip_path']=entry
                except (OSError,ValueError) as error:
                    row.update(status='failed',diagnostic_code=getattr(error,'code',None) or {2:'source_missing',13:'access_denied',28:'disk_full'}.get(getattr(error,'errno',None),'invalid_or_io'))
                results.append(row)
                write_json(output/'retry-report.json',{'complete':False,'files':results,'previous_export':str(previous),'performance':metrics.report()})
    report={'complete':True,'files':results,'previous_export':str(previous),'performance':metrics.report(),'output_folder':str(output)}
    write_json(output/'retry-report.json',report)
    progress('리소스 재시도 완료',len(failed),len(failed),sum(r['status']=='failed' for r in results))
    return report
