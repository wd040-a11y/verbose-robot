import {chromium,webkit,_electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const mode=process.env.PLAYER_EXE?'electron':process.env.PLAYER_BROWSER||'chromium';
let app,browser,page;
if(mode==='electron'){app=await _electron.launch({executablePath:path.resolve(process.env.PLAYER_EXE)});page=await app.firstWindow();}
else{browser=await (mode==='webkit'?webkit:chromium).launch({headless:true});page=await browser.newPage();await page.goto(process.env.PLAYER_URL||'http://127.0.0.1:5173');}
page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.locator('input[type=file]').first().setInputFiles(path.resolve('fixtures/sample.zip'));
 await page.getByRole('button',{name:/시작 마을/}).click();
 const npc=page.locator('article').filter({hasText:'안내 NPC'});
 await npc.getByRole('button',{name:'감상하기',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByText(/페이지 1 — 독립된 조건/).click();
 await expect(dialog.getByText('환영합니다.',{exact:true})).toBeVisible();
 await expect(dialog.getByText('문 열기',{exact:true})).toBeVisible();
 await expect(dialog.getByText(/분기 경계/).first()).toBeVisible();
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByLabel('감상 모드').selectOption('free');
 await npc.getByRole('button',{name:'감상하기',exact:true}).click();
 await expect(page.getByText('환영합니다.',{exact:true})).toBeVisible();
 await fs.mkdir('reports',{recursive:true});
 await page.screenshot({path:`reports/integrated-${mode}.png`,fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile(`reports/gui-${mode}.json`,JSON.stringify({passed:true,mode,checks:['package import','static dialogue','separate branch boundaries','choices','existing interpreter dialogue'],realGame:false},null,2));
}finally{await app?.close();await browser?.close();}
