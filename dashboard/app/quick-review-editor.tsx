"use client";
import { useEffect, useRef, useState } from "react";
import { Check, X, Upload } from "lucide-react";
import twitterText from "twitter-text";
import { assertApprovable, plannedTime, PLATFORM_NAMES, PLATFORMS } from "@/lib/domain";
import { normalizeThreadContent } from "@/lib/thread-text";
import PublicationTimePicker from "./publication-time-picker";
import { timingFor,nativeScheduleIssue } from "@/lib/publication";
import type { Media, Post } from "@/lib/types";

export default function QuickReviewEditor({post, browserAgent=true,media, onUpload, initialIssue="", onClose, onSave}: {post:Post;browserAgent?:boolean;media:Media[];onUpload:(file:File)=>Promise<string>;initialIssue?:string;onClose:()=>void;onSave:(post:Post,defer:boolean,note:string,approve:boolean)=>Promise<void>}) {
  const [draft,setDraft]=useState<Post>(()=>structuredClone(post)),[note,setNote]=useState(post.reviewHold?.note || ""),[busy,setBusy]=useState(false),[error,setError]=useState(initialIssue);
  const dialog=useRef<HTMLDialogElement>(null), taking=useRef(false), editorBody=useRef<HTMLDivElement>(null);
  const showError=(message:string)=>{setError(message);editorBody.current?.scrollTo({top:0,behavior:"auto"});};
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  const dirty=JSON.stringify(draft)!==JSON.stringify(post)||note!==(post.reviewHold?.note||"");
  const close=()=>{if(!taking.current&&(!dirty||window.confirm("保存していない修正を破棄して閉じますか？")))onClose();};
  const save=async(approve:boolean)=>{
    if(taking.current)return;
    let candidate:Post;
    try{candidate={...draft,publicationMode:draft.publicationMode||timingFor(draft.date,draft.time).mode,plannedAt:plannedTime(draft.date,draft.time),content:normalizeThreadContent(draft.content)};
      if(approve){assertApprovable(candidate,candidate.publicationMode==="immediate"?-1:Date.now());if(browserAgent&&candidate.publicationMode==="scheduled"){const issue=nativeScheduleIssue(candidate);if(issue)throw new Error(issue);}if(candidate.platforms.includes("x")&&candidate.content.x.some(text=>!twitterText.parseTweet(text).valid))throw new Error("Xの文字数を確認してください。");}
    }catch(e){showError((e as Error).message);return;}
    taking.current=true;setBusy(true);setError("");
    try{await onSave(candidate,!approve,note,approve);}catch(e){showError((e as Error).message);}finally{taking.current=false;setBusy(false);}
  };
  const withImage=draft.needsImage || draft.mediaIds.length>0;
  const upload=async(file:File)=>{
    if(taking.current || draft.mediaIds.length>=4)return;
    taking.current=true;setBusy(true);setError("");
    try{const id=await onUpload(file);setDraft(p=>({...p,needsImage:true,mediaIds:[...p.mediaIds,id].slice(0,4)}));}catch(e){showError((e as Error).message);}finally{taking.current=false;setBusy(false);}
  };
  return <dialog ref={dialog} className="quick-editor" aria-labelledby="quick-editor-title" onCancel={event=>{event.preventDefault();close();}}>
    <header><div><small>QUICK EDIT</small><p id="quick-editor-title">{post.title}</p></div><button onClick={close} disabled={busy} aria-label="修正画面を閉じる"><X size={22}/></button></header>
    <div className="quick-editor-body" ref={editorBody}><p className="quick-editor-intro">修正した本文を保存します。そのまま承認するか、メモを添えて保留できます。</p>
      {error&&<p className="quick-editor-error quick-editor-validation" role="alert">{error}</p>}
      <fieldset disabled={busy}>
        <PublicationTimePicker date={draft.date} time={draft.time} mode={draft.publicationMode} disabled={busy} onChange={(date,time,plannedAt,publicationMode)=>{setDraft(p=>({...p,date,time,plannedAt,publicationMode}));setError("");}}/>
        <section className="quick-platform-options"><h3>投稿先</h3><div>{PLATFORMS.map(platform=><label key={platform}><input type="checkbox" checked={draft.platforms.includes(platform)} onChange={event=>{setDraft(p=>({...p,platforms:event.target.checked?[...p.platforms,platform]:p.platforms.filter(value=>value!==platform)}));setError("");}}/>{PLATFORM_NAMES[platform]}</label>)}</div></section>
        <section className="quick-image-options" aria-labelledby="quick-image-heading"><h3 id="quick-image-heading">投稿画像</h3>
          <div className="quick-image-modes"><label><input type="radio" name="quick-image-mode" checked={withImage} onChange={()=>{setDraft(p=>({...p,needsImage:true}));setError("");}}/>画像あり</label><label><input type="radio" name="quick-image-mode" checked={!withImage} onChange={()=>{setDraft(p=>({...p,needsImage:false,mediaIds:[]}));setError("");}}/>画像なしで投稿する</label></div>
          {withImage&&<><p className="quick-image-hint">{draft.mediaIds.length?`${draft.mediaIds.length} / 4枚を添付` : "画像が未登録です。追加するか「画像なしで投稿する」を選んでください。"}</p>
            <label className="quick-image-upload"><Upload size={16}/>{busy?"アップロードしています…":"画像を追加"}<input type="file" accept="image/jpeg,image/png" disabled={busy||draft.mediaIds.length>=4} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value="";}}/></label>
            {media.length>0&&<div className="quick-image-library" aria-label="共有画像から選ぶ">{media.map(item=><button type="button" key={item.id} aria-label={`${item.name}を添付`} aria-pressed={draft.mediaIds.includes(item.id)} disabled={!draft.mediaIds.includes(item.id)&&draft.mediaIds.length>=4} onClick={()=>{setDraft(p=>({...p,needsImage:true,mediaIds:p.mediaIds.includes(item.id)?p.mediaIds.filter(id=>id!==item.id):[...p.mediaIds,item.id]}));setError("");}}><img src={`/api/media/${item.id}`} alt={item.name}/>{draft.mediaIds.includes(item.id)&&<Check size={18}/>}</button>)}</div>}
          </>}
        </section>
        {draft.platforms.map(platform=><section key={platform}><h3>{PLATFORM_NAMES[platform]}</h3>{platform==="x"?draft.content.x.map((text,index)=><label key={index}>X 本文{draft.content.x.length>1?` ${index+1}`:""}<textarea rows={5} value={text} onChange={e=>setDraft(p=>({...p,content:{...p.content,x:p.content.x.map((v,i)=>i===index?e.target.value:v)}}))}/><small>{twitterText.parseTweet(text).weightedLength} / 280</small></label>):<label>{PLATFORM_NAMES[platform]} 本文<textarea rows={6} value={draft.content[platform]} onChange={e=>setDraft(p=>({...p,content:{...p.content,[platform]:e.target.value}}))}/></label>}</section>)}

        <label>保留メモ（任意）<textarea rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="残っている確認や修正点"/></label>
      </fieldset>
    </div>
    <footer><button className="button secondary" disabled={busy} onClick={()=>void save(false)}>保存してあとで</button><button className="button primary" disabled={busy} onClick={()=>void save(true)}><Check size={17}/>{busy?"保存しています…":draft.publicationMode==="scheduled"?"保存して予約を承認":"保存して今すぐ投稿を承認"}</button></footer>
  </dialog>;
}
