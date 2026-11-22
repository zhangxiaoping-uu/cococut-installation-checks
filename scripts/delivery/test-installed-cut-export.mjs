// Render with the installed cut engine and media binaries, without any model,
// account or user project. This also catches removed FFmpeg CLI options.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
const {values}=parseArgs({options:{'app-root':{type:'string'},output:{type:'string'}}});
assert.ok(isAbsolute(values['app-root']||''),'EXPLICIT_INSTALLED_APP_REQUIRED');
const appRoot=await realpath(values['app-root']),clientRelease=JSON.parse(await readFile(join(appRoot,'client-release.json')));
assert.equal(clientRelease.platform,process.platform);assert.equal(clientRelease.arch,process.arch);
const bin=join(appRoot,'.local/rebuild/packaging-resources/bin');
const python=join(appRoot,'.local/rebuild/portable-python/cut',process.platform==='win32'?'python.exe':'bin/python');
const work=await mkdtemp(join(tmpdir(),'cococut-cut-export-')),exec=promisify(execFile);
const source=String.raw`
import sys,json,hashlib,subprocess
from pathlib import Path
root,work=map(Path,sys.argv[1:])
for relative in ['site-packages','Lib/site-packages']:
    site=root/'.local/rebuild/portable-python/cut'/relative
    if site.is_dir():sys.path.insert(0,str(site))
sys.path.insert(0,str(root/'client/products/cut/upstream/src'))
from talking_video_editor.render.ffmpeg import concat_segments,RenderSegment
from talking_video_editor.models import TimeRange
original=work/'source.mp4';output=work/'edited.mp4'
subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2.4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(original)],check=True,capture_output=True)
before=hashlib.sha256(original.read_bytes()).hexdigest()
concat_segments(str(original),str(output),[RenderSegment(TimeRange(start=0.1,end=1.1)),RenderSegment(TimeRange(start=1.3,end=2.3),speed=2)])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(output)],text=True))
assert {s['codec_type'] for s in probe['streams']}=={'audio','video'}
duration=float(probe['format']['duration']);assert 1.35<=duration<=1.75,duration
video=next(s for s in probe['streams'] if s['codec_type']=='video');assert video['avg_frame_rate']=='30/1',video['avg_frame_rate']
subprocess.run(['ffmpeg','-v','error','-i',str(output),'-f','null','-'],check=True,capture_output=True)
assert before==hashlib.sha256(original.read_bytes()).hexdigest()
print(json.dumps({'actualInstalledEngine':True,'normalAndSpeedChangedSegments':True,'audioAndVideo':True,'fullyDecoded':True,'duration':duration,'sourceUnchanged':True}))
`;
try{
 const env={...process.env,PATH:bin+(process.platform==='win32'?';':':')+(process.env.PATH||'')};
 const result=await exec(python,['-I','-B','-c',source,appRoot,work],{env,timeout:90000,maxBuffer:4*1024**2,windowsHide:true});
 const exportResult=JSON.parse(result.stdout.trim());
 const receipt={status:'passed',appRoot,clientRelease,isolatedProfile:true,paidModelCalls:false,financialWrites:false,...exportResult};
 if(values.output){const output=resolve(values.output);await mkdir(join(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');}
 console.log(JSON.stringify(receipt));
}finally{await rm(work,{recursive:true,force:true,maxRetries:8,retryDelay:200});}
