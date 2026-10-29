"""Exercise the frozen importer before packaging it inside Electron."""
from pathlib import Path
import subprocess,json,zipfile
root=Path('build/importer-smoke').resolve();root.mkdir(parents=True,exist_ok=True)
result=root/'result.json'
run=subprocess.run([str(Path('importer/RPGGameImport.exe').resolve()),'--input',str(Path('fixtures/native-game').resolve()),'--output',str(root),'--result',str(result),'--progress',str(root/'progress.json')],timeout=120)
data=json.loads(result.read_text(encoding='utf-8'))
assert run.returncode==0,data
assert data['report']['schema_valid'],data
with zipfile.ZipFile(data['archive']) as z:
 assert 'schemas/package.schema.json' in z.namelist()
 assert any(n.startswith('assets/images/') and n.endswith('.png') for n in z.namelist())
Path('reports').mkdir(exist_ok=True)
Path('reports/importer-smoke.json').write_text(json.dumps({'passed':True,'synthetic':True,'schemaValid':True,'mediaIncluded':True,'report':data['report']},ensure_ascii=False,indent=2),encoding='utf-8')
