import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {importZip,library,removeGame,put,get} from '../src/storage.js';
import {placeName} from '../src/localization/places.js';
const zip=async()=>new Blob([await fs.readFile(new URL('../fixtures/sample.zip',import.meta.url))]);
test('replace exact package preserves saves; deletion preserves opt-in state and removes files',async()=>{
 const p=await importZip(await zip());await put('meta','state:'+p.id,{variables:{3:42}});await put('meta','place-names:'+p.id,{'1':'내 마을'});
 const q=await importZip(await zip(),()=>{},undefined,{onDuplicate:async rows=>{assert.equal(rows[0].id,p.id);return 'replace';}});
 assert.equal((await library()).some(x=>x.id===p.id),false);assert.equal(await get('files',p.id+'/normalized/maps.json'),undefined);
 assert.deepEqual(await get('meta','state:'+q.id),{variables:{3:42}});
 await removeGame(q.id);assert.equal((await library()).length,0);
 const r=await importZip(await zip());assert.equal((await get('meta','state:'+r.id)).variables[3],42);assert.equal((await get('meta','place-names:'+r.id))['1'],'내 마을');
 await removeGame(r.id,{keepSaves:false});
});
test('duplicate cancel leaves existing files and state unchanged',async()=>{
 const p=await importZip(await zip());
 await assert.rejects(importZip(await zip(),()=>{},undefined,{onDuplicate:async()=> 'cancel'}),/취소/);
 assert.ok(await get('files',p.id+'/normalized/maps.json'));await removeGame(p.id,{keepSaves:false});
});
test('place names distinguish known vocabulary from untranslated proper names',()=>{
 assert.equal(placeName({map_id:1,name:'酒場'}).text,'주점');
 assert.equal(placeName({map_id:2,name:'アラド王国'}).source,'미번역 원문');
 assert.equal(placeName({map_id:2,name:'アラド王国'},{2:'왕국'}).source,'직접 지정');
});
