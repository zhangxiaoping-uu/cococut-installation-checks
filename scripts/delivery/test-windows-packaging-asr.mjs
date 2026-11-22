import {join} from 'node:path';
import {access,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
if(process.platform!=='win32'||!process.argv[2])throw Error('EXPLICIT_WINDOWS_APP_ROOT_REQUIRED');
const root=process.argv[2];
await assert.rejects(access(join(root,'.local/rebuild/whisper-models')));
const engine=await readFile(join(root,'client/products/packaging/runtime/electron/engine.mjs'),'utf8');
assert.ok(engine.includes('ctx.transcribe(task,signal)'));assert.ok(!engine.includes('ctx.settings.models'));
const {createTranscriptionGateway}=await import(pathToFileURL(join(root,'client/products/packaging/host/transcription-gateway.mjs')));
const transcript=[{text:'speech',start:0,end:1,words:[{text:'speech',start:0,end:1}]}];let posts=0;
const server=http.createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer fixture');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(req.method==='POST'?(posts++,{status:'running'}):{status:'succeeded',transcript}));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 const gateway=createTranscriptionGateway({origin:'http://127.0.0.1:'+server.address().port,authorization:'Bearer fixture',allowLoopbackHttp:true},{pollMs:1});
 assert.deepEqual(await gateway({id:'task',source:{id:'source'},processingAdmission:{operationId:'original',commercial:{mediaId:'owned'}}}),transcript);assert.equal(posts,1);
 console.log(JSON.stringify({status:'passed',scope:'packaged-cloud-asr-gateway-fixture',wordTimestamps:true,speechRecognition:'doubao-auc-turbo',localModelIncluded:false,paidCalls:false}));
}finally{await new Promise(r=>server.close(r));}
