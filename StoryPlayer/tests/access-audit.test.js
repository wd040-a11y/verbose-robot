import {test} from 'node:test';import assert from 'node:assert/strict';
import {StoryCursor} from '../src/exploration/player.js';import {History} from '../src/core/history.js';import {initial} from '../src/core.js';import {auditPage} from '../src/exploration/access-audit.js';
let id=0;const c=(code,parameters=[],indent=0)=>({id:'c'+(++id),raw:{code,parameters,indent}});
test('show then erase has two presentation checkpoints and rewind restores CG',async()=>{
 const page={id:'p',commands:[c(231,[1,'cg',0,0,0,0,100,100,255,0]),c(235,[1])]};
 const h=new History(new StoryCursor({page,rawVisuals:true,state:initial(),context:{},common:async()=>null}));
 assert.equal((await h.next()).action,'show');assert.equal(h.runner.state.pictures[1].name,'cg');assert.equal((await h.next()).action,'erase');assert.deepEqual(h.runner.state.pictures,{});h.seek(0);assert.equal(h.runner.state.pictures[1].name,'cg');
});
test('audit explores both exclusive branches and separates missing media from unknown effects',async()=>{
 const page={id:'p',commands:[c(356,['PA_INIT']),c(102,[['A','B']]),c(402,[0]),c(401,['A'],1),c(231,[1,'cg',0,0,0,0,100,100,255,0],1),c(402,[1]),c(401,['B'],1),c(261,['film'],1),c(404)]};
 const r=await auditPage(page,{resource:async path=>({status:path.startsWith('img')?'decoded':'missing'})});
 assert.equal(r.contents.filter(x=>x.kind==='dialogue'&&x.status==='accessible').length,2);
 assert.deepEqual(r.contents.find(x=>x.kind==='choice').accessible_branches,[0,1]);assert.equal(r.counts.resource_missing,1);assert.equal(r.uncertain_effects.length,1);
 assert.equal(JSON.stringify(r).includes('PA_INIT'),false);
 const limited=await auditPage(page,{maxPaths:1});assert.equal(limited.limited,true);assert.ok(limited.counts.unknown);
});
test('connected movie remains unverified until decoding, not success from presence',async()=>{
 const r=await auditPage({id:'p',commands:[c(261,['film'])]},{resource:async()=>({status:'unverified',reason:'codec_unverified'})});assert.equal(r.contents[0].status,'partial');
});
