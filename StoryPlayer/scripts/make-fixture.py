from pathlib import Path
import sys,json,zipfile,tempfile,io,base64
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2]
extractor=root/'RPGMakerExtractor'
if not extractor.exists(): extractor=root.parent/'RPGMakerExtractor'
if not extractor.exists(): extractor=root
sys.path[:0]=[str(extractor),str(extractor/'src')]
from tools.sample_factory import create_game,cmd,page,write
from rpgextractor.pipeline import Extractor
out=Path(__file__).resolve().parents[1]/'fixtures';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
 game,png=create_game(Path(temp)/'game')
 events=[None,{'id':1,'name':'안내 NPC','x':1,'y':2,'pages':[page([
 cmd(205,0,{'list':[{'code':3,'parameters':[]},{'code':27,'parameters':[3]},{'code':0,'parameters':[]}],'wait':True,'skippable':True,'repeat':False}),cmd(505,{'code':27,'parameters':[3]}),cmd(211,0),cmd(322,1,'Hero',0,'Faces',5,'Battler'),cmd(231,1,'scene',1,0,408,220,100,100,192,0),cmd(231,2,'scene',1,0,408,220,25,25,255,0),cmd(101,'Faces',5,0,2),cmd(401,'환영합니다.'),cmd(102,['문 열기','돌아가기'],-2,0,2,0),cmd(402,0,'문 열기'),cmd(121,1,1,0,indent=1),cmd(235,2,indent=1),cmd(232,1,0,1,0,400,200,150,75,128,0,60,True,indent=1),cmd(122,1,1,0,0,5,indent=1),cmd(0,indent=1),cmd(402,1,'돌아가기'),cmd(401,'돌아갑니다.',indent=1),cmd(403),cmd(401,'취소했습니다.',indent=1),cmd(404),cmd(111,0,1,0),cmd(401,'문이 열렸습니다.',indent=1),cmd(411),cmd(401,'문이 닫혔습니다.',indent=1),cmd(412),cmd(0)])]}, {'id':2,'name':'호환 처리 필요','x':2,'y':2,'pages':[page([cmd(356,'UnknownPlugin'),cmd(401,'실행되면 안 됨'),cmd(0)])]}]
 events.extend([{'id':3,'name':'CG 전용','x':3,'y':2,'pages':[page([cmd(231,1,'scene',0,0,0,0,100,100,255,0),cmd(235,1),cmd(0)])]}, {'id':4,'name':'영상 검증','x':4,'y':2,'pages':[page([cmd(261,'test-video'),cmd(401,'영상 다음 대사'),cmd(0)])]}, {'id':5,'name':'시스템 전용','x':5,'y':2,'pages':[page([cmd(121,1,1,0),cmd(0)])]}])
 events.append({'id':6,'name':'대사 CG 통합 검증','x':6,'y':2,'pages':[page([cmd(231,1,'scene',0,0,0,0,100,100,255,0),cmd(401,'대사 A'),cmd(231,1,'scene',0,0,0,0,100,100,128,0),cmd(401,'대사 B'),cmd(235,1),cmd(401,'대사 C'),cmd(0)])]})
 movie=game/'movies/test-video.webm';movie.parent.mkdir(exist_ok=True);movie.write_bytes(base64.b64decode('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAKDEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggJt7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiEB0AAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYjWMb/sXKMzpZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDgibCBILqBIJqBAhJUw2dAgHNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PaY8CLY8WI1jG/7FyjM6VnyKVFo4dFTkNPREVSRIeYTGF2YzYwLjMxLjEwMiBsaWJ2cHgtdnA5Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4zMjAwMDAwMDAAH0O2dUDD54EAo6uBAACAgkmDQgAB8AH2ADgkHBhKAAAwYAAAEN//+/07/////1HYf///9XwAo5OBACgAhgBAkpwAUAAAAyAAAENAo5OBAFAAhgBAkpwATuAAAyAAAENAo5OBAHgAhgBAkpwAUAAAAyAAAENAo5OBAKAAhgBAkpwATUAAAyAAAENAo5OBAMgAhgBAkpwAUAAAAyAAAENAo5OBAPAAhgBAkpwATuAAAyAAAENAo5OBARgAhgBAkpwAUAAAAyAAAENAHFO7a5G7j7OBALeK94EB8YIBpPCBAw=='))
 path=game/'data/Map001.json';m=json.loads(path.read_text(encoding='utf-8'));m['events']=events;write(path,m)
 empty=dict(m);empty['events']=[None];write(game/'data/Map003.json',empty)
 infos=json.loads((game/'data/MapInfos.json').read_text(encoding='utf-8'));infos.append({'id':3,'name':'빈 장소','parentId':0});write(game/'data/MapInfos.json',infos)
 # Original synthetic sheets: each face cell has a unique solid color.
 face=Image.new('RGB',(576,288));draw=ImageDraw.Draw(face)
 colors=[(220,30,30),(30,220,30),(30,30,220),(220,220,30),(220,30,220),(30,220,220),(100,60,20),(240,240,240)]
 for i,color in enumerate(colors):draw.rectangle((i%4*144,i//4*144,i%4*144+143,i//4*144+143),fill=color)
 face_path=game/'img/faces/Faces.png';face.save(face_path)
 cg=Image.new('RGB',(320,240),(40,80,140));cgbytes=io.BytesIO();cg.save(cgbytes,format='PNG');png=cgbytes.getvalue()
 image_path=game/'img/pictures/scene.png'
 # Replace the synthetic encrypted image with a normal PNG for resource tests.
 for file in image_path.parent.glob('scene.*'):file.unlink()
 image_path.write_bytes(png)
 result=Extractor().run(game,Path(temp)/'out');folder=Path(result['output_folder'])
 with zipfile.ZipFile(out/'sample.zip','w',zipfile.ZIP_DEFLATED) as z:
  for file in folder.rglob('*'):
   if file.is_file() and not file.relative_to(folder).as_posix().startswith('assets/'):
    z.write(file,file.relative_to(folder).as_posix())
 with zipfile.ZipFile(out/'images.zip','w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('Wrapper/img/pictures/scene.png',png)
  z.write(face_path,'Wrapper/img/faces/Faces.png')
  z.writestr('Wrapper/no-reference.png',png)
  z.writestr('Wrapper/img/faces/Hero.png',b'not an image')
 with zipfile.ZipFile(out/'movies.zip','w',zipfile.ZIP_DEFLATED) as z:z.write(movie,'Wrapper/movies/test-video.webm')
print('Synthetic fixtures ready')



# Standalone raw game for the packaged folder-import GUI test.
native,_=create_game(out/'native-game','MZ')
m=json.loads((native/'data/Map001.json').read_text(encoding='utf-8'))
m['events'][1]['pages']=[page([cmd(231,1,'scene',0,0,0,0,100,100,255,0),cmd(231,2,'scene',0,0,1200,200,100,100,255,0),cmd(401,r'\N<안내자>\C[14]폴더에서 바로 감상\C[0]'),cmd(0)])]
write(native/'data/Map001.json',m)

# More than 100 real map records for no-search navigation regression.
with tempfile.TemporaryDirectory() as temp:
 nav_game,_=create_game(Path(temp)/'navigation','MZ')
 template=json.loads((nav_game/'data/Map002.json').read_text(encoding='utf-8'))
 infos=json.loads((nav_game/'data/MapInfos.json').read_text(encoding='utf-8'))
 for i in range(3,106):
  write(nav_game/f'data/Map{i:03}.json',template)
  infos.append({'id':i,'name':f'탐색 장소 {i}','parentId':0,'order':i})
 write(nav_game/'data/MapInfos.json',infos)
 from rpgextractor.pipeline import Options
 import shutil
 nav_result=Extractor(Options.story()).run(nav_game,Path(temp)/'export')
 shutil.copyfile(Path(nav_result['output_folder'])/'Game.zip',out/'navigation.zip')
