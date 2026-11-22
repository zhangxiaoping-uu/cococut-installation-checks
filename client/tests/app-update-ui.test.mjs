import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isAbsolute,resolve} from 'node:path';
import {chromium} from 'playwright';

const appRoot=process.env.COCUT_ACCOUNT_UI_APP_ROOT;
if(appRoot&&!isAbsolute(appRoot))throw Error('EXPLICIT_ACCOUNT_UI_APP_ROOT_REQUIRED');
const shellUrl=appRoot?pathToFileURL(resolve(appRoot,'client/shell/index.html')).href:new URL('../shell/index.html',import.meta.url).href;
const current={status:'current',currentVersion:'0.1.0',currentBuild:127};
const available={...current,status:'available',latestVersion:'0.1.1',latestBuild:128};

// Uses the production HTML/JS with a local bridge fixture. These tests never
// download an update, launch an installer, log in, or create a payment request.
async function fixture(t,options={}){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({state,options})=>{
  window.updateFixtureState=state;window.updateCalls=[];window.accountCalls=[];window.financialCalls=[];
  window.accountFixture={configured:true,status:'signed-out'};
  window.desktopShell={
   onState:callback=>{window.emitAccount=(account=window.accountFixture)=>callback({status:'ready',accountRequired:true,account});},
   showAccount:async()=>({open:true}),
   account:async command=>{window.accountCalls.push(command);return window.accountFixture;},
   purchaseCredits:async sku=>{window.financialCalls.push(sku);return window.accountFixture;},
  };
  if(!options.legacy){
   window.desktopShell.onUpdate=callback=>{window.emitUpdate=state=>{window.updateFixtureState=state;callback(state);};};
   window.desktopShell.update=command=>{
    window.updateCalls.push(command);
    if(command==='read'&&options.deferRead)return new Promise(resolve=>window.resolveRead=resolve);
    if(command==='check'&&window.deferCheck)return new Promise(resolve=>window.resolveCheck=resolve);
    if(command==='install'&&window.rejectInstall)return Promise.reject(Error(window.rejectInstall));
    if(command==='install'&&options.deferInstall)return new Promise(resolve=>window.resolveInstall=resolve);
    return Promise.resolve(window.updateFixtureState);
   };
  }
 },{state:options.state||current,options});
 await page.goto(shellUrl);
 return {page,errors};
}

test('version row precedes account content, detects a new release without interrupting, and fits smaller windows',async t=>{
 const {page,errors}=await fixture(t);
 await page.waitForFunction(()=>document.querySelector('#account-version').dataset.status==='current');
 await page.evaluate(()=>window.emitAccount());
 assert.equal(await page.locator('#account-current-version').innerText(),'0.1.0');
 assert.equal(await page.locator('#account-update-message').innerText(),'当前版本已是最新版本');
 assert.equal(await page.locator('#account-update-button').isDisabled(),true);
 assert.equal(await page.locator('#account-update-retry').isVisible(),false);
 assert.ok(await page.locator('#account-version').evaluate(row=>row.getBoundingClientRect().bottom<=document.querySelector('#account-signed-out').getBoundingClientRect().top));
 await page.evaluate(state=>window.emitUpdate(state),available);
 assert.equal(await page.locator('#account-update-button').isDisabled(),false);
 assert.equal(await page.locator('#account-update-badge').isVisible(),true);
 assert.equal(await page.locator('#account-login').isVisible(),true);
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.deepEqual(await page.evaluate(()=>window.financialCalls),[]);
 const evidence=fileURLToPath(new URL('../../.local/rebuild/in-app-updates/ui',import.meta.url));await mkdir(evidence,{recursive:true});
 for(const width of [1280,1000,740]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const fits=await page.locator('#account-version').evaluate(row=>{const bounds=row.getBoundingClientRect(),button=row.querySelector('#account-update-button').getBoundingClientRect();return row.scrollWidth<=row.clientWidth+1&&button.right<=bounds.right&&button.left>=bounds.left;});
  assert.ok(fits,'version row fits at '+width);
  if(width===1000)await page.screenshot({path:evidence+'/account-version-1000.png'});
 }
 assert.deepEqual(errors,[]);
});

test('update click starts once, disables while downloading, and keeps account errors isolated',async t=>{
 const {page,errors}=await fixture(t,{state:available,deferInstall:true});
 await page.evaluate(()=>window.emitAccount());
 await page.waitForFunction(()=>!document.querySelector('#account-update-button').disabled);
 await page.evaluate(()=>document.querySelector('#account-error').textContent='原充值错误保留');
 await page.locator('#account-update-button').click();
 assert.equal(await page.locator('#account-update-button').isDisabled(),true);
 assert.equal(await page.locator('#account-update-message').innerText(),'正在准备更新…');
 await page.evaluate(state=>window.emitUpdate(state),{...available,status:'downloading',progress:.42,message:'正在下载更新… 42%'});
 assert.equal(await page.locator('#account-update-progress').evaluate(progress=>progress.value),.42);
 assert.equal(await page.locator('#account-update-retry').isVisible(),false);
 await page.evaluate(state=>window.emitUpdate(state),{...available,status:'launching'});
 await page.evaluate(state=>window.resolveInstall(state),available);
 assert.equal(await page.locator('#account-version').getAttribute('data-status'),'launching');
 assert.equal(await page.locator('#account-update-button').isDisabled(),true);
 assert.equal(await page.locator('#account-update-progress').isVisible(),false);
 assert.equal(await page.locator('#account-error').innerText(),'原充值错误保留');
 assert.equal((await page.evaluate(()=>window.updateCalls)).filter(command=>command==='install').length,1);
 assert.deepEqual(await page.evaluate(()=>window.accountCalls),[]);
 assert.deepEqual(await page.evaluate(()=>window.financialCalls),[]);
 assert.deepEqual(errors,[]);
});

