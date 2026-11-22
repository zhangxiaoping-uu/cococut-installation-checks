import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';

/** Loopback-only startup fixture: no model, wallet, media or production access. */
export async function cutStartupFixture(){
 const authorization='Bearer '+randomBytes(32).toString('hex'),unexpected=[];
 const server=createServer((request,response)=>{
  if(request.headers.authorization!==authorization){response.writeHead(401).end();return;}
  let value;
  if(request.method==='GET'&&request.url==='/v1/cut/capabilities')value={schemaVersion:1,available:true,providerMode:'fixture',instanceId:'startup-smoke',scopeDigest:'startup-smoke'};
  else if(request.method==='POST'&&request.url==='/v1/cut/quote'){request.resume();value={unitScale:'1000',totalUnits:'1000',expiresAt:new Date(Date.now()+60000).toISOString()};}
  else{unexpected.push(request.method+' '+request.url);response.writeHead(404).end();return;}
  response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(value));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {connection:{schemaVersion:1,origin:'http://127.0.0.1:'+server.address().port,authorization,allowLoopbackHttp:true,allowFixture:true},unexpected,
  async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
