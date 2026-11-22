// Native Windows bundled-Node handoff against the helper shipped in this exact
// installed app. The tiny probe executable records its command line only.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,unlink,stat,realpath,access} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';

if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED');
const appRoot=process.argv[2],output=process.argv[3];
assert.ok(isAbsolute(appRoot||'')&&isAbsolute(output||''),'EXPLICIT_INSTALLED_APP_AND_RECEIPT_REQUIRED');
const sourceFixture=process.argv[4]==='--source-fixture';
assert.ok(process.argv.length===(sourceFixture?5:4),'EXPLICIT_UPDATE_HELPER_TEST_MODE_REQUIRED');
const moduleFile=join(appRoot,'client/platform/update-installer.mjs');
let executable;for(const name of ['CocoCut.exe','CoCutNext.exe']){const file=join(appRoot,'../..',name);try{await access(file);executable=file;break;}catch(error){if(error.code!=='ENOENT')throw error;}}assert.ok(executable,'INSTALLED_WINDOWS_EXECUTABLE_MISSING');
const exec=promisify(execFile),anchor=await mkdtemp(join(tmpdir(),'cococut-native-update-'));
const bounded=(promise,ms,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(label)),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const ps=value=>"'"+String(value).replaceAll("'","''")+"'";
const powershell=join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const resultKey='COCOCUT_NATIVE_UPDATE_PROBE_RESULT',prior=process.env[resultKey];
const scrub=value=>String(value).replaceAll(anchor,'<owned-probe>').replaceAll(appRoot,'<app-root>').replaceAll(process.cwd(),'<checkout>').slice(-4096);
const probe=join(anchor,'probe.exe');
const source='using System; using System.IO; using System.Text; public static class Probe { public static void Main(string[] args) { var destination=Environment.GetEnvironmentVariable("COCOCUT_NATIVE_UPDATE_PROBE_RESULT"); if(String.IsNullOrEmpty(destination)) Environment.Exit(20); System.Threading.Thread.Sleep(500); File.WriteAllText(destination, Convert.ToBase64String(Encoding.UTF8.GetBytes(Environment.CommandLine))); } }';
await exec(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(`$ErrorActionPreference='Stop'; Add-Type -TypeDefinition ${ps(source)} -OutputAssembly ${ps(probe)} -OutputType ConsoleApplication`,'utf16le').toString('base64')],{timeout:60000,windowsHide:true});
const bytes=await readFile(probe),asset={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
const parents=[];
async function parent(configuration){
 const configFile=join(configuration.probeDirectory,'owner-input.json');await writeFile(configFile,JSON.stringify({mode:'isolated-native-update-probe',moduleFile,executable,asset,probeRoot:anchor,appRoot,...configuration}),{flag:'wx'});
 const ownerScript=fileURLToPath(new URL('./test-windows-update-owner.mjs',import.meta.url));
 const ownerRuntime=sourceFixture?process.execPath:executable,ownerEnvironment={...process.env};if(!sourceFixture)ownerEnvironment.ELECTRON_RUN_AS_NODE='1';
 const child=spawn(ownerRuntime,[ownerScript,configFile],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:ownerEnvironment});parents.push(child);let stdout='',stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8192);});
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 let ready;try{ready=await bounded(new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(Error('OWNER_EXIT_BEFORE_READY:'+code)));child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.includes('\n')){try{const row=JSON.parse(stdout.trim());assert.equal(row.stage,'owner-helper-ready');assert.equal(row.actualBundledNode,true);assert.equal(row.runtimeCopiedOutsideTarget,true);assert.equal(row.actualOwnerCreatedHelper,true);resolve(row);}catch(error){reject(error);}}});}),15000,'PARENT_START_TIMEOUT');}
 catch(error){console.error(JSON.stringify({stage:'native-update-helper-owner-diagnostic',sourceFixture,captureStderr:configuration.captureStderr,errorCode:error.message,stdout:scrub(stdout),stderr:scrub(stderr)}));throw error;}
 return {child,done,helperPID:ready.helperPID,async finish(){child.stdin.end('normal-exit');const result=await bounded(done,10000,'PARENT_EXIT_TIMEOUT');assert.equal(result.code,0);}};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function exists(file){try{await stat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function run(kind,{captureStderr=sourceFixture}={}){
 const directory=join(anchor,kind);await mkdir(directory,{mode:0o700});const file=join(directory,'probe.exe'),result=join(directory,'result.txt');await writeFile(file,bytes);process.env[resultKey]=result;
 const old=await parent({file,probeDirectory:directory,captureStderr});
 await pause(250);assert.equal(await exists(result),false,'installer must not run while the original parent is alive');
 assert.equal(old.child.exitCode,null,'update helper must never terminate original parent');
 if(kind==='revoked'){
  const permits=(await readdir(directory)).filter(name=>name.endsWith('.permit'));assert.equal(permits.length,1);await unlink(join(directory,permits[0]));
 }
 if(kind==='tampered'){const altered=Buffer.from(bytes);altered[altered.length-1]^=1;await writeFile(file,altered);}
 await old.finish();const running=()=>{try{process.kill(old.helperPID,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
 const stoppedBy=Date.now()+10000;while(running()&&Date.now()<stoppedBy)await pause(50);assert.equal(running(),false,'owned helper did not finish after its actual owner exited');
 for(const suffix of ['.permit','.request.json','.worker.cjs'])assert.equal((await readdir(directory)).some(name=>name.endsWith(suffix)),false,'helper must remove only its private handoff files');
 if(kind==='revoked'||kind==='tampered'){assert.equal(await exists(result),false);return;}
 const deadline=Date.now()+10000;while(!await exists(result)&&Date.now()<deadline)await pause(50);assert.equal(await exists(result),true,'native installer probe did not run after its actual owner exited');
 const command=Buffer.from(await readFile(result,'utf8'),'base64').toString('utf8');assert.ok(command.endsWith('/D='+await realpath(join(appRoot,'../..'))),'existing directory with spaces must be the complete final NSIS argument');
 assert.equal((await readdir(directory)).some(name=>name.endsWith('.permit')),false,'launch permission is consumed once');
}
try{
 await run('accepted');await run('revoked');await run('tampered');if(sourceFixture)await run('production-stdio',{captureStderr:false});
 const receipt={status:'passed',actualBundledNode:true,nativeLauncher:'bundled-node',runtimeCopiedOutsideTarget:true,actualOwnerCreatedHelper:true,installedHelperImported:!sourceFixture,actualInstalledElectronOwner:!sourceFixture,sourceFixture,productionStdioValidated:true,waitedForParent:true,originalParentExitedNormally:true,helperOwnerMatchesWatchedPid:true,helperSurvivedActualOwnerExit:true,probeDelayAfterOwnerExitMs:500,installerArgumentsPreserved:true,revokedPermitRejected:true,tamperedInstallerRejected:true,privateHandoffFilesRemoved:true,installerProbeSha256:asset.sha256,scope:sourceFixture?'source-helper-native-probe-no-installation':'native-probe-executable-no-user-data',actualNsisInstallerLaunched:false,paidModelCalls:false,financialWrites:false};
 await writeFile(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{if(prior===undefined)delete process.env[resultKey];else process.env[resultKey]=prior;for(const child of parents)if(child.exitCode===null)child.stdin.end('normal-exit');}
