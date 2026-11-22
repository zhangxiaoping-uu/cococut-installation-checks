import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.resolve('@electron/packager'));
const {NtExecutable,NtExecutableResource,Resource,Data}=await import(pathToFileURL(require.resolve('resedit')).href);
const hash=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
// In PE icon directories a zero dimension encodes 256 pixels.
const width=icon=>(icon.width??icon.bitmapInfo.width)||256;
const height=icon=>(icon.height??Math.abs(icon.bitmapInfo.height)/2)||256;
const signature=icon=>[width(icon),height(icon),hash(icon.isRaw()?icon.bin:icon.generate())].join(':');

/** Inspect the actual PE resources, not just a configuration that says an icon
 * should exist. Packager writes these; builder must preserve them. */
export function inspectWindowsBranding(executable,iconBytes){
 const resources=NtExecutableResource.from(NtExecutable.from(executable));
 const versions=Resource.VersionInfo.fromEntries(resources.entries);
 const strings=versions.flatMap(version=>version.getAllLanguagesForStringValues().map(language=>version.getStringValues(language)));
 if(!strings.length||strings.some(value=>value.ProductName!=='CocoCut'||value.FileDescription!=='CocoCut'||value.InternalName!=='CocoCut'||value.OriginalFilename!=='CocoCut.exe'))throw Error('WINDOWS_PE_BRANDING_INVALID');
 const expected=Data.IconFile.from(iconBytes).icons.map(icon=>icon.data),groups=Resource.IconGroupEntry.fromEntries(resources.entries);
 if(!groups.length||![16,32,256].every(size=>expected.some(icon=>icon.width===size&&icon.height===size)))throw Error('WINDOWS_PE_ICON_MISSING');
 const fingerprints=expected.map(signature).sort();
 if(!groups.some(group=>JSON.stringify(group.getIconItemsFromEntries(resources.entries).map(signature).sort())===JSON.stringify(fingerprints)))throw Error('WINDOWS_PE_ICON_MISMATCH');
 return {status:'passed',productName:'CocoCut',executableName:'CocoCut.exe',versionStringsChecked:strings.length,embeddedBrandIconMatches:true,iconSizes:expected.map(icon=>icon.width).sort((a,b)=>a-b)};
}
export async function verifyWindowsBrandingFiles(executable,icon){return inspectWindowsBranding(await readFile(executable),await readFile(icon));}
