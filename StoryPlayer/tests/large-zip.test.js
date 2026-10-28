import 'fake-indexeddb/auto';import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {importZip,get} from '../src/storage.js';import {lazyFile} from '../src/lazy-zip.js';
test('ZIP64 over 2GiB reads actual story and media lazily without copying archive',async()=>{
 execFileSync('python',['scripts/make-large-fixture.py']);const file=await fs.open('.large-test/large.zip','r');let read=0;
 const size=(await file.stat()).size;
 const source={size,name:'large.zip',slice(start,end){return {arrayBuffer:async()=>{const b=Buffer.alloc(end-start);const n=(await file.read(b,0,b.length,start)).bytesRead;read+=n;return b.buffer.slice(b.byteOffset,b.byteOffset+n);}};}};
 try{assert.ok(size>2**31);const p=await importZip(source,()=>{});assert.equal(p.lazyArchive,true);const maps=await p.json('normalized/maps.json');const shard=await p.json(maps[0].file);assert.ok(shard.events.length);const media=await lazyFile(p.id,'media/cg.png',128*1024**2);assert.ok(media.size>0);assert.equal(await get('files',p.id+'/'+maps[0].file),undefined);assert.ok(read<8*1024**2,`read ${read}`);console.log(JSON.stringify({archiveBytes:size,bytesRead:read,maps:maps.length,mediaBytes:media.size}));}
 finally{await file.close();await fs.rm('.large-test',{recursive:true,force:true});}
});
