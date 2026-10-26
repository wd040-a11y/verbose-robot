from pathlib import Path
import json
from tools.sample_factory import create_game
from tools.ace_factory import create_ace,make_archive

def main():
    base=Path('build/smoke-inputs').resolve();base.mkdir(parents=True,exist_ok=True)
    cases=[]
    for engine in ('MV','MZ'):
        root,_=create_game(base/(engine+' 한글 日本語'),engine)
        cases.append({'engine':engine,'input':str(root)})
    root=create_ace(base/'VXACE 한글 日本語');cases.append({'engine':'VXACE','input':str(root)})
    arc=base/'Game.rgss3a'
    make_archive({p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*') if p.is_file() and p.suffix not in ('.exe',)},arc)
    cases.append({'engine':'VXACE','input':str(arc)})
    (base/'config.json').write_text(json.dumps({'cases':cases,'open_folder':True},ensure_ascii=False),encoding='utf-8')
if __name__=='__main__':main()
