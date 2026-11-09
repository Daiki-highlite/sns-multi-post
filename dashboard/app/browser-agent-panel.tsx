"use client";
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, RefreshCw, Check, Play } from "lucide-react";
import type { DashboardData } from "@/lib/types";
import { requestJson } from "@/lib/client-api";
import { activeHandoffJobs,formatAgentHandoff,type AgentJob as Job,type AgentPacket as Packet } from "@/lib/agent-handoff";
async function call(path:string,body?:unknown){return requestJson(`/api/agent/${path}`,body!==undefined?"POST":"GET",body);}
function download(name:string,text:string,mime:string){const url=URL.createObjectURL(new Blob([text],{type:mime}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function BrowserAgentPanel({data,onComplete}:{data:DashboardData;onComplete:()=>Promise<unknown>}) {
  const [packet,setPacket]=useState<Packet|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");const taking=useRef(false);
  const load=async()=>{const next=await call("packet") as Packet;setPacket(next);return next;};
  useEffect(()=>{let active=true;void call("packet").then(next=>{if(active)setPacket(next);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[data.posts]);
  const run=async(fn:()=>Promise<void>)=>{if(taking.current)return;taking.current=true;setBusy(true);setError("");try{await fn();await load();await onComplete();}catch(e){setError((e as Error).message);try{await load();await onComplete();}catch{/* Keep the original error visible. */}}finally{taking.current=false;setBusy(false);}};
  const exportPacket=async(ids?:string[])=>{
    const latest=await load(),[harness,operations]=await Promise.all([fetch("/agent/HARNESS.md"),fetch("/agent/OPERATIONS.md")]);
    if(!harness.ok || !operations.ok)throw new Error("動作手順を読み込めませんでした。");
    download("sns-agent-handoff.md",formatAgentHandoff(latest,await harness.text(),await operations.text(),ids),"text/markdown;charset=utf-8");
  };
  const jobs=packet?activeHandoffJobs(packet):[];
  return <section className="agent-panel"><div className="agent-intro"><div><h2>承認した原稿を、SNS画面から投稿</h2><p>有料SNS APIは使いません。予定時刻にエージェントを起動し、ログイン済みのSNSで投稿します。画面を閉じたままの自動定時実行は行いません。</p></div><div className="agent-actions"><a className="button secondary" href="/agent/HARNESS.md" target="_blank" rel="noreferrer">手順を読む（md）<ExternalLink size={14}/></a><button className="button primary" disabled={busy||!jobs.length} onClick={()=>void run(()=>exportPacket())}><Download size={16}/>承認済み原稿と指示を渡す</button><button className="icon-button" aria-label="エージェントの一覧を更新" disabled={busy} onClick={()=>void run(async()=>{})}><RefreshCw size={16}/></button></div></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    <p className="agent-help">エージェントには、受け渡し用ファイルを読ませてこの画面から作業を引き受けさせてください。公開後はSNS上の本文・画像・投稿先と投稿URLを確認して記録します。</p>
    {!packet&&!error&&<p role="status">承認済みの作業を読み込んでいます…</p>}
    <div className="agent-jobs">{jobs.map(job=><article key={job.id} className="agent-job"><div className="agent-job-heading"><div><span>{job.platformName}{job.sequence>0?` 続き ${job.sequence+1}`:""}</span><h3>{job.title}</h3></div><small>{({queued:"実行待ち",blocked:"要確認",sending:"作業中",failed:"未投稿・再試行待ち",unknown:"結果を確認",published:"公開済み"})[job.state]}</small></div><p className="agent-job-time">{new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",dateStyle:"short",timeStyle:"short"}).format(new Date(job.plannedAt))} 日本時間</p>{job.destination&&<a href={job.destination.url} target="_blank" rel="noreferrer">{job.destination.label}<ExternalLink size={12}/></a>}<details><summary>送信する原稿と画像</summary><p className="agent-job-copy">{job.text}</p>{job.media.map(m=><a href={m.url} key={m.id} target="_blank" rel="noreferrer">添付画像：{m.name}<ExternalLink size={12}/></a>)}{job.replyTo&&<a href={job.replyTo} target="_blank" rel="noreferrer">返信先の親投稿<ExternalLink size={12}/></a>}</details>
      {["queued","blocked"].includes(job.state)&&<><p className="agent-job-reason">{job.blockers.join(" ")||"実行できます。投稿前に作業を引き受けてください。"}</p><ClaimAction job={job} busy={busy} onClaim={allowLate=>run(async()=>{await call(`targets/${encodeURIComponent(job.id)}/claim`,{revision:job.revision,allowLate});})}/></>}
      {["sending","unknown"].includes(job.state)&&<><p className="agent-job-reason">再投稿せず、SNS上の結果を確認してください。</p><button className="button secondary" disabled={busy} onClick={()=>void run(()=>exportPacket([job.id]))}><Download size={15}/>この作業の指示を渡す</button><Receipt job={job} busy={busy} onSave={input=>run(async()=>{await call(`targets/${encodeURIComponent(job.id)}/result`,{...input,revision:job.revision,claim:job.claim});})}/></>}
      {job.state==="failed"&&<button className="button secondary" disabled={busy} onClick={()=>void run(async()=>{await requestJson("/api/targets/retry","POST",{id:job.id});})}>未投稿を確認して再試行へ</button>}
    </article>)}{packet&&!jobs.length&&<div className="empty-state"><Check size={30}/><h3>エージェントへ渡す投稿はありません</h3><p>POSTで原稿を承認すると、ここに表示されます。</p></div>}</div>
  </section>;
}
function Receipt({job,busy,onSave}:{job:Job;busy:boolean;onSave:(input:Record<string,unknown>)=>Promise<void>}) {
  const [outcome,setOutcome]=useState("published"),[url,setUrl]=useState(""),[confirmed,setConfirmed]=useState(false),[note,setNote]=useState("");
  return <form className="agent-receipt" onSubmit={e=>{e.preventDefault();void onSave({outcome,url,accountConfirmed:confirmed,note});}}><label>作業結果<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="published">SNS上で公開を確認した</option><option value="unknown">結果が不明・再投稿を止める</option>{job.state!=="unknown"&&<option value="failed">公開操作前に中止した・未投稿</option>}</select></label>{outcome==="published"?<><label>公開済みの投稿URL<input type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label><label className="checkbox-label"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>SNS上で本文・画像・投稿先が承認内容と一致することを確認した</label></>:<label>状況メモ<textarea required maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>}<button type="submit" className="button primary" disabled={busy}>結果を記録</button></form>;
}

function ClaimAction({job,busy,onClaim}:{job:Job;busy:boolean;onClaim:(allowLate:boolean)=>Promise<void>}) {
  const [confirmed,setConfirmed]=useState(false);
  return <div className="agent-claim-action">{job.canConfirmLate&&<label className="checkbox-label"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>原稿中の日付・期限を確認したうえで、今から実行する</label>}<button className="button secondary" disabled={busy||(!job.canClaim&&!(job.canConfirmLate&&confirmed))} onClick={()=>void onClaim(job.canConfirmLate&&confirmed)}><Play size={15}/>{job.canConfirmLate?"確認して今から引き受ける":"作業を引き受ける"}</button></div>;
}
