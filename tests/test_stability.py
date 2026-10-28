import json,zipfile,copy
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator
from rpgextractor.pipeline import Extractor,Options
from rpgextractor.discovery import discover,preferred
from rpgextractor.validation import validate_package,validate_value,validators
from rpgextractor.io import load_json,write_json,Cancelled,digest
from rpgextractor.assets import HEADER,AssetError,decrypt_standard
from rpgextractor.retry import retry_resources
from tools.sample_factory import create_game,write,cmd,KEY

def payload(p):return load_json(p)['data']

@pytest.mark.parametrize('engine,nested',[('MV',False),('MZ',False),('MV',True),('MZ',True)])
def test_story_profile_and_roots(tmp_path,engine,nested):
 root,_=create_game(tmp_path/'game',engine,nested=nested)
 c=preferred(discover(tmp_path/'game'));assert c and c.validation['sample_valid']>0
 r=Extractor(Options.story()).run(tmp_path/'game',tmp_path/'out');out=Path(r['output_folder'])
 assert r['schema_valid'] and r['output_counts']['events']>0
 assert not (out/'source_archive').exists() and not (out/'llm_input').exists()
 assert not validate_package(out)
 with zipfile.ZipFile(out/'Story.zip') as z:
  assert 'normalized/assets.json' in z.namelist() and 'events/map_001.json' in z.namelist()
  assert not any(n.startswith(('assets/','raw/','llm_input/')) for n in z.namelist())
  shard=json.loads(z.read('events/map_001.json'))['data'];assert shard['events'][0]['pages'][0]['commands'][0]['raw']['code']==101
 perf=payload(out/'reports/performance.json')
 assert perf['validation']['full']['scope']=='full' and perf['validation']['final_reports']['files']==4
 assert {'extraction','resources','output','validation','zip'}<=set(perf['stages'])

def test_candidates_tie_not_arbitrarily_combined(tmp_path):
 create_game(tmp_path/'A','MZ');create_game(tmp_path/'B','MZ')
 candidates=discover(tmp_path);assert len(candidates)==2 and preferred(candidates) is None
 with pytest.raises(ValueError,match='후보'):Extractor().run(tmp_path,tmp_path/'out')

def test_damaged_map_and_zero_events(tmp_path):
 root,_=create_game(tmp_path/'game','MZ');(root/'data/Map001.json').write_text('{broken')
 r=Extractor(Options.story()).run(root,tmp_path/'out');out=Path(r['output_folder'])
 assert r['state']=='partial' and (out/'events/map_002.json').exists()
 for p in (root/'data').glob('Map[0-9]*.json'):
  v={'events':[None]};write(p,v)
 r=Extractor().run(root,tmp_path/'out');assert r['state'] not in ('complete','complete_with_issues')
 assert any(x['code']=='no_story_content' for x in payload(Path(r['output_folder'])/'reports/warnings.json'))

def test_no_core_rejected(tmp_path):
 (tmp_path/'data').mkdir();(tmp_path/'data/System.json').write_text('{bad')
 with pytest.raises(ValueError,match='읽을 수'):Extractor().run(tmp_path,tmp_path/'out')

def test_empty_picture_is_not_missing_file(tmp_path):
 root,_=create_game(tmp_path/'game','MZ');path=root/'data/Map001.json';m=load_json(path)
 m['events'][1]['pages'][0]['list'] += [cmd(231,1,'',0,0,0,0,100,100,255,0),cmd(231,1,{'dynamic':True},0,0,0,0,100,100,255,0)]
 write(path,m);r=Extractor(Options.story()).run(root,tmp_path/'out');out=Path(r['output_folder'])
 refs=payload(out/'reports/resource_diagnostics.json')['references'];assert any(x['status']=='empty_name' for x in refs);assert any(x['status']=='unconfirmed' for x in refs)
 assert not any(x['target']=='asset:img/pictures/' for x in payload(out/'reports/unresolved_references.json'))

def test_key_missing_retry_and_source_preservation(tmp_path):
 root,_=create_game(tmp_path/'game','MZ');p=root/'data/System.json';system=load_json(p);system.pop('encryptionKey');write(p,system)
 r=Extractor(Options.story()).run(root,tmp_path/'out');out=Path(r['output_folder']);assets=payload(out/'normalized/assets.json')
 assert any(x['status']=='failed' for x in assets)
 assert payload(out/'reports/resource_diagnostics.json')['groups']['key_missing']['count']>0
 before={str(p):digest(p) for p in out.rglob('*') if p.is_file()}
 system['encryptionKey']=KEY;write(p,system)
 retry=retry_resources(out,root);assert any(x['status']=='decrypted' for x in retry['files'])
 with zipfile.ZipFile(Path(retry['output_folder'])/'ResourcesRetry.zip') as z:assert 'img/pictures/scene.png' in z.namelist()
 assert before=={str(p):digest(p) for p in out.rglob('*') if p.is_file()}
 assert KEY not in (Path(retry['output_folder'])/'retry-report.json').read_text()

@pytest.mark.parametrize('data,code',[(HEADER+b'x','truncated_file'),(b'not-standard'+bytes(50),'header_mismatch'),(HEADER+bytes(32),'restored_format_invalid')])
def test_decryption_reason(tmp_path,data,code):
 p=tmp_path/'bad.rpgmvp';p.write_bytes(data)
 with pytest.raises(AssetError) as e:decrypt_standard(p,tmp_path/'out.png',KEY,'.png')
 assert e.value.code==code and not (tmp_path/'out.png').exists()

def test_streaming_cancel_and_full_validator_equivalence(exported):
 _,_,out,_=exported
 schema=load_json(Path(__file__).parents[1]/'src/rpgextractor/schemas/package.schema.json');full=Draft202012Validator(schema)
 for p in out.rglob('*.json'):
  if p.relative_to(out).parts[0] in ('schemas','source_archive','assets'):continue
  v=load_json(p)
  for value in [v,{**v,'package_id':12},{**v,'data_type':{}},{**v,'data':None}]:
   assert bool(list(validate_value(value)))==bool(list(full.iter_errors(value)))
 base=load_json(out/'normalized/game.json');row={**base,'data_type':'text_record','data':{'id':'bad'}}
 # Streaming test does not accumulate a huge decoded document; cancellation
 # interrupts the line loop rather than waiting for the entire file.
 p=out/'normalized/large.jsonl'
 with p.open('w') as f:
  for _ in range(20000):f.write(json.dumps(row)+'\n')
 calls=0;seen=[]
 def cancel():
  nonlocal calls
  calls+=1
  if calls>600:raise Cancelled()
 with pytest.raises(Cancelled):validate_package(out,cancel=cancel,only=['normalized/large.jsonl'],progress=lambda *x:seen.append(x))
 assert seen and calls==601
 row=json.loads((out/"normalized/text_index.jsonl").read_text().splitlines()[0])
 with p.open("w") as f:
  for _ in range(10000):f.write(json.dumps(row)+"\n")
 stats={}
 assert not validate_package(out,only=["normalized/large.jsonl"],stats=stats)
 assert stats["records"]==10000

def test_final_status_mismatch_rejected(exported):
 _,_,out,_=exported;r=load_json(out/'report.json');r['data']['state']='failed';write_json(out/'report.json',r)
 assert any('상태 불일치' in e['message'] for e in validate_package(out,only=['manifest.json','report.json']))
