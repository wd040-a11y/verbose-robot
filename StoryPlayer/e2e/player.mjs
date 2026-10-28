import {chromium,webkit,_electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const mode=process.env.PLAYER_EXE?'electron':process.env.PLAYER_BROWSER||'chromium';
let app,browser,page;
if(mode==='electron'){app=await _electron.launch({executablePath:path.resolve(process.env.PLAYER_EXE)});page=await app.firstWindow();}
else{browser=await (mode==='webkit'?webkit:chromium).launch({headless:true});page=await browser.newPage();await page.goto(process.env.PLAYER_URL||'http://127.0.0.1:5173');}
page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function advanceToGreeting(){
 await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0);
 const next=page.getByRole('button',{name:'다음',exact:true});
 for(let i=0;i<3;i++){
  await expect(next).not.toHaveAttribute('aria-busy','true');
  if(await page.getByText(/그림 표시 · 다음으로/).isVisible())await next.click();
  else break;
 }
 await expect(page.getByText('환영합니다.',{exact:true})).toBeVisible();
}

try{
 await page.locator('input[type=file]').first().setInputFiles(path.resolve(process.env.PLAYER_LARGE?' .large-test/large.zip'.trim():'fixtures/sample.zip'));
 await expect(page.getByRole('button',{name:/빈 장소/})).toHaveCount(0);
 await page.getByRole('button',{name:/시작 마을/}).click();
 const npc=page.locator('article').filter({hasText:'안내 NPC'});
 await npc.getByRole('button',{name:'감상하기',exact:true}).click();
 await advanceToGreeting();
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
 await page.getByText('감상 설정 / 실행 정보',{exact:true}).click();
 await expect(page.locator('article').filter({hasText:'시스템 전용'})).toHaveCount(0);
 const cgOnly=page.locator('article').filter({hasText:'CG 전용'});
 await cgOnly.getByRole('button',{name:'감상하기',exact:true}).click();
 await expect(page.locator('.picture-layer img')).toHaveCount(1);
 await fs.mkdir('reports',{recursive:true});
 await page.screenshot({path:`reports/cg-only-${mode}.png`});
 const cgPixels=await page.locator('.scene').screenshot();
 const imageBox=await page.locator('.picture-layer img').boundingBox(), sceneBox=await page.locator('.scene').boundingBox();
 if(imageBox.width>sceneBox.width+1||imageBox.height>sceneBox.height+1)throw Error('CG exceeds scene bounds');
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await expect(page.getByText(/장면 감상 완료/)).toBeVisible();
 await page.getByRole('button',{name:'이전',exact:true}).click();
 await expect(page.locator('.picture-layer img')).toHaveCount(1);
 await fs.writeFile(`reports/cg-before-${mode}.png`,cgPixels);
 await page.locator('.scene').screenshot({path:`reports/cg-after-${mode}.png`});
 execFileSync('python',['scripts/compare-scenes.py',`reports/cg-before-${mode}.png`,`reports/cg-after-${mode}.png`],{stdio:'inherit'});
 const integratedScene=page.locator('article').filter({hasText:'대사 CG 통합 검증'});
 await integratedScene.getByRole('button',{name:'감상하기',exact:true}).click();
 await expect(page.getByText('대사 A',{exact:true})).toBeVisible();
 await expect(page.locator('.picture-layer img')).toHaveCSS('opacity','1');
 await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0);
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await expect(page.getByText('대사 B',{exact:true})).toBeVisible();
 if(Math.abs(await page.locator('.picture-layer img').evaluate(e=>Number(getComputedStyle(e).opacity))-128/255)>0.001)throw Error('CG opacity mismatch');
 await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0);
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await expect(page.getByText('대사 C',{exact:true})).toBeVisible();
 await expect(page.locator('.scene')).toBeHidden();
 await page.getByRole('button',{name:'이전',exact:true}).click();
 await expect(page.getByText('대사 B',{exact:true})).toBeVisible();
 await expect(page.locator('.picture-layer img')).toHaveCount(1);
 const movieEvent=page.locator('article').filter({hasText:'영상 검증'});
 await movieEvent.getByRole('button',{name:'감상하기',exact:true}).click();
 await page.getByRole('button',{name:'동영상 재생',exact:true}).click();
 await expect(dialog.getByText(/연결 자료에 동영상이 없습니다/)).toBeVisible();
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByRole('button',{name:'리소스',exact:true}).click();
 await page.getByLabel('이미지 리소스 ZIP').setInputFiles(path.resolve('fixtures/movies.zip'));
 await expect(page.getByText(/검사 1개 · 정상 연결 1개/)).toBeVisible();
 await page.getByRole('button',{name:'감상',exact:true}).click();
 await page.getByRole('button',{name:'동영상 재생',exact:true}).click();
 await expect(dialog.locator('video')).toBeVisible();
 if(mode!=='webkit')await expect.poll(()=>dialog.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByLabel('감상 모드').selectOption('free');
 await npc.getByRole('button',{name:'감상하기',exact:true}).click();
 await advanceToGreeting();
 if(mode!=='electron'){
  await page.setViewportSize({width:390,height:844});
  await page.locator('.mobile-nav').getByRole('button',{name:'장소',exact:true}).click();
  await page.getByLabel('감상 모드').selectOption('story');
  await page.getByRole('button',{name:/시작 마을/}).click();
  await expect(page.locator('.explorer')).toHaveAttribute('data-mobile','장면');
  await npc.getByRole('button',{name:'감상하기',exact:true}).click();
  await expect(page.locator('.explorer')).toHaveAttribute('data-mobile','재생');
  await advanceToGreeting();
  const bar=await page.locator('.playbar').boundingBox();
  if(bar.y+bar.height>844)throw Error('Mobile controls outside viewport');
  await expect(page.locator('.playbar button').first()).toHaveCSS('touch-action','manipulation');
 }
 await fs.mkdir('reports' ,{recursive:true});
 if(process.env.PLAYER_LARGE)await fs.writeFile('reports/large-zip-gui.json',JSON.stringify({passed:true,mode,archiveBytes:(await fs.stat('.large-test/large.zip')).size,checks:['real ZIP64 file input','map and event JSON after 2GiB offset','dialogue and choices','separate media connection'],realGame:false},null,2));
 await page.screenshot({path:`reports/integrated-${mode}.png`,fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile(`reports/gui-${mode}.json`,JSON.stringify({passed:true,mode,checks:['package import','static dialogue','separate branch boundaries','choices','existing interpreter dialogue','resource ZIP counts','static CG decoded and visible','package access audit'],realGame:false},null,2));
}finally{await app?.close();await browser?.close();}
