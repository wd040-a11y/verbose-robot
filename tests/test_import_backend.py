import importlib.util
from pathlib import Path
from tools.sample_factory import create_game
from rpgextractor.io import load_json

def test_progress_file_lock_does_not_interrupt_registration(tmp_path,monkeypatch):
 spec=importlib.util.spec_from_file_location('local_import',Path(__file__).parents[1]/'launch_import.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 root,_=create_game(tmp_path/'game','MZ');result=tmp_path/'result.json';progress=tmp_path/'progress.json'
 real_write=module.write_json
 def locked(path,value):
  if path==progress:raise PermissionError('simulated Windows progress reader lock')
  return real_write(path,value)
 monkeypatch.setattr(module,'write_json',locked)
 monkeypatch.setattr(module.sys,'argv',['import','--input',str(root),'--output',str(tmp_path/'out'),'--result',str(result),'--progress',str(progress)])
 assert module.main()==0
 value=load_json(result);assert Path(value['archive']).is_file() and value['report']['schema_valid']
