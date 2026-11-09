import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalTiming,timingFor,nativeScheduleIssue} from '../lib/publication.ts';
import {agentJob,scheduledEvidence} from '../lib/browser-agent.ts';
import {makeTargetPayloads,statusOf} from '../lib/domain.ts';
import {activeHandoffJobs,type AgentPacket} from '../lib/agent-handoff.ts';
import type {Post,Target,Destination} from '../lib/types.ts';
const now=Date.parse('2026-11-09T12:00:00Z'),future='2026-11-11T03:00:00.000Z';
const destination:Destination={platform:'x',username:'uat_test',url:'https://x.com/uat_test',label:'test'};
const post={id:'p',date:'2026-11-11',time:'12:00',plannedAt:future,content:{x:['one','two'],linkedin:'LI',facebook:'FB'},platforms:['x'],mediaIds:[],version:2,revision:'r',approvedVersion:2,approvedDeliveryMode:'browser_agent',approvedDestinations:[destination],publicationMode:'scheduled'} as unknown as Post;
const targets=makeTargetPayloads(post,{x:'web:'+destination.url}).map(t=>({...t,postId:'p',version:2,state:'queued',scheduledAt:future,claimedAt:null,remoteId:null,url:null,error:null,attempts:0,updatedAt:future})) as Target[];
const p={...post,targets},job=(target=targets[0],at=now,source=p)=>agentJob(source,target,[destination],[],'https://local.test',at);
test('未来の日時は予約、現在・過去は今すぐとして明示する',()=>{
 assert.equal(timingFor('2026-11-10','00:00',now).mode,'scheduled');
 assert.equal(timingFor('2026-11-09','20:59',now).mode,'immediate');
 assert.equal(timingFor('2026-11-09','21:00',now).mode,'immediate');
});
test('承認日時は日本時間をUTCへ固定し、時刻経過で予約を即時投稿に変えない',()=>{
 const t=approvalTiming(post,{timing:{date:'2026-11-12',time:'00:15',mode:'scheduled'}},now);assert.equal(t.plannedAt,'2026-11-11T15:15:00.000Z');assert.equal(t.date,'2026-11-12');
 assert.throws(()=>approvalTiming(post,{timing:{date:'2026-11-09',time:'21:00',mode:'scheduled'}},now),/指定時刻/);
 assert.throws(()=>approvalTiming(post,{timing:{date:'2026-11-12',time:'00:15',mode:'immediate'}},now),/未来/);
 assert.equal(approvalTiming(post,{immediate:true},now).plannedAt,new Date(now).toISOString());
});
test('不正日時・投稿方法を承認前に拒否する',()=>{
 for(const timing of [null,{date:'bad',time:'12:00',mode:'scheduled'},{date:'2026-11-12',time:'12:00',mode:'other'}])assert.throws(()=>approvalTiming(post,{timing},now));
});
test('LinkedIn会社ページの予約条件を確認しX連投はまとめて扱う',()=>{
 assert.equal(nativeScheduleIssue(post,now),'');
 const li={...post,platforms:['linkedin'] as ['linkedin']};
 assert.match(nativeScheduleIssue({...li,plannedAt:new Date(now+30*60000).toISOString()},now),/1時間/);
 assert.match(nativeScheduleIssue({...li,plannedAt:'2027-03-01T00:00:00Z'},now),/3か月/);
 assert.match(nativeScheduleIssue({...li,mediaIds:['a','b']},now),/複数画像/);
});
test('未来でも今からSNS予約を引き受け、Xは親から全件をまとめて処理する',()=>{
 assert.equal(job().operation,'schedule');assert.equal(job().canClaim,true);assert.equal(job().parts.length,2);
 assert.equal(job(targets[1]).canClaim,false);assert.equal(job(targets[1]).groupRootId,targets[0].id);
 assert.equal(job(targets[0],Date.parse(future)-30*60000,{...p,platforms:['x','linkedin']}).canClaim,true);
 assert.equal(job(targets[0],Date.parse(future)+1).canClaim,false);assert.equal(job(targets[0],Date.parse(future)+1).canConfirmLate,false);
});
test('予約登録には一致した日時・公式管理URL・SNSでの照合を要求する',()=>{
 const input={accountConfirmed:true,scheduleConfirmed:true,scheduledFor:future,scheduleUrl:'https://x.com/compose/tweet/unsent/scheduled',note:'一覧で原稿と日時を照合'};
 assert.equal(scheduledEvidence('x',input,targets[0],destination,now).plannedAt,future);
 for(const changed of [{accountConfirmed:false},{scheduleConfirmed:false},{scheduledFor:'2026-11-11T04:00:00Z'},{scheduleUrl:destination.url},{scheduleUrl:'https://x.com.evil.test/compose/tweet/unsent/scheduled'},{note:''}])assert.throws(()=>scheduledEvidence('x',{...input,...changed},targets[0],destination,now));
 assert.throws(()=>scheduledEvidence('x',input,targets[0],destination,Date.parse(future)+1));
 const li={platform:'linkedin',accountId:'123',url:'https://www.linkedin.com/company/123/',label:'LI'} as Destination;
 assert.equal(scheduledEvidence('linkedin',{...input,scheduleUrl:'https://www.linkedin.com/company/123/admin/page-posts/published/'},targets[0],li,now).url.includes('/123/'),true);
 assert.throws(()=>scheduledEvidence('linkedin',{...input,scheduleUrl:'https://www.linkedin.com/company/999/admin/page-posts/published/'},targets[0],li,now));
});
test('時刻が過ぎても予約済みを公開済みにせず、再登録も許可しない',()=>{
 const scheduled={...p,targets:targets.map(t=>({...t,state:'scheduled' as const}))};
 assert.equal(statusOf(scheduled),'scheduled');assert.equal(job(scheduled.targets[0],now,scheduled).canClaim,false);
 assert.equal(job(scheduled.targets[0],now,scheduled).canVerifyPublication,false);
 assert.equal(job(scheduled.targets[0],Date.parse(future)+1,scheduled).canVerifyPublication,true);
 assert.equal(job(scheduled.targets[0],Date.parse(future)+1,scheduled).operation,'verify');
});
test('受け渡しはX親1件に連投全体を含み、予約済みは公開確認時だけ出す',()=>{
 const packet={schemaVersion:2,mode:'browser_agent',generatedAt:'now',harness:'url',jobs:targets.map(t=>job(t))} as AgentPacket;
 assert.equal(activeHandoffJobs(packet).length,1);assert.throws(()=>activeHandoffJobs(packet,[targets[1].id]));
 const scheduled={...p,targets:targets.map(t=>({...t,state:'scheduled' as const}))};
 assert.equal(activeHandoffJobs({...packet,jobs:scheduled.targets.map(t=>job(t,now,scheduled))}).length,0);
 assert.equal(activeHandoffJobs({...packet,jobs:scheduled.targets.map(t=>job(t,Date.parse(future)+1,scheduled))}).length,1);
});
