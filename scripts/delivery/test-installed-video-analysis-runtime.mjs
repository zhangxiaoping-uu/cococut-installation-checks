import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,rm,writeFile,realpath} from 'node:fs/promises';
import {join,isAbsolute,resolve,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {installedReleaseFile} from './client-release-metadata.mjs';
import {validateCanonicalSpeechWav} from '../../contracts/video-analysis/speech.mjs';
import {verifyInstalledAnalysisPaths} from './test-video-analysis-paths.mjs';
const exec=promisify(execFile),{values}=parseArgs({options:{'app-root':{type:'string'},output:{type:'string'}}});assert.ok(isAbsolute(values['app-root']||''));const appRoot=await realpath(values['app-root']),runtime=join(appRoot,'.local/rebuild/video-analysis-desktop'),python=join(appRoot,'.local/rebuild/portable-python/video-analysis',process.platform==='win32'?'python.exe':'bin/python'),bin=join(appRoot,'.local/rebuild/packaging-resources/bin'),ffmpeg=join(bin,process.platform==='win32'?'ffmpeg.exe':'ffmpeg');
const work=await realpath(await mkdtemp(join(tmpdir(),'cc-analysis-runtime-'))),env={...Object.fromEntries(['HOME','USERPROFILE','TEMP','TMP','SYSTEMROOT','WINDIR','LANG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]])),PATH:bin+delimiter+(process.env.PATH||''),PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'};
try{
 const clientRelease=await installedReleaseFile(appRoot),manifest=JSON.parse(await readFile(join(runtime,'build-inputs.json')));assert.equal(manifest.runtimeMode,'desktop');assert.equal(manifest.providerKeysIncluded,false);assert.equal(createHash('sha256').update(await readFile(join(runtime,'core.mjs'))).digest('hex'),manifest.coreSha256);
 const probe=JSON.parse((await exec(python,['-X','utf8',join(runtime,'worker.py'),'--probe'],{env,timeout:30000,windowsHide:true})).stdout);assert.equal(probe.available,true);assert.equal(probe.localExtraction,true);assert.equal(probe.providerCredentials,false);
 const lock=await readFile(join(runtime,'requirements.lock'),'utf8'),expected=Object.fromEntries(lock.trim().split(/\r?\n/).map(x=>x.split('==')));assert.equal(Object.keys(expected).length,19);
 const versions=JSON.parse((await exec(python,['-X','utf8','-c','import json,importlib.metadata as m;print(json.dumps({k:m.version(k)for k in '+JSON.stringify(Object.keys(expected))+'}))'],{env,timeout:30000,windowsHide:true})).stdout);
 for(const [name,wanted]of Object.entries(expected)){const normalize=v=>name==='yt-dlp'?v.replace(/(^|\.)([0-9]+)/g,(_m,p,n)=>p+Number(n)).replace(/\.?dev(?:0)?$/,'dev0'):v;assert.equal(normalize(versions[name]),normalize(wanted),name+' installed version');}
 const video=join(work,'synthetic.mp4');await exec(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=30:d=0.3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',video],{env,timeout:30000,windowsHide:true});const before=await readFile(video);
 const script='import sys,json;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from worker import canonical_wav;from engine import media;print(json.dumps(canonical_wav(Path(sys.argv[2]),Path(sys.argv[3]),media)))';const audio=JSON.parse((await exec(python,['-X','utf8','-c',script,runtime,video,work],{env,timeout:30000,windowsHide:true})).stdout),bytes=await readFile(audio.path);validateCanonicalSpeechWav(bytes.subarray(0,44),bytes.length);assert.equal(createHash('sha256').update(bytes).digest('hex'),audio.sha256);assert.deepEqual(await readFile(video),before);
 const windowsPaths=process.platform==='win32'?await verifyInstalledAnalysisPaths({appRoot,python,ffmpeg,ffprobe:join(bin,'ffprobe.exe'),work}):undefined;
 const receipt={windowsPaths,status:'passed',scope:'installed-independent-video-analysis-runtime',platform:process.platform,appRoot,clientRelease,independentPython:true,lockedDependencies:19,versions,localExtraction:true,canonicalTemporaryAudio:true,audioBytes:bytes.length,sourceUnchanged:true,providerKeys:false,paidCalls:false,realAccount:false};if(values.output){await mkdir(join(resolve(values.output),'..'),{recursive:true});await writeFile(resolve(values.output),JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt));
}finally{await rm(work,{recursive:true,force:true});}
