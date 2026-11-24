import assert from 'node:assert/strict';
import {mkdtemp,readdir,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron as electron} from 'playwright';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {installerClientRelease,verifyClientRelease} from './client-release-metadata.mjs';
import {verifyWindowsShortcuts} from './verify-windows-shortcuts.mjs';
const exec=promisify(execFile),base='.local/rebuild/windows-96';
const bounded=(promise,ms,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(label)),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},error=>{clearTimeout(timer);reject(error);});});
if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED');
const expected=installerClientRelease(JSON.parse(await readFile(join(base,'receipt.json'),'utf8')),{platform:'win32',arch:'x64',...(process.env.COCUT_RELEASE_BUILD?{build:Number(process.env.COCUT_RELEASE_BUILD)}:{}),...(process.env.GITHUB_SHA?{sourceCommit:process.env.GITHUB_SHA}:{})});
if(!expected)throw Error('UPDATE_CAPABLE_CLIENT_BUILD_REQUIRED');
const folder=join(base,'installer/nsis-web'),names=await readdir(folder),installer=names.find(n=>n.endsWith('.exe'));
assert.ok(installer);assert.ok(names.some(n=>n.endsWith('.7z')));
const installerPath=join(folder,installer),installerHash=createHash('sha256');for await(const chunk of createReadStream(installerPath))installerHash.update(chunk);
const installerReceipt={name:installer,bytes:(await stat(installerPath)).size,sha256:installerHash.digest('hex')};
// Match the production updater's canonical target while retaining Unicode and
// spaces. NSIS 3.04 cannot safely overwrite the former 274-character temp tree.
const anchor=await mkdtemp(join(await realpath(tmpdir()),'cc-')),target=join(anchor,'CocoCut 验收');
async function readInstalledPathBudget(){
 const canonicalTarget=await realpath(target);assert.equal(canonicalTarget,target,'CANONICAL_INSTALLATION_TARGET_REQUIRED');
 let filesExamined=0,directoriesExamined=0,maxRelativeChars=0,maxAbsoluteChars=canonicalTarget.length,longestRelativeEntry='';
 async function visit(directory,relative=''){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const relativeEntry=join(relative,entry.name),absoluteEntry=join(canonicalTarget,relativeEntry);
   assert.equal(entry.isSymbolicLink(),false,'UNEXPECTED_LINK_IN_INSTALLED_PATH_BUDGET');
   if(relativeEntry.length>maxRelativeChars){maxRelativeChars=relativeEntry.length;longestRelativeEntry=relativeEntry;}
   maxAbsoluteChars=Math.max(maxAbsoluteChars,absoluteEntry.length);
   if(entry.isDirectory()){directoriesExamined++;await visit(absoluteEntry,relativeEntry);}else{assert.ok(entry.isFile(),'UNSUPPORTED_INSTALLED_PATH_ENTRY');filesExamined++;}
  }
 }
 await visit(canonicalTarget);assert.ok(filesExamined>0,'EMPTY_INSTALLED_PATH_SCAN');
 let defaultPerUserProjection={available:false,actualDefaultInstallVerified:false};
 if(process.env.LOCALAPPDATA){
  const projectedTarget=join(await realpath(process.env.LOCALAPPDATA),'Programs','CocoCut');
  defaultPerUserProjection={available:true,basis:'LocalAppData/Programs/CocoCut layout projection only',projectedTargetChars:projectedTarget.length,projectedMaxAbsoluteChars:projectedTarget.length+1+maxRelativeChars,actualDefaultInstallVerified:false};
 }
 const budget={canonicalTarget,targetChars:canonicalTarget.length,maxRelativeChars,maxAbsoluteChars,longestRelativeEntry,filesExamined,directoriesExamined,allInstalledEntriesExamined:true,maximumSupportedChars:259,defaultPerUserProjection};
 console.log(JSON.stringify({stage:'installed-path-budget',...budget}));
 assert.ok(maxAbsoluteChars<=budget.maximumSupportedChars,`NSIS_PATH_BUDGET_EXCEEDED:${maxAbsoluteChars}>${budget.maximumSupportedChars}`);return budget;
}
// NSIS requires /D=... to be the final, unquoted parameter.
const installCandidate=()=>bounded(new Promise((resolve,reject)=>{const child=spawn(join(process.cwd(),folder,installer),['/S',`/D=${target}`],{windowsVerbatimArguments:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('NSIS_INSTALL_FAILED:'+code)));}),600000,'NSIS_INSTALL_TIMEOUT');
await installCandidate();
console.log(JSON.stringify({stage:'installer-extracted',target}));
const initialPathBudget=await readInstalledPathBudget();let overwritePathBudget;
const executable=join(target,'CocoCut.exe'),appRoot=join(target,'resources/app'),profileRoot=join(anchor,'profiles');await mkdir(profileRoot);
const brandingInitial=await verifyWindowsShortcuts(target);
async function verifyRetainedIncrementalBase(){
 const metadata=JSON.parse(await readFile(join(base,'incremental-payload.json'),'utf8')),relative=(await readFile(join(target,'resources/incremental-base-path.txt'),'utf8')).trim();
 assert.match(relative,/^[A-Za-z0-9._-]{1,100}-updater[\\/]package\.7z$/,'FIXED_WINDOWS_BASE_CACHE_REQUIRED');assert.ok(process.env.LOCALAPPDATA);
 const file=join(process.env.LOCALAPPDATA,relative),info=await stat(file),h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);
 assert.equal(info.size,metadata.descriptor.payload.bytes);assert.equal(h.digest('hex'),metadata.descriptor.payload.sha256,'RETAINED_PACKAGE_MUST_MATCH_VERIFIED_INSTALLER');return {status:'passed',existingNsisCacheUsed:true,bytes:info.size,sha256:metadata.descriptor.payload.sha256};
}
const baselineInitial=await verifyRetainedIncrementalBase();
const clientRelease=await verifyClientRelease(appRoot,expected),checks=['installed-client-release'];
assert.equal(JSON.parse(await readFile(join(appRoot,'package.json'),'utf8')).version,clientRelease.version,'INSTALLED_PACKAGE_VERSION_MISMATCH');
let nativeUpdateAcceptance;
for(let attempt=0;attempt<3;attempt++){
 if(attempt===2){
  const helperFile=join(process.cwd(),base,'native-update-helper-receipt.json');
  const native=await exec(process.execPath,[join('scripts/delivery','test-windows-update-helper.mjs'),appRoot,helperFile],{timeout:120000,maxBuffer:4*1024*1024,windowsHide:true});console.log(native.stdout);
  const helper=JSON.parse(await readFile(helperFile,'utf8'));assert.equal(helper.status,'passed');checks.push('windows-native-update-helper');
  const markers=[];
  for(const name of ['account/acceptance-login.marker','packaging/acceptance-project.marker']){
   const directory=join(profileRoot,'fresh',name.split('/')[0]);await mkdir(directory,{recursive:true});const file=join(profileRoot,'fresh',name),bytes=Buffer.from('isolated-existing-data:'+randomUUID());await writeFile(file,bytes,{flag:'wx'});markers.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  // This is an automated per-user install over the same path, without the test
  // invoking any uninstaller. NSIS may perform its own normal update cleanup.
  await installCandidate();await verifyClientRelease(appRoot,expected);overwritePathBudget=await readInstalledPathBudget();
  for(const marker of markers)assert.equal(createHash('sha256').update(await readFile(marker.file)).digest('hex'),marker.sha256,'PERSISTENT_PROFILE_DATA_CHANGED_BY_OVERWRITE');
  checks.push('windows-overwrite-preserves-data');
  nativeUpdateAcceptance={status:'passed',helper,overwrite:{status:'passed',sameInstallDirectory:true,manualUninstallPerformed:false,isolatedProfileMarkersPreserved:true,installedReleaseUnchanged:true,reopened:false,scope:'same-candidate-native-nsis-overwrite',realLoginVerified:false,publicUpdateDiscoveryTested:false}};
 }
 let application,page,output='';
 try{
  application=await electron.launch({executablePath:executable,timeout:60000,env:{...process.env,COCUT_REBUILD_SMOKE:'1',COCUT_REBUILD_TEST_PROFILE_ROOT:profileRoot,COCUT_REBUILD_DATA:join(profileRoot,'fresh'),COCUT_REBUILD_DEBUG_PORT:String(9350+attempt),COCUT_REBUILD_SESSION_ONLY:'1'}});
  application.process().stderr.on('data',chunk=>output+=chunk);application.process().stdout.on('data',chunk=>output+=chunk);
  page=await application.firstWindow({timeout:60000});
  await page.getByRole('heading',{name:'\u4e3b\u9875',exact:true}).waitFor({timeout:60000});
  assert.ok(await page.getByRole('button',{name:/\u5f00\u59cb\u526a\u8f91/}).count());assert.ok(await page.getByRole('button',{name:/\u5f00\u59cb\u5305\u88c5/}).count());
  assert.equal(await page.locator('#start-video-analysis').count(),1,'NEW_PRODUCT_HOME_ENTRY_REQUIRED');
  assert.deepEqual(await page.locator('.sidebar nav button').evaluateAll(buttons=>buttons.map(button=>button.id)),['home','video-analysis','cut','packaging']);
  assert.equal(await page.locator('#home-packaging-demo').evaluate(video=>video.muted&&video.loop&&video.playsInline),true,'SILENT_LOOPING_HOME_DEMO_REQUIRED');
  await page.screenshot({path:join(base,`fresh-home-${attempt}.png`)});checks.push(attempt===2?'overwrite-reopen-home':attempt?'cold-reopen-home':'clean-install-home');if(attempt===2)nativeUpdateAcceptance.overwrite.reopened=true;console.log(JSON.stringify({stage:checks.at(-1),status:'passed'}));
 }catch(error){console.error(error.stack);console.error(output.slice(-6000));if(page)console.error(await bounded(page.locator('body').innerText(),5000,'DIAGNOSTIC_TIMEOUT').catch(()=>''));throw error;
 }finally{if(application){
  const child=application.process(),exited=child.exitCode===null?new Promise(resolve=>child.once('exit',code=>resolve(code))):Promise.resolve(child.exitCode);
  try{await bounded(application.close(),15000,'APPLICATION_CLOSE_TIMEOUT');assert.equal(await bounded(exited,10000,'APPLICATION_NORMAL_EXIT_TIMEOUT'),0,'INSTALLED_CLIENT_NORMAL_EXIT_REQUIRED');}
  catch(error){if(child.exitCode===null)child.kill('SIGTERM');throw error;}
 }}
}

for(const [script,args] of [
 ['test-cut-runtime.mjs',['--app-root',appRoot]],
 ['test-installed-cut-export.mjs',['--app-root',appRoot,'--output',join(process.cwd(),base,'cut-export-receipt.json')]],
 ['run-cut-workspace-test.mjs',['--app-root',appRoot]],
 ['test-packaging-local-production.mjs',[appRoot]],
 ['test-supporting-materials-runtime.mjs',[appRoot]],
 ['test-installed-recharge-ui.mjs',[appRoot]],
 ['test-windows-packaging-asr.mjs',[appRoot]],
 ['test-onnx-native.mjs',[appRoot]],
 ['test-windows-render-worker.mjs',[join(target,'resources/renderer-worker/CoCutRender.exe')]],
 ['test-installed-video-analysis-runtime.mjs',['--app-root',appRoot,'--output',join(process.cwd(),base,'video-analysis-runtime-receipt.json')]],
 ['test-analysis-stdin-lease.mjs',['--app-root',appRoot]],
 ['test-analysis-media-processing.mjs',['--app-root',appRoot]],
 ['test-installed-export-browser.mjs',['--app-root',appRoot,'--output',join(process.cwd(),base,'export-browser-receipt.json')]],
 ['test-installed-packaging-features.mjs',['--app-root',appRoot,'--output',join(process.cwd(),base,'installed-features-receipt.json')]],
 ['run-installed-video-analysis-test.mjs',['--app-root',appRoot,'--output',join(process.cwd(),base,'video-analysis-native-receipt.json')]],
]){const result=await exec(process.execPath,[join('scripts/delivery',script),...args],{timeout:480000,maxBuffer:8*1024*1024});console.log(result.stdout);checks.push(script);}
const recovery=await exec(process.execPath,[join('scripts/delivery/test-installed-login-recovery.mjs'),'--app-root',appRoot,'--output',join(process.cwd(),base,'login-recovery-receipt.json')],{timeout:180000,maxBuffer:4*1024*1024,windowsHide:true});console.log(recovery.stdout);checks.push('installed-login-recovery');
const updateUi=await exec(process.execPath,['--test','--test-reporter=tap',join('client/tests/app-update-ui.test.mjs')],{env:{...process.env,COCUT_ACCOUNT_UI_APP_ROOT:appRoot},timeout:120000,maxBuffer:4*1024*1024,windowsHide:true});
assert.match(updateUi.stdout,/^# tests 6\r?$/m,'SIX_UPDATE_UI_CHECKS_REQUIRED');assert.match(updateUi.stdout,/^# fail 0\r?$/m,'UPDATE_UI_CHECKS_FAILED');console.log(updateUi.stdout);checks.push('app-update-ui.test.mjs');
const releaseFeatures={packaging:JSON.parse(await readFile(join(base,'installed-features-receipt.json'),'utf8')),videoAnalysis:JSON.parse(await readFile(join(base,'video-analysis-native-receipt.json'),'utf8')),videoAnalysisRuntime:JSON.parse(await readFile(join(base,'video-analysis-runtime-receipt.json'),'utf8')),branding:{initial:brandingInitial,overwrite:await verifyWindowsShortcuts(target)},incrementalBaseline:{initial:baselineInitial,overwrite:await verifyRetainedIncrementalBase()}};
assert.equal(releaseFeatures.packaging.status,'passed');assert.equal(releaseFeatures.videoAnalysis.status,'passed');assert.equal(releaseFeatures.packaging.charts.length,4);
assert.equal(releaseFeatures.videoAnalysis.localExtraction,true);assert.equal(releaseFeatures.videoAnalysis.cloudVideoUploads,false);assert.equal(releaseFeatures.videoAnalysisRuntime.status,'passed');assert.equal(releaseFeatures.videoAnalysisRuntime.independentPython,true);assert.equal(releaseFeatures.videoAnalysisRuntime.lockedDependencies,19);assert.deepEqual(releaseFeatures.videoAnalysisRuntime.clientRelease,clientRelease);assert.deepEqual(releaseFeatures.videoAnalysis.clientRelease,clientRelease);
await writeFile(join(base,'fresh-install-receipt.json'),JSON.stringify({status:'passed',checks,clientRelease,updateProtocol:1,nativeUpdateAcceptance,releaseFeatures,installationPaths:{initial:initialPathBudget,overwrite:overwritePathBudget,unicodeAndSpacesRetained:true,actualDefaultInstallVerified:false},installer:installerReceipt,sourceCommit:clientRelease.sourceCommit,realSmsTest:false,realPaymentTest:false,paidModelCalls:false,isolatedProfile:true,offlineModelIncluded:false,offlineModelIncludedFieldScope:'legacy-speech-model-alias',localSpeechModelIncluded:false,presenterMattingModelIncluded:true,speechRecognition:'doubao-auc-turbo'},null,2)+'\n');
console.log(JSON.stringify({status:'fresh-install-passed',checks}));
