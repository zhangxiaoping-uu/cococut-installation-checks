import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {cutStartupFixture} from './cut-startup-fixture.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{python:{type:'string'},bin:{type:'string'},'app-root':{type:'string'}}});
const application=values['app-root']||root,fixture=await cutStartupFixture(),directory=await mkdtemp(join(tmpdir(),'cocut-cut-startup-'));
let runtime;
try{
 const {startCutRuntime}=await import(pathToFileURL(join(application,'client/products/cut/host/runtime.mjs')));
 runtime=await startCutRuntime({python:values.python||join(application,'.local/rebuild/portable-python/cut/python.exe'),binaryDirectory:values.bin||join(application,'.local/rebuild/packaging-resources/bin'),directory,core:fixture.connection});
 const get=path=>fetch(runtime.origin+path,{headers:runtime.headers});
 assert.equal((await fetch(runtime.origin+'/api/jobs')).status,401);
 const health=await(await get('/api/health')).json();assert.equal(health.asr_configured,true);assert.equal(health.ffmpeg_ready,true);
 const page=await get('/');assert.equal(page.status,200);assert.match(await page.text(),/口播剪辑/);
 for(const path of ['/static/app.js','/static/style.css','/desktop/fees.mjs']){const r=await get(path);assert.equal(r.status,200,path);assert.ok((await r.text()).length>20);}
 assert.deepEqual(await(await get('/api/jobs')).json(),[]);
 assert.deepEqual(fixture.unexpected,[]);
 console.log(JSON.stringify({status:'passed',scope:'cut-owned-worker-http-startup',hostAdapterLoaded:true,paidCalls:false,financialWrites:false}));
}catch(error){
 const log=await readFile(join(directory,'worker.log'),'utf8').catch(()=>'');console.error(log.slice(-6000));throw error;
}finally{await runtime?.stop();await fixture.close();await rm(directory,{recursive:true,force:true});}
