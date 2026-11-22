// Test-only real owner: it creates the shipped update helper and is itself the
// process the helper must wait for. No real client or NSIS installer is run.
import {readFile,realpath} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {dirname,relative,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED');
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(input.mode,'isolated-native-update-probe');
const installedRuntime=await realpath(join(input.appRoot,'.local/rebuild/packaging-resources/bin/node.exe')),installedExecutable=await realpath(input.executable);
const {launchUpdateInstaller}=await import(pathToFileURL(input.moduleFile).href);
let helper,closed,evidence,stderr='';const bounded=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('OWNER_HELPER_CLOSE_TIMEOUT')),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const timer=setTimeout(()=>{console.error('OWNER_LIFETIME_TIMEOUT');process.exit(1);},60000);
process.stdin.once('data',()=>process.exit(0));
try{
 await launchUpdateInstaller({file:input.file},{platform:'win32',asset:input.asset},{executable:input.executable,pid:process.pid,spawnProcess:(program,args,options)=>{
  const request=JSON.parse(readFileSync(args[1],'utf8')),outside=relative(dirname(installedExecutable),program);
  assert.equal(program,request.node);assert.equal(request.pid,process.pid);assert.equal(args[0],request.worker);
  assert.equal(request.sourceNode,installedRuntime);
  assert.ok(outside.startsWith('..')||isAbsolute(outside),'helper runtime must be outside the directory NSIS replaces');
  assert.equal(createHash('sha256').update(readFileSync(program)).digest('hex'),request.nodeSha256);
  assert.equal(options.detached,true);assert.deepEqual(options.stdio,['ignore','pipe','ignore']);
  evidence={actualBundledNode:true,runtimeCopiedOutsideTarget:true,actualOwnerCreatedHelper:true};
  helper=spawn(program,args,input.captureStderr?{...options,stdio:['ignore','pipe','pipe']}:options);
  helper.stderr?.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8192);});
  closed=new Promise((resolve,reject)=>{helper.once('error',reject);helper.once('close',(code,signal)=>resolve({code,signal}));});return helper;
 }});
 console.log(JSON.stringify({stage:'owner-helper-ready',ownerPID:process.pid,helperPID:helper.pid,...evidence}));
}catch(error){
 const exit=closed?await bounded(closed,3000).catch(()=>({code:helper?.exitCode,signal:helper?.signalCode})):undefined;
 const scrub=value=>String(value).replaceAll(input.probeRoot,'<owned-probe>').replaceAll(input.appRoot,'<app-root>').slice(-4096);
 console.error(JSON.stringify({stage:'owner-helper-launch-failed',errorCode:error.message,exitCode:exit?.code,signal:exit?.signal,stderr:scrub(stderr)}));
 clearTimeout(timer);process.stdin.destroy();process.exitCode=1;
}
