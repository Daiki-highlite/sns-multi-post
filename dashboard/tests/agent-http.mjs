import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {origin,api,futureDate} from './support/api.mjs';
const initial=(await api('state')).body;assert.equal(initial.deliveryMode,'browser_agent');assert.equal(initial.connections.length,0);assert.ok(initial.destinations.find(d=>d.platform==='x'));
const destinations=Object.fromEntries(initial.destinations.map(d=>[d.platform,`web:${d.url}`]));
const schedulerSecret=readFileSync('.dev.vars','utf8').match(/^SCHEDULER_SECRET=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g,'');
assert.ok(schedulerSecret,'Local scheduler secret is required to verify API delivery stays disabled');
const disabled=await fetch(origin+'/api/jobs/run',{method:'POST',headers:{Authorization:`Bearer ${schedulerSecret}`}});assert.equal(disabled.status,200);assert.equal((await disabled.json()).mode,'browser_agent','The API runner must not call SNS providers by default');
const {id}=(await api('posts','POST',{date:futureDate(),time:'12:00'})).body;
assert.match(id,/^[a-f0-9-]{36}$/);
function localSql(sql){execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{stdio:'pipe'});}
const find=async()=>(await api('state')).body.posts.find(p=>p.id===id);
try {
let p=await find();assert.equal((await api(`posts/${id}`,'PATCH',{...p,title:'[使い捨て] ブラウザー実行ハーネス検証',platforms:['x'],content:{x:['修正後の親投稿','修正後の自己返信'],linkedin:'',facebook:''},needsImage:false})).status,200);
p=await find();assert.equal((await api(`posts/${id}/approve`,'POST',{revision:p.revision,destinations,immediate:true})).status,200);
p=await find();const before=(await api('agent/packet')).body.jobs.filter(j=>j.postId===id);assert.equal(before.length,2);const parent=before.find(j=>!j.sequence),child=before.find(j=>j.sequence);assert.equal(parent.canClaim,true);assert.equal(child.canClaim,false);assert.equal(parent.text,'修正後の親投稿');
const claimPath=`agent/targets/${encodeURIComponent(parent.id)}/claim`,resultPath=`agent/targets/${encodeURIComponent(parent.id)}/result`;
const competing=await Promise.all([api(claimPath,'POST',{revision:p.revision}),api(claimPath,'POST',{revision:p.revision})]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);const claim=competing.find(r=>r.status===200).body.job.claim;
assert.equal((await api(`posts/${id}/revoke`,'POST',{revision:p.revision})).status,409,'Cannot revoke a job while browser work is in flight');
assert.equal((await api(resultPath,'POST',{revision:p.revision,claim:'wrong',outcome:'published',url:'https://x.com/example/status/123',accountConfirmed:true})).status,409);
assert.equal((await api(resultPath,'POST',{revision:p.revision,claim,outcome:'published',url:parent.destination.url,accountConfirmed:true})).status,400,'Profile URL is not publication proof');
const publishedUrl=`${parent.destination.url}/status/1234567890123456789`;
assert.equal((await api(resultPath,'POST',{revision:p.revision,claim,outcome:'published',url:publishedUrl})).status,400,'Must explicitly verify SNS content and account');
assert.equal((await api(resultPath,'POST',{revision:p.revision,claim,outcome:'published',url:publishedUrl,accountConfirmed:true})).status,200);
assert.equal((await api(resultPath,'POST',{revision:p.revision,claim,outcome:'published',url:publishedUrl,accountConfirmed:true})).status,409,'A receipt cannot publish the same job twice');
const after=(await api('agent/packet')).body.jobs.filter(j=>j.postId===id);assert.equal(after.find(j=>j.sequence).replyTo,publishedUrl);assert.equal(after.find(j=>j.sequence).canClaim,true);
const childPath=`agent/targets/${encodeURIComponent(child.id)}`;const childClaim=await api(childPath+'/claim','POST',{revision:p.revision});assert.equal(childClaim.status,200);
const expired=new Date(Date.now()-16*60*1000).toISOString();localSql(`UPDATE targets SET claimed_at='${expired}' WHERE post_id='${id}' AND sequence=1 AND state='sending';`);
assert.equal((await api(childPath+'/claim','POST',{revision:p.revision})).status,409,'An expired claim is not replayed');
assert.equal((await api('agent/packet')).body.jobs.find(j=>j.id===child.id).state,'unknown');
assert.equal((await api(childPath+'/result','POST',{revision:p.revision,claim:expired,outcome:'unknown',note:'公開操作後に確認できないため停止（使い捨て検証）'})).status,200);
assert.equal((await api(childPath+'/claim','POST',{revision:p.revision})).status,409,'Unknown result must not be replayed');
console.log('Agent HTTP: frozen payload/destination, concurrent claim, in-flight edit lock, receipt verification, X parent/child, unknown-result replay protection passed');
assert.equal((await api(childPath+'/result','POST',{revision:p.revision,claim:expired,outcome:'failed'})).status,409,'Unknown cannot be converted back to unposted');
} finally {
 if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid local fixture ID');
 const sql=`DELETE FROM targets WHERE post_id='${id}'; DELETE FROM activities WHERE post_id='${id}'; DELETE FROM posts WHERE id='${id}' AND source_key='manual:${id}';`;
 localSql(sql);
}
