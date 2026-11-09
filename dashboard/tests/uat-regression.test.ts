import test from 'node:test';
import assert from 'node:assert/strict';
import {assertApprovable,importedPosts,plannedTime,makeTargetPayloads} from '../lib/domain.ts';
import {publishedEvidence,agentJob} from '../lib/browser-agent.ts';
import {formatAgentHandoff,activeHandoffJobs,type AgentPacket} from '../lib/agent-handoff.ts';
import {readApiResponse} from '../lib/client-api.ts';
import type {Post,Target,Destination} from '../lib/types.ts';
const d:Destination={platform:'x',url:'https://x.com/uat_test',username:'uat_test',label:'test'};
const now=Date.now(),t={id:'t',postId:'p',version:1,platform:'x',sequence:0,state:'queued',scheduledAt:new Date(now-11*60000).toISOString(),parentId:null,remoteId:null,url:null,error:null,attempts:0,claimedAt:null,updatedAt:new Date(now).toISOString(),payload:{text:'saved',mediaIds:[],accountId:`web:${d.url}`}} as Target;
const p={id:'p',version:1,revision:'new',approvedVersion:1,approvedDeliveryMode:'browser_agent',approvedDestinations:[d],targets:[t],platforms:['x'],content:{x:['saved'],linkedin:'',facebook:''},mediaIds:[],needsImage:false} as unknown as Post;
test('不正日時と壊れた取込行は承認・変更前に拒否する',()=>{
 assert.throws(()=>plannedTime(null as any,'12:00'));
 assert.throws(()=>assertApprovable({...p,plannedAt:'not-a-date'},0),/日時/);
 assert.throws(()=>importedPosts({spreadsheetId:'uat_calendar_id',tabs:[{name:'test',sheetId:1,rows:[null as any]}]}),/各行/);
});
test('遅延実行は明示確認可能だが親未公開・未来・送信中は解除しない',()=>{
 const job=(post=p,target=t)=>agentJob(post,target,[d],[],'https://example.test',now);
 assert.equal(job().canClaim,false);assert.equal(job().canConfirmLate,true);
 assert.equal(job(p,{...t,parentId:'missing'}).canConfirmLate,false);
 assert.equal(job(p,{...t,state:'sending'}).canConfirmLate,false);
 assert.equal(job(p,{...t,scheduledAt:new Date(now+60000).toISOString()}).canConfirmLate,false);
 assert.equal(job(p,{...t,scheduledAt:'invalid'}).canConfirmLate,false);
});
test('LinkedInの正式URLはエンコード・会社投稿形式に対応する',()=>{
 for(const url of ['https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A123/','https://www.linkedin.com/posts/company_activity-123-abc'])assert.equal(publishedEvidence('linkedin',url,undefined).id,'123');
 assert.throws(()=>publishedEvidence('linkedin','https://www.linkedin.com/feed/update/%ZZ',undefined));
});
test('指示MDには最新の本文・版と操作手順をまとめ、公開済みを除く',()=>{
 const job=agentJob(p,t,[d],[],'https://example.test',now);
 const packet={schemaVersion:1,mode:'browser_agent',generatedAt:'now',harness:'url',jobs:[job,{...job,id:'done',state:'published'}]} as AgentPacket;
 assert.equal(activeHandoffJobs(packet).length,1);
 const md=formatAgentHandoff({...packet,jobs:[{...job,text:'fresh ``` text'}]},'HARNESS','OPERATIONS',[job.id]);
 assert.ok(md.includes('HARNESS')&&md.includes('OPERATIONS'));assert.ok(md.includes('fresh \\u0060\\u0060\\u0060 text'));assert.ok(md.includes('"revision": "new"'));
 assert.throws(()=>formatAgentHandoff(packet,'a','b',['done']),/更新/);
 assert.throws(()=>formatAgentHandoff({...packet,jobs:[]},'a','b'),/未完了/);
});
test('ログイン期限・非JSON応答も利用者が読める案内にする',async()=>{
 await assert.rejects(readApiResponse(new Response('<html>signin</html>',{status:401})),/ログイン/);
 await assert.rejects(readApiResponse(new Response('unavailable',{status:503})),/最新の状態/);
 await assert.rejects(readApiResponse(Response.json({error:'別の担当が更新しました'},{status:409})),/別の担当/);
 assert.deepEqual(await readApiResponse(Response.json({ok:true})),{ok:true});
});

test('3件以上の連投でも直前の自己投稿だけを返信先とし画像を重複しない',()=>{
 const targets=makeTargetPayloads({...p,id:'chain',version:3,plannedAt:new Date(now).toISOString(),content:{x:['one','two','three'],linkedin:'',facebook:''},mediaIds:['image']},{x:'web:'+d.url});
 assert.equal(targets.length,3);assert.equal(targets[1].parentId,targets[0].id);assert.equal(targets[2].parentId,targets[1].id);
 assert.deepEqual(targets.map(t=>t.payload.mediaIds),[['image'],[],[]]);
});
