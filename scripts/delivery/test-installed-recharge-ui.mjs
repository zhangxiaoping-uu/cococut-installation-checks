// The harness stays in the build checkout; HTML, JS and CSS come from this
// exact installed app. Only explicit mock account/payment data enters the page.
import assert from 'node:assert/strict';
import {access,realpath} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

assert.ok(process.argv[2]&&isAbsolute(process.argv[2]),'EXPLICIT_INSTALLED_APP_ROOT_REQUIRED');
const app=await realpath(process.argv[2]),root=fileURLToPath(new URL('../../',import.meta.url));
for(const name of ['index.html','shell.js','style.css'])await access(join(app,'client/shell',name));
let result;
try{
 result=await promisify(execFile)(process.execPath,['--test','--test-reporter=tap',join(root,'client/tests/account-payment-ui.test.mjs')],{
  cwd:root,env:{...process.env,COCUT_ACCOUNT_UI_APP_ROOT:app},timeout:120000,maxBuffer:4*1024*1024,windowsHide:true,
 });
}catch(error){console.error(error.stdout||'');console.error(error.stderr||'');throw error;}
console.log(result.stdout);
assert.match(result.stdout,/^# tests 5\r?$/m,'FIVE_RECHARGE_UI_CHECKS_REQUIRED');
assert.match(result.stdout,/^# fail 0\r?$/m,'RECHARGE_UI_CHECKS_FAILED');
console.log(JSON.stringify({status:'passed',scope:'recharge-ui-from-explicit-app-root',tests:5,platform:process.platform,
 fiveDynamicTiers:true,discountBadges:true,responsiveLayout:true,latestQrOnly:true,staleCheckoutNotice:true,
 isolatedAccountFixture:true,realOrdersCreated:false,realPayments:false,paidModelCalls:false}));
