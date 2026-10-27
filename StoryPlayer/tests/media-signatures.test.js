import {test} from 'node:test';import assert from 'node:assert/strict';import {inspectImage,resourceIndex,resolveResource} from '../src/resources.js';
test('movie container recognition does not claim codec decoding',async()=>{
 const mp4=new Uint8Array(24);mp4.set([102,116,121,112],4);
 assert.equal((await inspectImage(new Blob([mp4]))).codecVerified,false);
 const webm=new Uint8Array([26,69,223,163,0,0,0,0]);assert.equal((await inspectImage(new Blob([webm]))).mime,'video/webm');
 await assert.rejects(inspectImage(new Blob(['unknown'])));
});
test('movie references use paths instead of filename guesses',()=>{
 const asset={id:'movie:1',category:'movies',logical_path:'movies/opening',source_path:'movies/opening.webm'};
 assert.equal(resolveResource('wrapper/movies/opening.webm',resourceIndex([asset])).asset.id,asset.id);
 assert.equal(resolveResource('opening.webm',resourceIndex([asset])).reason,'no_reference');
});
