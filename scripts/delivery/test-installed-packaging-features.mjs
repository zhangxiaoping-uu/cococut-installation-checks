// Exercise newly shipped local production from the explicit installation. All
// media is synthetic or bundled artwork; no account, model API or user project.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {installedReleaseFile} from './client-release-metadata.mjs';
const repository=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{'app-root':{type:'string'},output:{type:'string'},'rvm-only':{type:'boolean',default:false}}});
assert.ok(values['app-root']&&isAbsolute(values['app-root']),'EXPLICIT_INSTALLED_APP_ROOT_REQUIRED');
const appRoot=await realpath(values['app-root']),resources=join(appRoot,'.local/rebuild/packaging-resources');
const clientRelease=await installedReleaseFile(appRoot);assert.equal(clientRelease.platform,process.platform);assert.equal(clientRelease.arch,process.arch);
const output=resolve(values.output||join(repository,'.local/rebuild/windows-96/installed-features-receipt.json'));
const bin=name=>join(resources,'bin',name+(process.platform==='win32'?'.exe':''));
const python=join(appRoot,'.local/rebuild/portable-python/packaging',process.platform==='win32'?'python.exe':'bin/python');
const exec=promisify(execFile),load=name=>import(pathToFileURL(join(appRoot,'client/products/packaging/runtime/electron',name)));
const work=await realpath(await mkdtemp(join(tmpdir(),'cc-features-')));
const receipt={status:'running',appRoot,clientRelease,platform:process.platform,arch:process.arch,paidCalls:false,financialWrites:false,isolatedProfile:true,humanVisualReview:false,charts:[]};
try{
 const workspace=join(work,'workspaces','f'.repeat(64),'packaging/assets/workspaces','00000000-0000-4000-8000-000000000149','中文素材-'+ 'a'.repeat(100));await mkdir(workspace,{recursive:true});
 const source=join(workspace,'host.mp4');
 await exec(bin('ffmpeg'),['-v','error','-loop','1','-i',join(appRoot,'client/shell/assets/cut-hero.png'),'-vf','scale=288:162,setsar=1','-t','0.267','-r','30','-an','-c:v','libx264','-pix_fmt','yuv420p',source],{timeout:30000,windowsHide:true});
 const sourceBytes=await readFile(source),{createRvmCutoutPreparation}=await import(pathToFileURL(join(appRoot,'client/products/packaging/host/rvm-cutout-preparation.mjs')));
 const prepare=createRvmCutoutPreparation(),task={clips:[{id:'presenter',role:'presenter',mask:'cutout',start:0,duration:.2,sourceStart:0}]},context={python,resources,ffmpeg:bin('ffmpeg'),ffprobe:bin('ffprobe')};
 const first=await prepare(task,workspace,context);assert.equal(first.required,true);assert.equal(first.cached,false);assert.equal(first.metadata.validation.passed,true);assert.equal(first.metadata.version,3);assert.equal(first.metadata.parts.length,1);
 const part=first.metadata.parts[0],partMetadata=JSON.parse(await readFile(join(workspace,'.presenter-cutout',part.file.replace(/presenter\.webm$/,'presenter.json')),'utf8'));
 assert.equal(part.startFrame,0);assert.equal(part.endFrame,6);assert.ok(part.endFrame<first.metadata.configuration.expectedFrames,'ONLY_REQUESTED_INTERVAL_MATTED');assert.equal(partMetadata.worker.frames,6);
 assert.ok(partMetadata.worker.visibleFrames>0);assert.ok(partMetadata.worker.transparentFrames>0);assert.equal(partMetadata.worker.recurrentStateMaintained,true);
 assert.ok(partMetadata.validation.alpha.some(a=>a.max>32&&a.min<250),'ACTUAL_DECODED_ALPHA_REQUIRED');
 const reused=await prepare({...task,clips:[{...task.clips[0],presenterOutline:{style:'dashed',width:6,color:'#FFFFFF'}}]},workspace,context);assert.equal(reused.cached,true);assert.equal(reused.key,first.key);assert.deepEqual(await readFile(source),sourceBytes);
 receipt.rvm={model:'RVM MobileNetV3 FP32',actualBundledPython:true,actualModelInference:true,transparentVp9Decoded:true,recurrentStateMaintained:true,cacheReusedAcrossOutlineEdit:true,sourceUnchanged:true,sourcePathLength:source.length,workerFrames:partMetadata.worker.frames,requestedIntervalOnly:true};
 console.log(JSON.stringify({stage:'installed-rvm-production',status:'passed',...receipt.rvm}));
 const {chartVideo}=await load('chart-video.mjs'),{machineAdmission}=await load('local-resources.mjs');machineAdmission.memoryAt=Date.now();machineAdmission.sample=()=>({cpu:0,memory:0,available:12*1024**3,total:16*1024**3,pressureLevel:1});
 const chartContext={resources,ffmpeg:bin('ffmpeg'),register:file=>({id:file,url:pathToFileURL(file).href})};
 for(const name of values['rvm-only']?[]:['series-ep5','series-ep6','series-ep7','series-ep8']){
  const chartRoot=join(workspace,name);await mkdir(chartRoot);const draft=JSON.parse(await readFile(join(resources,'chart-video/examples/chart-presets',name+'.json'),'utf8'));
  delete draft.operation;delete draft.workspace;delete draft.request_id;
  await writeFile(join(chartRoot,'request.json'),JSON.stringify(draft));
  const chartTask={id:name,source:{width:draft.output.width,height:draft.output.height},composition:{outputSpec:{...draft.output},revision:0},revision:0};
  const result=await chartVideo(chartTask,chartContext,chartRoot,{action:'render',key:name,file:'request.json',requestId:'installed-'+name});
  assert.equal(result.adopted,true,JSON.stringify(result));const asset=chartTask.chartAssets[name];assert.ok((await readFile(join(chartRoot,asset.file))).length>0);assert.ok(result.images.length>0);
  receipt.charts.push({preset:draft.visual.preset,adopted:true,previewFrames:result.images.length,transparentDeliveryValidated:true});console.log(JSON.stringify({stage:'installed-chart-production',...receipt.charts.at(-1)}));
  // Keep only the small receipt. Do not accumulate several full alpha masters
  // in the runner while the installer and its overwrite target also exist.
  await rm(chartRoot,{recursive:true,force:true});
 }
 if(!values['rvm-only']){
  const result=await exec(process.execPath,[join(repository,'scripts/delivery/test-browser-render-profile.mjs'),'--resources',resources,'--ffmpeg',bin('ffmpeg')],{timeout:240000,maxBuffer:4*1024**2,windowsHide:true});
  receipt.browserProfiles=JSON.parse(result.stdout.trim());assert.equal(receipt.browserProfiles.status,'passed');assert.equal(receipt.browserProfiles.results.at(-1).skill,'image-flow-animation-production');
 }
 receipt.status='passed';await mkdir(join(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await rm(work,{recursive:true,force:true,maxRetries:8,retryDelay:200});}
