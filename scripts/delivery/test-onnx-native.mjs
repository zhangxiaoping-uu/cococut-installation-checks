import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {readFile,readdir,writeFile,access} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// Tiny ONNX graph: y = Add(x, x). Real inference tests the kept native binding/library.
const varint=value=>{const bytes=[];do{const b=value&127;value>>>=7;bytes.push(b|(value?128:0));}while(value);return Buffer.from(bytes);};
const number=(field,value)=>Buffer.concat([varint(field*8),varint(value)]);
const data=(field,value)=>{const bytes=typeof value==='string'?Buffer.from(value):value;return Buffer.concat([varint(field*8+2),varint(bytes.length),bytes]);};
const info=name=>Buffer.concat([data(1,name),data(2,data(1,Buffer.concat([number(1,1),data(2,data(1,number(1,1)))])))]);
export async function verifyOnnxNative(appRoot){
 const node=Buffer.concat([data(1,'x'),data(1,'x'),data(2,'y'),data(4,'Add')]);
 const graph=Buffer.concat([data(1,node),data(2,'cocut-native-check'),data(11,info('x')),data(12,info('y'))]);
 const model=Buffer.concat([number(1,8),data(7,graph),data(8,number(2,13))]);
 const directory=join(appRoot,'.local/rebuild/packaging-resources/hyperframes/node_modules/onnxruntime-node');
 let nodeBundled=true;try{await access(join(directory,'package.json'));}catch(error){if(error.code!=='ENOENT')throw error;nodeBundled=false;}
 if(!nodeBundled){
  // Windows has always used the bundled Python ONNX runtime. Do not add an
  // unused Node package solely to satisfy a package-size pruning assertion.
  const python=join(appRoot,'.local/rebuild/portable-python/packaging',process.platform==='win32'?'python.exe':'bin/python');
  const code="import base64,json,sys,numpy as np,onnxruntime as ort; s=ort.InferenceSession(base64.b64decode(sys.argv[1]),providers=['CPUExecutionProvider']); y=s.run(None,{'x':np.array([3],dtype=np.float32)})[0]; assert float(y[0])==6; print(json.dumps({'status':'passed','runtime':'bundled-python','onnxVersion':ort.__version__,'nativeInference':True,'nodeRuntimeBundled':False,'paidCalls':False}))";
  const result=JSON.parse((await promisify(execFile)(python,['-X','utf8','-c',code,model.toString('base64')],{timeout:60000,windowsHide:true})).stdout);
  assert.equal(result.nativeInference,true);return {...result,platform:process.platform,arch:process.arch};
 }
 const base=join(directory,'bin/napi-v3');
 assert.deepEqual((await readdir(base)).sort(),[process.platform]);
 assert.deepEqual(await readdir(join(base,process.platform)),[process.arch]);
 const require=createRequire(join(directory,'package.json')),ort=require(directory);
 const session=await ort.InferenceSession.create(model,{executionProviders:['cpu']});
 try{const result=await session.run({x:new ort.Tensor('float32',Float32Array.of(3),[1])});assert.equal(result.y.data[0],6);}
 finally{await session.release();}
 return {status:'passed',platform:process.platform,arch:process.arch,onnxVersion:JSON.parse(await readFile(join(directory,'package.json'))).version,nativeInference:true,foreignNativeDirectories:0,paidCalls:false};
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('EXPLICIT_APP_ROOT_REQUIRED');
 const result=await verifyOnnxNative(resolve(process.argv[2]));
 if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
