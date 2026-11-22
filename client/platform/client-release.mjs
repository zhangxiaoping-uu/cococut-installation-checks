import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export function clientRelease(value){
 if(!value||value.schemaVersion!==1||!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.version||'')||!Number.isSafeInteger(value.build)||value.build<1||value.build>100000000||!/^[a-f0-9]{40}$/.test(value.sourceCommit||'')||!['darwin','win32'].includes(value.platform)||value.arch!==(value.platform==='darwin'?'arm64':'x64')||value.updateProtocol!==1)throw Error('CLIENT_RELEASE_INVALID');
 return {schemaVersion:1,version:value.version,build:value.build,sourceCommit:value.sourceCommit,platform:value.platform,arch:value.arch,updateProtocol:1};
}
export async function installedClientRelease(root,{version,platform,arch}){
 const value=clientRelease(JSON.parse(await readFile(join(root,'client-release.json'),'utf8')));
 if(value.version!==version||value.platform!==platform||value.arch!==arch)throw Error('CLIENT_RELEASE_RUNTIME_MISMATCH');return value;
}
