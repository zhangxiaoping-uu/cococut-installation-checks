import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateCanonicalSpeechWav} from '../../contracts/video-analysis/speech.mjs';

const exec=promisify(execFile),repository=fileURLToPath(new URL('../../',import.meta.url));

/** Actual installed Python/FFmpeg, with no platform, account or paid requests. */
export async function verifyInstalledAnalysisPaths({appRoot,python,ffmpeg,ffprobe,work}){
 const runtime=join(appRoot,'.local/rebuild/video-analysis-desktop'),originalPython=python,pythonBefore=await readFile(python);let clone;
 const {createDesktopExtractionRunner}=await import(pathToFileURL(join(appRoot,'client/products/video-analysis/host/desktop-runner.mjs')));
 try{
  if(process.platform==='win32'){
   clone=JSON.parse((await exec(python,['-X','utf8',join(repository,'scripts/delivery/prepare-short-path-fixture.py')],{timeout:15000,windowsHide:true})).stdout);python=clone.python;
  }
  let directory=join(work,'analysis-path-fixture');
  while(directory.length<360)directory=join(directory,'分析 用户文件夹'.repeat(3));
  await mkdir(directory,{recursive:true});directory=await realpath(directory);
  if(process.platform==='win32'){
   const value=await exec(python,['-X','utf8','-c','import json,sys;from pathlib import Path;print(json.dumps({"unprefixedDirectoryReadable":Path(sys.argv[1]).is_dir()}))',directory],{timeout:15000,windowsHide:true});
   assert.equal(JSON.parse(value.stdout).unprefixedDirectoryReadable,false,'LEGACY_WINDOWS_PATH_FAILURE_MUST_BE_REPRODUCED');
  }
  const source=join(work,'analysis-source.mp4');await exec(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=30:d=0.3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source],{timeout:30000,windowsHide:true});const sourceBefore=await readFile(source);
  const worker=join(work,'analysis-path-worker.py');
  await writeFile(worker,`import sys,shutil\nfrom pathlib import Path\nsys.path.insert(0,${JSON.stringify(runtime)})\nimport worker as module\nfrom engine.filesystem import native_path,main_path\nfrom engine import tls\noriginal=module.configure_transport\ndef configure(value):\n media=original(value)\n certificate=Path(native_path(${JSON.stringify(directory)}))/'安全 证书.pem'\n certificate.write_bytes(tls.bundled_ca())\n tls.bundled_ca.cache_clear()\n tls.certifi.where=lambda:main_path(certificate)\n handle=tls.VerifiedCurl()\n try:\n  handle._cacert='nonexistent-native-certificate.pem'\n  handle._ensure_cacert()\n  clone=handle.duphandle()\n  try:clone._ensure_cacert()\n  finally:clone.close()\n  handle.reset();handle._ensure_cacert()\n finally:handle.close()\n def metadata(self,asset,progress):\n  asset.info={'title':'path fixture','duration':0.3};return asset.info\n def video(self,asset,progress):\n  destination=asset.folder/'video.mp4'\n  shutil.copyfile(Path(native_path(${JSON.stringify(source)})),destination)\n  asset.info={'title':'path fixture','duration':0.3};return destination\n media.MediaService.metadata=metadata\n media.MediaService.video=video\n return media\nmodule.configure_transport=configure\ntry:module.main()\nfinally:module.finish_parent_supervision()\n`);
  let audioPrepared=false;
  const runner=createDesktopExtractionRunner({python,worker,ffmpeg,ffprobe,resolveProxy:async()=> 'DIRECT',speech:{transcribe:async({audio})=>{
   const bytes=await readFile(audio.path);validateCanonicalSpeechWav(bytes.subarray(0,44),bytes.length);assert.equal(bytes.length,audio.bytes);assert.ok(!audio.path.startsWith('\\\\?\\'));audioPrepared=true;return {text:'offline audio fixture',source:'fixture'};
  }}});
  for(const action of ['video','transcript']){
   const result=await runner({input:{action,shareText:'https://www.xiaohongshu.com/explore/offline-fixture'},directory,signal:AbortSignal.timeout(45000)});
   assert.ok(result.mediaPath.startsWith(directory));assert.ok(!result.mediaPath.startsWith('\\\\?\\'));assert.ok((await readFile(result.mediaPath)).length>0);
  }
  assert.equal(audioPrepared,true);assert.deepEqual(await readFile(source),sourceBefore);assert.deepEqual(await readFile(originalPython),pythonBefore);
  return {status:'passed',directoryLength:directory.length,unicodePath:true,manifestLongPathAware:clone?false:undefined,sourceUnchanged:true,mediaAndAudioPrepared:true,mainPathContractPreserved:true,caReadFromLongUnicodePath:true,nativeCaBlobCloneAndReset:true,shippingPythonUnchanged:true,registryChanged:false,realPlatformRequests:false,paidCalls:false};
 }finally{
  if(clone)for(const file of [clone.python,clone.pth])await rm(file,{force:true});
 }
}