test('failed update gives a Chinese retry path and a busy task cannot launch an installer',async t=>{
 const {page,errors}=await fixture(t,{state:available});
 await page.evaluate(()=>window.emitAccount());
 await page.waitForFunction(()=>!document.querySelector('#account-update-button').disabled);
 await page.evaluate(()=>{window.rejectInstall='UPDATE_BUSY /private/path';document.querySelector('#account-error').textContent='原账户错误';});
 await page.locator('#account-update-button').click();
 await page.waitForFunction(()=>document.querySelector('#account-version').dataset.status==='error');
 assert.equal(await page.locator('#account-update-message').innerText(),'当前有任务正在处理或导出，请完成后再更新。');
 assert.equal(await page.locator('#account-update-button').isDisabled(),true);
 assert.equal(await page.locator('#account-update-retry').isVisible(),true);
 await page.evaluate(()=>window.deferCheck=true);
 await page.locator('#account-update-retry').click();
 assert.equal(await page.locator('#account-version').getAttribute('data-status'),'checking');
 assert.equal(await page.locator('#account-update-retry').isVisible(),false);
 await page.evaluate(state=>window.resolveCheck(state),current);
 await page.waitForFunction(()=>document.querySelector('#account-version').dataset.status==='current');
 assert.equal(await page.locator('#account-update-message').innerText(),'当前版本已是最新版本');
 assert.equal(await page.locator('#account-error').innerText(),'原账户错误');
 assert.deepEqual(await page.evaluate(()=>window.financialCalls),[]);
 assert.deepEqual(errors,[]);
});

test('late initial read cannot replace the newer update event',async t=>{
 const {page,errors}=await fixture(t,{deferRead:true});
 await page.waitForFunction(()=>typeof window.resolveRead==='function');
 await page.evaluate(state=>window.emitUpdate(state),available);
 await page.evaluate(state=>window.resolveRead(state),current);
 assert.equal(await page.locator('#account-version').getAttribute('data-status'),'available');
 assert.equal(await page.locator('#account-update-button').isDisabled(),false);
 assert.deepEqual(errors,[]);
});

test('older bridge fixtures keep working without update APIs',async t=>{
 const {page,errors}=await fixture(t,{legacy:true});
 await page.evaluate(()=>window.emitAccount());
 assert.equal(await page.locator('#account-version').getAttribute('data-status'),'unsupported');
 assert.equal(await page.locator('#account-update-button').isDisabled(),true);
 assert.equal(await page.locator('#account-update-message').innerText(),'当前安装包暂不支持客户端内更新');
 assert.equal(await page.locator('#account-login').isEnabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.updateCalls),[]);
 assert.deepEqual(errors,[]);
});
test('the lower-left account icon shows an update badge across home, processing and retry states without auto-installing',async t=>{
 const {page,errors}=await fixture(t,{state:available});
 await page.locator('#account-nav-update-badge').waitFor({state:'visible'});assert.equal(await page.locator('#account-nav-update-badge').innerText(),'更新');
 const badge=await page.locator('#account-nav-update-badge').boundingBox(),button=await page.locator('#account-button').boundingBox();assert.ok(badge.x>=0&&badge.x+badge.width<=74);assert.ok(badge.y<button.y+button.height/2);
 const directory=fileURLToPath(new URL('../../.local/rebuild/incremental-235/',import.meta.url));await mkdir(directory,{recursive:true});await page.screenshot({path:directory+'home-update-badge.png',fullPage:true});
 for(const status of ['downloading','launching']){await page.evaluate(state=>window.emitUpdate(state),{...available,status});assert.equal(await page.locator('#account-nav-update-badge').isVisible(),true);}
 await page.evaluate(state=>window.emitUpdate(state),{...available,status:'downloading',transfer:{mode:'preparing-base'}});assert.equal(await page.locator('#account-update-progress').getAttribute('value'),null);assert.equal(await page.locator('#account-update-button').innerText(),'正在准备…');
 await page.evaluate(state=>window.emitUpdate(state),{...available,status:'error',updateAvailable:true,retryable:true});assert.equal(await page.locator('#account-nav-update-badge').isVisible(),true);
 await page.locator('#account-button').click();await page.locator('#account-panel').waitFor({state:'visible'});assert.deepEqual(await page.evaluate(()=>window.updateCalls.filter(value=>value==='install')),[]);
 await page.evaluate(state=>window.emitUpdate(state),current);assert.equal(await page.locator('#account-nav-update-badge').isVisible(),false);assert.deepEqual(errors,[]);
});
