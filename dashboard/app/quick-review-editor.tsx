"use client";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import twitterText from "twitter-text";
import { assertApprovable, plannedTime, PLATFORM_NAMES } from "@/lib/domain";
import type { Post } from "@/lib/types";

export default function QuickReviewEditor({post, onClose, onSave}: {post:Post;onClose:()=>void;onSave:(post:Post,defer:boolean,note:string,approve:boolean)=>Promise<void>}) {
  const [draft,setDraft]=useState<Post>(()=>structuredClone(post)),[note,setNote]=useState(post.reviewHold?.note || ""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const dialog=useRef<HTMLDialogElement>(null), taking=useRef(false);
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  const dirty=JSON.stringify(draft)!==JSON.stringify(post)||note!==(post.reviewHold?.note||"");
  const close=()=>{if(!taking.current&&(!dirty||window.confirm("保存していない修正を破棄して閉じますか？")))onClose();};
  const save=async(approve:boolean)=>{
    if(taking.current)return;
    if(approve)try{assertApprovable({...draft,plannedAt:plannedTime(draft.date,draft.time)});if(draft.platforms.includes("x")&&draft.content.x.some(text=>!twitterText.parseTweet(text).valid))throw new Error("Xの文字数を確認してください。");}catch(e){setError((e as Error).message);return;}
    taking.current=true;setBusy(true);setError("");
    try{await onSave(draft,!approve,note,approve);}catch(e){setError((e as Error).message);}finally{taking.current=false;setBusy(false);}
  };
  return <dialog ref={dialog} className="quick-editor" aria-labelledby="quick-editor-title" onCancel={event=>{event.preventDefault();close();}}>
    <header><div><small>QUICK EDIT</small><h2 id="quick-editor-title">この場で直して、次へ</h2><p>{post.title}</p></div><button onClick={close} disabled={busy} aria-label="修正画面を閉じる"><X size={22}/></button></header>
    <div className="quick-editor-body"><p className="quick-editor-intro">修正した本文を保存します。そのまま承認するか、メモを添えて保留できます。</p>
      <fieldset disabled={busy}>
        {draft.platforms.map(platform=><section key={platform}><h3>{PLATFORM_NAMES[platform]}</h3>{platform==="x"?draft.content.x.map((text,index)=><label key={index}>X 本文{draft.content.x.length>1?` ${index+1}`:""}<textarea rows={5} value={text} onChange={e=>setDraft(p=>({...p,content:{...p.content,x:p.content.x.map((v,i)=>i===index?e.target.value:v)}}))}/><small>{twitterText.parseTweet(text).weightedLength} / 280</small></label>):<label>{PLATFORM_NAMES[platform]} 本文<textarea rows={6} value={draft.content[platform]} onChange={e=>setDraft(p=>({...p,content:{...p.content,[platform]:e.target.value}}))}/></label>}</section>)}
        <div className="quick-editor-schedule"><label>投稿予定日<input type="date" value={draft.date} onChange={e=>setDraft(p=>({...p,date:e.target.value}))}/></label><label>時刻（日本時間）<input type="time" value={draft.time} onChange={e=>setDraft(p=>({...p,time:e.target.value}))}/></label></div>
        <label>保留メモ（任意）<textarea rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="残っている確認や修正点"/></label>
      </fieldset>
      {error&&<p className="quick-editor-error" role="alert">{error}</p>}
    </div>
    <footer><button className="button secondary" disabled={busy} onClick={()=>void save(false)}>保存してあとで</button><button className="button primary" disabled={busy} onClick={()=>void save(true)}><Check size={17}/>{busy?"保存しています…":"修正して承認"}</button></footer>
  </dialog>;
}
