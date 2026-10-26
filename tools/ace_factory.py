"""Self-authored binary fixtures. These are NOT commercial-game compatibility evidence."""
import struct
import zlib
from pathlib import Path

class Obj:
    def __init__(self,class_name,**attrs): self.name=class_name; self.attrs=attrs
class User:
    def __init__(self,name,data): self.name=name; self.data=data

def integer(n):
    if n==0: return b'\0'
    if 0<n<123: return bytes([n+5])
    if -124<n<0: return bytes([(n-5)&255])
    width=next(i for i in range(1,5) if (-1<<(8*i))<=n<(1<<(8*i)))
    return bytes([width if n>0 else 256-width])+(n&((1<<(8*width))-1)).to_bytes(width,'little')
def blob(b): return integer(len(b))+b
def sym(s): return b':'+blob(s.encode())
def dump(v):
    if v is None: return b'0'
    if v is True: return b'T'
    if v is False: return b'F'
    if isinstance(v,int): return b'i'+integer(v)
    if isinstance(v,str): return b'I"'+blob(v.encode())+integer(1)+sym('E')+b'T'
    if isinstance(v,bytes): return b'"'+blob(v)
    if isinstance(v,list): return b'['+integer(len(v))+b''.join(dump(x) for x in v)
    if isinstance(v,dict): return b'{'+integer(len(v))+b''.join(dump(k)+dump(x) for k,x in v.items())
    if isinstance(v,Obj): return b'o'+sym(v.name)+integer(len(v.attrs))+b''.join(sym('@'+k)+dump(x) for k,x in v.attrs.items())
    if isinstance(v,User): return b'u'+sym(v.name)+blob(v.data)
    raise TypeError(type(v))
def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(b'\x04\x08'+dump(value))
def cmd(code,*p,indent=0): return Obj('RPG::EventCommand',code=code,indent=indent,parameters=list(p))
def create_ace(root):
    from PIL import Image
    root=Path(root); data=root/'Data'; data.mkdir(parents=True,exist_ok=True)
    (root/'Game.exe').write_bytes(b'fixture, not executable')
    (root/'Game.ini').write_text('[Game]\nLibrary=System/RGSS301.dll\nScripts=Data/Scripts.rvdata2\nTitle=테스트 日本語\n')
    (root/'Game.rvproj2').write_text('RPGVXAce 1.00')
    save(root/'Save01.rvdata2',{'save':'ignored'})
    save(data/'System.rvdata2',Obj('RPG::System',game_title='테스트 日本語',switches=['','문 열림'],variables=['','호감도'],sounds=[]))
    save(data/'MapInfos.rvdata2',{1:Obj('RPG::MapInfo',name='시작',parent_id=0,order=1)})
    condition=Obj('RPG::Event::Page::Condition',switch1_valid=True,switch1_id=1,switch2_valid=False,variable_valid=True,variable_id=1,variable_value=3,self_switch_valid=False,item_valid=False,actor_valid=False)
    page=Obj('RPG::Event::Page',condition=condition,graphic=Obj('RPG::Event::Page::Graphic',character_name='Hero',character_index=0),trigger=0,priority_type=1,list=[cmd(101,'',0,0,2),cmd(401,'안녕하세요 日本語'),cmd(102,['예','아니오'],2),cmd(402,0,'예'),cmd(121,1,1,0,indent=1),cmd(122,1,1,0,0,7,indent=1),cmd(117,1,indent=1),cmd(231,1,'scene',0,0,0,0,100,100,255,0,indent=1),cmd(404),cmd(355,'raise "MUST NEVER RUN"'),cmd(0)])
    event=Obj('RPG::Event',id=1,name='NPC',x=2,y=3,pages=[page])
    table=User('Table',struct.pack('<5I4h',3,2,2,1,4,1,2,3,4))
    save(data/'Map001.rvdata2',Obj('RPG::Map',width=2,height=2,tileset_id=1,events={1:event},data=table,encounter_list=[]))
    save(data/'CommonEvents.rvdata2',[None,Obj('RPG::CommonEvent',id=1,name='공통',trigger=0,switch_id=1,list=[cmd(401,'공통 대사'),cmd(0)])])
    for name in ['Actors','Classes','Skills','Items','Weapons','Armors','Enemies','Troops','States','Animations','Tilesets']:
        save(data/(name+'.rvdata2'),[None,Obj('RPG::'+name.rstrip('s'),id=1,name=name,pages=[],effects=[],timings=[],tileset_names=[])])
    save(data/'Scripts.rvdata2',[[100,'테스트',zlib.compress('raise "절대 실행 금지"\n'.encode())]])
    for name in ['Pictures/scene','Characters/Hero']:
        p=root/'Graphics'/(name+'.png');p.parent.mkdir(parents=True,exist_ok=True);Image.new('RGB',(2,2),(30,60,90)).save(p)
    return root

def make_archive(files,path):
    seed=17; key=(seed*9+3)&0xffffffff; kb=struct.pack('<I',key)
    offset=12+sum(16+len(name.encode()) for name in files)+4
    header=b'RGSSAD\0\3'+struct.pack('<I',seed); payload=b''
    for name,content in files.items():
        name=name.encode(); filekey=1234567
        header+=struct.pack('<4I',offset^key,len(content)^key,filekey^key,len(name)^key)+bytes(b^kb[i%4] for i,b in enumerate(name))
        for i in range(0,len(content),4):
            part=content[i:i+4]; mask=struct.pack('<I',filekey);payload+=bytes(a^b for a,b in zip(part,mask)); filekey=(filekey*7+3)&0xffffffff
        offset+=len(content)
    path.write_bytes(header+struct.pack('<I',key)+payload)
