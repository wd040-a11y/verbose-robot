const {app,BrowserWindow,shell}=require('electron');
const path=require('node:path');
app.whenReady().then(()=>{const win=new BrowserWindow({width:1280,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.loadFile(path.join(__dirname,'dist/index.html'));});
app.on('window-all-closed',()=>app.quit());
