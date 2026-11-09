import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {api,origin,identity,headers,futureDate} from './support/api.mjs';
// This suite runs only inside run-uat.mjs's synthetic database.
import {existsSync} from 'node:fs';
assert.ok(existsSync('.uat-owned'),'Refusing to mutate a non-UAT database');
function sql(text){return execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',text],{stdio:'pipe'});}
assert.equal((await fetch(origin+'/api/state')).status,401);
for(const email of ['uat-a@example.test','uat-b@example.test'])assert.equal((await api('state','GET',undefined,{...headers,...identity(email)})).status,200);
assert.equal((await api('state','GET',undefined,{...headers,...identity('outsider@example.test')})).status,403);
for(const data of [null,[],42])assert.equal((await api('posts','POST',data)).status,400);
const {id}=(await api('posts','POST',{date:futureDate(),time:'12:00'})).body;
const find=async()=>(await api('state')).body.posts.find(p=>p.id===id);
let p=await find();assert.ok(p);
assert.ok((await api('state','GET',undefined,{...headers,...identity('uat-b@example.test')})).body.posts.some(other=>other.id===id));
assert.equal((await api('posts/'+id,'PATCH',{...p,title:42})).status,400);assert.equal((await find()).revision,p.revision);
assert.equal((await api('import','POST',{data:{spreadsheetId:'uat_calendar_id',tabs:[{name:'t',sheetId:1,rows:[['日付（JST）'],null]}]}})).status,400);
assert.equal((await api('posts/bulk','POST',{options:{entries:[null]}})).status,400);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
const form=new FormData();form.set('file',new Blob([png],{type:'image/png'}),'uat.png');
const upload=await fetch(origin+'/api/media',{method:'POST',headers:Object.fromEntries(Object.entries(headers).filter(([k])=>k!=='Content-Type')),body:form});assert.equal(upload.status,200);const mediaId=(await upload.json()).id;
assert.equal((await fetch(origin+'/api/media/'+mediaId)).status,401);
assert.deepEqual(Buffer.from(await (await fetch(origin+'/api/media/'+mediaId,{headers})).arrayBuffer()),png);
assert.equal((await api('posts/'+id,'PATCH',{...p,title:'UAT',platforms:['x','linkedin','facebook'],content:{x:['(1/2) 親の承認本文','（2/2）続きの承認本文'],linkedin:'LI',facebook:'FB'},needsImage:true,mediaIds:[mediaId]})).status,200);
p=await find();const destinations=Object.fromEntries((await api('state')).body.destinations.map(d=>[d.platform,'web:'+d.url]));
assert.equal((await api(`posts/${id}/approve`,'POST',{revision:p.revision,destinations,immediate:true})).status,200);p=await find();assert.equal(p.targets.length,4);assert.equal(p.content.x[0],'親の承認本文');
const jobs=async()=>(await api('agent/packet')).body.jobs.filter(j=>j.postId===id);
const targetPath=j=>`agent/targets/${encodeURIComponent(j.id)}`;
let all=await jobs(),parent=all.find(j=>j.platform==='x'&&!j.sequence),child=all.find(j=>j.platform==='x'&&j.sequence),li=all.find(j=>j.platform==='linkedin'),fb=all.find(j=>j.platform==='facebook');
assert.equal(parent.media.length,1);assert.equal(child.media.length,0);
assert.equal((await api(targetPath(child)+'/claim','POST',{revision:p.revision,allowLate:true})).status,409);
let claimed=(await api(targetPath(parent)+'/claim','POST',{revision:p.revision})).body.job;
assert.equal((await api(targetPath(parent)+'/result','POST',{revision:p.revision,claim:claimed.claim,outcome:'published',accountConfirmed:true,url:'https://x.com/uat_test/status/1234567890123456790'})).status,200);
// Simulate an interruption after the first real-world thread action. No waiting and no provider traffic.
const late=new Date(Date.now()-11*60000).toISOString();sql(`UPDATE targets SET scheduled_at='${late}' WHERE post_id='${id}' AND platform='x' AND sequence=1;`);
child=(await jobs()).find(j=>j.platform==='x'&&j.sequence);assert.equal(child.canConfirmLate,true);assert.equal(child.replyTo,'https://x.com/uat_test/status/1234567890123456790');
assert.equal((await api(targetPath(child)+'/claim','POST',{revision:p.revision})).status,409);
assert.equal((await api('posts/'+id,'PATCH',{...p,time:'13:00'})).status,409);
claimed=(await api(targetPath(child)+'/claim','POST',{revision:p.revision,allowLate:true})).body.job;assert.equal(claimed.text,'続きの承認本文');assert.equal(claimed.state,'sending');
assert.equal((await api(targetPath(child)+'/result','POST',{revision:p.revision,claim:claimed.claim,outcome:'unknown',note:'通信中断'})).status,200);
for(const payload of [{url:child.destination.url,remoteId:'fake',accountConfirmed:true},{url:'https://x.com/uat_test/status/1234567890123456791'},{url:'https://x.com/uat_test/status/1234567890123456791',accountConfirmed:true,revision:'old'}]){
 const r=await api('targets/resolve','POST',{id:child.id,revision:p.revision,published:true,...payload});assert.ok([400,409].includes(r.status));
}
assert.equal((await api('targets/resolve','POST',{id:child.id,revision:p.revision,published:true,accountConfirmed:true,url:'https://x.com/uat_test/status/1234567890123456791'})).status,200);
assert.equal((await api('targets/resolve','POST',{id:child.id,revision:p.revision,published:true,accountConfirmed:true,url:'https://x.com/uat_test/status/1234567890123456791'})).status,409);
claimed=(await api(targetPath(li)+'/claim','POST',{revision:p.revision})).body.job;
assert.equal((await api(targetPath(li)+'/result','POST',{revision:p.revision,claim:claimed.claim,outcome:'published',accountConfirmed:true,url:'https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A1234567890123456792/'})).status,200);
claimed=(await api(targetPath(fb)+'/claim','POST',{revision:p.revision})).body.job;
assert.equal((await api(targetPath(fb)+'/result','POST',{revision:p.revision,claim:claimed.claim,outcome:'published',accountConfirmed:true,url:'https://www.facebook.com/permalink.php?story_fbid=pfbidUAT&id=123456789'})).status,200);
assert.ok((await find()).targets.every(t=>t.state==='published'));
assert.ok((await api('state')).body.activities.some(a=>a.action==='agent-claimed'&&a.detail.includes('予定経過')));
for(const doc of ['HARNESS.md','OPERATIONS.md']){const r=await fetch(origin+'/agent/'+doc);assert.equal(r.status,200);assert.ok((await r.text()).length>100);}
console.log('UAT HTTP: A/B access, outsider/anonymous denial, invalid input atomicity, private media round trip, frozen image/text payload, late X child recovery, legacy receipt defenses, encoded LinkedIn proof, Facebook proof, audit, portable instructions passed');

const calendar={spreadsheetId:'uat_calendar_id',tabs:[{name:'UAT',sheetId:1,rows:[['日付（JST）','主テーマ','投稿テーマ','枝番','X 本文','LinkedIn 本文','Facebook 本文','投稿時刻（案）','投稿ID'],[futureDate().replaceAll('-','/'),'UAT','取込','1/1','imported','LI','FB','12:00','UAT-1']]}]};
const count=(await api('state')).body.posts.length;
assert.equal((await api('import','POST',{data:calendar,apply:false})).body.added,1);assert.equal((await api('state')).body.posts.length,count);
assert.equal((await api('import','POST',{data:calendar,apply:true})).body.added,1);
assert.equal((await api('import','POST',{data:calendar,apply:true})).body.added,0);
calendar.tabs[0].rows[1][4]='updated';assert.equal((await api('import','POST',{data:calendar,apply:true})).body.skipped,1);
const imported=(await api('state')).body.posts.find(p=>p.sourcePostId==='UAT-1');
assert.equal((await api('import','POST',{data:calendar,apply:true,overwrite:{[imported.id]:imported.revision}})).body.updated,1);
const retryId=(await api('posts','POST',{date:futureDate(),time:'12:00'})).body.id;
let retryPost=(await api('state')).body.posts.find(p=>p.id===retryId);
await api('posts/'+retryId,'PATCH',{...retryPost,platforms:['x'],content:{x:['retry fixture'],linkedin:'',facebook:''}});retryPost=(await api('state')).body.posts.find(p=>p.id===retryId);
assert.equal((await api(`posts/${retryId}/approve`,'POST',{revision:retryPost.revision,destinations,immediate:true})).status,200);
let retryJob=(await api('agent/packet')).body.jobs.find(j=>j.postId===retryId);
let lease=(await api(targetPath(retryJob)+'/claim','POST',{revision:retryJob.revision})).body.job.claim;
assert.equal((await api(targetPath(retryJob)+'/result','POST',{revision:retryJob.revision,claim:lease,outcome:'failed',note:'公開操作前に中止'})).status,200);
assert.equal((await api('targets/retry','POST',{id:retryJob.id})).status,200);
lease=(await api(targetPath(retryJob)+'/claim','POST',{revision:retryJob.revision})).body.job.claim;
assert.equal((await api(targetPath(retryJob)+'/result','POST',{revision:retryJob.revision,claim:lease,outcome:'unknown',note:'公開結果の確認が必要'})).status,200);
assert.equal((await api('targets/retry','POST',{id:retryJob.id})).status,409);
console.log('UAT HTTP: import preview/apply/reimport/optimistic overwrite, shared member data, failed retry and unknown retry denial passed');
