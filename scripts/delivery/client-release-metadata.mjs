import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {clientRelease,installedClientRelease} from '../../client/platform/client-release.mjs';

/** Release identity is explicit; a directory name is never a version source. */
export function buildClientRelease({version,build,sourceCommit,platform,arch}){
 if(typeof build==='string'&&!/^[1-9]\d{0,8}$/.test(build))throw Error('EXPLICIT_CLIENT_RELEASE_BUILD_REQUIRED');
 return clientRelease({schemaVersion:1,version,build:typeof build==='string'?Number(build):build,sourceCommit,platform,arch,updateProtocol:1});
}

export async function writeClientRelease(root,release){
 const value=clientRelease(release);
 await writeFile(join(root,'client-release.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 return value;
}

export async function verifyClientRelease(root,expected){
 const value=await installedClientRelease(root,expected);
 if(value.build!==expected.build||value.sourceCommit!==expected.sourceCommit)throw Error('CLIENT_RELEASE_BUILD_MISMATCH');
 return value;
}

/** Old receipts stay downloadable, without being advertised as in-app updates. */
export function installerClientRelease(receipt,expected){
 if(receipt.updateProtocol===undefined)return undefined;
 if(receipt.updateProtocol!==1)throw Error('INSTALLER_UPDATE_PROTOCOL_INVALID');
 const value=clientRelease(receipt.clientRelease);
 for(const key of ['platform','arch','build','version','sourceCommit'])if(expected?.[key]!==undefined&&value[key]!==expected[key])throw Error('INSTALLER_CLIENT_RELEASE_MISMATCH');
 return value;
}

export async function installedReleaseFile(root){
 const release=clientRelease(JSON.parse(await readFile(join(root,'client-release.json'),'utf8')));
 const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
 return installedClientRelease(root,{version,platform:release.platform,arch:release.arch});
}

/** Protocol1 Windows updates require native helper and actual NSIS overwrite
 * evidence as well as the separate mock UI tests. No public/human claim here. */
export function windowsNativeUpdateAccepted(receipt){
 const native=receipt?.nativeUpdateAcceptance,helper=native?.helper,overwrite=native?.overwrite;
 return native?.status==='passed'&&helper?.status==='passed'&&helper.actualBundledNode===true&&helper.nativeLauncher==='bundled-node'&&helper.runtimeCopiedOutsideTarget===true&&helper.actualOwnerCreatedHelper===true&&helper.productionStdioValidated===true&&helper.helperOwnerMatchesWatchedPid===true&&helper.helperSurvivedActualOwnerExit===true&&Number.isSafeInteger(helper.probeDelayAfterOwnerExitMs)&&helper.probeDelayAfterOwnerExitMs>=500&&helper.installedHelperImported===true&&helper.actualInstalledElectronOwner===true&&helper.waitedForParent===true&&helper.originalParentExitedNormally===true&&helper.installerArgumentsPreserved===true&&helper.revokedPermitRejected===true&&helper.tamperedInstallerRejected===true&&helper.privateHandoffFilesRemoved===true&&helper.scope==='native-probe-executable-no-user-data'&&
  overwrite?.status==='passed'&&overwrite.sameInstallDirectory===true&&overwrite.manualUninstallPerformed===false&&overwrite.isolatedProfileMarkersPreserved===true&&overwrite.installedReleaseUnchanged===true&&overwrite.reopened===true&&overwrite.scope==='same-candidate-native-nsis-overwrite'&&
  ['windows-native-update-helper','windows-overwrite-preserves-data','overwrite-reopen-home'].every(check=>receipt.checks?.includes(check));
}
