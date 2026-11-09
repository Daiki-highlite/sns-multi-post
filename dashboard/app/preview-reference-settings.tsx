"use client";
import { useState } from "react";
import { PLATFORMS, PLATFORM_NAMES } from "@/lib/domain";
import type { DashboardData } from "@/lib/types";
export default function PreviewReferenceSettings({data,onComplete}:{data:DashboardData;onComplete:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <section className="settings-panel"><details><summary>投稿シミュレーションの実画面参照</summary><p className="settings-description">各SNSの390px幅のヘッダーと、投稿先の実アイコンを登録します。画像はこのツールの利用者だけが閲覧できます。画面変更時に更新してください。</p>
    {PLATFORMS.map(platform=>{const reference=data.previewReferences?.find(r=>r.platform===platform);return <form key={platform} aria-label={`${PLATFORM_NAMES[platform]}の実画面参照`} className="connection-form" onSubmit={async event=>{event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);form.set("platform",platform);setBusy(true);setError("");try{const response=await fetch("/api/preview-references",{method:"POST",body:form});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"保存できませんでした。");await onComplete();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      <h3>{PLATFORM_NAMES[platform]}</h3><small>{reference?`実画面参照：${reference.capturedAt.slice(0,10)}`:"未登録"}</small>
      <label>実際の表示名<input name="name" required maxLength={100} defaultValue={reference?.name || ""}/></label>
      <label>背景<select name="theme" defaultValue={reference?.theme || (platform==="linkedin"?"light":"dark")}><option value="dark">ダーク</option><option value="light">ライト</option></select></label>
      <label>実画面のヘッダー（JPEG・PNG）<input name="header" aria-label={`${PLATFORM_NAMES[platform]} ヘッダー画像`} type="file" accept="image/jpeg,image/png" required/></label>
      <label>実プロフィール画像（JPEG・PNG）<input name="avatar" aria-label={`${PLATFORM_NAMES[platform]} プロフィール画像`} type="file" accept="image/jpeg,image/png" required/></label>
      <button className="button secondary" disabled={busy} type="submit">{PLATFORM_NAMES[platform]}の参照を保存</button>
    </form>;})}{error&&<p role="alert">{error}</p>}</details></section>;
}
