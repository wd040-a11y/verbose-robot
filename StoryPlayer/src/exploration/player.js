// Presentation-only cursor. Never evaluates scripts or writes game switches.
export class StoryCursor {
 constructor({page,state,context,common}){this.state=structuredClone(state);this.state.pictures={};this.stack=[this.frame(page,context)];this.common=common;this.wait=null;this.done=false;this.steps=0;this.log=[];this.fidelity=[];}
 frame(page,ctx){return {commands:page.commands||[],pc:0,ctx,branches:{}};}
 jump(f,codes,indent){for(;f.pc<f.commands.length;f.pc++){const r=f.commands[f.pc].raw;if(r.indent<indent||(r.indent===indent&&codes.includes(r.code)))return;}}
 async advance(answer){
  if(this.done)return {type:'done'};
  if(this.wait?.type==='choice'){
   const w=this.wait;if(!Number.isInteger(answer)||answer<0||answer>=w.choices.length)return w;
   w.frame.branches[w.indent]=answer;this.log.push({choice:answer,command:w.command});
   if(w.condition&&answer===1)this.jump(w.frame,[411,412],w.indent);
  }
  this.wait=null;
  for(let budget=0;budget<2000&&this.stack.length;budget++){
   const f=this.stack.at(-1);if(f.pc>=f.commands.length){this.stack.pop();continue;}
   const c=f.commands[f.pc++],{code,parameters:p=[],indent=0}=c.raw;this.steps++;
   if([101,105].includes(code)){
    const lines=[],ids=[];const continuation=code===101?401:405;
    while(f.commands[f.pc]?.raw.code===continuation){const x=f.commands[f.pc++];lines.push(x.raw.parameters[0]);ids.push(x.id);}
    if(lines.length)return this.wait={type:'text',text:lines.join('\n'),lineIds:ids,face:code===101?p[0]:'',faceIndex:p[1]||0,command:c.id};
   }else if([401,405].includes(code))return this.wait={type:'text',text:p[0],lineIds:[c.id],command:c.id};
   else if(code===102||code===111)return this.wait={type:'choice',choices:code===102?p[0]:['조건 성립 경로','그 외 경로'],cancel:{mode:'disabled'},condition:code===111,frame:f,indent,command:c.id,sourceCondition:code===111?p:null};
   else if(code===402&&f.branches[indent]!==p[0])this.jump(f,[402,403,404],indent);
   else if(code===403)this.jump(f,[404],indent);
   else if(code===411&&f.branches[indent]===0)this.jump(f,[412],indent);
   else if([404,412].includes(code))delete f.branches[indent];
   else if(code===117){
    if(this.stack.length>=16||this.stack.some(x=>x.ctx.common===p[0]))this.fidelity.push({kind:'unknown',command:c.id,message:'공통 이벤트 순환 참조 — 펼치기 중지'});
    else {const pg=await this.common(p[0]);if(pg)this.stack.push(this.frame(pg,{...f.ctx,common:p[0]}));else this.fidelity.push({kind:'unknown',command:c.id,message:'공통 이벤트 누락'});}
   }else if(code===231){
    this.state.pictures[p[0]]={name:p[1],origin:p[2],x:p[3]===0?p[4]:0,y:p[3]===0?p[5]:0,zoomX:p[6],zoomY:p[7],opacity:p[8],blend:p[9]};
    if(p[3]!==0)this.fidelity.push({kind:'unknown',command:c.id,message:'변수 좌표 미확정 — 미리보기 원점 사용'});
   }else if(code===232){const pic=this.state.pictures[p[0]];if(pic)Object.assign(pic,{origin:p[2],x:p[3]===0?p[4]:pic.x,y:p[3]===0?p[5]:pic.y,zoomX:p[6],zoomY:p[7],opacity:p[8]});}
   else if(code===235)delete this.state.pictures[p[0]];
   else if(code===261){this.state.storyMovie=p[0];return this.wait={type:'text',text:'동영상: '+p[0],command:c.id};}
   else if([112,113,413,118,119,115].includes(code)){
    this.fidelity.push({kind:'unknown',command:c.id,message:'반복·점프의 실행 순서는 재현하지 않음. 이후 원본 구간 탐색'});
    return this.wait={type:'text',text:'제어 흐름 경계 — 이후 구간은 원본 순서로 탐색하며 실제 연결은 미확정입니다.',command:c.id};
   }else if(![0,505].includes(code))this.fidelity.push({kind:'unknown',command:c.id,message:`명령 ${code} 실행 효과 미확정`});
  }
  if(!this.stack.length){this.done=true;return {type:'done'};}return {type:'yield'};
 }
}
