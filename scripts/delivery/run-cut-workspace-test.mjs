import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED');
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(join(root,'package.json')),exec=promisify(execFile);
// Materialize the locked official Electron test host, without changing system
// settings or reusing an installed user's application/profile.
await exec(process.execPath,[require.resolve('electron/install.js')],{timeout:240000,maxBuffer:2*1024*1024});
const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
for(const script of ['test-cut-workspace-electron.mjs','test-window-lifetime-electron.mjs','test-update-workspace-electron.mjs']){
 const profile=script==='test-window-lifetime-electron.mjs'?await mkdtemp(join(tmpdir(),'cocut-window-lifetime-')):undefined;
 try{
  const result=await exec(require('electron'),[join(root,'scripts/delivery',script),...process.argv.slice(2),...(profile?['--profile',profile]:[])],{cwd:root,env:environment,timeout:60000,maxBuffer:2*1024*1024,windowsHide:true});
  process.stdout.write(result.stdout);process.stderr.write(result.stderr);
 }finally{if(profile)await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});}
}
