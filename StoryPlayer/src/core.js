export const clone=x=>structuredClone(x);
export function initial(system={}) {return {switches:{},variables:{},self:{},items:{},weapons:{},armors:{},gold:0,party:system.partyMembers||[],map:system.startMapId||0,x:system.startX||0,y:system.startY||0,pictures:{}}}
const value=(s,id)=>s.variables[id]??0;
const key=(ctx,ch)=>`${ctx.map}:${ctx.event}:${ch}`;
export function pageStatus(page,s,ctx){
 const c=page.raw_metadata?.conditions||{};const failed=[];
 for(const n of ['switch1','switch2'])if(c[n+'Valid']&&!s.switches[c[n+'Id']])failed.push(`스위치 ${c[n+'Id']} ON 필요`);
 if(c.variableValid&&!(value(s,c.variableId)>=c.variableValue))failed.push(`변수 ${c.variableId} ≥ ${c.variableValue} 필요`);
 if(c.selfSwitchValid&&!s.self[key(ctx,c.selfSwitchCh)])failed.push(`셀프 스위치 ${c.selfSwitchCh} ON 필요`);
 if(c.itemValid&&!(s.items[c.itemId]>0))failed.push(`아이템 ${c.itemId} 필요`);
 if(c.actorValid&&!s.party.includes(c.actorId))failed.push(`파티원 ${c.actorId} 필요`);
 return failed;
}
export function selectPage(event,s,ctx){for(let i=event.pages.length-1;i>=0;i--)if(!pageStatus(event.pages[i],s,ctx).length)return i;return -1}
export class Unsupported extends Error{}
export function condition(p,s,ctx){
 const [type,a,b,c,d]=p;
 switch(type){
 case 0:return !!s.switches[a]===(b===0);
 case 1:{const x=value(s,a),y=b===0?c:value(s,c);switch(d){case 0:return x===y;case 1:return x>=y;case 2:return x<=y;case 3:return x>y;case 4:return x<y;case 5:return x!==y;default:throw new Unsupported('변수 비교 형식');}}
 case 2:return !!s.self[key(ctx,a)]===(b===0);
 case 4:if(b===0)return s.party.includes(a);throw new Unsupported('캐릭터 상세 조건');
 case 7:return b===0?s.gold>=a:b===1?s.gold<=a:s.gold<a;
 case 8:return (s.items[a]||0)>0;
 case 9:case 10:if(b)throw new Unsupported('장착 장비 포함 조건');return ((type===9?s.weapons:s.armors)[a]||0)>0;
 default:throw new Unsupported(`조건 유형 ${type}: 정확한 호환 처리 필요`);
 }}
