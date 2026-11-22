import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isAbsolute,resolve} from 'node:path';

const appRoot=process.env.COCUT_ACCOUNT_UI_APP_ROOT;
if(appRoot&&!isAbsolute(appRoot))throw Error('EXPLICIT_ACCOUNT_UI_APP_ROOT_REQUIRED');
const shellUrl=appRoot?pathToFileURL(resolve(appRoot,'client/shell/index.html')).href:new URL('../shell/index.html',import.meta.url).href;

test('account payment UI distinguishes payable, missing code, unknown, failed and closed without new financial requests',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base={configured:true,status:'signed-in',displayName:'支付界面夹具',catalog:{unit_scale:'1000',products:[
  {sku:'credits.large',amount_minor:'19900',units:'2500000'},
  {sku:'credits.small',amount_minor:'3990',units:'400000'},
  {sku:'credits.medium',amount_minor:'9990',units:'1200000'},
 ]},orders:[],records:[]};
 await page.addInitScript(state=>{
  window.fixtureState=state;window.financialCalls=[];
  window.desktopShell={onState:fn=>{window.updateFixture=account=>fn({accountRequired:true,account,status:'ready'});},
   showAccount:async()=>({open:true}),account:async()=>window.fixtureState,
   purchaseCredits:async sku=>{window.financialCalls.push(sku);return window.fixtureState;}};
 },base);
 await page.goto(shellUrl);
 await page.evaluate(()=>window.updateFixture(window.fixtureState));
 assert.deepEqual(await page.locator('.credit-package').allTextContents(),['400 积分¥39.90','1200 积分¥99.90','2500 积分¥199.00']);
 const qr='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
 for(const [payment,message,visible,refreshDisabled,closeDisabled] of [
  [{status:'pending',channel_status:'ready',qrDataUrl:qr},'请使用微信扫码支付',true,false,false],
  [{status:'pending'},'正在准备支付，请刷新状态',false,false,false],
  [{status:'pending',channel_status:'submitting',qrDataUrl:qr},'正在准备支付，请刷新状态',false,false,false],
  [{status:'pending',channel_status:'unknown',qrDataUrl:qr},'支付结果待确认，请刷新状态',false,false,false],
  [{status:'failed',qrDataUrl:qr},'支付未完成，请在原订单中继续支付',false,false,true],
  [{status:'pending',channel_status:'closed',qrDataUrl:qr},'支付已关闭',false,true,true],
  [{status:'paid',qrDataUrl:qr},'支付成功',false,true,true],
 ]){
  await page.evaluate(payment=>window.updateFixture({...window.fixtureState,payment:{attempt_id:'fixture-attempt',order_id:'fixture-order',...payment}}),payment);
  assert.equal(await page.locator('#payment-status').textContent(),message);
  assert.equal(await page.locator('#payment-qr').isVisible(),visible);
  assert.equal(await page.locator('#payment-qr').getAttribute('src'),visible?qr:null);
  assert.equal(await page.locator('#payment-refresh').isDisabled(),refreshDisabled);
  assert.equal(await page.locator('#payment-close').isDisabled(),closeDisabled);
 }
 assert.deepEqual(await page.evaluate(()=>window.financialCalls),[]);assert.deepEqual(errors,[]);
});

