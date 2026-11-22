import {spawn} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED');
const root=fileURLToPath(new URL('../../',import.meta.url)),base=join(root,'.local/rebuild/windows-96'),profile=join(base,'helper-smoke-profile');await mkdir(profile,{recursive:true});
const helper=process.argv[2]||join(base,'application/CocoCut-win32-x64/resources/renderer-worker/CoCutRender.exe'),child=spawn(helper,[],{env:{...process.env,KOUBO_DEMO_USER_DATA:profile},stdio:['ignore','pipe','pipe'],windowsHide:true});
let output='',terminal=false,browser;child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',()=>{terminal=true;resolve();});});
try{
 const deadline=Date.now()+30000;let url;
 while(Date.now()<deadline&&!terminal){url=/KOUBO_DEMO_CAPTURE_URL (http:\/\/127\.0\.0\.1:\d+\/[^\s]+)/.exec(output)?.[1];if(url)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(url,'Dedicated rendering worker must start without opening client');
 const status=await(await fetch(url+'/status')).json();assert.equal(status.windows.length,1);assert.equal(status.windows[0].visible,false);assert.equal(status.windows[0].focused,false);
 const ws=/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/.exec(output)?.[1];assert.ok(ws,'Isolated renderer debugger endpoint required');
 const require=createRequire(join(root,'client/package.json'));const {chromium}=require('playwright-core');browser=await chromium.connectOverCDP(ws);const page=browser.contexts()[0].pages()[0];
 await page.setContent('<html><body style="margin:0;background:#172238;color:white"><h1>CoCut rendering check</h1><div style="width:160px;height:80px;background:#36d5ad"></div></body></html>');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const response=await fetch(url+'/capture'),data=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200,response.status===200?'':data.toString('utf8').slice(0,300));assert.equal(data.subarray(1,4).toString(),'PNG');
 await writeFile(join(base,'render-worker-smoke.png'),data);await writeFile(join(base,'render-worker-receipt.json'),JSON.stringify({status:'passed',dedicatedExecutable:true,hidden:true,pngCaptured:true,paidCalls:false})+'\n');
 console.log(JSON.stringify({status:'passed',dedicatedExecutable:true,hidden:true,pngCaptured:true}));
}finally{await browser?.close();if(!terminal)child.kill('SIGTERM');await closed;}
