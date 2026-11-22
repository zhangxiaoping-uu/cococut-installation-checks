import {app,BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
const repository=fileURLToPath(new URL('../../',import.meta.url)),{values}=parseArgs({options:{'app-root':{type:'string'},profile:{type:'string'}}}),root=values['app-root']||repository;
if(!values.profile)throw Error('PARENT_OWNED_TEST_PROFILE_REQUIRED');
const profile=realpathSync(values.profile);assert.equal(dirname(profile),realpathSync(tmpdir()));assert.ok(basename(profile).startsWith('cocut-window-lifetime-'));app.setPath('userData',profile);
app.on('window-all-closed',()=>{});
const deadline=setTimeout(()=>app.exit(1),30000);
async function run(){let window,quitting=false,unbind,relaunches=0;try{
 await app.whenReady();const {bindSecondInstance}=await import(pathToFileURL(join(root,'client/platform/window-lifetime.mjs')));
 unbind=bindSecondInstance(app,()=>({window,quitting}),{scheduleRelaunch:()=>{relaunches++;}});app.emit('second-instance');
 window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await window.loadURL('data:text/html,<title>CoCut lifetime fixture</title>');
 // Hosted Windows runs without an interactive foreground desktop. Verify the
 // real native calls, rather than treating OS foreground visibility as proof
 // that the lifecycle callback ran. Retain this same native object after close.
 let shows=0,focuses=0;const show=window.show.bind(window),focus=window.focus.bind(window);
 window.show=()=>{shows++;return show();};window.focus=()=>{focuses++;return focus();};
 app.emit('second-instance');assert.equal(shows,1);assert.equal(focuses,1);window.destroy();assert.equal(window.isDestroyed(),true);
 // Retain the actual destroyed native object while cleanup is still pending.
 for(let n=0;n<10;n++)app.emit('second-instance');assert.equal(shows,1);assert.equal(focuses,1);
 window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});quitting=true;
 for(let n=0;n<10;n++)app.emit('second-instance');assert.equal(relaunches,1);assert.equal(window.isVisible(),false);window.destroy();unbind();
 const receipt={status:'passed',platform:process.platform,secondLaunchNativeCalls:true,destroyedWindowIgnored:true,shutdownRelaunchDeferred:true,queuedRelaunchCount:1,paidCalls:false,financialWrites:false};
 const out=join(repository,'.local/rebuild/windows-96');await mkdir(out,{recursive:true});await writeFile(join(out,'window-lifetime-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
 // Chromium holds its Windows profile database until process exit. The parent
 // runner owns this temporary directory and removes it only after we exit.
 clearTimeout(deadline);app.exit(0);
}catch(error){console.error(error);unbind?.();if(window&&!window.isDestroyed())window.destroy();clearTimeout(deadline);app.exit(1);}}
void run();
