import {app,BrowserWindow,protocol} from 'electron';
import assert from 'node:assert/strict';
import {writeFile,rm,mkdir} from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {cutStartupFixture} from './cut-startup-fixture.mjs';
const repository=fileURLToPath(new URL('../../',import.meta.url)),{values}=parseArgs({options:{'app-root':{type:'string'}}}),root=values['app-root']||repository,profile=mkdtempSync(join(tmpdir(),'cocut-cut-view-'));
app.setPath('userData',profile);protocol.registerSchemesAsPrivileged([{scheme:'cocut-cut',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
let fixture,workspace,window,phase='waiting-for-app';const deadline=setTimeout(()=>{console.error('CUT_VIEW_STARTUP_DEADLINE:'+phase);app.exit(1);},45000);
// Electron waits for its main ESM module to settle before app readiness. Keep
// whenReady inside an async task rather than a top-level await cycle.
async function run(){
try{
 await app.whenReady();phase='creating-workspace';console.log('CUT_VIEW_APP_READY');const {createProductWorkspace}=await import(pathToFileURL(join(root,'client/composition/product-workspace.mjs')));fixture=await cutStartupFixture();window=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 workspace=await createProductWorkspace({root,directory:join(profile,'workspace'),key:'isolated-startup-smoke',paths:{python:join(root,'.local/rebuild/portable-python/cut/python.exe'),binaryDirectory:join(root,'.local/rebuild/packaging-resources/bin')},window,connections:{cut:fixture.connection},resize:()=>workspace?.bounds({x:0,y:0,width:1200,height:850}),canActivate:()=>true,onFailure:(_product,error)=>{console.error(error);app.exit(1);}});
 phase='activating-cut';await workspace.activate('cut');phase='waiting-for-renderer';console.log('CUT_VIEW_WORKER_AND_DOCUMENT_READY');workspace.bounds({x:0,y:0,width:1200,height:850});workspace.setVisible(true,'cut');window.showInactive();
 const view=workspace.cutView;assert.equal(view.webContents.getURL(),'cocut-cut://workspace/');
 let state;
 for(let n=0;n<100;n++){
  state=await view.webContents.executeJavaScript("({title:document.title,tasks:document.getElementById('taskCount')?.textContent,health:document.getElementById('health')?.textContent,fees:window.__cutFeesInstalled===true,form:document.querySelectorAll('#uploadRhythm input').length})");
  if(state.tasks==='0 条素材'&&state.fees)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.match(state.title,/口播剪辑/);assert.equal(state.tasks,'0 条素材');assert.equal(state.health,'● 服务已就绪');assert.equal(state.form,2);assert.equal(state.fees,true);assert.deepEqual(fixture.unexpected,[]);
 console.log('CUT_VIEW_DOM_ASSERTIONS_PASSED');phase='capturing-owned-test-window';await view.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const out=join(repository,'.local/rebuild/windows-96');await mkdir(out,{recursive:true});await writeFile(join(out,'cut-workspace.png'),(await view.webContents.capturePage()).toPNG());
 const receipt={status:'passed',scope:'isolated-windows-cut-workspace',customSchemeAndPreload:true,workerReady:true,htmlCssJavascriptLoaded:true,preferencesAndJobsLoaded:true,feeModuleLoaded:true,paidCalls:false,financialWrites:false};await writeFile(join(out,'cut-startup-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
 await workspace.stop();workspace=undefined;window.destroy();await fixture.close();fixture=undefined;clearTimeout(deadline);await rm(profile,{recursive:true,force:true});app.exit(0);
}catch(error){console.error(error);clearTimeout(deadline);await workspace?.stop();window?.destroy();await fixture?.close();app.exit(1);}
}
void run();