test('five server-provided tiers sort, wrap evenly and keep only the final selected QR',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 // Explicit mock catalog, deliberately unordered; never reads or publishes live tiers.
 await page.addInitScript(()=>{const tiers=[[1999,26000],[99,1000],[4999,70000],[399,4500],[999,12000]];
  const base={configured:true,status:'signed-in',catalog:{unit_scale:'1000',products:tiers.map(([price,credits])=>({sku:'tier.'+price,version:'fixture-v1',currency:'CNY',units:String(credits*1000),amount_minor:String(price*100)}))},orders:[{order_id:'unpaid',snapshot:{title:'未完成'},payment_status:'unpaid'},{order_id:'paid',snapshot:{title:'成功充值'},payment_status:'paid'}],records:[],purchasePending:false};
  window.fixtureState=base;window.calls=[];window.desktopShell={onState:fn=>window.updateFixture=account=>fn({status:'ready',accountRequired:true,account}),account:async()=>window.fixtureState,purchaseCredits:async sku=>{window.calls.push(sku);await new Promise(r=>setTimeout(r,100));return {...base,pendingSku:sku,payment:{status:'pending',channel_status:'ready',qrDataUrl:'data:image/png;base64,'+btoa(sku)}};}};
 });
 await page.goto(shellUrl);await page.evaluate(()=>window.updateFixture(window.fixtureState));assert.equal(await page.locator('#account-orders').innerText(),'成功充值 · 已支付\n查看');
 assert.deepEqual(await page.locator('.credit-package').allTextContents(),['1000 积分¥99.00','4500 积分¥399.00优惠10%','12000 积分¥999.00优惠16%','26000 积分¥1999.00优惠22%','70000 积分¥4999.00优惠28%']);assert.equal(await page.locator('.credit-package').first().locator('.credit-package-discount').count(),0);assert.deepEqual(await page.locator('.credit-package-discount').allTextContents(),['优惠10%','优惠16%','优惠22%','优惠28%']);
 const evidence=fileURLToPath(new URL('../../.local/rebuild/catalog-qr-guard',import.meta.url));await mkdir(evidence,{recursive:true});
 for(const [width,expected]of [[1440,[5]],[1280,[5]],[1100,[3,2]],[1000,[3,2]],[740,[2,2,1]]]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const layout=await page.locator('#account-packages').evaluate(container=>{
   const cards=[...container.children].map(card=>{const rect=card.getBoundingClientRect(),badge=card.querySelector('.credit-package-discount'),text=card.querySelector('strong').getBoundingClientRect(),offer=badge?.getBoundingClientRect();return {top:Math.round(rect.top),width:rect.width,textFits:card.querySelector('strong').scrollWidth<=card.querySelector('strong').clientWidth,badgeFits:!offer||offer.top>=rect.top&&offer.right<=rect.right&&offer.bottom<=text.top};});
   return {cards,containerFits:container.scrollWidth<=container.clientWidth+1};
  });
  const rows=[...new Set(layout.cards.map(card=>card.top))].map(top=>layout.cards.filter(card=>card.top===top).length);
  assert.deepEqual(rows,expected,'row layout at '+width);assert.ok(Math.max(...layout.cards.map(card=>card.width))-Math.min(...layout.cards.map(card=>card.width))<1,'equal widths at '+width);
  assert.ok(layout.containerFits&&layout.cards.every(card=>card.textFits&&card.badgeFits),'content fits at '+width);
  if(width===1440||width===1000)await page.screenshot({path:evidence+'/five-tier-'+width+'.png',fullPage:false});
 }
 await page.setViewportSize({width:1280,height:900});
 for(let index=0;index<5;index++)await page.locator('.credit-package').nth(index).click();
 await page.waitForFunction(()=>document.querySelector('#payment-qr').getAttribute('src')==='data:image/png;base64,'+btoa('tier.4999'));
 assert.deepEqual(await page.locator('.credit-package').evaluateAll(bs=>bs.map(b=>b.disabled)),[false,false,false,false,false]);assert.equal(await page.locator('.credit-package[aria-pressed=true]').count(),1);
 assert.equal((await page.evaluate(()=>window.calls)).at(-1),'tier.4999');assert.equal(await page.locator('.credit-package[aria-pressed=true]').getAttribute('data-sku'),'tier.4999');
});

test('account panel displays full support user number and copies only on an explicit click',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.addInitScript(()=>{window.fixtureCopies=0;window.desktopShell={onState:fn=>{window.updateFixture=account=>fn({account,accountRequired:true,status:'ready'});},copyUserId:async()=>{window.fixtureCopies++;return {copied:true};}};});
 await page.goto(shellUrl);await page.evaluate(()=>window.updateFixture({configured:true,status:'signed-in',identity:{user_id:'adbe10ab-3911-4588-a8d5-e24ecbb45d67'},orders:[],records:[]}));
 assert.equal(await page.locator('#account-user-id').textContent(),'adbe10ab-3911-4588-a8d5-e24ecbb45d67');assert.equal(await page.evaluate(()=>window.fixtureCopies),0);
 await page.locator('#account-copy-id').click();assert.equal(await page.locator('#account-copy-status').textContent(),'已复制');assert.equal(await page.evaluate(()=>window.fixtureCopies),1);const evidence=fileURLToPath(new URL('../../.local/rebuild/eight-hour/admin-87',import.meta.url));await mkdir(evidence,{recursive:true});await page.screenshot({path:evidence+'/user-number.png',fullPage:true});
});

