from pathlib import Path
import hashlib
import json
import os
import time
import tracemalloc
import pytest
from tools.sample_factory import create_game,cmd,KEY,encrypt,write,page
from rpgextractor.pipeline import Extractor,Options,rebuild_event
from rpgextractor.discovery import discover
from rpgextractor.io import load_json,UnsafePath
from rpgextractor.assets import decrypt_standard,HEADER
from rpgextractor.validation import validate_package
from rpgextractor.commands import analyze_commands
from rpgextractor.plugins import parse_plugins

def data(out,rel): return load_json(out/rel)["data"]
def hashes(folder): return {p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob('*') if p.is_file()}

def test_A_mv_basic(exported):
 root,png,out,result=exported
 assert result["state"]=="complete_with_issues" # Unknown 999 is reported separately, no data loss.
 assert result["schema_valid"] and result["output_counts"]==result["source_counts"]
 assert result["output_counts"]["maps"]==2 and result["output_counts"]["events"]==2
 assert result["output_counts"]["common_events"]==2 and result["plugins"]==1
 assert data(out,"reports/integrity.json")["all_raw_equal"]
 assert data(out,"normalized/references.json")["by_target"]["switch:1"]
 assert data(out,"normalized/relations.json")["common_event_calls"]["common_event:2"]==["common_event:1"]
 assert data(out,"reports/unresolved_references.json")==[]
 assert data(out,"reports/unsupported_commands.json")[0]["code"]==999

