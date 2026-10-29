import test from 'node:test';
import assert from 'node:assert/strict';
import {previewText,tokenize} from '../src/presentation/text.js';
import {sourceRows,buildSources} from '../src/enrichment/sources.js';
import {analysisZip} from '../src/enrichment/manager.js';
import {ZipReader,BlobReader,TextWriter} from '@zip.js/zip.js';
test('navigation removes standard effects without changing original or pretending dynamic values known',()=>{
 const raw='\\C[14]키르스틴\\C[0] \\V[2] \\WC[3]';
 assert.equal(previewText(raw),'키르스틴 [변수 2] [미지원 효과]');
 assert.equal(tokenize(raw)[0].raw,'\\C[14]');
 assert.equal(previewText('\\\\C[1]'), '\\C[1]');
});
test('analysis streams beyond former 100000 source limit into separate jobs',async()=>{
 const cmd={raw:{code:401,parameters:['원문 대사'],indent:0}};
 const pkg={json:async()=>({events:[{id:'event',source:{event_id:1},raw_metadata:{name:'NPC'},pages:[{id:'page',commands:Array.from({length:100001},(_,i)=>({...cmd,id:'command:'+i}))}]}]}),assets:[]};
 const args=[pkg,{system:{}},[{map_id:1,file:'map',name:'장소'}],[],{}];
 const zip=await analysisZip('test',sourceRows(...args),{maxChars:50000});
 const reader=new ZipReader(new BlobReader(zip));let count=0,jobs=0;
 for(const entry of await reader.getEntries())if(entry.filename.startsWith('jobs/')){jobs++;const data=JSON.parse(await entry.getData(new TextWriter()));count+=data.sources.filter(x=>x.kind==='command').length;}
 assert.equal(count,100001);assert.ok(jobs>1);await reader.close();
 const index=await buildSources(...args,{wanted:new Set(['command:100000'])});
 assert.deepEqual(Object.keys(index),['command:100000']);
});
test('analysis cancellation is preserved',async()=>{
 const rows=sourceRows({},{system:{}},[{map_id:1}],[],{},{cancelled:()=>true});
 await assert.rejects(async()=>{for await(const row of rows){}},/취소/);
});
import {pictureBounds,unionBounds} from '../src/presentation/geometry.js';
import {groupScenes} from '../src/exploration/catalog.js';
import {branchSummary} from '../src/exploration/branches.js';
import {portableSettings,checkSettings} from '../src/enrichment/portable.js';
test('angle speaker syntax preserves literal names and standard actor escape',()=>{const t=tokenize('\\N<블루>대사 \\N[3]');assert.equal(t[0].type,'speaker');assert.equal(previewText('\\N<블루>대사 \\N[3]'),'블루 · 대사 [인물 3]');});
test('composite bounds include offset and centered scaled pictures',()=>{const a=pictureBounds({x:900,y:0},800,1200),b=pictureBounds({x:1300,y:700,origin:1,zoomX:50,zoomY:50},1000,1000);assert.deepEqual(unionBounds([a,b]),{x:900,y:0,width:800,height:1200});assert.deepEqual(b,{x:1050,y:450,width:500,height:500});});
test('duplicate presentation preserves originals and separates conditions',()=>{const a={id:'map:12:event:7',pages:[{raw_metadata:{conditions:{switch1_id:1}},commands:[{id:'a',raw:{code:401,parameters:['대사'],indent:0}}]}]},b=structuredClone(a);b.id='map:12:event:8';b.pages[0].commands[0].id='b';assert.equal(groupScenes([a,b]).length,1);b.pages[0].raw_metadata.conditions.switch1_id=2;assert.equal(groupScenes([a,b]).length,2);assert.equal(a.id,'map:12:event:7');});
test('branch previews separate paths and identify state-only paths',()=>{const c=(code,parameters=[],indent=1)=>({raw:{code,parameters,indent}});const s=branchSummary([c(401,['첫 장면']),c(411,[],0),c(401,['다른 장면']),c(412,[],0)],0,0);assert.deepEqual(s.paths.map(x=>x.preview),['첫 장면','다른 장면']);assert.equal(branchSummary([c(121,[1,1,0]),c(412,[],0)],0,0).paths.some(x=>x.content),false);});
test('portable names and analysis are package-bound',()=>{const d=portableSettings('p','내 게임',{'12':'왕도'},{maps:[],events:[]},{items:{}});assert.equal(checkSettings(d,'p').placeNames[12],'왕도');assert.throws(()=>checkSettings(d,'other'),/다른 게임/);assert.equal(d.state,undefined);});
