from __future__ import annotations
from pathlib import Path
from functools import lru_cache
import json
from jsonschema import Draft202012Validator
from .io import load_json, safe_files, reject_links, UnsafePath

REQUIRED=("manifest.json","report.json","normalized/game.json","normalized/maps.json","normalized/events.json",
          "normalized/common_events.json","normalized/switches.json","normalized/variables.json","normalized/references.json",
          "normalized/assets.json","normalized/plugins.json","normalized/relations.json","normalized/source_inventory.json",
          "enrichment/template.json","normalized/text_index.jsonl")

@lru_cache(maxsize=1)
def validators():
    schema=load_json(Path(__file__).parent/'schemas/package.schema.json')
    Draft202012Validator.check_schema(schema)
    full=Draft202012Validator(schema); by_kind={}
    # All branches are pure data_type discriminators. Keep envelope/$defs and
    # the applicable branch intact; unknown/malformed discriminators use full.
    branches=schema.get('allOf',[])
    if all(b.get('if')=={'properties':{'data_type':{'const':b.get('if',{}).get('properties',{}).get('data_type',{}).get('const')}}} for b in branches):
        for b in branches:
            kind=b['if']['properties']['data_type']['const']
            by_kind[kind]=Draft202012Validator({**schema,'allOf':[b]})
    return full,by_kind

def validate_value(value):
    full,kinds=validators()
    validator=kinds.get(value.get('data_type'),full) if isinstance(value,dict) and isinstance(value.get('data_type'),str) else full
    return validator.iter_errors(value)

def validate_package(folder:Path,cancel=lambda:None,progress=lambda *args:None,only=None,stats=None):
    folder=Path(folder); errors=[]; stats=stats if stats is not None else {}
    stats.update(files=0,bytes=0,records=0,scope='changed_reports' if only is not None else 'full')
    try: validators()
    except (OSError,ValueError):
        return [{'path':'schemas/package.schema.json','message':'프로그램의 검증 스키마를 읽을 수 없습니다. 전체 배포본을 다시 설치하거나 압축을 모두 풀어 주세요.'}]
    if only is None:
        for name in REQUIRED:
            cancel()
            try:
                reject_links(folder/name)
                if not (folder/name).is_file():errors.append({'path':name,'message':'필수 출력 파일 누락'})
            except (OSError,UnsafePath):errors.append({'path':name,'message':'필수 출력 경로가 안전하지 않거나 읽을 수 없음'})
    try: manifest=load_json(folder/'manifest.json')
    except (OSError,ValueError):manifest=None
    expected={k:manifest.get(k) for k in ('schema_version','engine','game_id','package_id')} if isinstance(manifest,dict) else None
    def check(value,path):
        stats['records']+=1
        if expected and isinstance(value,dict) and any(value.get(k)!=v for k,v in expected.items()):errors.append({'path':path,'message':'manifest와 패키지 식별 정보 불일치'})
        for e in validate_value(value):errors.append({'path':path,'message':'스키마 불일치: '+'/'.join(map(str,e.absolute_path))})
    def unsafe(code,path,message):errors.append({'path':str(path),'message':'출력 경로 읽기 실패 또는 링크 감지'})
    paths=[]
    if only is None:
        for p in safe_files(folder,issue=unsafe):
            cancel();rel=p.relative_to(folder).as_posix()
            if not rel.startswith(('source_archive/','schemas/','assets/','raw/')) and p.suffix in ('.json','.jsonl'):paths.append(p)
    else:
        for name in only:
            p=folder/name
            if Path(name).is_absolute() or '..' in Path(name).parts:raise ValueError('안전하지 않은 검증 경로')
            paths.append(p)
    for i,p in enumerate(paths):
        cancel();rel=p.relative_to(folder).as_posix();progress(i,len(paths),len(errors),rel)
        try:
            reject_links(p); stats['bytes']+=p.stat().st_size
            if p.suffix=='.jsonl':
                with p.open(encoding='utf-8') as f:
                    for line_no,line in enumerate(f,1):
                        cancel()
                        if line.strip():check(json.loads(line),f'{rel}:{line_no}')
                        if line_no%256==0:progress(i,len(paths),len(errors),f'{rel}:{line_no}')
            else:check(load_json(p),rel)
        except (OSError,ValueError,UnicodeError):errors.append({'path':rel,'message':'출력 JSON 파싱 실패'})
        stats['files']+=1;progress(i+1,len(paths),len(errors),rel)
    if manifest:
        opts=manifest.get('data',{}).get('options',{})
        if only is None and opts.get('llm'):
            for name in ('game_overview.json','switch_usage.json','variable_usage.json','event_chunks.jsonl','plugin_index.json'):
                if not (folder/'llm_input'/name).is_file():errors.append({'path':'llm_input/'+name,'message':'필수 LLM 자료 누락'})
        try:
            report=load_json(folder/'report.json')['data']
            if report.get('state')!=manifest.get('data',{}).get('state'):errors.append({'path':'report.json','message':'manifest/report 최종 상태 불일치'})
            if (folder/'reports/validation.json').exists():
                valid=load_json(folder/'reports/validation.json')['data']['valid']
                if valid!=report.get('schema_valid'):errors.append({'path':'report.json','message':'검증 보고서/schema_valid 불일치'})
        except (OSError,ValueError,KeyError,TypeError):errors.append({'path':'report.json','message':'최종 보고서 읽기 실패'})
    return errors
