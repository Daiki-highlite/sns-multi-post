import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {api,origin,futureDate} from './support/api.mjs';
assert.ok(existsSync('.uat-owned'),'Disposable UAT database required');
const all=async()=>(await api('state')).body;
const dest=Object.fromEntries((await all()).destinations.map(d=>[d.platform,'web:'+d.url]));
const find=async id=>(await all()).posts.find(p=>p.id===id);
const packet=async id=>(await api('agent/packet')).body.jobs.filter(j=>j.postId===id);
const path=j=>`agent/targets/${encodeURIComponent(j.id)}`;
function sql(text){execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',text],{stdio:'pipe'});}
async function create(platforms=['x','linkedin','facebook']){
 const id=(await api('posts','POST',{date:futureDate(2),time:'12:00'})).body.id,p=await find(id);
 assert.equal((await api('posts/'+id,'PATCH',{...p,title:'Native schedule UAT',platforms,content:{x:['親の予約本文','続きの予約本文'],linkedin:'LI予約本文',facebook:'FB予約本文'},needsImage:false})).status,200);
 return find(id);
}
const original=await create(),timing={date:futureDate(3),time:'11:45',mode:'scheduled'};
const concurrent=await Promise.all([api(`posts/${original.id}/approve`,'POST',{revision:original.revision,destinations:dest,timing}),api(`posts/${original.id}/approve`,'POST',{revision:original.revision,destinations:dest,timing})]);
assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);let p=await find(original.id);
assert.equal(p.publicationMode,'scheduled');assert.equal(p.date,timing.date);assert.equal(p.time,timing.time);assert.equal(p.version,original.version+1);assert.equal(p.plannedAt,timing.date+'T02:45:00.000Z');assert.equal(p.targets.length,4);
assert.ok(p.targets.every(t=>t.payload.publicationMode==='scheduled'&&t.scheduledAt===p.plannedAt));
let jobs=await packet(p.id),parent=jobs.find(j=>j.platform==='x'&&!j.sequence),child=jobs.find(j=>j.platform==='x'&&j.sequence);assert.equal(parent.operation,'schedule');assert.equal(parent.canClaim,true);assert.equal(parent.parts.length,2);assert.equal(child.canClaim,false);
assert.equal((await api(path(child)+'/claim','POST',{revision:p.revision})).status,409);
const competing=await Promise.all([api(path(parent)+'/claim','POST',{revision:p.revision}),api(path(parent)+'/claim','POST',{revision:p.revision})]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);let claim=competing.find(r=>r.status===200).body.job.claim;
p=await find(p.id);assert.ok(p.targets.filter(t=>t.platform==='x').every(t=>t.state==='sending'&&t.claimedAt===claim&&t.attempts===1));
const receipt={revision:p.revision,claim,outcome:'scheduled',scheduledFor:p.plannedAt,scheduleUrl:'https://x.com/compose/tweet/unsent/scheduled',accountConfirmed:true,scheduleConfirmed:true,threadConfirmed:true,note:'合成予約一覧で全件の原稿・順序・日時を照合'};
for(const change of [{scheduledFor:new Date(Date.parse(p.plannedAt)+60000).toISOString()},{accountConfirmed:false},{scheduleConfirmed:false},{threadConfirmed:false},{scheduleUrl:'https://x.com/uat_test'}])assert.equal((await api(path(parent)+'/result','POST',{...receipt,...change})).status,400);
assert.equal((await api(path(parent)+'/result','POST',{revision:p.revision,claim,outcome:'published',accountConfirmed:true,threadConfirmed:true,publishedUrls:['https://x.com/uat_test/status/4441','https://x.com/uat_test/status/4442']})).status,409);
assert.equal((await api(path(parent)+'/result','POST',receipt)).status,200);assert.equal((await api(path(parent)+'/result','POST',receipt)).status,409);
p=await find(p.id);assert.ok(p.targets.filter(t=>t.platform==='x').every(t=>t.state==='scheduled'&&t.url===null&&t.payload.nativeSchedule.plannedAt===p.plannedAt));
assert.equal((await api(`posts/${p.id}/revoke`,'POST',{revision:p.revision})).status,409);assert.equal((await api(`posts/${p.id}`,'PATCH',{...p,time:'13:00'})).status,409);assert.equal((await api(`posts/${p.id}`,'DELETE',{revision:p.revision})).status,409);assert.equal((await api('targets/retry','POST',{id:parent.id})).status,409);
for(const platform of ['linkedin','facebook']){
 const job=(await packet(p.id)).find(j=>j.platform===platform);assert.equal(job.canClaim,true);
 const c=await api(path(job)+'/claim','POST',{revision:p.revision});assert.equal(c.status,200);
 const scheduleUrl=platform==='linkedin'?'https://www.linkedin.com/company/123456789/admin/page-posts/published/':'https://business.facebook.com/latest/content_calendar/?asset_id=123456789';
 assert.equal((await api(path(job)+'/result','POST',{...receipt,claim:c.body.job.claim,scheduleUrl})).status,200);
}
p=await find(p.id);assert.ok(p.targets.every(t=>t.state==='scheduled'&&!t.url));
// Cancellation is an attested external action; the app never silently deletes a native reservation.
for(const job of (await packet(p.id)).filter(j=>!j.groupRootId||j.groupRootId===j.id)){
 const cancelled={revision:p.revision,claim:job.claim,outcome:'cancelled',accountConfirmed:true,cancellationConfirmed:true,threadConfirmed:true,note:'合成テスト：SNSで対象全件の予約取消を照合'};
 assert.equal((await api(path(job)+'/result','POST',{...cancelled,cancellationConfirmed:false})).status,400);
 assert.equal((await api(path(job)+'/result','POST',cancelled)).status,200);
}
p=await find(p.id);assert.ok(p.targets.every(t=>t.state==='cancelled'));assert.equal((await api(`posts/${p.id}/revoke`,'POST',{revision:p.revision})).status,200);
// A native X thread is published only with distinct proof for every part, after the scheduled time.
let verification=await create(['x']);assert.equal((await api(`posts/${verification.id}/approve`,'POST',{revision:verification.revision,destinations:dest,timing})).status,200);verification=await find(verification.id);let root=(await packet(verification.id)).find(j=>!j.sequence);
claim=(await api(path(root)+'/claim','POST',{revision:verification.revision})).body.job.claim;
assert.equal((await api(path(root)+'/result','POST',{...receipt,revision:verification.revision,claim,scheduledFor:verification.plannedAt})).status,200);
const past=new Date(Date.now()-60000).toISOString();sql(`UPDATE targets SET scheduled_at='${past}',payload=json_set(payload,'$.nativeSchedule.plannedAt','${past}') WHERE post_id='${verification.id}';`);
root=(await packet(verification.id)).find(j=>!j.sequence);assert.equal(root.canVerifyPublication,true);assert.equal(root.canClaim,false);
const published={revision:verification.revision,claim,outcome:'published',accountConfirmed:true,threadConfirmed:true,publishedUrls:['https://x.com/uat_test/status/5551','https://x.com/uat_test/status/5552']};
assert.equal((await api(path(root)+'/result','POST',{...published,publishedUrls:['https://x.com/uat_test/status/5551','https://x.com/uat_test/status/5551']})).status,400);
assert.equal((await api(path(root)+'/result','POST',published)).status,200);assert.ok((await find(verification.id)).targets.every(t=>t.state==='published'));
// Failed registration retries preserve the approved future time and claim the whole group exactly once.
let retry=await create(['x']);await api(`posts/${retry.id}/approve`,'POST',{revision:retry.revision,destinations:dest,timing});retry=await find(retry.id);root=(await packet(retry.id)).find(j=>!j.sequence);claim=(await api(path(root)+'/claim','POST',{revision:retry.revision})).body.job.claim;
assert.equal((await api(path(root)+'/result','POST',{revision:retry.revision,claim,outcome:'failed',note:'予約操作より前に中止した合成テスト'})).status,200);
assert.equal((await api('targets/retry','POST',{id:root.id})).status,200);assert.ok((await find(retry.id)).targets.every(t=>t.state==='queued'&&t.scheduledAt===retry.plannedAt));
claim=(await api(path(root)+'/claim','POST',{revision:retry.revision})).body.job.claim;const expired=new Date(Date.now()-16*60000).toISOString();sql(`UPDATE targets SET claimed_at='${expired}' WHERE post_id='${retry.id}';`);
assert.equal((await api(path(root)+'/claim','POST',{revision:retry.revision})).status,409);assert.ok((await find(retry.id)).targets.every(t=>t.state==='unknown'));assert.equal((await api('targets/retry','POST',{id:root.id})).status,409);
console.log('Native scheduling HTTP: atomic date approval, future registration, grouped X claims/receipts, exact reservation time, no premature publication, all-platform receipts, edit/delete/replay guards, attested cancellation, distinct thread proofs, preserved-time retry and expired-group protection passed');
