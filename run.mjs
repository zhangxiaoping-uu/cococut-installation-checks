import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
const candidate=JSON.parse(await readFile('candidate.json')),base=resolve('.local/rebuild/windows-96'),folder=join(base,'installer/nsis-web');await mkdir(folder,{recursive:true});
const digest=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
const mode=process.argv[2];assert.ok([undefined,'--download-only','--verify-only'].includes(mode));
if(mode!=='--verify-only')for(const asset of candidate.assets){
 const url=new URL(asset.url);assert.equal(url.origin,'https://www.xiongdoudou.com');assert.equal(url.pathname,'/downloads/files/windows-0.1.5-245/'+asset.name);assert.match(asset.sha256,/^[a-f0-9]{64}$/);
 const file=await open(join(folder,asset.name),'wx'),stop=new AbortController(),deadline=AbortSignal.timeout(1800000);let completed=0,next=0;const chunk=16*1024**2,parts=Math.ceil(asset.bytes/chunk);
 await file.truncate(asset.bytes);
 const worker=async()=>{while(next<parts){const index=next++,start=index*chunk,end=Math.min(asset.bytes-1,start+chunk-1);let body;
  for(let attempt=0;attempt<3;attempt++){
   if(stop.signal.aborted||deadline.aborted)throw Error('DOWNLOAD_ABORTED');
   try{const r=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.any([stop.signal,deadline,AbortSignal.timeout(180000)]),redirect:'error'});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${asset.bytes}`);body=Buffer.from(await r.arrayBuffer());assert.equal(body.length,end-start+1);break;}
   catch(error){if(attempt===2){stop.abort();throw error;}console.log(JSON.stringify({stage:'range-retry',name:asset.name,index,attempt:attempt+1,error:error.name}));}
  }
  let written=0;while(written<body.length){const result=await file.write(body,written,body.length-written,start+written);assert.ok(result.bytesWritten>0);written+=result.bytesWritten;}
  completed+=body.length;console.log(JSON.stringify({stage:'range-downloaded',name:asset.name,completed,total:asset.bytes,part:index+1,parts}));
  // A single small progress receipt is useful even if a later range times out.
  await writeFile(join(base,'download-progress.json'),JSON.stringify({name:asset.name,completed,total:asset.bytes,parts,paidModelCalls:false}));
 }};
 try{const results=await Promise.allSettled(Array.from({length:Math.min(8,parts)},worker));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;assert.equal(completed,asset.bytes);await file.sync();}finally{await file.close();}
 assert.equal(await digest(join(folder,asset.name)),asset.sha256);console.log(JSON.stringify({stage:'download-verified',name:asset.name,bytes:asset.bytes}));
}
for(const asset of candidate.assets)assert.equal(await digest(join(folder,asset.name)),asset.sha256,'IMMUTABLE_DOWNLOADED_CANDIDATE_REQUIRED');
await writeFile(join(base,'download-ready.json'),JSON.stringify({status:'passed',files:candidate.assets,clientRelease:candidate.clientRelease}));
if(mode==='--download-only')process.exit(0);
await writeFile(join(base,'receipt.json'),JSON.stringify({clientRelease:candidate.clientRelease,updateProtocol:1}));await writeFile(join(base,'incremental-payload.json'),JSON.stringify(candidate.incremental));
const run=(args,env={})=>new Promise((accept,reject)=>{const p=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,...env}});p.once('error',reject);p.once('exit',code=>code===0?accept():reject(Error('CHECK_FAILED:'+args[0]+':'+code)));});
await run(['scripts/delivery/test-windows-fresh-install.mjs'],{GITHUB_SHA:candidate.clientRelease.sourceCommit,COCUT_RELEASE_BUILD:String(candidate.clientRelease.build)});
const receipt=JSON.parse(await readFile(join(base,'fresh-install-receipt.json')));assert.equal(receipt.status,'passed');assert.deepEqual(receipt.clientRelease,candidate.clientRelease);
await run(['scripts/delivery/test-installed-packaging-mix.mjs',receipt.releaseFeatures.packaging.appRoot,base]);
console.log(JSON.stringify({status:'passed',clientRelease:candidate.clientRelease,freshInstall:true,overwrite:true,installedPackagingMix:true,publicFeedChanged:false,paidModelCalls:false,realAccount:false}));
