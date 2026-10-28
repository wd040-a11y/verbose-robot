const {dialog,ipcMain,app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
module.exports=function install(win){
 const root=path.join(app.getPath('userData'),'game-imports'),registryPath=path.join(root,'registry.json');
 let registry={},pending=null,busy=false;
 const ready=(async()=>{await fs.mkdir(root,{recursive:true});try{registry=JSON.parse(await fs.readFile(registryPath,'utf8'));}catch{}})();
 function allowed(e){if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('허용되지 않은 요청');}
 async function descriptor(token){await ready;const f=registry[token];if(!f||!path.resolve(f).startsWith(path.resolve(root)+path.sep))throw Error('등록된 자료가 없습니다.');const stat=await fs.stat(f);return {token,size:stat.size,name:path.basename(f)};}
 ipcMain.handle('game:open',async(e,token)=>{allowed(e);return descriptor(token);});
 ipcMain.handle('game:remove',async(e,token)=>{allowed(e);await ready;await descriptor(token);const archive=registry[token],job=path.dirname(path.dirname(archive));if(path.dirname(job)!==root)throw Error('관리 폴더 경로 오류');delete registry[token];await fs.writeFile(registryPath,JSON.stringify(registry));await fs.rm(job,{recursive:true,force:true});});
 ipcMain.handle('game:read',async(e,token,offset,length)=>{allowed(e);const d=await descriptor(token);if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||length>4*1024**2||offset+length>d.size)throw Error('파일 읽기 범위 오류');const h=await fs.open(registry[token],'r');try{const b=Buffer.alloc(length);const r=await h.read(b,0,length,offset);return new Uint8Array(b.subarray(0,r.bytesRead));}finally{await h.close();}});
 ipcMain.handle('game:import',async(e,candidate)=>{
  allowed(e);await ready;if(busy)throw Error('게임을 등록하는 중입니다.');busy=true;
  try{
   if(candidate===undefined){const selected=await dialog.showOpenDialog(win,{title:'RPG Maker 게임 폴더 선택',properties:['openDirectory']});if(selected.canceled)return null;pending=selected.filePaths[0];}
   if(!pending||candidate!==undefined&&(!Number.isInteger(candidate)||candidate<0))throw Error('게임 폴더를 선택하세요.');
   const job=path.join(root,crypto.randomUUID());await fs.mkdir(job);const result=path.join(job,'result.json'),progress=path.join(job,'progress.json');
   const exe=app.isPackaged?path.join(process.resourcesPath,'importer','RPGGameImport.exe'):path.join(__dirname,'importer','RPGGameImport.exe');
   const args=['--input',pending,'--output',job,'--result',result,'--progress',progress];if(candidate!==undefined)args.push('--candidate',String(candidate));
   let timer=setInterval(async()=>{try{const v=JSON.parse(await fs.readFile(progress,'utf8'));if(!win.isDestroyed())win.webContents.send('game:progress',v);}catch{}},250);
   try{await new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true,stdio:'ignore',shell:false});child.once('error',()=>reject(Error('게임 가져오기 구성 요소를 실행하지 못했습니다. 전체 배포본을 사용하세요.')));child.once('exit',()=>resolve());});}finally{clearInterval(timer);}
   const data=JSON.parse(await fs.readFile(result,'utf8'));if(data.error)throw Error(data.error);if(data.candidates)return data;
   const archive=path.resolve(data.archive);if(!archive.startsWith(path.resolve(job)+path.sep))throw Error('결과 경로 오류');
   const token=crypto.randomUUID();registry[token]=archive;await fs.writeFile(registryPath,JSON.stringify(registry));pending=null;
   return {...await descriptor(token),report:data.report};
  }finally{busy=false;}
 });
};
