const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('localGames',{
 importFolder:(candidate)=>ipcRenderer.invoke('game:import',candidate),
 remove:token=>ipcRenderer.invoke('game:remove',token),
 open:token=>ipcRenderer.invoke('game:open',token),
 read:(token,offset,length)=>ipcRenderer.invoke('game:read',token,offset,length),
 progress:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('game:progress',listener);return ()=>ipcRenderer.removeListener('game:progress',listener);}
});
