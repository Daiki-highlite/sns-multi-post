import { AppError, PLATFORM_NAMES } from "./domain.ts";
import { nativeScheduleIssue } from "./publication.ts";
import type { Destination, Media, Post, Target } from "./types.ts";
export const AGENT_LEASE_MS=15*60*1000;
export function executionTargets(post:Post,target:Target):Target[] {
  return post.approvedDeliveryMode==="browser_agent"&&target.platform==="x"&&target.payload.publicationMode==="scheduled"?(post.targets||[]).filter(t=>t.platform==="x"&&t.version===target.version).sort((a,b)=>a.sequence-b.sequence):[target];
}
export function agentJob(post:Post,target:Target,current:Destination[],media:Media[],origin:string,now=Date.now()) {
  const destination=post.approvedDestinations?.find(d=>d.platform===target.platform),intended=current.find(d=>d.platform===target.platform);
  const parent=target.parentId?post.targets?.find(t=>t.id===target.parentId):undefined;
  const native=post.approvedDeliveryMode==="browser_agent" && target.payload.publicationMode==="scheduled";
  const group=executionTargets(post,target),groupRootId=group.length>1?group[0]?.id:null;
  const operation=target.state==="scheduled"?"verify":native?"schedule":"publish";
  const blockers:string[]=[];
  const planned=Date.parse(target.scheduledAt),expired=!native&&Number.isFinite(planned)&&now-planned>10*60*1000;
  if(post.approvedVersion!==post.version || target.version!==post.version || post.approvedDeliveryMode!=="browser_agent")blockers.push("現在の原稿・投稿方法で再承認してください。");
  if(!destination || !intended || destination.url!==intended.url || target.payload.accountId!==`web:${destination.url}`)blockers.push("承認後に投稿先が変わりました。再承認してください。");
  if(!["queued","blocked"].includes(target.state))blockers.push(target.state==="published"?"公開済みです。再投稿しないでください。":target.state==="scheduled"?"SNSへの予約登録は完了しています。再登録せず公開結果を確認してください。":target.state==="sending"?"別の担当が作業中です。結果を確認してください。":"投稿結果の確認または再試行の指定が必要です。");
  if(groupRootId&&target.id!==groupRootId)blockers.push("Xの連投は親投稿からまとめて予約・確認してください。");
  if(group.length>1&&group.some(t=>t.scheduledAt!==target.scheduledAt))blockers.push("連投の予約日時が一致しません。再承認してください。");
  if(group.length>1&&["queued","blocked"].includes(target.state)&&group.some(t=>!["queued","blocked"].includes(t.state)))blockers.push("連投の作業状態を確認してください。再登録は行わないでください。");
  if(!Number.isFinite(planned))blockers.push("予定日時が不正です。原稿を確認してください。");
  if(native){const issue=nativeScheduleIssue({...post,platforms:[target.platform],plannedAt:target.scheduledAt},now);if(issue)blockers.push(issue);}
  else if(now<planned)blockers.push("投稿予定時刻まで実行できません。");
  if(!native&&target.parentId && (parent?.state!=="published" || !parent.url))blockers.push("親投稿の公開とURL記録が先に必要です。");
  if(target.payload.mediaIds.some(id=>!media.some(m=>m.id===id)))blockers.push("添付画像が見つかりません。");
  const canConfirmLate=expired && blockers.length===0;
  if(expired)blockers.push("予定から10分以上経過しています。本文中の日付・期限を確認して、今回の実行を指定してください。");
  return {groupRootId,parts:group.map(t=>({id:t.id,sequence:t.sequence,text:t.payload.text,mediaIds:t.payload.mediaIds})),operation,canVerifyPublication:target.state==="scheduled"&&Number.isFinite(planned)&&now>=planned,nativeSchedule:target.payload.nativeSchedule||null,canConfirmLate,requiresLateConfirmation:expired,id:target.id,postId:post.id,revision:post.revision,version:post.version,title:post.title,platform:target.platform,platformName:PLATFORM_NAMES[target.platform],sequence:target.sequence,state:target.state,plannedAt:target.scheduledAt,approvedBy:post.approvedBy,approvedAt:post.approvedAt,destination:destination||null,text:target.payload.text,media:target.payload.mediaIds.map(id=>({id,name:media.find(m=>m.id===id)?.name||id,url:`${origin}/api/media/${id}`})),replyTo:parent?.url||null,claim:target.claimedAt,blockers,canClaim:blockers.length===0};
}
export function scheduledEvidence(platform:Target["platform"],input:Record<string,unknown>,target:Target,destination:Destination|undefined,now=Date.now()) {
  if(input.accountConfirmed!==true || input.scheduleConfirmed!==true)throw new AppError("SNS上で本文・画像・投稿主体・予約日時の一致を確認してください。");
  if(typeof input.scheduledFor!=="string" || Date.parse(input.scheduledFor)!==Date.parse(target.scheduledAt))throw new AppError("SNSの予約日時と承認した日時が一致しません。");
  if(Date.parse(target.scheduledAt)<=now)throw new AppError("公開時刻を過ぎています。SNSの公開結果を確認してください。",409);
  if(typeof input.note!=="string" || !input.note.trim() || input.note.length>1000)throw new AppError("予約一覧で確認した内容を状況メモに記載してください。");
  let url:URL;try{url=new URL(String(input.scheduleUrl));}catch{throw new AppError("SNSの予約管理画面のURLを入力してください。");}
  if(url.protocol!=="https:" || url.username || url.password || url.port)throw new AppError("公式SNSの予約管理画面のURLを指定してください。");
  const valid=platform==="x"?["x.com","www.x.com"].includes(url.hostname)&&/^\/compose\/(?:post|tweet)\/unsent\/scheduled\/?$/.test(url.pathname):platform==="linkedin"?["linkedin.com","www.linkedin.com"].includes(url.hostname)&&url.pathname.startsWith(`/company/${destination?.accountId}/admin/`):["facebook.com","www.facebook.com","business.facebook.com"].includes(url.hostname)&&/^\/(?:professional_dashboard|latest)(?:\/|$)/.test(url.pathname);
  if(!valid)throw new AppError("指定したSNSの予約管理画面を開き、URLを確認してください。");
  return {url:url.href,plannedAt:target.scheduledAt,note:input.note.trim()};
}
export function publishedEvidence(platform:Target["platform"],input:unknown,destination:Destination|undefined) {
  let url:URL;try{url=new URL(String(input));}catch{throw new AppError("公開済みの投稿URLを入力してください。");}
  if(url.protocol!=="https:" || url.username || url.password || url.port)throw new AppError("公式SNSの公開済み投稿URLを指定してください。");
  let pathname:string;try{pathname=decodeURIComponent(url.pathname);}catch{throw new AppError("投稿URLの文字コードを確認してください。");}
  let id:string|undefined;
  if(platform==="x" && ["x.com","www.x.com","twitter.com","www.twitter.com"].includes(url.hostname)) {
    const match=pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/);
    if(match && match[1].toLowerCase()===destination?.username?.toLowerCase())id=match[2];
  }
  if(platform==="linkedin" && ["www.linkedin.com","linkedin.com"].includes(url.hostname))id=pathname.match(/^\/feed\/update\/urn:li:(?:activity|share):(\d+)\/?$/)?.[1] || pathname.match(/^\/posts\/[^/]+[-_]activity-(\d+)(?:-[^/]+)?\/?$/)?.[1];
  if(platform==="facebook" && ["www.facebook.com","facebook.com"].includes(url.hostname)) {
    if(pathname==="/permalink.php" && url.searchParams.get("id")===destination?.accountId)id=url.searchParams.get("story_fbid")||undefined;
    const path=pathname.match(/^\/(\d+)\/posts\/([A-Za-z0-9]+)\/?$/);if(path && path[1]===destination?.accountId)id=path[2];
  }
  if(!id || id.length>200)throw new AppError("指定したSNS・投稿先の投稿URLを確認してください。プロフィールURLや共有用の短縮URLは使えません。");
  return {id,url:url.href};
}
