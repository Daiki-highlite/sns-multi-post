import { AppError,plannedTime } from './domain.ts';
import type { Post } from './types.ts';
export type PublicationMode='immediate'|'scheduled';
export type ApprovalTiming={date:string;time:string;mode:PublicationMode};
export function timingFor(date:string,time:string,now=Date.now()):ApprovalTiming {
  return {date,time,mode:Date.parse(plannedTime(date,time))>now?'scheduled':'immediate'};
}
export function approvalTiming(post:Pick<Post,'date'|'time'|'plannedAt'>,input:{timing?:unknown;immediate?:unknown},now=Date.now()) {
  let mode:PublicationMode,plannedAt:string;
  if(input.timing!==undefined){
    const t=input.timing as ApprovalTiming;
    if(!t || typeof t!=='object' || !['immediate','scheduled'].includes(t.mode))throw new AppError('投稿日時と投稿方法を確認してください。');
    plannedAt=plannedTime(t.date,t.time);mode=t.mode;
    if(mode==='scheduled' && Date.parse(plannedAt)<=now)throw new AppError('指定時刻を過ぎました。投稿日時を確認してください。',409);
    if(mode==='immediate' && Date.parse(plannedAt)>now)throw new AppError('未来の日時は予約投稿で承認してください。');
  }else{
    mode=input.immediate===true?'immediate':'scheduled';plannedAt=plannedTime(post.date,post.time);
    if(mode==='scheduled'&&Date.parse(plannedAt)<=now)throw new AppError('公開日時をこれからの時刻に変更してください。');
  }
  const instant=new Date(now);
  return mode==='scheduled'?{mode,plannedAt,date:input.timing?(input.timing as ApprovalTiming).date:post.date,time:input.timing?(input.timing as ApprovalTiming).time:post.time}:{mode,plannedAt:instant.toISOString(),date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(instant),time:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(instant)};
}
export function nativeScheduleIssue(post:Pick<Post,'platforms'|'content'|'mediaIds'|'plannedAt'>,now=Date.now()) {
  const planned=Date.parse(post.plannedAt);
  if(!Number.isFinite(planned)||planned<=now)return '予約日時をこれからの時刻に変更してください。';
  if(post.platforms.includes('linkedin')){
    if(post.mediaIds.length>1)return 'LinkedIn会社ページでは複数画像を予約できません。画像を1枚にするか、LinkedInを外してください。';
    if(planned-now<60*60*1000)return 'LinkedIn会社ページの予約は1時間以上先を指定してください。';
    const latest=new Date(now);latest.setUTCMonth(latest.getUTCMonth()+3);
    if(planned>latest.getTime())return 'LinkedIn会社ページの予約は3か月以内を指定してください。';
  }
  return '';
}
