import twitterText from "twitter-text";
import { AppError, assertApprovable, plannedTime, PLATFORMS } from "./domain.ts";
import { normalizeThreadContent } from "./thread-text.ts";
import type { Platform, Post } from "./types.ts";

export type BulkOptions = {
  entries: { id: string; revision: string }[];
  platforms: Platform[];
  dateMode: "keep" | "shift";
  startDate: string;
  anchorDate?: string;
  imageMode: "keep" | "text" | "shared";
  mediaIds: string[];
};
export type BulkEntry = { original: Post; draft: Post; errors: string[]; canSave: boolean };
export function bulkPlan(posts: Post[], options: BulkOptions, now = Date.now()): BulkEntry[] {
  if (!Array.isArray(options.entries) || !options.entries.length || options.entries.length > 300 || new Set(options.entries.map(p=>p.id)).size!==options.entries.length) throw new AppError("1〜300件の異なる投稿を選んでください。");
  if (!Array.isArray(options.platforms) || !options.platforms.length || options.platforms.some(p=>!PLATFORMS.includes(p))) throw new AppError("投稿先を選んでください。");
  if (!["keep","shift"].includes(options.dateMode) || !["keep","text","shared"].includes(options.imageMode) || !Array.isArray(options.mediaIds) || options.mediaIds.length>4 || options.mediaIds.some(v=>typeof v!=="string")) throw new AppError("共通設定を確認してください。");
  const byId = new Map(posts.map(p=>[p.id,p]));
  const selected = options.entries.map(entry=>{ const p=byId.get(entry.id);if(!p)throw new AppError("選択した投稿が見つかりません。再読み込みしてください。",409);return p; });
  const anchor=options.anchorDate||selected.map(p=>p.date).sort()[0];
  const shift=options.dateMode==="shift"?(Date.parse(plannedTime(options.startDate,"12:00"))-Date.parse(plannedTime(anchor,"12:00")))/86400000:0;
  return selected.map((original,index)=>{
    const errors:string[]=[];
    const canSave=original.revision===options.entries[index].revision && original.approvedVersion===null && !(original.targets??[]).some(t=>["sending","published","unknown"].includes(t.state));
    if(!canSave)errors.push("他の編集・承認があります。最新の状態を読み込んでください。");
    const date=shift?new Date(Date.parse(original.date+"T12:00:00Z")+shift*86400000).toISOString().slice(0,10):original.date;
    const draft:Post={...original,content:normalizeThreadContent(original.content),date,plannedAt:plannedTime(date,original.time),platforms:[...options.platforms].filter(p=>p==="x"?original.content.x.some(t=>t.trim()):!!original.content[p].trim()),mediaIds:options.imageMode==="text"?[]:options.imageMode==="shared"?[...options.mediaIds]:[...original.mediaIds],needsImage:options.imageMode==="text"?false:options.imageMode==="shared"?true:original.needsImage};
    try{assertApprovable(draft,now);}catch(e){errors.push((e as Error).message);}
    if(draft.platforms.includes("x") && draft.content.x.some(t=>!twitterText.parseTweet(t).valid))errors.push("Xの本文が文字数などの条件を満たしていません。");
    return {original,draft,errors,canSave};
  });
}