// Only presentation-only operations are skipped. Movement routes may change switches.
const visual=new Set([108,408,204,212,213,221,222,223,224,225,230,236,241,242,243,244,245,246,249,250,251,261]);
export class Interpreter{
 constructor({page,state,context,engine,common}){this.state=clone(state);this.before=clone(state);this.engine=engine;this.common=common;this.stack=[{commands:page.commands,pc:0,ctx:context,branches:{}}];this.log=[];this.wait=null;this.done=false;this.steps=0;}
 fail(message,c){this.wait={type:'blocked',message,command:c?.id,raw:c?.raw};this.log.push(this.wait);return this.wait}
 jump(f,codes,indent){let i=f.pc;for(;i<f.commands.length;i++){const r=f.commands[i].raw;if(r.indent<indent)break;if(r.indent===indent&&codes.includes(r.code))break;}f.pc=i;}
 async advance(answer){
 if(this.done)return {type:'done'};
 if(this.wait?.type==='blocked')return this.wait;
 if(this.wait?.type==='choice'){
  const w=this.wait;let selected=answer;
  if(answer==='cancel'){
   const c=w.cancel;if(c.mode==='disabled')return w;selected=c.mode==='branch'?'cancel':c.index;
  }
  if(selected!=='cancel'&&(!Number.isInteger(selected)||selected<0||selected>=w.choices.length))return w;
  w.frame.branches[w.indent]=selected;this.log.push({choice:selected,command:w.command});
 }
 this.wait=null;
 for(let burst=0;burst<2000;burst++){
  if(++this.steps>100000)return this.fail('실행 명령 한도 초과');
  const f=this.stack.at(-1);if(!f){this.done=true;return {type:'done'}}
  if(f.pc>=f.commands.length){this.stack.pop();continue;}
  const command=f.commands[f.pc++],r=command.raw||{},p=r.parameters||[],d=r.indent;
  const s=this.state;this.log.push({command:command.id,code:r.code});
  try{
   if(visual.has(r.code)){this.log.at(-1).skipped='presentation_only';continue;}
   switch(r.code){
   case 0:break;
   case 101:case 105:{let lines=[];const cont=r.code===101?401:405;while(f.commands[f.pc]?.raw.code===cont)lines.push(f.commands[f.pc++].raw.parameters[0]);this.wait={type:'text',text:lines.join('\n'),face:r.code===101?p[0]:null,faceIndex:p[1],speaker:this.engine==='MZ'?p[4]:null};return this.wait;}
   case 401:case 405:this.wait={type:'text',text:p[0]};return this.wait;
   case 102:{let cancel;if(this.engine==='VXACE')cancel=p[1]===0?{mode:'disabled'}:p[1]===5?{mode:'branch'}:{mode:'choice',index:p[1]-1};else cancel=p[1]===-1?{mode:'disabled'}:p[1]===-2||p[1]>=p[0].length?{mode:'branch'}:{mode:'choice',index:p[1]};this.wait={type:'choice',choices:p[0],cancel,defaultIndex:this.engine==='VXACE'?0:p[2],frame:f,indent:d,command:command.id};return this.wait;}
   case 402:if(f.branches[d]!==p[0])this.jump(f,[402,403,404],d);break;
   case 403:if(f.branches[d]!=='cancel')this.jump(f,[404],d);break;
   case 404:delete f.branches[d];break;
   case 111:f.branches[d]=condition(p,s,f.ctx);if(!f.branches[d])this.jump(f,[411,412],d);break;
   case 411:if(f.branches[d])this.jump(f,[412],d);break;
   case 412:delete f.branches[d];break;
   case 121:if(p[1]-p[0]>10000)throw new Unsupported('스위치 범위 한도');for(let id=p[0];id<=p[1];id++)s.switches[id]=p[2]===0;break;
   case 122:{if(p[1]-p[0]>10000)throw new Unsupported('변수 범위 한도');let operand;if(p[3]===0)operand=p[4];else if(p[3]===1)operand=value(s,p[4]);else throw new Unsupported('변수 피연산자: 난수·게임 데이터·스크립트 호환 처리 필요');if(typeof operand!=='number'||!Number.isFinite(operand))throw new Unsupported('숫자가 아닌 변수');const changes={};for(let id=p[0];id<=p[1];id++){let x=value(s,id),v;switch(p[2]){case 0:v=operand;break;case 1:v=x+operand;break;case 2:v=x-operand;break;case 3:v=x*operand;break;case 4:if(!operand)throw new Unsupported('0 나누기');v=Math.floor(x/operand);break;case 5:if(!operand)throw new Unsupported('0 나머지');v=this.engine==='VXACE'?((x%operand)+operand)%operand:x%operand;break;default:throw new Unsupported('변수 연산');}if(!Number.isFinite(v))throw new Unsupported('비정상 계산');changes[id]=this.engine==='VXACE'?v:Math.floor(v);}Object.assign(s.variables,changes);break;}
   case 123:if(!f.ctx.event)throw new Unsupported('셀프 스위치 컨텍스트 없음');s.self[key(f.ctx,p[0])]=p[1]===0;break;
   case 117:{if(this.stack.length>=32)throw new Unsupported('공통 이벤트 호출 깊이 한도');const pg=await this.common(p[0]);if(!pg)throw new Unsupported('공통 이벤트 누락');this.stack.push({commands:pg.commands,pc:0,ctx:{...f.ctx},branches:{}});break;}
   case 115:this.stack.pop();break;
   case 112:break;
   case 413:{let i=f.pc-2;while(i>=0&&!(f.commands[i].raw.code===112&&f.commands[i].raw.indent===d))i--;if(i<0)throw new Unsupported('루프 시작 누락');f.pc=i+1;break;}
   case 113:{let i=f.pc-2;while(i>=0&&!(f.commands[i].raw.code===112&&f.commands[i].raw.indent<d))i--;if(i<0)throw new Unsupported('루프 탈출 대상 없음');this.jump(f,[413],f.commands[i].raw.indent);f.pc++;break;}
   case 118:break;
   case 119:{const i=f.commands.findIndex(c=>c.raw.code===118&&c.raw.parameters[0]===p[0]);if(i<0)throw new Unsupported('라벨 누락');f.pc=i+1;break;}
   case 125:{const n=p[1]===0?p[2]:value(s,p[2]);s.gold=Math.max(0,Math.min(99999999,s.gold+(p[0]===0?n:-n)));break;}
   case 126:case 127:case 128:{if(p[4])throw new Unsupported('장착 장비 제거');const table=r.code===126?s.items:r.code===127?s.weapons:s.armors;const n=p[2]===0?p[3]:value(s,p[3]);table[p[0]]=Math.min(99,Math.max(0,(table[p[0]]||0)+(p[1]===0?n:-n)));break;}
   case 129:if(p[2])throw new Unsupported('파티원 초기화');if(p[1]===0&&!s.party.includes(p[0]))s.party.push(p[0]);if(p[1]===1)s.party=s.party.filter(x=>x!==p[0]);break;
   case 201:s.map=p[0]===0?p[1]:value(s,p[1]);s.x=p[0]===0?p[2]:value(s,p[2]);s.y=p[0]===0?p[3]:value(s,p[3]);return this.wait={type:'transfer',map:s.map};
   case 231:s.pictures[p[0]]={name:p[1],origin:p[2],x:p[3]===0?p[4]:value(s,p[4]),y:p[3]===0?p[5]:value(s,p[5]),zoomX:p[6],zoomY:p[7],opacity:p[8],blend:p[9]};break;
   case 232:if(s.pictures[p[0]])Object.assign(s.pictures[p[0]],{origin:p[2],x:p[3]===0?p[4]:value(s,p[4]),y:p[3]===0?p[5]:value(s,p[5]),zoomX:p[6],zoomY:p[7],opacity:p[8],blend:p[9]});break;
   case 235:delete s.pictures[p[0]];break;
   default:throw new Unsupported(`명령 ${r.code}: 정확한 호환 처리 필요`);
   }
  }catch(e){return this.fail(e.message,command)}
 }
 return this.wait={type:'yield'};
 }
 rollback(){this.state=clone(this.before);this.done=true;this.wait=null;return this.state}
}
