import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,win32} from 'node:path';
import {verifyWindowsBrandingFiles} from './windows-branding.mjs';
import {unicodeShellLinkSource} from './windows-shell-link-unicode.mjs';
export function shortcutTarget(value){
 if(typeof value!=='string')throw Error('WINDOWS_SHORTCUT_PATH_INVALID');
 let path=value.trim();if(path.startsWith('"')&&path.endsWith('"'))path=path.slice(1,-1);
 if(!win32.isAbsolute(path)||/[\x00-\x1f"<>|?*]/.test(path))throw Error('WINDOWS_SHORTCUT_PATH_INVALID');
 return win32.normalize(path).toLowerCase();
}
export async function readWindowsShortcutFiles(files){
 if(process.platform!=='win32'||!Array.isArray(files)||!files.length||files.some(file=>!win32.isAbsolute(file)))throw Error('WINDOWS_SHORTCUT_FILES_REQUIRED');
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 // Read the Unicode IShellLinkW interface directly. WScript.Shell can use
 // an ANSI interface and lose a target outside the process code page. Keep
 // stdout ASCII as well; never repair a damaged target in the verifier.
 const script=`$ErrorActionPreference='Stop'; Add-Type -TypeDefinition ${literal(unicodeShellLinkSource)}; $results=@(); foreach($file in @(${files.map(literal).join(',')})){if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'WINDOWS_SHORTCUT_MISSING'}; $value=[CocoCutShellLinkW]::Read($file); $results+=@{name='CocoCut';target=$value[0];icon=$value[1]}}; $json=ConvertTo-Json -InputObject @{shortcuts=$results} -Depth 4 -Compress; [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))`;
 const {stdout}=await promisify(execFile)(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:30000,maxBuffer:65536});
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(stdout.trim()))throw Error('WINDOWS_SHORTCUT_TRANSPORT_INVALID');
 const result=JSON.parse(Buffer.from(stdout.trim(),'base64').toString('utf8'));if(result.shortcuts?.length!==files.length)throw Error('WINDOWS_SHORTCUT_VERIFICATION_INVALID');return result.shortcuts;
}
/** Read-only acceptance on an actual Windows install. No shortcut repair or
 * unrelated desktop enumeration is performed by this verifier. */
export async function verifyWindowsShortcuts(target){
 if(process.platform!=='win32'||!win32.isAbsolute(target))throw Error('WINDOWS_INSTALLED_TARGET_REQUIRED');
 const executable=join(target,'CocoCut.exe'),icon=join(target,'resources/app/client/resources/app.ico');
 const branding=await verifyWindowsBrandingFiles(executable,icon);
 const script=`$ErrorActionPreference='Stop'; $files=@(); foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){$files+=Join-Path $folder 'CocoCut.lnk'}; $json=ConvertTo-Json -InputObject @{files=$files} -Compress; [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))`;
 const {stdout}=await promisify(execFile)(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:30000,maxBuffer:65536});
 const files=JSON.parse(Buffer.from(stdout.trim(),'base64').toString('utf8')).files;if(files?.length!==2)throw Error('WINDOWS_SHORTCUT_VERIFICATION_INVALID');
 const shortcuts=(await readWindowsShortcutFiles(files)).map(link=>{
  let target,iconPath;try{target=shortcutTarget(link.target);if(link.icon)iconPath=shortcutTarget(link.icon.replace(/,\s*-?\d+$/,''));}catch(error){throw Error('WINDOWS_SHORTCUT_RAW_PATH_INVALID:'+JSON.stringify({target:link.target,icon:link.icon}),{cause:error});}
  if(target!==shortcutTarget(executable))throw Error('WINDOWS_SHORTCUT_TARGET_INVALID:'+JSON.stringify({actual:link.target,expected:executable}));
  if(iconPath&&iconPath!==shortcutTarget(executable))throw Error('WINDOWS_SHORTCUT_ICON_INVALID');
  return {name:'CocoCut',targetMatches:true,iconUsesExecutable:true};
 });
 return {...branding,desktopAndStartMenuShortcuts:shortcuts};
}
