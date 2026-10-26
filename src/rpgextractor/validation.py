from __future__ import annotations
from pathlib import Path
import json
from jsonschema import Draft202012Validator
from .io import load_json, safe_files, reject_links, UnsafePath

REQUIRED=("manifest.json","report.json","normalized/game.json","normalized/maps.json","normalized/events.json",
          "normalized/common_events.json","normalized/switches.json","normalized/variables.json","normalized/references.json",
          "normalized/assets.json","normalized/plugins.json","normalized/relations.json","normalized/source_inventory.json",
          "enrichment/template.json","normalized/text_index.jsonl")

def validate_package(folder: Path, cancel=lambda:None):
    folder=Path(folder)
    # Use the trusted bundled schema, never an arbitrary output-supplied remote schema.
    schema=load_json(Path(__file__).parent/"schemas/package.schema.json")
    Draft202012Validator.check_schema(schema)
    validator=Draft202012Validator(schema)
    errors=[]
    for name in REQUIRED:
        try:
            reject_links(folder/name)
            if not (folder/name).is_file(): errors.append({"path":name,"message":"필수 출력 파일 누락"})
        except (OSError,UnsafePath): errors.append({"path":name,"message":"필수 출력 경로가 안전하지 않거나 읽을 수 없음"})
    try:
        manifest=load_json(folder/"manifest.json")
    except (OSError,ValueError): manifest=None
    expected={k:manifest.get(k) for k in ("schema_version","engine","game_id","package_id")} if isinstance(manifest,dict) else None
    def identity_check(value,path):
        if expected and isinstance(value,dict) and any(value.get(k)!=v for k,v in expected.items()):
            errors.append({"path":path,"message":"manifest와 패키지 식별 정보 불일치"})
    def unsafe(code,path,message):
        errors.append({"path":str(path),"message":"출력 경로 읽기 실패 또는 링크 감지"})
    for p in safe_files(folder,issue=unsafe):
        cancel(); rel=p.relative_to(folder).as_posix()
        if rel.startswith(("source_archive/","schemas/","assets/","raw/")): continue
        if p.suffix not in (".json",".jsonl"): continue
        try:
            if p.suffix==".jsonl":
                with p.open(encoding="utf-8") as f:
                    for line_no,line in enumerate(f,1):
                        cancel()
                        if not line.strip(): continue
                        value=json.loads(line)
                        identity_check(value,f"{rel}:{line_no}")
                        for e in validator.iter_errors(value): errors.append({"path":f"{rel}:{line_no}","message":"스키마 불일치: "+"/".join(map(str,e.absolute_path))})
            else:
                value=load_json(p)
                identity_check(value,rel)
                if rel=="manifest.json": manifest=value
                for e in validator.iter_errors(value): errors.append({"path":rel,"message":"스키마 불일치: "+"/".join(map(str,e.absolute_path))})
        except (OSError,ValueError,UnicodeError): errors.append({"path":rel,"message":"출력 JSON 파싱 실패"})
    if manifest:
        opts=manifest.get("data",{}).get("options",{})
        if opts.get("llm"):
            for name in ("game_overview.json","switch_usage.json","variable_usage.json","event_chunks.jsonl","plugin_index.json"):
                if not (folder/"llm_input"/name).is_file(): errors.append({"path":"llm_input/"+name,"message":"필수 LLM 자료 누락"})
    return errors
