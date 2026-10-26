"""Generate original, distributable synthetic fixtures; no commercial assets."""
from pathlib import Path
from copy import deepcopy
import json
import struct
from PIL import Image

KEY="00112233445566778899aabbccddeeff"
HEADER=bytes.fromhex("5250474d560000000003010000000000")

def cmd(code,*parameters,indent=0,**extra): return {"code":code,"indent":indent,"parameters":list(parameters),**extra}
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")
def encrypt(data): return HEADER+bytes(a^b for a,b in zip(data[:16],bytes.fromhex(KEY)))+data[16:]
def page(commands,**conditions):
 c={"switch1Valid":False,"switch1Id":1,"switch2Valid":False,"switch2Id":1,"variableValid":False,"variableId":1,"variableValue":0,
    "selfSwitchValid":False,"selfSwitchCh":"A","itemValid":False,"itemId":1,"actorValid":False,"actorId":1,**conditions}
 return {"conditions":c,"image":{"tileId":0,"characterName":"Hero","characterIndex":0,"direction":2,"pattern":1},"moveType":0,"moveSpeed":3,"moveFrequency":3,
         "moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":True,"skippable":False,"wait":False},"walkAnime":True,"stepAnime":False,"directionFix":False,"through":False,"priorityType":1,"trigger":0,"list":commands}

