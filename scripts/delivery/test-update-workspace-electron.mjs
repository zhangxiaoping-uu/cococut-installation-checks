// Start both real product hosts after runtime generation. No login, provider or
// media processing is performed; all data belongs to this disposable profile.
import {app,BrowserWindow,protocol} from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {cutStartupFixture} from './cut-startup-fixture.mjs';
const repository=fileURLToPath(new URL('../../',import.meta.url)),{values}=parseArgs({options:{'app-root':{type:'string'}}}),root=values['app-root']||repository,profile=mkdtempSync(join(tmpdir(),'cococut-update-hosts-'));
app.setPath('userData',profile);
protocol.registerSchemesAsPrivileged(['cocut-cut','studio'].map(scheme=>({scheme,privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}})));
let workspace,window,fixture,phase='ready';const deadline=setTimeout(()=>{console.error('UPDATE_PRODUCT_HOST_STARTUP_TIMEOUT:'+phase);app.exit(1);},60000);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
 try{
  await app.whenReady();phase='configuration';
  const paths=values['app-root']?await(await import(pathToFileURL(join(root,'client/platform/installed-runtime.mjs')).href)).loadInstalledRuntime(root):JSON.parse(await readFile(join(root,'.local/rebuild/runtime.json'),'utf8'));
  fixture=await cutStartupFixture();window=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const {createProductWorkspace}=await import(pathToFileURL(join(root,'client/composition/product-workspace.mjs')).href);
  workspace=await createProductWorkspace({root,directory:join(profile,'workspace'),key:'7'.repeat(64),paths,window,connections:{cut:fixture.connection},resize:()=>workspace?.bounds({x:0,y:0,width:1200,height:850}),canActivate:()=>true,onFailure:(_product,error)=>{console.error(error);app.exit(1);}});
  phase='cut';await workspace.activate('cut');assert.equal(workspace.cutView.webContents.getURL(),'cocut-cut://workspace/');
  phase='packaging';await workspace.activate('packaging');assert.equal(workspace.packagingView.webContents.getURL(),'studio://app/index.html');
  let text='';for(let n=0;n<100;n++){text=await workspace.packagingView.webContents.executeJavaScript('document.body.innerText');if(text.includes('口播包装工作台'))break;await pause(100);}assert.match(text,/口播包装工作台/);
  phase='idle-preparation';let release;
  for(let n=0;n<30;n++){try{release=await workspace.prepareUpdate();break;}catch(error){if(error.code!=='UPDATE_WORKSPACE_BUSY')throw error;await pause(100);}}
  assert.equal(typeof release,'function','both initialized hosts must prepare an idle update');await release();
  assert.deepEqual(fixture.unexpected,[]);
  const output=join(repository,'.local/rebuild/windows-96');await mkdir(output,{recursive:true});
  const receipt={status:'passed',scope:'isolated-prepared-product-hosts',platform:process.platform,cutHostStarted:true,packagingHostStarted:true,packagingDocumentLoaded:true,preparedRuntimeLinked:true,bothIdleChecksExecuted:true,paidCalls:false,financialWrites:false};
  await writeFile(join(output,'update-workspace-startup-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
  await workspace.stop();workspace=undefined;window.destroy();await fixture.close();fixture=undefined;clearTimeout(deadline);await rm(profile,{recursive:true,force:true});app.exit(0);
 }catch(error){console.error(error);clearTimeout(deadline);await workspace?.stop();window?.destroy();await fixture?.close();app.exit(1);}
}
void run();
