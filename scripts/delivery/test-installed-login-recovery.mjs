// Actual installed executable + OS encryption. Only synthetic account bytes and
// isolated profiles are used. Native confirmation answers are test fixtures;
// this does not claim human confirmation, SMS login, payment or production.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,realpath,access} from 'node:fs/promises';
import {join,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {_electron} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{'app-root':{type:'string'},'previous-app-root':{type:'string'},output:{type:'string'}}});
assert.ok(isAbsolute(values['app-root']||'')&&isAbsolute(values.output||''),'EXPLICIT_INSTALLED_INPUTS_REQUIRED');
const appRoot=await realpath(values['app-root']),previous=values['previous-app-root']?await realpath(values['previous-app-root']):appRoot;
const owned=await realpath(join(root,'.local/rebuild')),inside=value=>{const rel=relative(owned,value);return !!rel&&!rel.startsWith('..')&&!isAbsolute(rel);};
assert.ok(inside(await realpath(dirname(values.output))),'OWNED_OUTPUT_REQUIRED');
const executable=async base=>{if(process.platform==='darwin')return join(base,'../../MacOS/CoCutNext');for(const name of ['CocoCut.exe','CoCutNext.exe']){const file=join(base,'../..',name);try{await access(file);return file;}catch(error){if(error.code!=='ENOENT')throw error;}}throw Error('INSTALLED_WINDOWS_EXECUTABLE_MISSING');};
const profiles=join(owned,'profiles');await mkdir(profiles,{recursive:true});const anchor=await mkdtemp(join(profiles,'installed-login-')),profile=join(anchor,'default');await mkdir(profile);await mkdir(join(profile,'account'));
const vault=join(profile,'account/account-session.enc'),marker=join(profile,'project-preserved.marker');await writeFile(marker,'isolated project marker',{flag:'wx'});
const deployment=JSON.parse(await readFile(join(appRoot,'deployment.json'),'utf8')),binding=createHash('sha256').update(deployment.account.coreBaseUrl).digest('hex');
const fixture=JSON.stringify({schemaVersion:1,binding,value:{purchases:[],acceptanceMarker:'synthetic-account-no-user-token'}});
let application,page;const close=async()=>{if(!application)return;const current=application;application=undefined;await current.close();};
async function waitAccount(predicate,timeoutMs){const deadline=Date.now()+timeoutMs;let last;while(Date.now()<deadline){try{last=await page.evaluate(()=>window.desktopShell.account('read'));if(predicate(last))return last;}catch(error){if(!String(error.message).includes('No handler registered'))throw error;}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('ACTUAL_ACCOUNT_IPC_NOT_READY:'+JSON.stringify(last));}
async function launch(base,sessionOnly){
 application=await _electron.launch({executablePath:await executable(base),args:[],env:{...process.env,COCUT_REBUILD_SMOKE:'1',COCUT_REBUILD_SESSION_ONLY:sessionOnly?'1':'0',COCUT_REBUILD_TEST_PROFILE_ROOT:anchor,COCUT_REBUILD_DATA:profile},timeout:60000});
 page=await application.firstWindow();await waitAccount(view=>view.configured,60000);
}
const proof={status:'pending',platform:process.platform,scope:'installed-client-login-recovery',clientRelease:JSON.parse(await readFile(join(appRoot,'client-release.json'),'utf8')),isolatedProfile:true,syntheticCiphertext:true,realAccount:false,realSms:false,payments:false,paidModelCalls:false,nativeConfirmationAnswersMocked:true};
try{
 await launch(previous,true);
 const cipher=Buffer.from(await application.evaluate(async({safeStorage},input)=>Array.from(await safeStorage.encryptStringAsync(input)),fixture));
 await close();await writeFile(vault,cipher,{flag:'wx',mode:0o600});
 await launch(appRoot,false);let view=await page.evaluate(()=>window.desktopShell.account('read'));
 assert.equal(view.status,'signed-out');assert.equal(view.loginRecoveryRequired,undefined);assert.deepEqual(await readFile(vault),cipher);
 proof.osEncryptedColdRestore=true;proof.previousBuild=JSON.parse(await readFile(join(previous,'client-release.json'),'utf8')).build;
 await close();
 const broken=Buffer.from([0x76,0x31,0x30,0]);await writeFile(vault,broken,{mode:0o600});
 await launch(appRoot,false);view=await page.evaluate(()=>window.desktopShell.account('read'));assert.equal(view.loginRecoveryRequired,true);
 await page.locator('#account-button').click();await page.locator('#account-recover').waitFor({state:'visible'});
 assert.match(await page.locator('#account-error').innerText(),/原登录信息/);await new Promise(resolve=>setTimeout(resolve,350));assert.match(await page.locator('#account-error').innerText(),/原登录信息/);
 await application.evaluate(({dialog})=>{globalThis.loginRecoveryConfirmations=[];dialog.showMessageBox=async(_parent,options)=>{globalThis.loginRecoveryConfirmations.push({title:options.title,cancelId:options.cancelId,detail:options.detail});return {response:1};};});
 await page.locator('#account-recover').click();await page.waitForFunction(()=>!document.querySelector('#account-recover').disabled);assert.deepEqual(await readFile(vault),broken);assert.equal((await page.evaluate(()=>window.desktopShell.account('read'))).loginRecoveryRequired,true);
 await application.evaluate(({dialog})=>{dialog.showMessageBox=async(_parent,options)=>{globalThis.loginRecoveryConfirmations.push({title:options.title,cancelId:options.cancelId,detail:options.detail});return {response:0};};});
 await page.locator('#account-recover').click();await waitAccount(view=>!view.loginRecoveryRequired,30000);
 // Native authorization may load the public first-party page; never send SMS.
 for(let n=0;n<40;n++){const loaded=await application.evaluate(({BrowserWindow},origin)=>BrowserWindow.getAllWindows().some(window=>window.isVisible()&&window.webContents.getURL().startsWith(origin+'/')),deployment.account.authorizationOrigins[0]);if(loaded){proof.authorizationWindowOpened=true;break;}const state=await page.evaluate(()=>window.desktopShell.account('read'));if(state.status!=='signing-in')break;await new Promise(resolve=>setTimeout(resolve,500));}
 assert.equal(proof.authorizationWindowOpened,true,'FIRST_PARTY_LOGIN_WINDOW_NOT_LOADED');
 await page.evaluate(()=>window.desktopShell.account('cancel-login'));
 assert.equal((await page.evaluate(()=>window.desktopShell.account('read'))).status,'signed-out');
 const backups=(await readdir(join(profile,'account'))).filter(name=>name.startsWith('account-session.enc.recovery-'));assert.equal(backups.length,1);assert.deepEqual(await readFile(join(profile,'account',backups[0])),broken);
 assert.equal(await readFile(marker,'utf8'),'isolated project marker');
 const confirmations=await application.evaluate(()=>globalThis.loginRecoveryConfirmations);assert.equal(confirmations.length,2);assert.ok(confirmations.every(value=>value.cancelId===1&&value.detail.includes('备份')&&value.detail.includes('订单')));
 proof.cancelPreservesOriginal=true;proof.recoveryPreservesExactCiphertext=true;proof.systemEncryptionRequired=true;proof.projectMarkerPreserved=true;proof.errorPersists=true;
 await close();await launch(appRoot,false);view=await page.evaluate(()=>window.desktopShell.account('read'));assert.equal(view.status,'signed-out');assert.equal(view.loginRecoveryRequired,undefined);
 proof.recoveredColdReopen=true;proof.status='passed';await close();
 await writeFile(values.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(proof));
}finally{await close();}
