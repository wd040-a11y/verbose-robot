import {chromium,_electron} from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
let browser,app,page;
if(process.env.PLAYER_EXE){app=await _electron.launch({executablePath:path.resolve(process.env.PLAYER_EXE)});page=await app.firstWindow();}else{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto(process.env.PLAYER_URL||'http://127.0.0.1:5173');}
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.locator('input[type=file]').first().setInputFiles(path.resolve('fixtures/sample.zip'));
await page.getByRole('button',{name:'1 · 시작 마을',exact:true}).waitFor({timeout:120000});
await page.getByRole('button',{name:'1 · 시작 마을',exact:true}).click();
await page.locator('article').filter({hasText:'안내 NPC'}).getByRole('button',{name:'일반 실행',exact:true}).click();
await page.getByText('환영합니다.',{exact:true}).waitFor();
await page.getByText('그림 1: scene — 리소스 미등록 (이벤트 계속 실행)',{exact:true}).waitFor();
await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByRole('button',{name:'문 열기',exact:true}).click();await page.getByText('문이 열렸습니다.',{exact:true}).waitFor();
assert.equal(await page.locator('label').filter({hasText:'1 문 열림'}).locator('input').isChecked(),true);
await page.locator('input[type=file]').nth(1).setInputFiles(path.resolve('fixtures/images.zip'));
await page.waitForFunction(()=>[...document.images].some(i=>i.complete&&i.naturalWidth===3));
await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByText('이벤트 종료',{exact:true}).waitFor();
await page.locator('article').filter({hasText:'호환 처리 필요'}).getByRole('button',{name:'일반 실행',exact:true}).click();await page.getByText(/이 이벤트 실행 중단/).waitFor();
await page.getByRole('button',{name:'2 · 엔딩 방',exact:true}).click();await page.getByRole('button',{name:'일반 실행',exact:true}).click();await page.getByText('엔딩입니다.',{exact:true}).waitFor();
await page.screenshot({path:'reports/desktop.png',fullPage:true});
await page.reload();await page.getByRole('button',{name:'1 · 시작 마을',exact:true}).waitFor();
assert.equal(await page.locator('label').filter({hasText:'1 문 열림'}).locator('input').isChecked(),true);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'reports/mobile.png',fullPage:true});
assert.deepEqual(errors,[]);console.log('GUI PASS: import, dialogue, choice, branch, state, missing image, attach image, blocked-event isolation, persistence, mobile viewport');
}finally{if(app)await app.close();if(browser)await browser.close();}
