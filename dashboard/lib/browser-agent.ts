import { AppError, PLATFORM_NAMES } from "./domain.ts";
import type { Destination, Media, Post, Target } from "./types.ts";
export const AGENT_LEASE_MS=15*60*1000;
export function agentJob(post:Post,target:Target,current:Destination[],media:Media[],origin:string,now=Date.now()) {
  const destination=post.approvedDestinations?.find(d=>d.platform===target.platform),intended=current.find(d=>d.platform===target.platform);
  const parent=target.parentId?post.targets?.find(t=>t.id===target.parentId):undefined;
  const blockers:string[]=[];
  if(post.approvedVersion!==post.version || target.version!==post.version || post.approvedDeliveryMode!=="browser_agent")blockers.push("現在の原稿・投稿方法で再承認してください。");
  if(!destination || !intended || destination.url!==intended.url || target.payload.accountId!==`web:${destination.url}`)blockers.push("承認後に投稿先が変わりました。再承認してください。");
  if(!["queued","blocked"].includes(target.state))blockers.push(target.state==="published"?"公開済みです。再投稿しないでください。":target.state==="sending"?"別の担当が作業中です。結果を確認してください。":"投稿結果の確認または再試行の指定が必要です。");
  if(now<Date.parse(target.scheduledAt))blockers.push("投稿予定時刻まで実行できません。");
  if(!Number.isFinite(Date.parse(target.scheduledAt)) || now-Date.parse(target.scheduledAt)>10*60*1000)blockers.push("予定から10分以上経過しています。日時を確認して再承認してください。");
  if(target.parentId && (parent?.state!=="published" || !parent.url))blockers.push("親投稿の公開とURL記録が先に必要です。");
  if(target.payload.mediaIds.some(id=>!media.some(m=>m.id===id)))blockers.push("添付画像が見つかりません。");
  return {id:target.id,postId:post.id,revision:post.revision,version:post.version,title:post.title,platform:target.platform,platformName:PLATFORM_NAMES[target.platform],sequence:target.sequence,state:target.state,plannedAt:target.scheduledAt,approvedBy:post.approvedBy,approvedAt:post.approvedAt,destination:destination||null,text:target.payload.text,media:target.payload.mediaIds.map(id=>({id,name:media.find(m=>m.id===id)?.name||id,url:`${origin}/api/media/${id}`})),replyTo:parent?.url||null,claim:target.claimedAt,blockers,canClaim:blockers.length===0};
}
export function publishedEvidence(platform:Target["platform"],input:unknown,destination:Destination|undefined) {
  let url:URL;try{url=new URL(String(input));}catch{throw new AppError("公開済みの投稿URLを入力してください。");}
  if(url.protocol!=="https:" || url.username || url.password || url.port)throw new AppError("公式SNSの公開済み投稿URLを指定してください。");
  let id:string|undefined;
  if(platform==="x" && ["x.com","www.x.com","twitter.com","www.twitter.com"].includes(url.hostname)) {
    const match=url.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/);
    if(match && match[1].toLowerCase()===destination?.username?.toLowerCase())id=match[2];
  }
  if(platform==="linkedin" && ["www.linkedin.com","linkedin.com"].includes(url.hostname))id=url.pathname.match(/^\/feed\/update\/urn:li:(?:activity|share):(\d+)\/?$/)?.[1] || url.pathname.match(/^\/posts\/[^/]+-activity-(\d+)(?:-[^/]+)?\/?$/)?.[1];
  if(platform==="facebook" && ["www.facebook.com","facebook.com"].includes(url.hostname)) {
    if(url.pathname==="/permalink.php" && url.searchParams.get("id")===destination?.accountId)id=url.searchParams.get("story_fbid")||undefined;
    const path=url.pathname.match(/^\/(\d+)\/posts\/([A-Za-z0-9]+)\/?$/);if(path && path[1]===destination?.accountId)id=path[2];
  }
  if(!id || id.length>200)throw new AppError("指定したSNS・投稿先の投稿URLを確認してください。プロフィールURLや共有用の短縮URLは使えません。");
  return {id,url:url.href};
}
