import {test} from 'node:test';import assert from 'node:assert/strict';
import {StoryCursor} from '../src/exploration/player.js';import {History} from '../src/core/history.js';import {initial} from '../src/core.js';
let id=0;const c=(code,parameters=[],indent=0)=>({id:String(++id),raw:{code,parameters,indent}});
const make=(commands,common=async()=>null)=>new StoryCursor({page:{commands},state:initial(),context:{map:1,event:1},common});
test('static choices keep exclusive branches separate and rewind picture state',async()=>{
 const r=make([c(356,['PA_INIT']),c(102,[['A','B']]),c(402,[0]),c(231,[1,'A',0,0,10,20,100,100,255,0],1),c(401,['A only'],1),c(402,[1]),c(231,[1,'B',0,0,30,40,100,100,255,0],1),c(401,['B only'],1),c(404),c(356,['stopMist']),c(401,['end'])]);
 const h=new History(r);assert.equal((await h.next()).type,'choice');assert.equal((await h.next(0)).type,'visual');assert.equal((await h.next()).text,'A only');assert.equal(r.state.pictures[1].name,'A');h.seek(0);assert.deepEqual(r.state.pictures,{});assert.equal((await h.next(1)).type,'visual');assert.equal((await h.next()).text,'B only');assert.equal(r.state.pictures[1].name,'B');assert.equal((await h.next()).text,'end');
});
test('nested conditions are selected without executing unknown calculations',async()=>{
 const r=make([c(111,[12,'danger()']),c(111,[0,1,0],1),c(401,['inner yes'],2),c(411,[],1),c(401,['inner no'],2),c(412,[],1),c(411),c(401,['outer no'],1),c(412),c(401,['join'])]);
 await r.advance();await r.advance(0);assert.equal((await r.advance(1)).text,'inner no');assert.equal((await r.advance()).text,'join');
});
test('recursive common calls bounded and stored text after cycle remains readable',async()=>{
 const pg={commands:[c(117,[1]),c(401,['common'])]};const r=make([c(117,[1]),c(203),c(401,['after'])],async()=>pg);
 assert.equal((await r.advance()).text,'common');assert.equal((await r.advance()).text,'after');assert.ok(r.fidelity.length);
});
