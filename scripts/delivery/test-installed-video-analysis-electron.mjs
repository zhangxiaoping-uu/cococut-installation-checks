// Official isolated Electron host, but Host/preload/HTML/CSS/JS are loaded from
// the actual installation. The Core and generated media below are fixtures.
import {app,BrowserWindow,protocol,session,webContents} from 'electron';
import assert from 'node:assert/strict';
import {realpathSync,lstatSync,readFileSync} from 'node:fs';
import {mkdir,readFile,writeFile,readdir,access,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {installedReleaseFile} from './client-release-metadata.mjs';
const repository=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{'app-root':{type:'string'},output:{type:'string'},'profile-root':{type:'string'}}});
assert.ok(values['app-root']&&isAbsolute(values['app-root']),'EXPLICIT_INSTALLED_APP_ROOT_REQUIRED');
const root=values['app-root'],output=resolve(values.output||join(repository,'.local/rebuild/windows-96/video-analysis-native-receipt.json'));
assert.ok(isAbsolute(values['profile-root']||''),'EXPLICIT_WRAPPER_OWNED_PROFILE_REQUIRED');
const profile=realpathSync.native(values['profile-root']),ownerFile=join(profile,'.fixture-owner.json'),ownerMetadata=lstatSync(ownerFile);assert.ok(ownerMetadata.isFile()&&!ownerMetadata.isSymbolicLink());
const ownership=JSON.parse(readFileSync(ownerFile,'utf8'));assert.equal(ownership.ownerPid,process.ppid);assert.equal(ownership.profile,profile);const legacyProfile=ownership.legacyProfile;
app.setPath('userData',join(profile,'electron'));
protocol.registerSchemesAsPrivileged([{scheme:'cococut-video-analysis',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
app.on('window-all-closed',()=>{});
const sourceA='https://www.instagram.com/reel/installed-A/',sourceB='https://www.instagram.com/reel/installed-B/';
const record={status:'running',stage:'before-ready',platform:process.platform,scope:'installed-video-analysis-native-fixture',localExtraction:true,cloudVideoUploads:false,cases:[],paidCalls:false,realAccountWrites:false,userProfileTouched:false,realPlatformDownloads:false};
record.canonicalProfile={legacy:legacyProfile,native:profile,differ:legacyProfile!==profile};
let core,owner,product,contents;
function phase(stage){record.stage=stage;console.log(JSON.stringify({diagnostic:'installed-analysis-phase',stage,cases:record.cases}));}
function deadlineSnapshot(){
 const alive=app.isReady()?webContents.getAllWebContents().slice(0,16).map(value=>{try{const url=value.getURL();return {id:value.id,type:value.getType(),destroyed:value.isDestroyed(),loading:value.isLoading(),urlKind:url==='about:blank'?'about:blank':url.startsWith('cococut-video-analysis:')?'analysis':url?'other':'empty'};}catch(error){return {id:value.id,inspectionError:error.name};}}):[];
 return {diagnostic:'installed-analysis-deadline-state',stage:record.stage,cases:record.cases,canonicalProfile:record.canonicalProfile,startupCleanup:record.startupCleanup||null,protocolCleanupFailure:record.protocolCleanupFailure||null,aliveContents:alive,ownerChildren:owner&&!owner.isDestroyed()?owner.contentView.children.length:null,ownerDestroyed:owner?owner.isDestroyed():null};
}
const deadline=setTimeout(()=>{console.error('INSTALLED_ANALYSIS_NATIVE_DEADLINE');console.error(JSON.stringify(deadlineSnapshot()));app.exit(2);},60000);
const wait=async read=>{const end=Date.now()+12000;while(Date.now()<end){if(await read())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('INSTALLED_ANALYSIS_CONDITION_TIMEOUT');};
async function files(directory){const entries=await readdir(directory,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});const result=[];for(const entry of entries){const file=join(directory,entry.name);if(entry.isDirectory())result.push(...await files(file));else result.push(file);}return result;}
async function run(){
 try{
  phase('waiting-for-app-ready');await app.whenReady();phase('app-ready');assert.equal(await realpath(root),root,'CANONICAL_APP_ROOT_REQUIRED');
  assert.equal(await realpath(profile),profile,'CANONICAL_FIXTURE_PROFILE_REQUIRED');
  record.appRoot=root;record.clientRelease=await installedReleaseFile(root);assert.equal(record.clientRelease.platform,process.platform);assert.equal(record.clientRelease.arch,process.arch);
  const ffmpeg=join(root,'.local/rebuild/packaging-resources/bin',process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),fixture=join(profile,'fixture.mp4');
  phase('prepare-synthetic-media');await promisify(execFile)(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30','-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p',fixture],{timeout:15000,windowsHide:true});
  const media=await readFile(fixture),artifacts=new Set();
  const origin='https://speech.invalid',coreRoot=join(profile,'host/local-core');
  const {startVideoAnalysisProduct}=await import(pathToFileURL(join(root,'client/products/video-analysis/host/runtime.mjs'))),{createDesktopVideoAnalysis}=await import(pathToFileURL(join(root,'client/products/video-analysis/host/desktop.mjs')));
  const fixtureQuotaFetch=async(url,options)=>{assert.equal(new URL(url).origin,origin);const match=/\/quota\/operations\/([a-f0-9-]{36})(?:\/(touch|complete|release))?$/.exec(new URL(url).pathname);assert.ok(match,'ONLY_ISOLATED_QUOTA_REQUEST_ALLOWED');const input=JSON.parse(options.body);return Response.json({id:match[1],action:input.action,status:match[2]==='complete'?'succeeded':match[2]==='release'?'released':'reserved',leaseMs:300000});};
  const desktopFactory=async options=>{core=await createDesktopVideoAnalysis({...options,fetcher:fixtureQuotaFetch,runnerFactory:()=>async({input,directory,signal})=>{
   signal.throwIfAborted();assert.ok([sourceA,sourceB].includes(input.shareText));const file=join(directory,input.shareText===sourceA?'A.mp4':'B.mp4');await mkdir(directory,{recursive:true});await writeFile(file,media);if(input.shareText===sourceA)artifacts.add(file);
   return {title:input.shareText===sourceA?'A号隔离视频':'B号隔离视频',platform:'测试平台',mediaPath:file,duration:1,...(input.action==='transcript'?{transcript:{text:'仅本页面保留的合成文案',source:'测试夹具'}}:{})};
  }});return core;};
  owner=new BrowserWindow({show:false,width:1180,height:820,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const owned=session.fromPartition('cococut-video-analysis-'+'b'.repeat(64)),before=new Set(webContents.getAllWebContents().map(value=>value.id)),startupFailure=Object.assign(Error('controlled installed startup failure'),{code:'INSTALLED_FIXTURE_STARTUP_REJECTED'});
  assert.equal(await owned.protocol.isProtocolHandled('cococut-video-analysis'),false);
  phase('controlled-startup-rejection');await assert.rejects(startVideoAnalysisProduct({root,directory:join(profile,'host'),workspaceKey:'b'.repeat(64),ownerWindow:owner,connection:{origin,authorization:'Bearer installed-fixture'},desktopFactory:async()=>{throw startupFailure;}}),error=>error===startupFailure);
  assert.deepEqual(new Set(webContents.getAllWebContents().map(value=>value.id)),before);assert.equal(owner.contentView.children.length,0);assert.equal(await owned.protocol.isProtocolHandled('cococut-video-analysis'),false);
  phase('controlled-startup-rejection-cleaned');const startupCleanupFailure=Object.assign(Error('controlled startup service cleanup failure'),{code:'INSTALLED_FIXTURE_CLOSE_REJECTED'});
  phase('controlled-startup-and-cleanup-rejection');await assert.rejects(startVideoAnalysisProduct({root,directory:join(profile,'host'),workspaceKey:'b'.repeat(64),ownerWindow:owner,connection:{origin,authorization:'Bearer installed-fixture'},desktopFactory:async()=>({connection:{origin:'http://forbidden.invalid',authorization:'Bearer fixture'},close:async()=>{throw startupCleanupFailure;}})}),error=>error instanceof AggregateError&&error.cause===error.errors[0]&&error.cause.code==='VIDEO_ANALYSIS_CONFIGURATION_INVALID'&&error.errors[1]===startupCleanupFailure);
  assert.deepEqual(new Set(webContents.getAllWebContents().map(value=>value.id)),before);assert.equal(owner.contentView.children.length,0);assert.equal(await owned.protocol.isProtocolHandled('cococut-video-analysis'),false);
  phase('controlled-double-rejection-cleaned');record.startupCleanup={originalErrorPreserved:true,cleanupFailurePreservesPrimaryCause:true,ownedViewDestroyed:true,ownerRecovered:true,protocolUnregistered:true,laterOpenSucceeded:false};
  const create=async()=>{const value=await startVideoAnalysisProduct({root,directory:join(profile,'host'),workspaceKey:'b'.repeat(64),ownerWindow:owner,connection:{origin,authorization:'Bearer installed-fixture'},canAccess:()=>true,desktopFactory});owner.contentView.addChildView(value.view);value.view.setBounds({x:0,y:0,width:1180,height:820});value.view.setVisible(true);value.view.webContents.setBackgroundThrottling(false);owner.showInactive();return value;};
  phase('normal-create');product=await create();phase('normal-create-ready');record.startupCleanup.laterOpenSucceeded=true;contents=product.view.webContents;const ui=script=>contents.executeJavaScript(script);
  phase('initial-ui-checks');assert.equal(await ui('typeof window.videoAnalysis.clear'),'function');assert.equal(await ui('document.getElementById("history")'),null);assert.equal(await ui('document.getElementById("extract-video").getAttribute("aria-busy")'),'false');record.cases.push('installed-sandbox-preload-and-empty-state');
  phase('extract-video');await ui(`document.getElementById('share-input').value=${JSON.stringify(sourceA)};document.getElementById('share-input').dispatchEvent(new Event('input'));document.getElementById('extract-video').click()`);
  await wait(()=>ui('!document.getElementById("video-panel").hidden'));
  phase('extract-transcript');await ui('document.getElementById("extract-transcript").click()');await wait(()=>ui('!document.getElementById("text-panel").hidden'));
  const a=await ui('window.videoAnalysis.snapshot()');assert.equal(a.tasks.length,2);assert.ok(a.tasks.every(t=>t.status==='succeeded'));record.cases.push('video-and-transcript-real-native-ipc');
  phase('play-native-media');assert.equal(await contents.executeJavaScript('document.getElementById("video-player").play().then(()=>true)',true),true);await wait(()=>ui('document.getElementById("video-player").currentTime>0.1'));await ui('document.getElementById("video-player").pause()');record.cases.push('authenticated-native-media-stream-decodes');
  phase('replace-link');await ui(`document.getElementById('share-input').value=${JSON.stringify(sourceB)};document.getElementById('share-input').dispatchEvent(new Event('input'));document.getElementById('extract-video').click()`);
  await wait(()=>ui('!document.getElementById("video-panel").hidden&&document.getElementById("video-title").textContent==="B号隔离视频"'));
  for(const file of artifacts)await assert.rejects(access(file),{code:'ENOENT'});assert.equal(await ui('document.getElementById("transcript").value'),'');record.cases.push('new-link-physically-deletes-old-source');
  phase('clear-current');await ui('document.getElementById("clear-input").click()');await wait(async()=>{const s=await ui('window.videoAnalysis.snapshot()');return !s.clearing&&!s.cleanupPending&&!s.tasks.length;});
  assert.equal(await ui('document.getElementById("share-input").value'),'');assert.equal((await files(join(coreRoot,'accounts'))).length,0);assert.equal((await files(join(coreRoot,'operations'))).length,0);record.cases.push('clear-awaits-server-file-deletion');
  phase('stop-before-cold-reopen');await product.stop();phase('cold-reopen-create');product=await create();phase('cold-reopen-ui');contents=product.view.webContents;assert.equal(await ui('document.getElementById("share-input").value'),'');assert.equal((await ui('window.videoAnalysis.snapshot()')).tasks.length,0);record.cases.push('same-profile-reopen-is-blank');
  const stored=await readFile(join(profile,'host/tasks.json'),'utf8');assert.ok(!stored.includes(sourceA)&&!stored.includes(sourceB)&&!stored.includes('合成文案'));record.cases.push('no-content-in-local-control-file');
  phase('injected-unhandle-failure');const originalUnhandle=owned.protocol.unhandle,cleanupFailure=Object.assign(Error('controlled protocol cleanup failure'),{code:'INSTALLED_FIXTURE_UNHANDLE_REJECTED'});
  try{
   owned.protocol.unhandle=function(scheme){originalUnhandle.call(this,scheme);throw cleanupFailure;};
   await assert.rejects(product.stop(),error=>error===cleanupFailure);assert.equal(contents.isDestroyed(),true);assert.equal(owner.contentView.children.length,0);
  }finally{owned.protocol.unhandle=originalUnhandle;}
  phase('reopen-after-unhandle-failure');assert.equal(await owned.protocol.isProtocolHandled('cococut-video-analysis'),false);product=await create();contents=product.view.webContents;assert.equal(await ui('document.getElementById("share-input").value'),'');
  record.protocolCleanupFailure={injectedAfterNativeUnregister:true,errorPropagated:true,viewDestroyed:true,ownerRecovered:true,laterOpenSucceeded:true};
  phase('all-native-cases-passed');record.status='passed';
 }catch(error){record.status='failed';record.error={name:error.name,message:error.message};if(contents&&!contents.isDestroyed())record.player=await contents.executeJavaScript('(()=>{const v=document.getElementById("video-player");return v?{currentTime:v.currentTime,paused:v.paused,ended:v.ended,readyState:v.readyState,error:v.error?.message}:null})()').catch(()=>null);console.error(error);}
 finally{
  record.finalCleanup={productStopped:false,ownerDestroyed:false,coreClosed:false};
  const clean=async(flag,stage,action)=>{phase(stage);try{await action();record.finalCleanup[flag]=true;}catch(error){record.status='failed';(record.cleanupErrors??=[]).push({stage,name:String(error.name).slice(0,80),code:String(error.code||'').slice(0,100),message:String(error.message||'').slice(0,240)});}};
  await clean('productStopped','final-product-stop',()=>product?.stop());await clean('ownerDestroyed','final-owner-destroy',()=>owner?.destroy());await clean('coreClosed','final-core-close',()=>core?.close());phase('profile-cleanup-deferred-until-process-exit');record.profileCleanupPending=true;
  clearTimeout(deadline);await mkdir(join(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));app.exit(record.status==='passed'?0:1);
 }
}
void run();
