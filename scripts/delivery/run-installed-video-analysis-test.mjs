import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {join,resolve,dirname,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {mkdtemp,realpath,writeFile,readFile,lstat,rm,access,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(join(root,'package.json'));
const {values}=parseArgs({options:{'app-root':{type:'string'},output:{type:'string'}}});assert.ok(isAbsolute(values['app-root']||''),'EXPLICIT_INSTALLED_APP_ROOT_REQUIRED');
const output=resolve(values.output||join(root,'.local/rebuild/windows-96/video-analysis-native-receipt.json'));
// Only this wrapper creates and later removes its one native-canonical profile.
// Chromium owns files in userData until the Electron process has really exited.
const temporary=await mkdtemp(join(tmpdir(),'cc-analysis-')),profile=await realpath(temporary),ownerFile=join(profile,'.fixture-owner.json');
const ownership={schemaVersion:1,ownerPid:process.pid,profile,legacyProfile:realpathSync(temporary)};
await writeFile(ownerFile,JSON.stringify(ownership)+'\n',{flag:'wx',mode:0o600});
const cleanup={childExitedNormally:false,ownedTemporaryProfile:false,physicalDirectoryRemoved:false};let executionError,cleanupError,result;
try{
 // Use the locked official Electron host, never a packaged app as a script runner.
 await promisify(execFile)(process.execPath,[require.resolve('electron/install.js')],{timeout:240000,maxBuffer:2*1024**2,windowsHide:true});
 const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
 result=await promisify(execFile)(require('electron'),[join(root,'scripts/delivery/test-installed-video-analysis-electron.mjs'),'--app-root',values['app-root'],'--output',output,'--profile-root',profile],{cwd:root,env:environment,timeout:80000,maxBuffer:4*1024*1024,windowsHide:true});
 cleanup.childExitedNormally=true;
}catch(error){executionError=error;result=error;}
try{
 const metadata=await lstat(profile);assert.ok(metadata.isDirectory()&&!metadata.isSymbolicLink());assert.equal(await realpath(profile),profile);assert.equal(dirname(profile),await realpath(tmpdir()));assert.ok(basename(profile).startsWith('cc-analysis-'));assert.deepEqual(JSON.parse(await readFile(ownerFile,'utf8')),ownership);cleanup.ownedTemporaryProfile=true;
 await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});await assert.rejects(access(profile),{code:'ENOENT'});cleanup.physicalDirectoryRemoved=true;
}catch(error){cleanupError=error;}
await mkdir(dirname(output),{recursive:true});await writeFile(output+'.profile-cleanup.json',JSON.stringify({status:cleanupError?'failed':'passed',...cleanup},null,2)+'\n');
if(result?.stdout)process.stdout.write(result.stdout);if(result?.stderr)process.stderr.write(result.stderr);
if(executionError&&cleanupError)throw new AggregateError([executionError,cleanupError],'NATIVE_FIXTURE_AND_PROFILE_CLEANUP_FAILED',{cause:executionError});
if(executionError)throw executionError;if(cleanupError)throw cleanupError;
const receipt=JSON.parse(await readFile(output,'utf8'));assert.equal(receipt.status,'passed');assert.equal(receipt.profileCleanupPending,true);receipt.profileCleanupPending=false;receipt.nativeProfileCleanup=cleanup;await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
// Keep the existing CLI contract: the final line is the complete native proof.
console.log(JSON.stringify(receipt));
