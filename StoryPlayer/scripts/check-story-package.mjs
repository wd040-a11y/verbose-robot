// Compatibility probe only; no player/UI behavior changes.
import 'fake-indexeddb/auto';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {importZip} from '../src/storage.js';
import {StoryCursor} from '../src/exploration/player.js';
import {initial} from '../src/core.js';
const config=JSON.parse(await fs.readFile('build/story-compat.json','utf8'));
const results=[];
for(const file of config.zips){
const bytes=await fs.readFile(file),pkg=await importZip(new Blob([bytes]),()=>{});
const maps=await pkg.json('normalized/maps.json'),shard=await pkg.json(maps[0].file);
await pkg.json('normalized/assets.json');
const page=shard.events[0].pages[0];
const cursor=new StoryCursor({page,state:initial(),context:{},common:async()=>null});
const w=await cursor.advance();assert.equal(w.type,'text');assert.ok(w.text.length);
if(file===config.zips.at(-1)){await importZip(new Blob([await fs.readFile(config.retry_zip)]),()=>{},pkg);assert.ok(await pkg.image('img/pictures/scene'));}
results.push({passed:true,synthetic:true,zipBytes:bytes.length,maps:maps.length,rawCommands:page.commands.length,firstDialogue:true});
}
await fs.mkdir('build/windows-evidence',{recursive:true});
await fs.writeFile('build/windows-evidence/story-player-compat.json',JSON.stringify(results,null,2));
console.log('Normal and media-failure Story.zip both imported with existing schema and StoryCursor');
