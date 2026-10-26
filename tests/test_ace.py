from pathlib import Path
import json
import hashlib
import shutil
import pytest
from tools.ace_factory import create_ace,make_archive,save,Obj,User
from tools.sample_factory import create_game
from rpgextractor.discovery import discover
from rpgextractor.pipeline import Extractor
from rpgextractor.io import load_json
from rpgextractor.adapters.marshal import Reader,plain,graph,MarshalError
from rpgextractor.adapters.rgss3 import entries,unpack
from rpgextractor.validation import validate_package

def data(out,name):return load_json(out/name)['data']
def run(root,base=None):
    report=Extractor().run(root,base);return Path(report['output_folder']),report

def test_A_ace_real_binary_conversion(tmp_path):
    root=create_ace(tmp_path/'게임 日本語 [test]')
    before={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
    c=discover(root)[0];assert c.engine=='VXACE'
    out,r=run(root,tmp_path)
    assert r['schema_valid'] and r['output_counts']['events']==1 and r['output_counts']['maps']==1
    page=data(out,'events/map_001.json')['events'][0]['pages'][0]
    assert page['commands'][1]['raw']['parameters']==['안녕하세요 日本語']
    assert page['commands'][4]['kind']=='control_switches'
    refs=data(out,'normalized/references.json')['by_target']
    assert 'switch:1' in refs and 'variable:1' in refs and 'common_event:1' in refs
    assert any(c['enabled'] and c['kind']=='switch' for c in page['condition_checks'])
    scripts=data(out,'normalized/scripts.json');assert scripts[0]['status']=='decompressed'
    assert '절대 실행 금지' in (out/scripts[0]['source_path']).read_text()
    assert data(out,'normalized/assets.json')[0]['category']=='images'
    assert not any('Save01' in r['path'] for r in data(out,'normalized/source_inventory.json'))
    assert all(hashlib.sha256(p.read_bytes()).hexdigest()==h for p,h in before.items())
    assert not validate_package(out)

@pytest.mark.parametrize('entry', ['index','none'])
def test_B_mixed_engine(tmp_path,entry):
    root,_=create_game(tmp_path/'game','MV')
    (root/'js/rmmz_core.js').write_text('// leftover')
    (root/'js/rmmz_objects.js').write_text('// leftover')
    (root/'index.html').write_text('<script src="js/rpg_core.js"></script>' if entry=='index' else '')
    c=discover(root)[0];assert c.engine==('MV' if entry=='index' else 'MV_MZ')
    out,r=run(root,tmp_path);assert r['schema_valid'] and r['output_counts']['events']==2

@pytest.mark.parametrize('base_kind',['parent','self','existing','default'])
def test_C_D_E_G_K_output(tmp_path,monkeypatch,base_kind):
    root=create_ace(tmp_path/'한글 日本語 [ ]')
    bases={'parent':tmp_path,'self':root,'existing':tmp_path/'occupied','default':None}
    base=bases[base_kind]
    if base: base.mkdir(exist_ok=True); (base/'keep.txt').write_text('keep')
    monkeypatch.setattr('rpgextractor.output.default_base',lambda:tmp_path/'documents')
    first,r=run(root,base);second,r2=run(root,base)
    assert first!=second and r['schema_valid'] and r2['schema_valid']
    assert len(discover(root))==1
    if base: assert (base/'keep.txt').read_text()=='keep'

@pytest.mark.parametrize('selection',['root','data','map','project'])
def test_input_selection(tmp_path,selection):
    root=create_ace(tmp_path/'game')
    path={'root':root,'data':root/'Data','map':root/'Data/Map001.rvdata2','project':root/'Game.rvproj2'}[selection]
    assert discover(path)[0].engine=='VXACE'
    assert run(path,tmp_path/'out')[1]['schema_valid']

def test_I_archive_only_and_resource_link(tmp_path):
    root=create_ace(tmp_path/'fixture'); packed=tmp_path/'packed';packed.mkdir()
    files={p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*') if p.is_file() and p.suffix!='.exe'}
    arc=packed/'Game.rgss3a';make_archive(files,arc)
    assert discover(arc)[0].archive==arc
    out,r=run(arc,tmp_path/'out');assert r['schema_valid'] and r['output_counts']['events']==1
    assert data(out,'manifest.json')['archive_sha256']==hashlib.sha256(arc.read_bytes()).hexdigest()
    refs=[json.loads(x)['data'] for x in (out/'normalized/references.jsonl').read_text().splitlines()]
    assert next(x for x in refs if x['target_id']=='img/pictures/scene')['resolved_ids']

@pytest.mark.parametrize('name',['../escape','C:/escape','Data/../../escape','/absolute','NUL.txt','Data/x.'])
def test_archive_path_safety(tmp_path,name):
    arc=tmp_path/'Game.rgss3a';make_archive({name:b'bad'},arc)
    with pytest.raises(ValueError): entries(arc)

def test_marshal_links_cycles_and_bounds():
    # Reference example from Ruby official Marshal specification.
    v=Reader(b'\x04\x08[\x07"\x0ahello@\x06').load()
    assert v.value[0] is v.value[1] and plain(v)==['hello','hello']
    cyclic=Reader(b'\x04\x08[\x06@\0').load()
    assert graph(cyclic)['nodes'][0]['value']==[{'$ref':0}]
    with pytest.raises(MarshalError): plain(cyclic)
    for bad in [b'\x04\x08@\x06',b'\x04\x08"\xff',b'\x04\x08'+b'[\x06'*170+b'0']:
        with pytest.raises(MarshalError): Reader(bad).load()

def test_corrupt_file_continues(tmp_path):
    root=create_ace(tmp_path/'game');(root/'Data/Actors.rvdata2').write_bytes(b'\x04\x08bad')
    out,r=run(root,tmp_path/'out')
    assert r['state']=='partial' and r['schema_valid'] and r['output_counts']['events']==1
    assert (out/'source_archive/Data/Actors.rvdata2').read_bytes()==b'\x04\x08bad'