def test_B_mz_plugin_and_speaker(tmp_path):
 root,_=create_game(tmp_path/"MZ","MZ"); out=tmp_path/"out"
 report=(_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"]); assert report["schema_valid"]
 p=data(out,"events/map_001.json")["events"][0]["pages"][0]
 assert p["text_groups"][0]["speaker"]=="안내자"
 call=next(c for c in p["commands"] if c["raw"]["code"]==357)
 assert call["plugin"]["arguments"]=={"text":"한글"}
 assert call["raw"]["parameters"]==["TestPlugin","sample","샘플",{"text":"한글"}]
 assert data(out,"normalized/plugins.json")[0]["command_calls"]==[call["id"]]

def test_C_nested_branches_and_control_chars(exported):
 root,_,out,_=exported
 raw=load_json(root/"data/Map001.json")["events"][1]
 e=data(out,"events/map_001.json")["events"][0]
 assert rebuild_event(e)==raw
 p=e["pages"][0]; choice=p["choices"][0]
 assert choice["cancel_type"]==-2 and choice["choices"]==["문을 연다","돌아간다"]
 block=next(b for b in p["flow_blocks"] if b["code"]==102)
 assert block["start_index"]==4 and block["end_index"]==13
 assert [x["index"] for x in block["branches"]]==[5,11]
 assert len(p["commands"][9]["contexts"])==3
 assert p["text_groups"][0]["lines"]==[raw["pages"][0]["list"][1]["parameters"][0]]
 assert "\\V[1]\n" in p["text_groups"][0]["text"]
 assert p["commands"][24]["raw"]["customField"]=={"keep":True}

def test_D_multiple_pages(exported):
 _,_,out,_=exported
 e=data(out,"events/map_001.json")["events"][0]
 assert [p["page_index"] for p in e["pages"]]==[0,1]
 assert e["page_selection"]=="highest_satisfied_page_index"
 checks=e["pages"][1]["condition_checks"]
 assert next(x for x in checks if x["kind"]=="variable")["value"]==3
 assert next(x for x in checks if x["kind"]=="variable")["enabled"] is True
 assert next(x for x in checks if x["kind"]=="item")["enabled"] is False

def test_E_encrypted_image_exact(exported,tmp_path):
 root,png,out,result=exported
 picture=next(a for a in data(out,"normalized/assets.json") if a["source_path"].startswith("img/pictures"))
 assert picture["status"]=="decrypted" and picture["dimensions"]==[3,2]
 assert (out/picture["output_path"]).read_bytes()==png
 assert picture["output_sha256"]==hashlib.sha256(png).hexdigest()
 assert result["decrypted"]==1
 enc=root/"img/pictures/scene.rpgmvp"; dest=tmp_path/"wrong.png"
 with pytest.raises(ValueError): decrypt_standard(enc,dest,"f"*32,".png")
 assert not dest.exists() and not dest.with_name("wrong.png.tmp").exists()

def test_F_nonstandard_extension_and_plain_png(mv):
 root,png,out=mv
 (root/"img/pictures/weird.rpgmvp_").write_bytes(encrypt(png))
 (root/"img/pictures/bad.rpgmvp_").write_bytes(b"proprietary format")
 (root/"img/pictures/plain.rpgmvp_").write_bytes(png)
 (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 assets={Path(x["source_path"]).name:x for x in data(out,"normalized/assets.json")}
 assert assets["weird.rpgmvp_"]["status"]=="decrypted"
 assert assets["bad.rpgmvp_"]["status"]=="unsupported_encryption"
 assert assets["plain.rpgmvp_"]["status"]=="copied"
 assert (out/assets["plain.rpgmvp_"]["output_path"]).read_bytes()==png

def test_G_corrupt_json_continues(mv):
 root,_,out=mv; (root/"data/Map002.json").write_text('{bad',encoding="utf-8")
 result=(_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 assert result["errors"]>=1 and result["output_counts"]["maps"]==1 and result["schema_valid"]
 assert result["state"]=="partial"
 assert (out/"source_archive/data/Map002.json").read_text()=="{bad"
 assert any(x["code"]=="json_parse_failed" for x in data(out,"reports/warnings.json"))

def test_H_large_project(tmp_path):
 root,_=create_game(tmp_path/"large","MZ",event_count=600)
 # Thousands of commands, two pages per event; measure actual peak + elapsed.
 out=tmp_path/"export"; tracemalloc.start(); start=time.monotonic()
 result=(_extraction := Extractor(Options(llm=False)).run(root,out)); out=Path(_extraction["output_folder"])
 elapsed=time.monotonic()-start; _,peak=tracemalloc.get_traced_memory(); tracemalloc.stop()
 assert result["output_counts"]["events"]==601 and result["output_counts"]["commands"]>17000
 assert result["source_counts"]==result["output_counts"] and result["schema_valid"]
 assert peak<300*1024*1024
 (tmp_path/"performance.json").write_text(json.dumps({"elapsed_seconds":elapsed,"peak_tracemalloc_bytes":peak}))
 print(f"\nlarge: events=601 commands={result['output_counts']['commands']} seconds={elapsed:.2f} peak={peak/1024**2:.1f} MiB")

def test_I_all_schemas_and_mutation(exported):
 _,_,out,_=exported; assert validate_package(out)==[]
 obj=load_json(out/"events/map_001.json"); del obj["data"]["events"][0]["pages"][0]["commands"][0]["raw"]
 write(out/"events/map_001.json",obj)
 assert any(x["path"]=="events/map_001.json" for x in validate_package(out))

def test_J_source_unchanged(mv):
 root,_,out=mv; before=hashes(root); (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"]); assert before==hashes(root)

def test_stable_ids_and_redaction(mv,tmp_path):
 root,_,out=mv; (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"]); second=tmp_path/"second"; (_extraction := Extractor().run(root,second)); second=Path(_extraction["output_folder"])
 assert data(out,"normalized/events.json")==data(second,"normalized/events.json")
 assert load_json(out/"manifest.json")["package_id"]==load_json(second/"manifest.json")["package_id"]
 for p in out.rglob('*'):
  if p.suffix in (".json",".jsonl") and "schemas" not in p.parts: assert KEY not in p.read_text(encoding="utf-8")
 inv=data(out,"normalized/source_inventory.json"); system=next(x for x in inv if x["path"]=="data/System.json")
 assert system["representation"]=="redacted_json"
 assert "encryptionKey" not in load_json(out/"source_archive/data/System.json")

def test_sensitive_archive_explicit_option(mv):
 root,_,out=mv; (_extraction := Extractor(Options(sensitive_system=True)).run(root,out)); out=Path(_extraction["output_folder"])
 assert (root/"data/System.json").read_bytes()==(out/"source_archive/data/System.json").read_bytes()
 assert "encryptionKey" not in data(out,"normalized/game.json")["system"]

def test_multi_roots_and_nested_discovery(tmp_path):
 a,_=create_game(tmp_path/"A","MV",nested=True); b,_=create_game(tmp_path/"B","MZ")
 candidates=discover(tmp_path); assert {x.root for x in candidates}=={a,b}
 with pytest.raises(ValueError): Extractor().run(tmp_path,tmp_path/"out")
 chosen=next(x for x in candidates if x.root==a)
 result=Extractor().run(tmp_path,tmp_path/"out",chosen); assert result["schema_valid"]

def test_symlink_and_output_safety(mv,tmp_path):
 root,_,out=mv
 external=tmp_path/"outside"; external.mkdir(); (external/"secret.png").write_bytes(b"no")
 try: (root/"img/link").symlink_to(external,target_is_directory=True)
 except OSError: pytest.skip("symlink privilege unavailable")
 (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 assert not any("secret" in a["source_path"] for a in data(out,"normalized/assets.json"))
 assert Extractor().run(root,root)["schema_valid"]
 assert Extractor().run(root,out)["schema_valid"]

def test_output_inside_source_is_excluded(mv):
 root,_,_=mv; out=root/"export"; (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 assert not any("export/" in a["path"] for a in data(out,"normalized/source_inventory.json"))
 assert validate_package(out)==[]

def test_cancel_manifest_is_never_complete(mv):
 root,_,out=mv; stop=[False]
 def progress(*args): stop[0]=True
 result=(_extraction := Extractor(progress=progress,cancelled=lambda:stop[0]).run(root,out)); out=Path(_extraction["output_folder"])
 assert result["state"]=="cancelled" and not result["schema_valid"]
 assert data(out,"manifest.json")["state"]=="cancelled"

def test_scripts_never_evaluated(mv):
 root,_,out=mv
 marker=root/"should_not_exist"
 (root/"js/plugins/Evil.js").write_text(f"require('fs').writeFileSync({json.dumps(str(marker))}, 'bad');",encoding="utf-8")
 (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"]); assert not marker.exists()
 assert (out/"source_archive/js/plugins/Evil.js").exists()

def test_missing_database_and_unresolved(mv):
 root,_,out=mv; (root/"data/CommonEvents.json").unlink()
 (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 unresolved=data(out,"reports/unresolved_references.json")
 assert any(x["target"]=="common_event:1" for x in unresolved)

def test_movement_and_indirect_variable_references():
 commands=[cmd(201,1,1,2,3,0,0),cmd(205,0,{"list":[{"code":27,"parameters":[2]},{"code":45,"parameters":["throw 1"]}]}),cmd(122,1,1,1,1,2),cmd(285,1,0,2,-1,0)]
 parsed,refs,unknown,opaque=analyze_commands(commands,"page","event","MZ")
 assert {r["target_id"] for r in refs if r["source_id"]=="page:command:0"}=={"1","2","3"}
 assert any(r["target_kind"]=="switch" and r["detail"].get("movement_index")==0 for r in refs)
 assert any(r["target_id"]=="2" and r["detail"].get("operand_for_range")==[1,1] for r in refs)
 assert not any(r["target_id"]=="-1" for r in refs)
 assert opaque

def test_nonliteral_plugins_are_not_executed(tmp_path):
 path=tmp_path/"plugins.js"; path.write_text('var $plugins = getPlugins();',encoding="utf-8")
 with pytest.raises(ValueError): parse_plugins(path)

def test_unsupported_engine_fails_clearly(mv):
 root,_,out=mv
 for p in (root/"js").glob('rpg_*.js'): p.unlink()
 assert Extractor().run(root,out)["schema_valid"]

def test_options_and_raw_extensions(mv):
 root,_,out=mv; result=(_extraction := Extractor(Options(raw_json=False,plugin_sources=False,images=False,llm=False,keep_tiles=False)).run(root,out)); out=Path(_extraction["output_folder"])
 assert result["schema_valid"] and not (out/"llm_input").exists()
 assert not (out/"source_archive").exists()
 assert "data" not in data(out,"events/map_001.json")["raw_map"]
 assert data(out,"normalized/assets.json") and not (out/"assets/images").exists()

def test_relocated_data_and_assets(tmp_path):
 import shutil
 root,_=create_game(tmp_path/"game","MZ")
 (root/"assets").mkdir(); (root/"content").mkdir()
 shutil.move(str(root/"data"),str(root/"content/db"))
 shutil.move(str(root/"img"),str(root/"assets/img"))
 c=discover(root)[0]; assert c.root==root and c.data_dir==root/"content/db"
 out=tmp_path/"out"; result=(_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 assert result["schema_valid"]
 assert any(a["logical_path"]=="img/pictures/scene" for a in data(out,"normalized/assets.json"))
 assert not data(out,"reports/unresolved_references.json")

def test_malformed_database_and_page_does_not_abort(mv):
 root,_,out=mv
 write(root/"data/BrokenDatabase.json",[{"effects":None}])
 raw=load_json(root/"data/Map001.json"); raw["events"][1]["pages"][0]["list"]=None; write(root/"data/Map001.json",raw)
 result=(_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 assert result["state"] in ("partial","invalid")
 assert (out/"events/map_002.json").exists() and (out/"report.json").exists()
 assert data(out,"events/map_001.json")["events"][0]["pages"][0]["raw_unparsed"]["list"] is None
 assert result["schema_valid"]

def test_audio_decryption_and_truncation(mv,tmp_path):
 root,_,out=mv
 audio=(root/"audio/bgm/Theme.ogg").read_bytes()
 (root/"audio/bgm/Theme.ogg").unlink()
 (root/"audio/bgm/Theme.rpgmvo").write_bytes(encrypt(audio))
 result=(_extraction := Extractor(Options(audio=True)).run(root,out)); out=Path(_extraction["output_folder"])
 rec=next(x for x in data(out,"normalized/assets.json") if x["category"]=="audio")
 assert rec["status"]=="decrypted" and (out/rec["output_path"]).read_bytes()==audio
 truncated=tmp_path/"truncated"; truncated.write_bytes(HEADER+b"1")
 with pytest.raises(ValueError): decrypt_standard(truncated,tmp_path/"out.ogg",KEY,".ogg")
 assert not (tmp_path/"out.ogg").exists()

def test_unknown_additional_fields_preserved_without_archive(mv):
 root,_,out=mv
 (_extraction := Extractor(Options(raw_json=False)).run(root,out)); out=Path(_extraction["output_folder"])
 shard=data(out,"events/map_001.json")
 assert shard["raw_map"]["unknownMapFlag"]==7
 event=shard["events"][0]
 assert event["raw_metadata"]["pluginExtra"]==[1,2]
 assert rebuild_event(event)==load_json(root/"data/Map001.json")["events"][1]

def test_disabled_detailed_reports(mv):
 root,_,out=mv; (_extraction := Extractor(Options(detailed_reports=False)).run(root,out)); out=Path(_extraction["output_folder"])
 assert not (out/"reports/raw_comparisons.json").exists()
 assert (out/"reports/warnings.json").exists() and (out/"reports/integrity.json").exists()

def test_asset_output_name_collision_isolated(mv):
 root,png,out=mv
 # A real PNG whose name equals the naive decrypted destination must survive.
 (root/"img/pictures/scene.rpgmvp.png").write_bytes(png)
 (_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 selected=[a for a in data(out,"normalized/assets.json") if a["source_path"].startswith("img/pictures/")]
 assert len({a["output_path"] for a in selected})==2
 assert all((out/a["output_path"]).read_bytes()==png for a in selected)

def test_symlinked_system_not_read(mv,tmp_path):
 root,_,out=mv; system=root/"data/System.json"
 outside=tmp_path/"private.json"; outside.write_bytes(system.read_bytes()); system.unlink()
 try: system.symlink_to(outside)
 except OSError: pytest.skip("symlink privilege unavailable")
 result=(_extraction := Extractor().run(root,out)); out=Path(_extraction["output_folder"])
 assert data(out,"normalized/game.json")["system"]=={}
 assert any(x["code"]=="unsafe_link" for x in data(out,"reports/warnings.json"))
 assert not (out/"source_archive/data/System.json").exists()

def test_m4a_standard_container_roundtrip(tmp_path):
 import struct
 def box(kind,payload): return struct.pack('>I',len(payload)+8)+kind+payload
 plain=box(b'ftyp',b'M4A '+bytes(4)+b'isom')+box(b'moov',b'')+box(b'mdat',b'test')
 source=tmp_path/'audio.m4a_'; source.write_bytes(encrypt(plain)); dest=tmp_path/'audio.m4a'
 kind,_=decrypt_standard(source,dest,KEY,'.m4a')
 assert kind=='.m4a' and dest.read_bytes()==plain

def test_manifest_namespace_consistency(exported):
 _,_,out,_=exported
 value=load_json(out/'normalized/maps.json'); value['package_id']='another-game'; write(out/'normalized/maps.json',value)
 assert any(x['path']=='normalized/maps.json' and '불일치' in x['message'] for x in validate_package(out))
