from pathlib import Path
import sys,json,zipfile,tempfile
root=Path(__file__).resolve().parents[2]
extractor=root/'RPGMakerExtractor'
if not extractor.exists(): extractor=root
sys.path[:0]=[str(extractor),str(extractor/'src')]
from tools.sample_factory import create_game,cmd,page,write
from rpgextractor.pipeline import Extractor
out=Path(__file__).resolve().parents[1]/'fixtures';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
 game,png=create_game(Path(temp)/'game')
 events=[None,{'id':1,'name':'안내 NPC','x':1,'y':2,'pages':[page([
 cmd(231,1,'scene',0,0,0,0,100,100,255,0),cmd(101,'',0,0,2),cmd(401,'환영합니다.'),cmd(102,['문 열기','돌아가기'],-2,0,2,0),cmd(402,0,'문 열기'),cmd(121,1,1,0,indent=1),cmd(122,1,1,0,0,5,indent=1),cmd(0,indent=1),cmd(402,1,'돌아가기'),cmd(401,'돌아갑니다.',indent=1),cmd(403),cmd(401,'취소했습니다.',indent=1),cmd(404),cmd(111,0,1,0),cmd(401,'문이 열렸습니다.',indent=1),cmd(411),cmd(401,'문이 닫혔습니다.',indent=1),cmd(412),cmd(0)])]}, {'id':2,'name':'호환 처리 필요','x':2,'y':2,'pages':[page([cmd(356,'UnknownPlugin'),cmd(401,'실행되면 안 됨'),cmd(0)])]}]
 path=game/'data/Map001.json';m=json.loads(path.read_text(encoding='utf-8'));m['events']=events;write(path,m)
 result=Extractor().run(game,Path(temp)/'out');folder=Path(result['output_folder'])
 with zipfile.ZipFile(out/'sample.zip','w',zipfile.ZIP_DEFLATED) as z:
  for file in folder.rglob('*'):
   if file.is_file() and not file.relative_to(folder).as_posix().startswith('assets/'):
    z.write(file,file.relative_to(folder).as_posix())
 with zipfile.ZipFile(out/'images.zip','w',zipfile.ZIP_DEFLATED) as z:z.writestr('img/pictures/scene.png',png)
print('Synthetic fixtures ready')
