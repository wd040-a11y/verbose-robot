import {BlobWriter} from '@zip.js/zip.js';
const mounts=new Map(),resources=new Map();
export function mountZip(id,zip,entries,prefix){const old=mounts.get(id);if(old)old.zip.close();mounts.set(id,{zip,entries:new Map(entries.filter(e=>!e.directory&&e.filename.startsWith(prefix)).map(e=>[e.filename.slice(prefix.length),e]))});}
export function mountResource(id,logical,entry){if(!resources.has(id))resources.set(id,new Map());resources.get(id).set(logical,entry);}
export async function readEntry(entry,limit){
 if(entry.uncompressedSize>limit)throw Error(`파일 읽기 한도 초과: ${entry.filename} · 해제 ${entry.uncompressedSize}바이트 / 한도 ${limit}바이트`);
 if(entry.uncompressedSize>16*1024**2&&entry.uncompressedSize/Math.max(1,entry.compressedSize)>1000)throw Error(`압축 폭탄 의심: ${entry.filename} · 압축비 1000배 초과`);
 try{return await entry.getData(new BlobWriter(),{checkSignature:true});}catch(e){throw Error(`ZIP 무결성/읽기 오류: ${entry.filename} · ${e.message}`);}
}
export async function lazyFile(id,path,limit){const e=mounts.get(id)?.entries.get(path);return e?readEntry(e,limit):null;}
export async function lazyResource(id,logical){const e=resources.get(id)?.get(logical);return e?readEntry(e,128*1024**2):null;}
