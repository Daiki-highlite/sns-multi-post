import test from "node:test";
import assert from "node:assert/strict";
import { agentJob, publishedEvidence } from "../lib/browser-agent.ts";
import { approvalAccounts } from "../lib/delivery.ts";
import type { Destination, Post, Target } from "../lib/types.ts";
const destination:Destination={platform:"x",url:"https://x.com/test_account",username:"test_account",label:"test"};
const now=Date.parse("2027-01-01T00:00:00Z");
const target={id:"p:v1:x:0",postId:"p",version:1,platform:"x",sequence:0,state:"queued",scheduledAt:new Date(now).toISOString(),parentId:null,claimedAt:null,remoteId:null,url:null,error:null,attempts:0,updatedAt:new Date(now).toISOString(),payload:{text:"承認した本文",mediaIds:[],accountId:`web:${destination.url}`}} as Target;
const post={id:"p",version:1,revision:"r1",approvedVersion:1,approvedDeliveryMode:"browser_agent",approvedDestinations:[destination],targets:[target]} as Post;
const job=(p=post,t=target,current=[destination],at=now)=>agentJob(p,t,current,[],"https://example.test",at);
test("ブラウザー方式はAPI認証なしで承認時のURLを固定する",()=>{
 assert.deepEqual(approvalAccounts([], [destination]),{x:`web:${destination.url}`});
 assert.equal(job().canClaim,true);assert.equal(job().text,target.payload.text);
 assert.equal(job({...post,approvedVersion:null}).canClaim,false);
 assert.equal(job({...post,approvedDeliveryMode:"api"}).canClaim,false);
});
test("投稿先変更・未来の予定・期限切れの実行を止める",()=>{
 assert.equal(job(post,target,[{...destination,url:"https://x.com/other"}]).canClaim,false);
 assert.equal(job(post,target,[destination],now-1).canClaim,false);
 assert.equal(job(post,target,[destination],now+600001).canClaim,false);
});
test("作業中・不明・公開済みと親投稿未確認では再投稿しない",()=>{
 for(const state of ["sending","unknown","published"] as const)assert.equal(job(post,{...target,state}).canClaim,false);
 const child={...target,id:"p:v1:x:1",sequence:1,parentId:target.id};assert.equal(job(post,child).canClaim,false);
 assert.equal(job({...post,targets:[{...target,state:"published",url:"https://x.com/test_account/status/123"}]},child).replyTo,"https://x.com/test_account/status/123");
 assert.equal(job({...post,targets:[{...target,state:"published",url:"https://x.com/test_account/status/123"}]},child).canClaim,true);
});
test("添付画像不足では実行せず、URLから別アカウントへの投稿を検出する",()=>{
 assert.equal(job(post,{...target,payload:{...target.payload,mediaIds:["missing"]}}).canClaim,false);
 assert.deepEqual(publishedEvidence("x","https://x.com/test_account/status/123",destination),{id:"123",url:"https://x.com/test_account/status/123"});
 for(const url of ["https://x.com/other/status/123","https://x.com/test_account","https://x.com.evil.test/test_account/status/123","http://x.com/test_account/status/123"])assert.throws(()=>publishedEvidence("x",url,destination));
});
test("会社・ページの正式な投稿URLだけを公開証拠にする",()=>{
 assert.equal(publishedEvidence("linkedin","https://www.linkedin.com/feed/update/urn:li:activity:123/",undefined).id,"123");
 assert.equal(publishedEvidence("linkedin","https://www.linkedin.com/posts/test-activity-123-abc",undefined).id,"123");
 const fb:Destination={platform:"facebook",accountId:"123",url:"https://www.facebook.com/profile.php?id=123",label:"page"};
 assert.equal(publishedEvidence("facebook","https://www.facebook.com/permalink.php?story_fbid=pfbidExample&id=123",fb).id,"pfbidExample");
 assert.throws(()=>publishedEvidence("facebook","https://www.facebook.com/permalink.php?story_fbid=pfbidExample&id=999",fb));
 assert.throws(()=>publishedEvidence("facebook","https://www.facebook.com/share/p/abc",fb));
});
