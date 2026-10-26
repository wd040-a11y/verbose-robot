import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Interpreter,initial,selectPage} from '../src/core.js';
const c=(code,parameters=[],indent=0)=>({id:crypto.randomUUID(),raw:{code,parameters,indent}});
const run=(commands,opts={})=>new Interpreter({page:{commands},state:initial(),context:{map:1,event:2},engine:'MV',common:async()=>null,...opts});
test('text, choice, nested terminator and switch/variable branch execute in order',async()=>{
 const r=run([c(101,['',0]),c(401,['hello']),c(102,[['A','B'],-1,0]),c(402,[0]),c(121,[1,1,0],1),c(0,[],1),c(402,[1]),c(121,[2,2,0],1),c(404),c(111,[0,1,0]),c(122,[3,3,0,0,7],1),c(411),c(122,[3,3,0,0,99],1),c(412),c(0)]);
 assert.equal((await r.advance()).text,'hello');assert.equal((await r.advance()).type,'choice');assert.equal((await r.advance(0)).type,'done');assert.equal(r.state.switches[1],true);assert.equal(r.state.switches[2],undefined);assert.equal(r.state.variables[3],7);
});
test('unsupported script blocks only its interpreter without evaluating source',async()=>{
 const r=run([c(121,[1,1,0]),c(355,['globalThis.COMPROMISED=true']),c(121,[2,2,0])]);assert.equal((await r.advance()).type,'blocked');assert.equal(globalThis.COMPROMISED,undefined);assert.equal(r.state.switches[2],undefined);assert.equal((await run([c(401,['independent'])]).advance()).text,'independent');assert.deepEqual(r.rollback(),initial());
});
test('missing image does not block event logic',async()=>{const r=run([c(231,[1,'missing',0,0,0,0,100,100,255,0]),c(121,[4,4,0]),c(401,['visible'])]);assert.equal((await r.advance()).text,'visible');assert.equal(r.state.switches[4],true);assert.equal(r.state.pictures[1].name,'missing')});
test('common event inherits self switch context and returns',async()=>{const r=run([c(117,[1]),c(121,[9,9,0])],{common:async()=>({commands:[c(123,['A',0]),c(0)]})});assert.equal((await r.advance()).type,'done');assert.equal(r.state.self['1:2:A'],true);assert.equal(r.state.switches[9],true)});
test('highest eligible page wins',()=>{const e={pages:[{raw_metadata:{conditions:{}}},{raw_metadata:{conditions:{switch1Valid:true,switch1Id:8}}}]};const s=initial();assert.equal(selectPage(e,s,{map:1,event:2}),0);s.switches[8]=true;assert.equal(selectPage(e,s,{map:1,event:2}),1)});
test('cancel branch differs between MV and VX Ace',async()=>{for(const engine of ['MV','VXACE']){const r=run([c(102,[['A'],engine==='MV'?-2:5]),c(402,[0]),c(121,[1,1,0],1),c(403),c(121,[2,2,0],1),c(404)],{engine});await r.advance();await r.advance('cancel');assert.equal(r.state.switches[2],true);assert.equal(r.state.switches[1],undefined)}});
test('loop break and numerical operations',async()=>{const r=run([c(122,[1,1,0,0,0]),c(112),c(122,[1,1,1,0,1],1),c(111,[1,1,0,3,1],1),c(113,[],2),c(412,[],1),c(413)]);assert.equal((await r.advance()).type,'done');assert.equal(r.state.variables[1],3)});
test('unknown condition never guesses branch success',async()=>{const r=run([c(111,[12,'true']),c(121,[1,1,0],1),c(412)]);assert.equal((await r.advance()).type,'blocked');assert.deepEqual(r.state.switches,{})});
test('temporary interpreter does not mutate supplied world',async()=>{const s=initial();const r=run([c(121,[1,1,0])],{state:s});await r.advance();assert.deepEqual(s,initial())});