def create_game(base: Path, engine="MV", nested=False, event_count=1):
 root=base/"중간 폴더"/"www" if nested else base/("www" if engine=="MV" else "")
 root.mkdir(parents=True,exist_ok=True)
 system={"gameTitle":"테스트 모험 "+engine,"versionId":100,"switches":["","문 열림","스토리 단계",""],"variables":["","진행도","좌표","목표 맵"],
         "partyMembers":[1],"startMapId":1,"startX":0,"startY":0,"hasEncryptedImages":True,"hasEncryptedAudio":True,"encryptionKey":KEY,
         "optSideView":False,"boat":{"characterName":"","bgm":{"name":""}},"unknownSystemField":{"keep":True}}
 if engine=="MZ": system["advanced"]={"gameId":123,"screenWidth":816}
 write(root/"data/System.json",system)
 write(root/"data/MapInfos.json",[None,{"id":1,"name":"시작 마을","parentId":0,"order":1},{"id":2,"name":"엔딩 방","parentId":1,"order":2}])
 lines=[cmd(101,"Hero",0,0,2,*( ["안내자"] if engine=="MZ" else [] )),cmd(401,"안녕하세요.\\V[1]\n원문 줄바꿈과 \\C[2]제어 문자"),
        cmd(111,0,1,0),cmd(111,1,1,0,5,1,indent=1),cmd(102,["문을 연다","돌아간다"],-2,0,2,0,indent=2),
        cmd(402,0,"문을 연다",indent=2),cmd(121,1,2,0,indent=3),cmd(122,1,1,1,1,2,indent=3),cmd(117,1,indent=3),
        cmd(231,1,"scene",0,0,0,0,100,100,255,0,indent=3),cmd(201,0,2,1,1,2,0,indent=3),
        cmd(403,indent=2),cmd(401,"취소했습니다.",indent=3),cmd(404,indent=2),cmd(411,indent=1),cmd(401,"다른 조건",indent=2),cmd(412,indent=1),
        cmd(411),cmd(401,"문이 닫혀 있다.",indent=1),cmd(412),cmd(355,"// 수집 자료: 실행 금지"),cmd(655,"throw new Error('never execute');"),
        cmd(357,"TestPlugin","sample","샘플",{"text":"한글"}) if engine=="MZ" else cmd(356,"TestPlugin sample 한글"),
        cmd(241,{"name":"Theme","volume":90,"pitch":100,"pan":0}),cmd(999,{"future":[1,2]},customField={"keep":True}),cmd(0)]
 events=[None]
 for i in range(1,event_count+1):
  events.append({"id":i,"name":f"표지판 또는 NPC {i}","x":i%20,"y":i//20,"note":"<custom: yes>","pluginExtra":[1,2],
                 "pages":[page(deepcopy(lines)),page([cmd(101,"",0,0,2),cmd(401,"두 번째 페이지"),cmd(0)],switch1Valid=True,switch1Id=2,variableValid=True,variableId=1,variableValue=3)]})
 map1={"displayName":"마을","width":20,"height":15,"tilesetId":1,"data":[0]*1800,"events":events,"bgm":{"name":"Theme"},"bgs":{"name":""},"parallaxName":"","encounterList":[],"note":"","unknownMapFlag":7}
 map2=deepcopy(map1); map2["displayName"]="엔딩 방"; map2["events"]=[None,{"id":1,"name":"엔딩","x":1,"y":1,"pages":[page([cmd(101,"",0,0,2),cmd(401,"엔딩입니다."),cmd(0)])]}]
 write(root/"data/Map001.json",map1); write(root/"data/Map002.json",map2)
 write(root/"data/CommonEvents.json",[None,{"id":1,"name":"순환 공통 이벤트","trigger":1,"switchId":1,"list":[cmd(121,2,2,0),cmd(117,2),cmd(0)]},{"id":2,"name":"역방향 호출","trigger":0,"switchId":1,"list":[cmd(117,1),cmd(0)]}])
 for name,value in {"Actors":[None,{"id":1,"name":"용사","characterName":"Hero","faceName":"Hero","battlerName":""}],"Items":[None,{"id":1,"name":"열쇠","effects":[{"code":44,"dataId":1,"value1":0,"value2":0}]}],"Tilesets":[None,{"id":1,"name":"마을","tilesetNames":[]}],"Troops":[None,{"id":1,"name":"전투","pages":[{"conditions":{"switchValid":True,"switchId":1},"span":0,"list":[cmd(117,1),cmd(0)]}]}]}.items(): write(root/f"data/{name}.json",value)
 js=root/"js"; js.mkdir(exist_ok=True)
 prefix="rmmz_" if engine=="MZ" else "rpg_"
 (js/(prefix+"core.js")).write_text(f'// Synthetic detection fixture, not an engine implementation\nUtils.RPGMAKER_NAME = "{engine}";\nUtils.RPGMAKER_VERSION = "1.0.0";\n',encoding="utf-8")
 (js/(prefix+"objects.js")).write_text("// Synthetic engine marker only.\n",encoding="utf-8")
 (js/"plugins").mkdir(exist_ok=True)
 (js/"plugins/TestPlugin.js").write_text("// Never execute this fixture.\nthrow new Error('extractor must not execute JavaScript');\n",encoding="utf-8")
 plugins=[{"name":"TestPlugin","status":True,"description":"테스트 플러그인","parameters":{"value":"5","json":"{\"x\":1}"}}]
 (js/"plugins.js").write_text("// generated test settings\nvar $plugins =\n"+json.dumps(plugins,ensure_ascii=False)+";\n",encoding="utf-8")
 image=root/"img/pictures/scene.png"; image.parent.mkdir(parents=True,exist_ok=True)
 Image.new("RGBA",(3,2),(28,70,115,255)).save(image)
 png=image.read_bytes(); image.unlink(); image.with_suffix(".rpgmvp" if engine=="MV" else ".png_").write_bytes(encrypt(png))
 for kind in ("faces","characters"):
  path=root/f"img/{kind}/Hero.png"; path.parent.mkdir(parents=True,exist_ok=True); Image.new("RGB",(8,8),(100,150,180)).save(path)
 audio=root/"audio/bgm/Theme.ogg"; audio.parent.mkdir(parents=True,exist_ok=True)
 # A structural container fixture only, intentionally no decodable Vorbis stream.
 audio.write_bytes(b"OggS"+bytes([0,2])+bytes(20)+bytes([1,4])+b"test")
 (root/"index.html").write_text("<!doctype html><title>Synthetic fixture</title>",encoding="utf-8")
 return root,png

if __name__=="__main__":
 import argparse
 p=argparse.ArgumentParser(); p.add_argument("destination",type=Path); p.add_argument("--engine",choices=["MV","MZ"],default="MV"); p.add_argument("--events",type=int,default=1); p.add_argument("--nested",action="store_true"); a=p.parse_args()
 root,_=create_game(a.destination,a.engine,a.nested,a.events); print(root)
