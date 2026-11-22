import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
const candidate=JSON.parse(await readFile('candidate.json')),base=resolve('.local/rebuild/windows-96'),folder=join(base,'installer/nsis-web');await mkdir(folder,{recursive:true});
for(const asset of candidate.assets){
 const url=new URL(asset.url);assert.equal(url.origin,'https://www.xiongdoudou.com');assert.equal(url.pathname,'/downloads/files/windows-0.1.4-244/'+asset.name);assert.match(asset.sha256,/^[a-f0-9]{64}$/);
 const response=await fetch(url,{signal:AbortSignal.timeout(600000),redirect:'error'});assert.equal(response.status,200);assert.equal(Number(response.headers.get('content-length')),asset.bytes);
 const file=await open(join(folder,asset.name),'wx'),hash=createHash('sha256');let bytes=0;
 try{for await(const b of response.body){bytes+=b.length;assert.ok(bytes<=asset.bytes);hash.update(b);await file.writeFile(b);}}finally{await file.close();}
 assert.equal(bytes,asset.bytes);assert.equal(hash.digest('hex'),asset.sha256);console.log(JSON.stringify({stage:'download-verified',name:asset.name,bytes}));
}
await writeFile(join(base,'receipt.json'),JSON.stringify({clientRelease:candidate.clientRelease,updateProtocol:1}));await writeFile(join(base,'incremental-payload.json'),JSON.stringify(candidate.incremental));
const run=(args,env={})=>new Promise((accept,reject)=>{const p=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,...env}});p.once('error',reject);p.once('exit',code=>code===0?accept():reject(Error('CHECK_FAILED:'+args[0]+':'+code)));});
await run(['scripts/delivery/test-windows-fresh-install.mjs'],{GITHUB_SHA:candidate.clientRelease.sourceCommit,COCUT_RELEASE_BUILD:String(candidate.clientRelease.build)});
const receipt=JSON.parse(await readFile(join(base,'fresh-install-receipt.json')));assert.equal(receipt.status,'passed');assert.deepEqual(receipt.clientRelease,candidate.clientRelease);
await run(['scripts/delivery/test-installed-packaging-mix.mjs',receipt.releaseFeatures.packaging.appRoot,base]);
console.log(JSON.stringify({status:'passed',clientRelease:candidate.clientRelease,freshInstall:true,overwrite:true,installedPackagingMix:true,publicFeedChanged:false,paidModelCalls:false,realAccount:false}));
