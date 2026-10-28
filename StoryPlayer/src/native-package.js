import {Reader} from '@zip.js/zip.js';
export function nativePackage(descriptor){
 class NativeReader extends Reader{
  constructor(){super();this.size=descriptor.size;}
  async readUint8Array(offset,length){const chunks=[];let count=0;while(count<length){const n=Math.min(4*1024**2,length-count);const b=new Uint8Array(await window.localGames.read(descriptor.token,offset+count,n));if(b.length!==n)throw Error('게임 자료 읽기가 중단되었습니다.');chunks.push(b);count+=n;}const out=new Uint8Array(length);let i=0;for(const b of chunks){out.set(b,i);i+=b.length;}return out;}
 }
 return {...descriptor,nativeToken:descriptor.token,reader:new NativeReader()};
}
