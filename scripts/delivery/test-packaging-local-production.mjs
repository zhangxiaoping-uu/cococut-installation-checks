import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../../',import.meta.url)),application=resolve(process.argv[2]||root);
let python=resolve(process.env.COCUT_TEST_PACKAGING_PYTHON||join(application,'.local/rebuild/portable-python/packaging',process.platform==='win32'?'python.exe':'bin/python')),clone;
const resources=join(application,'.local/rebuild/packaging-resources'),bin=join(resources,'bin'),ffmpeg=join(bin,process.platform==='win32'?'ffmpeg.exe':'ffmpeg');
const directory=await realpath(await mkdtemp(join(tmpdir(),'cocut-assets-'))),workspace=join(directory,'workspaces','a'.repeat(64),'packaging/assets/workspaces','00000000-0000-4000-8000-000000000000','中文工程-🧪','boundary-'+ 'c'.repeat(72));await mkdir(workspace,{recursive:true});
const require=createRequire(join(application,'client/package.json')),sharp=require('sharp'),exec=promisify(execFile);
const load=name=>import(pathToFileURL(join(application,'client/products/packaging/runtime/electron',name)));
try{
 // This fixture validates filesystem/producer boundaries, not host pressure
 // policy. Keep telemetry deterministic so unrelated desktop work cannot hold
 // the test indefinitely; the real scheduling and process calls remain active.
 const {machineAdmission}=await load('local-resources.mjs');machineAdmission.memoryAt=Date.now();machineAdmission.sample=()=>({cpu:0,memory:0,available:12*1024**3,total:16*1024**3,pressureLevel:1});
 if(process.platform==='win32'){
  clone=JSON.parse((await exec(python,['-X','utf8',join(root,'scripts/delivery/prepare-short-path-fixture.py')],{timeout:15000,windowsHide:true})).stdout);python=clone.python;
 }
 const probe=join(workspace,'.image-batches','b'.repeat(64),'input.json');await mkdir(join(workspace,'.image-batches','b'.repeat(64)),{recursive:true});await writeFile(probe,'{"ok":true}');assert.ok(probe.length>350);
 if(process.platform==='win32'){
  const baseline=await exec(python,['-X','utf8','-c',"import sys,json\ntry:\n open(sys.argv[1]).close();result='unexpected-success'\nexcept OSError as e:result=type(e).__name__\nprint(json.dumps({'baseline':result}))",probe],{timeout:15000,windowsHide:true});
  assert.notEqual(JSON.parse(baseline.stdout).baseline,'unexpected-success','The opt-out test process must reproduce the unprefixed long-path failure');
 }
 // Force the hostile Windows locale at the parent boundary. Each production
 // wrapper must select UTF-8 itself; the test must not mask a missing flag.
 process.env.PYTHONUTF8='0';process.env.PYTHONIOENCODING='gbk';
 for(const entry of ['batch-image-assets/scripts/pipeline.py','batch-image-assets/scripts/seedream_adapter.py','batch-image-assets/scripts/sunburst_adapter.py','image-card-broll/scripts/render.py','text-card-broll/scripts/render.py','keyword-styles/scripts/compile_keywords.py']){
  await exec(python,[...(process.platform==='win32'?['-I']:[]),'-X','utf8',join(resources,entry),'--help'],{timeout:15000,windowsHide:true});
 }
 const {generateBatchImages}=await load('batch-image-assets.mjs');
 const state={},ctx={resources,ffmpeg,batchImagePython:python,settings:{python,imageProvider:'ark',imageBase:'https://fixture.invalid/v1',imageKey:'fixture-only',imageModel:'doubao-seedream-5-0-flash'}};
 let generates=0;
 const adapter=async(operation,requestFile,responseFile)=>{
  assert.equal(operation,'generate');generates++;
  const request=JSON.parse(await readFile(requestFile,'utf8')),image=join(workspace,'测试原图.png');
  // The provider delivers bytes. Let Node's filesystem boundary store them,
  // matching the host's download path rather than libvips filename handling.
  await writeFile(image,await sharp({create:{width:request.width,height:request.height,channels:3,background:'#49a8cb'}}).png().toBuffer());
  await writeFile(responseFile,JSON.stringify({status:'succeeded',provider_request_id:'local-fixture',image_path:image}));
 };
 const inputs=[{key:'raw-price',prompt:'价格示意中文🧪',width:256,height:256,transparent:false}];
 const options={root:workspace,ctx,state,save:async()=>{},adapter};
 const generated=await generateBatchImages(inputs,options);assert.equal(generated.assets.length,1);assert.equal(generated.assets[0].status,'needs_review',JSON.stringify({generated,uncertain:state.uncertainGenerations}));
 console.log('PACKAGING_LONG_PATH_IMAGE_ORCHESTRATION_PASSED');
 const reused=await generateBatchImages(inputs,options);assert.equal(generates,1,'Existing result must not dispatch again');assert.equal(reused.assets[0].path,generated.assets[0].path);
 const raw=generated.assets[0];assert.ok(raw.path.length>350);assert.ok(!raw.path.startsWith('\\\\?\\'));assert.equal((await sharp(await readFile(raw.path)).metadata()).width,256);
 const registered=join(workspace,'raw-price.png');await copyFile(raw.path,registered);
 const {cardBroll}=await load('card-broll.mjs');
 const card=await cardBroll('image_card',ctx,workspace,{action:'render',items:[{asset_id:'card-price',image_path:registered,size:{width:320,height:320},text:'价格说明',template_id:'frosted-window'}]});
 assert.equal(card.status,'ready',JSON.stringify(card));assert.equal(card.items[0].status,'success');
 console.log('PACKAGING_LONG_PATH_IMAGE_CARD_PASSED');
 const text=await cardBroll('text_card',ctx,workspace,{action:'render',items:[{asset_id:'text-card',text:{zh:'先校验，再生产',en:'Verify before production'},size:{width:480,height:270},template_id:'burgundy-editorial'}]});
 assert.equal(text.status,'ready',JSON.stringify(text));assert.equal(text.items[0].status,'success');
 assert.equal((await sharp(await readFile(join(workspace,text.items[0].file))).metadata()).hasAlpha,true);
 const textAgain=await cardBroll('text_card',ctx,workspace,{action:'render',items:[{asset_id:'text-card',text:{zh:'先校验，再生产',en:'Verify before production'},size:{width:480,height:270},template_id:'burgundy-editorial'}]});
 assert.equal(textAgain.identity,text.identity);assert.equal(textAgain.items[0].file,text.items[0].file);
 const {compileKeywordClips}=await load('keyword-styles.mjs');
 const keyword={id:'keyword-title',assetKey:'keyword-title',kind:'text',text:'每次表达都出彩',fontSize:64,color:'#FFFFFF',x:.05,y:.1,w:.9,h:.3,start:0,duration:2,keywordStyle:{template:'title-note',line_breaks:'auto'}};
 const compiled=await compileKeywordClips([keyword],{width:1080,height:1920},{resources,root:workspace,python});
 assert.ok(compiled[0].keywordRender.code.includes('Dialogue:'));assert.equal(compiled[0].text,keyword.text);
 const again=await compileKeywordClips(compiled,{width:1080,height:1920},{resources,root:workspace,python});assert.equal(again[0].keywordRender.identity,compiled[0].keywordRender.identity);
 console.log('PACKAGING_LONG_PATH_TEXT_CARD_AND_KEYWORD_PASSED');

 // Exercise the complete card -> word-bound motion -> installed member chain.
 // A single card render does not test Pillow reopening its canonical filename
 // in the motion compiler, which was the real Windows failure boundary.
 const {cardMotion,installCardMotion}=await load('card-motion.mjs');
 const motionEvidence=[];
 for(const type of ['image_card','text_card']){
  const labels=['邮票','布票','粮票'],group='group-'+type;
  const items=labels.map((text,i)=>({asset_id:type+'-'+i,template_id:type==='image_card'?'frosted-window':'burgundy-editorial',text:type==='image_card'?text:{zh:text,en:'Ticket'},size:type==='image_card'?{width:320,height:320}:{width:480,height:270},...(type==='image_card'?{image_path:registered}:{})}));
  const batch=await cardBroll(type,ctx,workspace,{action:'render',items});assert.equal(batch.status,'ready',JSON.stringify(batch));
  const cardAssets=Object.fromEntries(batch.items.map(i=>[i.asset_id,{...i,status:'ready'}]));
  if(process.platform==='win32'&&type==='image_card'){
   const file=join(workspace,batch.items[0].file);
   const legacy=await exec(python,['-X','utf8','-c',"from PIL import Image;import sys,json\ntry:\n Image.open(sys.argv[1]).load();result='unexpected-success'\nexcept OSError as e:result=type(e).__name__\nprint(json.dumps({'baseline':result}))",file],{timeout:15000,windowsHide:true});
   assert.notEqual(JSON.parse(legacy.stdout).baseline,'unexpected-success','Raw Pillow filename must reproduce the opt-out MAX_PATH failure');
  }
  const slot={id:group,assetKey:group,role:'card-motion',kind:'image',start:1,duration:6,x:.07,y:.08,w:.86,h:.48};
  const task={id:'motion-chain-'+type,source:{width:1080,height:1920,duration:8,fps:30},composition:{revision:0,outputSpec:{width:1080,height:1920,fps:30}},transcript:[{text:labels.join(''),start:1,end:6,words:labels.map((text,i)=>({text,start:1+i*2,end:2+i*2}))}],clips:[slot],captions:[],progressive:{jobs:{[group]:{epoch:0,input:'original-card-group',status:'failed'}},edits:{},productionPlan:{segments:[slot]}}};
  const args={action:'compile',key:group,preset:'auto',intent:'list',cards:items.map((item,i)=>({id:item.asset_id,anchor:{first_word:'s0w'+i,text:labels[i]}}))};
  const motionContext={...ctx,cardAssets,register:file=>({id:file,url:pathToFileURL(file).href})};
  const result=await cardMotion(task,motionContext,workspace,args);
  assert.equal(result.status,'ready');assert.equal(result.cardMotion.tracks.filter(t=>t.face==='front').length,3);assert.equal(result.encodedVideos,0);
  const cached=await cardMotion(task,motionContext,workspace,args);assert.equal(cached.reused,true);assert.equal(cached.identity,result.identity);
  assert.equal(await installCardMotion(task,{key:group,epoch:0,input:'original-card-group'},result,motionContext,workspace),true);
  assert.equal(task.progressive.jobs[group].status,'ready');assert.equal(task.clips.filter(c=>c.cardMotion).length,3);
  motionEvidence.push({type,members:3,identityReused:true,installed:true,sourcePathLength:join(workspace,batch.items[0].file).length});
 }
 console.log('PACKAGING_LONG_PATH_IMAGE_AND_TEXT_CARD_MOTION_CHAIN_PASSED');

 assert.equal((await sharp(await readFile(join(workspace,card.items[0].file))).metadata()).hasAlpha,true);
 const {soundLibrary}=await load('sound-library.mjs'),index=JSON.parse(await readFile(join(resources,'sound-library/index.json'),'utf8'));
 const sound=index.sounds.find(s=>s.effective_duration_seconds>=.2);assert.ok(sound);
 const info=await soundLibrary(ctx,workspace,{action:'show',id:sound.id});assert.equal(info.id,sound.id);
 const audio=await soundLibrary(ctx,workspace,{action:'render',key:'sfx-price',id:sound.id,duration:.1});
 assert.ok((await readFile(join(workspace,audio.file))).length>44);
 assert.equal((await soundLibrary(ctx,workspace,{action:'render',key:'sfx-price',id:sound.id,duration:.1})).reused,true);
 console.log('PACKAGING_LONG_PATH_SOUND_PASSED');
 const ffprobe=join(bin,process.platform==='win32'?'ffprobe.exe':'ffprobe'),stockSource=join(workspace,'stock-fixture.mp4');
 await exec(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30','-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p',stockSource],{timeout:30000,windowsHide:true});
 const {prepareStockVideo}=await load('video-search.mjs'),stock=join(workspace,'stock-ready.mp4'),stockBytes=await readFile(stockSource);
 const media=await prepareStockVideo({provider:'pexels',url:'https://videos.pexels.com/video-files/1/fixture.mp4',duration:1,outputWidth:320,outputHeight:180},stock,{...ctx,ffprobe},undefined,{fetcher:async()=>new Response(stockBytes,{headers:{'content-length':String(stockBytes.length)}})});
 assert.equal(media.width,320);assert.ok(media.duration>=.95);console.log('PACKAGING_LONG_PATH_STOCK_VIDEO_PASSED');

 // Contending processes must claim exactly once. A crashed holder must release
 // its native lock, without deleting the shared lock file or resetting state.
 const script=String.raw`import sys,json,subprocess,os
scripts,run=sys.argv[1:];sys.path.insert(0,scripts)
from atlas import read
from cocut_paths import Path
from pipeline import locked
state=read(Path(run)/'state.json');jid=next(iter(state['jobs']))
state['jobs'][jid]['status']='planned'
from atlas import save
save(Path(run)/'state.json',state)
claim="import sys,json;sys.path.insert(0,sys.argv[1]);from pipeline import begin;print(json.dumps(begin(sys.argv[2],sys.argv[3])))"
children=[subprocess.Popen([sys.executable,'-X','utf8','-c',claim,scripts,run,jid],stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(6)]
rows=[]
for child in children:
 out,err=child.communicate(timeout=30);assert child.returncode==0,err.decode('utf8');rows.append(json.loads(out))
assert sum(row['submit'] for row in rows)==1,rows
crash="import sys,os;sys.path.insert(0,sys.argv[1]);from pipeline import locked\nwith locked(sys.argv[2]):os._exit(0)"
subprocess.run([sys.executable,'-X','utf8','-c',crash,scripts,run],check=True,timeout=15)
with locked(run):pass
print('EXCLUSIVE_CLAIM_AND_CRASH_RELEASE_PASSED')`;
 const lock=await exec(python,['-X','utf8','-c',script,join(resources,'batch-image-assets/scripts'),generated.directory],{env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},timeout:60000,windowsHide:true});
 assert.match(lock.stdout,/EXCLUSIVE_CLAIM_AND_CRASH_RELEASE_PASSED/);
 const receipt={status:'passed',platform:process.platform,unicodePaths:true,parentLocale:'gbk',inputPathLength:probe.length,artifactPathLength:raw.path.length,windowsLegacyLimitReproduced:process.platform==='win32',registryChanged:false,requestIdentitiesRewritten:false,imageOrchestration:true,imageCardRendered:true,textCardRendered:true,cardMotionChains:motionEvidence,keywordCompiled:true,stockVideoDecoded:true,soundRendered:true,resultReused:true,concurrentClaimCount:1,crashedLockReleased:true,paidCalls:false,financialWrites:false};
 const evidence=join(root,'.local/rebuild/windows-96');await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'local-production-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:200});if(clone)for(const file of [clone.python,clone.pth])await rm(file,{force:true,maxRetries:8,retryDelay:200});}
