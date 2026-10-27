import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storyPage,contentFlags,auditContent} from '../src/exploration/story.js';
import {Interpreter,initial} from '../src/core.js';
let id=0;const c=(code,parameters=[],indent=0)=>({id:`cmd:${++id}`,raw:{code,parameters,indent}});
test('PA_INIT blocks execution but never blocks source dialogue, choices, branches, CG or common events',async()=>{
 const page={id:'page:1',commands:[c(356,['PA_INIT']),c(203,[1,0,2,3]),c(111,[0,1,0]),c(401,['A'],1),c(411),c(401,['B'],1),c(412),c(102,[['yes','no']]),c(231,[1,'CG_A']),c(117,[1])]};
 const common=async()=>({id:'common:1',commands:[c(401,['common dialogue'])]});
 const state=initial(),before=structuredClone(state);
 const runner=new Interpreter({page,state,context:{map:1,event:1},engine:'MV',common});
 assert.equal((await runner.advance()).type,'blocked');
 const tree=await storyPage(page,common);
 assert.deepEqual(tree.nodes.filter(n=>n.kind==='dialogue').map(n=>n.parameters[0]),['A','B']);
 assert.equal(tree.nodes.filter(n=>n.kind==='branch').length,3);
 assert.equal(tree.nodes.at(-1).content.nodes[0].parameters[0],'common dialogue');
 assert.deepEqual(contentFlags(tree),{dialogue:true,choices:true,cg:true,uncertain:true});
 assert.deepEqual(state,before);
 const report=await auditContent([page],common,async()=>({status:'blocked',policy:'initial state, first command'}));
 assert.equal(report.readablePages,1);assert.equal(report.interpreterBlockedDialoguePages,1);
});
test('missing/cyclic common events remain explicit and untested execution is not counted as success',async()=>{
 const page={id:'cycle',commands:[c(117,[1])]};
 const tree=await storyPage(page,async()=>page);
 assert.equal(contentFlags(tree).uncertain,true);
 const report=await auditContent([page],async()=>null);
 assert.equal(report.interpreterUncheckedPages,1);assert.equal(report.interpreterBlockedDialoguePages,0);
});
