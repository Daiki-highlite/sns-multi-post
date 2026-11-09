// Never uses the checkout's development database, credentials or SNS accounts.
import {mkdtempSync,mkdirSync,cpSync,symlinkSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!existsSync(path.join(root,'dist/server/wrangler.json')))throw new Error('Run npm run build first');
mkdirSync(path.join(root,'.local'),{recursive:true});
const fixture=mkdtempSync(path.join(root,'.local/uat-'));
writeFileSync(path.join(fixture,'.uat-owned'),'synthetic-disposable-uat');
for(const name of ['dist','drizzle','scripts','tests'])cpSync(path.join(root,name),path.join(fixture,name),{recursive:true});
symlinkSync(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'dir');
writeFileSync(path.join(fixture,'package.json'),'{"type":"module"}');
const vars=`ALLOWED_USER_EMAILS=uat-a@example.test,uat-b@example.test,seedy@sites.test\nSCHEDULER_SECRET=${randomBytes(32).toString('hex')}\nCREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\nSCHEDULER_ENABLED=false\nDELIVERY_MODE=browser_agent\nDESTINATION_X_URL=https://x.com/uat_test\nDESTINATION_LINKEDIN_URL=https://www.linkedin.com/company/123456789/\nDESTINATION_FACEBOOK_URL=https://www.facebook.com/profile.php?id=123456789\n`;
for(const name of ['.dev.vars','dist/server/.dev.vars'])writeFileSync(path.join(fixture,name),vars,{mode:0o600});
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const origin=`http://127.0.0.1:${port}`;
const env={...process.env,TEST_AUTH_MODE:'headers',TEST_ORIGIN:origin,SITES_RUNTIME_ROOT:path.join(fixture,'.sites-runtime'),WRANGLER_SEND_METRICS:'false'};
const wrangler=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js'];
const config=['--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state'];
let server,logs='';
try{
 execFileSync(process.execPath,[...wrangler,'d1','execute','DB',...config,'--file','drizzle/0000_chunky_starfox.sql'],{cwd:fixture,env,stdio:'pipe'});
 server=spawn(process.execPath,[...wrangler,'dev',...config,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],{cwd:fixture,env,stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',v=>{logs=(logs+v).slice(-12000);});
 let ready=false;
 for(let i=0;i<120;i++){if(server.exitCode!==null)throw new Error('Isolated worker exited');try{const r=await fetch(origin+'/api/state');if(r.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw new Error('Isolated worker did not become ready');
 for(const suite of ['http-smoke.mjs','bulk-http.mjs','agent-http.mjs','uat-http.mjs']){
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/'+suite],{cwd:fixture,env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(suite+' failed')));});
 }
 console.log('UAT: all 4 production-build HTTP suites passed in an isolated synthetic environment.');
}catch(e){console.error(logs);throw e;}
finally{
 if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>{server.once('exit',r);setTimeout(r,5000).unref();});if(server.exitCode===null)server.kill('SIGKILL');}
 if(process.argv.includes('--keep'))console.log('Retained isolated UAT data: '+fixture);else rmSync(fixture,{recursive:true,force:true});
}