test('catalog update notice removes the old QR and a new selection alone restores the new code',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.addInitScript(()=>{window.fixtureState={configured:true,status:'signed-in',catalog:{unit_scale:'1000',products:[{sku:'custom',version:'v1',amount_minor:'9990',units:'1200000'}]},orders:[],records:[],pendingSku:'custom',payment:{order_id:'original',attempt_id:'original',status:'pending',channel_status:'ready',qrDataUrl:'data:image/png;base64,old'}};window.financialCalls=[];window.commands=[];
  window.desktopShell={onState:fn=>window.updateFixture=account=>fn({status:'ready',accountRequired:true,account}),account:async command=>{window.commands.push(command);return window.fixtureState;},
   purchaseCredits:async sku=>{window.financialCalls.push(sku);window.fixtureState={...window.fixtureState,paymentNotice:undefined,payment:{order_id:'new',attempt_id:'new',status:'pending',channel_status:'ready',qrDataUrl:'data:image/png;base64,new'}};return window.fixtureState;}};
 });
 await page.goto(shellUrl);await page.evaluate(()=>window.updateFixture(window.fixtureState));assert.equal(await page.locator('#payment-qr').getAttribute('src'),'data:image/png;base64,old');
 await page.evaluate(()=>{window.fixtureState={...window.fixtureState,catalog:{unit_scale:'1000',products:[{sku:'custom',version:'v2',amount_minor:'9900',units:'1000000'}]},payment:{order_id:'original',attempt_id:'original',status:'pending',channel_status:'ready'},paymentNotice:'充值档位已更新，请重新选择；原订单仍保留。'};window.updateFixture(window.fixtureState);});
 assert.deepEqual(await page.locator('.credit-package').allTextContents(),['1000 积分¥99.00']);assert.equal(await page.locator('#payment-qr').isVisible(),false);assert.equal(await page.locator('#payment-qr').getAttribute('src'),null);
 assert.match(await page.locator('#payment-status').innerText(),/档位已更新.*重新选择/);assert.equal(await page.locator('#payment-renew').isDisabled(),true);for(const id of ['payment-refresh','payment-close'])assert.equal(await page.locator('#'+id).isDisabled(),false);
 await page.waitForFunction(()=>window.commands.includes('refresh-payment'));assert.equal(await page.locator('#payment-qr').getAttribute('src'),null);assert.deepEqual(await page.evaluate(()=>window.financialCalls),[]);await page.locator('.credit-package').click();
 await page.waitForFunction(()=>document.querySelector('#payment-qr').getAttribute('src')==='data:image/png;base64,new');
 assert.deepEqual(await page.evaluate(()=>window.financialCalls),['custom']);assert.equal(await page.locator('#payment-qr').isVisible(),true);assert.equal(await page.locator('#payment-status').innerText(),'请使用微信扫码支付');
});

test('recharge discount badges follow current unit prices and disappear without a valid baseline or saving',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.addInitScript(()=>{window.desktopShell={onState:fn=>window.updateFixture=account=>fn({status:'ready',accountRequired:true,account})};});
 await page.goto(shellUrl);
 const baseline={sku:'base',version:'fixture',currency:'CNY',amount_minor:'9900',units:'1000000'};
 const offered={sku:'offer',version:'fixture',currency:'CNY',amount_minor:'39900',units:'4500000'};
 const render=async products=>page.evaluate(products=>window.updateFixture({configured:true,status:'signed-in',catalog:{unit_scale:'1000',products},orders:[],records:[]}),products);
 await render([offered,baseline]);assert.deepEqual(await page.locator('.credit-package-discount').allTextContents(),['优惠10%']);
 await render([{...offered,amount_minor:'49900'},baseline]);assert.equal(await page.locator('.credit-package-discount').count(),0,'A price change must not retain the old advertised discount');
 await render([{...offered,units:'5000000'},baseline]);assert.deepEqual(await page.locator('.credit-package-discount').allTextContents(),['优惠19%'],'Compute the actual changed rate instead of keying off the price');
 await render([{...offered,units:'4000000'},baseline]);assert.equal(await page.locator('.credit-package-discount').count(),0,'A higher per-credit price has no discount');
 await render([{...offered,amount_minor:'39600',units:'4000000'},baseline]);assert.equal(await page.locator('.credit-package-discount').count(),0,'An equal per-credit price has no discount');
 await render([offered,{...baseline,units:'1100000'}]);assert.equal(await page.locator('.credit-package-discount').count(),0,'Changing the reference tier removes the fixed-reference comparison');
 await render([offered]);assert.equal(await page.locator('.credit-package-discount').count(),0,'A missing reference tier cannot substantiate a discount');
 await render([{...offered,currency:'USD'},baseline]);assert.equal(await page.locator('.credit-package-discount').count(),0,'Do not compare different currencies');
});
