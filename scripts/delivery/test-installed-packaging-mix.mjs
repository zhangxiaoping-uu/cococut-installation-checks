import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const app=resolve(process.argv[2]),directory=resolve(process.argv[3]),root=join(directory,'mix-fixture');
assert.equal(process.platform,'win32');
await mkdir(root,{recursive:true,mode:0o700});
const {mixOutput}=await import(pathToFileURL(join(app,'client/products/packaging/runtime/electron/hybrid-render.mjs')));
const {localScheduler}=await import(pathToFileURL(join(app,'client/products/packaging/host/local-resources.mjs')));
assert.ok(mixOutput.toString().includes('apad=whole_len='));
assert.ok(mixOutput.toString().includes('atrim=end_sample='));
assert.ok(mixOutput.toString().includes('asetpts=N/SR/TB'));
const ctx={ffmpeg:join(app,'.local/rebuild/packaging-resources/bin/ffmpeg.exe'),ffprobe:join(app,'.local/rebuild/packaging-resources/bin/ffprobe.exe')},run=promisify(execFile);
const previous=localScheduler.admission;
localScheduler.admission={sample:()=>({cpu:0,memory:.1,available:8*1024**3,pressureLevel:0}),snapshot:()=>({})};
try{
 const duration=67.28,video=join(root,'picture.mp4'),voice=join(root,'voice.wav'),sound=join(root,'sound.wav'),output=join(root,'mix.mp4');
 await run(ctx.ffmpeg,['-v','error','-y','-f','lavfi','-i','color=s=64x64:r=30:d=67.3','-an','-c:v','libx264','-preset','ultrafast','-threads','1',video],{timeout:15000});
 for(const [file,rate,seconds]of [[voice,16000,62.713],[sound,48000,.21]])await run(ctx.ffmpeg,['-v','error','-y','-f','lavfi','-i',`sine=frequency=440:sample_rate=${rate}:duration=${seconds}`,'-c:a','pcm_s16le',file],{timeout:15000});
 const media=Array.from({length:22},(_,i)=>({src:pathToFileURL(sound).href,start:i*2.87,source:0,duration:.21,volume:.1}));
 media.push({src:pathToFileURL(voice).href,start:0,source:0,duration:62.713,volume:1});
 const started=Date.now();
 await mixOutput(ctx,root,root,[video],media,{width:64,height:64,fps:30,duration},output,AbortSignal.timeout(15000));
 const elapsedMs=Date.now()-started;
 const {stdout}=await run(ctx.ffprobe,['-v','error','-show_streams','-of','json',output],{timeout:5000});
 const streams=JSON.parse(stdout).streams,audio=streams.find(s=>s.codec_type==='audio'),picture=streams.find(s=>s.codec_type==='video');
 assert.equal(Number(picture.nb_frames),2019);
 assert.ok(Math.abs(Number(audio.duration)-duration)<.025);
 const {stdout:tail}=await run(ctx.ffmpeg,['-v','error','-ss','66','-i',output,'-map','0:a','-f','s16le','-ac','1','-ar','48000','pipe:1'],{encoding:'buffer',timeout:5000});
 assert.ok(tail.length>48000&&tail.every(byte=>byte===0));
 const proof={status:'passed',build:244,installedModuleUsed:true,bundledFfmpegUsed:true,audioInputs:media.length,elapsedMs,videoFrames:Number(picture.nb_frames),audioSeconds:Number(audio.duration),tailSilence:true,realAccountRead:false,paidModelCalls:0};
 await writeFile(join(directory,'installed-mix-verification.json'),JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify(proof));
}finally{localScheduler.admission=previous;await rm(root,{recursive:true,force:true});}
