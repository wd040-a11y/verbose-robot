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
 await expect(page.getByText('환영합니다.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await expect(page.getByRole('button',{name:'문 열기',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'돌아가기',exact:true}).click();
 await expect(page.getByText('돌아갑니다.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'이전',exact:true}).click();
 await expect(page.getByRole('button',{name:'문 열기',exact:true})).toBeVisible();
 const dialog=page.getByRole('dialog');
 await page.getByRole('button',{name:'리소스',exact:true}).click();
 await page.getByLabel('이미지 리소스 ZIP').setInputFiles(path.resolve('fixtures/images.zip'));
 await expect(page.getByText(/검사 4개 · 정상 연결 2개/)).toBeVisible();
 await page.getByRole('button',{name:'감상',exact:true}).click();
 await npc.getByRole('button',{name:'감상하기',exact:true}).click();
 await expect(page.locator('.picture-layer img').first()).toBeVisible();
 await page.getByText('감상 설정 / 실행 정보',{exact:true}).click();
 await page.getByRole('button',{name:'CG 전체 보기',exact:true}).click();
 await dialog.getByRole('button',{name:'scene',exact:true}).first().click();
 await expect(dialog.getByRole('img',{name:'scene',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByRole('button',{name:'콘텐츠 접근성 검사',exact:true}).click();
 await dialog.getByText('검사 결과',{exact:true}).click();
 await expect(dialog.locator('pre')).toContainText('dialoguePages');
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByLabel('감상 모드').selectOption('free');
 await npc.getByRole('button',{name:'감상하기',exact:true}).click();
 await expect(page.getByText('환영합니다.',{exact:true})).toBeVisible();
 await fs.mkdir('reports',{recursive:true});
 await page.screenshot({path:`reports/integrated-${mode}.png`,fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile(`reports/gui-${mode}.json`,JSON.stringify({passed:true,mode,checks:['package import','static dialogue','separate branch boundaries','choices','existing interpreter dialogue','resource ZIP counts','static CG decoded and visible','package access audit'],realGame:false},null,2));
}finally{await app?.close();await browser?.close();}
