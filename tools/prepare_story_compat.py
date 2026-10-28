from pathlib import Path
import json
from tools.sample_factory import create_game
from rpgextractor.pipeline import Extractor,Options
from rpgextractor.retry import retry_resources
from tools.sample_factory import KEY
root,_=create_game(Path('build/story-compat-input'),'MZ')
r=Extractor(Options.story()).run(root,Path('build/story-compat-output'))
paths=[str(Path(r['output_folder'])/'Story.zip')]
p=root/'data/System.json';system=json.loads(p.read_text(encoding='utf-8'));system.pop('encryptionKey');p.write_text(json.dumps(system),encoding='utf-8')
r=Extractor(Options.story()).run(root,Path('build/story-compat-output'))
paths.append(str(Path(r['output_folder'])/'Story.zip'))
system['encryptionKey']=KEY;p.write_text(json.dumps(system),encoding='utf-8')
retry=retry_resources(Path(r['output_folder']),root)
Path('build/story-compat.json').write_text(json.dumps({'zips':paths,'retry_zip':str(Path(retry['output_folder'])/'ResourcesRetry.zip')}))
