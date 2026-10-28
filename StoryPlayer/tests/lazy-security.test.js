import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readEntry} from '../src/lazy-zip.js';
test('lazy reads preserve size, ratio and CRC error diagnostics',async()=>{
 await assert.rejects(readEntry({filename:'huge.mp4',uncompressedSize:200,compressedSize:200},100),/huge.mp4.*200.*100/);
 await assert.rejects(readEntry({filename:'bomb',uncompressedSize:32*1024**2,compressedSize:1},64*1024**2),/압축 폭탄/);
 await assert.rejects(readEntry({filename:'broken.json',uncompressedSize:1,compressedSize:1,getData(){throw Error('CRC');}},100),/broken.json.*CRC/);
});
