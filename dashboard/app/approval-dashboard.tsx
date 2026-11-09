"use client";

import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { AlertCircle, Check, CheckCheck, Clock3, Loader2, RotateCcw, X } from "lucide-react";
import twitterText from "twitter-text";
import { assertApprovable, statusOf } from "@/lib/domain";
import { approvalAccounts } from "@/lib/delivery";
import { reviewIsCurrent, swipeDecision, type SwipeAction } from "@/lib/swipe";
import type { Connection, DashboardData, Destination, Platform, Post } from "@/lib/types";
import QuickReviewEditor from "./quick-review-editor";
import PlatformMobilePreview from "./platform-mobile-preview";

type Destinations = Partial<Record<Platform, string>>;
type Review = { post: Post; destinations: Destinations; connections: Connection[]; intended: Destination[] };
type Previous = { review: Review; action: SwipeAction; approved?: Post; saved?: Post };
const keyOf = (post: Post) => `${post.id}:${post.revision}`;
const dateLabel = (date: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short",
}).format(new Date(`${date}T12:00:00+09:00`));

function approvalIssue(post: Post) {
  try {
    assertApprovable(post);
    if (post.platforms.includes("x") && post.content.x.some(text => !twitterText.parseTweet(text).valid)) return "Xの文字数を確認してください。";
    return "";
  } catch (error) { return (error as Error).message; }
}

export default function ApprovalDashboard({ data, busy, onApprove, onUndo, onSave, onUpload }: {
  data: DashboardData; busy: boolean;
  onApprove: (post: Post, destinations: Destinations) => Promise<Post>;
  onUndo: (post: Post) => Promise<Post>;
  onSave: (post: Post, defer: boolean, note: string) => Promise<Post>;
  onUpload: (file: File) => Promise<string>;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [heldMode, setHeldMode] = useState(false), [editorOpen,setEditorOpen] = useState(false), [editorIssue,setEditorIssue] = useState("");
  const [handled, setHandled] = useState<string[]>([]);
  const [previous, setPrevious] = useState<Previous | null>(null);
  const [saving, setSaving] = useState(false), [exit, setExit] = useState<SwipeAction | null>(null);
  const [drag, setDrag] = useState(0), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const taking = useRef(false), card = useRef<HTMLElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; dx: number; dy: number; dragging: boolean } | null>(null);
  const focusNext = useRef(false);
  const snapshot = (post: Post): Review => ({ post, destinations: approvalAccounts(data.connections,data.destinations || [],data.deliveryMode), connections: data.connections, intended:data.destinations??[] });
  const now = Date.now();
  const pending = data.posts.filter(post => statusOf(post) === "review").sort((a, b) => {
    const pastA = Date.parse(a.plannedAt) <= now, pastB = Date.parse(b.plannedAt) <= now;
    return Number(pastA) - Number(pastB) || a.plannedAt.localeCompare(b.plannedAt) || a.title.localeCompare(b.title);
  });
  const available = pending.filter(post => (heldMode ? !!post.reviewHold : !post.reviewHold) && !handled.includes(keyOf(post)));
  const held = pending.filter(post => !!post.reviewHold).length;
  const counts = {
    review: pending.length,
    approved: data.posts.filter(post => ["approved", "blocked", "sending"].includes(statusOf(post))).length,
    published: data.posts.filter(post => statusOf(post) === "published").length,
    attention: data.posts.filter(post => ["failed", "unknown", "partial"].includes(statusOf(post))).length,
  };
  useEffect(() => {
    if (!review && available.length) setReview(snapshot(available[0]));
  }, [review, data.posts, data.connections, heldMode, handled]);
  useEffect(() => {
    if (review && focusNext.current) { card.current?.focus({ preventScroll: true }); focusNext.current = false; }
  }, [review]);
  const stale = !!review && (!reviewIsCurrent(review.post, data.posts.find(post => post.id === review.post.id), review.destinations, Object.entries(approvalAccounts(data.connections,data.destinations || [],data.deliveryMode)).map(([platform,accountId])=>({platform:platform as Platform,accountId,label:"",configured:true}))) || JSON.stringify(review.intended)!==JSON.stringify(data.destinations??[]));
  const issue = review ? approvalIssue(review.post) : "";
  const locked = busy || saving;
  const decide = async (action: SwipeAction, keyboard = false) => {
    if (!review || taking.current || busy) return;
    if (action === "defer") { setDrag(0); setError(""); setEditorIssue(""); setEditorOpen(true); return; }
    if (action === "approve" && stale) { setError("原稿や投稿先が更新されました。最新の内容を確認してください。"); setDrag(0); return; }
    if (action === "approve" && issue) { setDrag(0); setError(""); setEditorIssue(issue); setEditorOpen(true); return; }
    taking.current = true; setSaving(true); setExit(action); setError(""); setNotice("");
    try {
      const result = action === "approve" ? await onApprove(review.post, review.destinations) : undefined;
      await new Promise(resolve => setTimeout(resolve, 180));
      if (action === "approve") setHandled(keys => [...keys, keyOf(review.post)]);

      setPrevious({ review, action, approved: result });
      setNotice(action === "approve" ? "承認を保存しました" : "あとで確認する投稿に残しました");
      focusNext.current = keyboard; setReview(null);
    } catch (failure) { setError((failure as Error).message); }
    finally { taking.current = false; setSaving(false); setExit(null); setDrag(0); }
  };
  const undo = async () => {
    if (!previous || taking.current || busy) return;
    taking.current = true; setSaving(true); setError("");
    try {
      const restored = previous.action === "approve" && previous.approved ? await onUndo(previous.approved) : previous.saved ? await onSave(previous.saved, false, "") : undefined;
      if (!restored || statusOf(restored) !== "review") throw new Error("この投稿は更新されました。最新の状態を確認してください。");
      const key = keyOf(previous.review.post);
      setHandled(keys => keys.filter(item => item !== key && item !== (previous.saved && keyOf(previous.saved))));
      setReview(snapshot(restored)); setPrevious(null); setDrag(0); setNotice(previous.action === "approve" ? "承認を取り消しました" : "前の投稿に戻りました");
    } catch (failure) { setError((failure as Error).message); }
    finally { taking.current = false; setSaving(false); }
  };
  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (locked || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("button,a,input,textarea,select,summary,[contenteditable]")) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, dragging: false };
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = pointer.current; if (!start || start.id !== event.pointerId || locked) return;
    start.dx = event.clientX - start.x; start.dy = event.clientY - start.y;
    if (!start.dragging && Math.abs(start.dx) > 12 && Math.abs(start.dx) > Math.abs(start.dy) * 1.4) {
      start.dragging = true; event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (start.dragging) setDrag(start.dx);
  };
  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = pointer.current; pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!start || start.id !== event.pointerId || !start.dragging) { setDrag(0); return; }
    const action = swipeDecision(start.dx, start.dy, event.currentTarget.getBoundingClientRect().width);
    if (action) void decide(action); else setDrag(0);
  };

  return <section className="approval-dashboard swipe-dashboard" aria-label="投稿のクイック承認">
    <dl className="approval-counts" aria-label="投稿の件数">
      {([["review", "承認待ち"], ["approved", "承認済み"], ["published", "公開済み"], ["attention", "要確認"]] as const).map(([key, label]) =>
        <div key={key} className={key === "review" ? "current" : ""}><dt>{label}</dt><dd>{counts[key]}<small>件</small></dd></div>
      )}
    </dl>
    <div className="swipe-workspace">
      <div className="swipe-queue-heading"><h2>投稿をチェック</h2><span>{heldMode ? "保留を確認中" : `残り ${available.length}件`}{(heldMode || held > 0) && <button className="held-queue-button" disabled={locked} onClick={()=>{setHeldMode(v=>!v);setReview(null);setHandled([]);setPrevious(null);}}>{heldMode ? "未確認に戻る" : `保留 ${held}件を見る`}</button>}</span></div>
      <div className="swipe-feedback" aria-live="polite" role={error ? "alert" : "status"}>{error || notice || "右へスワイプで承認、左へスワイプであとで確認"}</div>
      {review ? <div className={`swipe-stack ${locked ? "is-saving" : ""}`}>
        <div className="swipe-under-card" aria-hidden="true" />
        <article key={keyOf(review.post)} ref={card} tabIndex={0} aria-label={`${review.post.title}。右矢印で承認、左矢印で保留`} aria-busy={saving} className={`swipe-card ${drag ? "is-dragging" : ""} ${exit ? `is-exiting-${exit}` : ""}`} style={{ "--drag-x": `${drag}px`, "--drag-rotation": `${drag / 30}deg` } as CSSProperties}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { pointer.current = null; setDrag(0); }}
          onKeyDown={event => { if (event.target !== event.currentTarget || event.repeat || event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); void decide(event.key === "ArrowRight" ? "approve" : "defer", true); }}>
          {Math.abs(drag) > 30 && <div className={`swipe-stamp ${drag > 0 ? "approve" : "defer"}`} aria-hidden="true">{drag > 0 ? "承認" : "あとで"}</div>}
          <header className="swipe-card-heading"><span>{review.post.category}</span><h3>{review.post.title}</h3><p><Clock3 size={14} /><time dateTime={review.post.plannedAt}>{dateLabel(review.post.date)} {review.post.time}</time><small>日本時間</small></p></header>
          <PlatformMobilePreview post={review.post} connections={review.connections} intended={review.intended} references={data.previewReferences || []} browserAgent={data.deliveryMode!=="api"} />
          <div className="swipe-card-note" id={review ? `approval-note-${review.post.id}` : undefined}>
            {review.post.reviewHold && <p className="review-hold-note">保留メモ：{review.post.reviewHold.note || "メモなし"}</p>}
            {stale ? <div className="swipe-issue"><AlertCircle size={16} /><span>原稿や投稿先が更新されました。</span><button disabled={locked} onClick={() => { const latest = data.posts.find(post => post.id === review.post.id); setReview(latest && statusOf(latest) === "review" ? snapshot(latest) : null); setError(""); }}>最新を確認</button></div> : issue ? <div className="swipe-issue"><AlertCircle size={16} /><span>{issue}<small>あとでを押すと、その場で本文・日時を修正できます。</small></span></div> : <p>✓で、この原稿・投稿先・日時を承認します。</p>}
            {data.deliveryMode!=="api" ? <p className="swipe-connection-note">承認後、AIエージェントがSNS画面で投稿します。実行はADMINから。</p> : (!data.schedulerReady || review.post.platforms.some(platform => !review.destinations[platform])) && <p className="swipe-connection-note">SNS・予約実行は設定待ちです。接続後に再承認してください。</p>}
          </div>
        </article>
        {saving && <div className="swipe-saving" role="status"><Loader2 size={22} className="spin" />{exit === "approve" ? "承認を保存しています" : "処理しています"}</div>}
      </div> : <div className="swipe-complete"><CheckCheck size={36} /><h3>{heldMode ? "保留した投稿を確認しました" : held ? "ひと通り確認しました" : "承認待ちの投稿はありません"}</h3><p>{heldMode ? "未確認の投稿へ戻って、続きを確認できます。" : held ? `${held}件は、あとで確認する投稿として残っています。` : "新しい原稿が登録されると、ここに表示されます。"}</p>{heldMode && <button className="button secondary" disabled={locked} onClick={()=>{setHeldMode(false);setHandled([]);setNotice("");}}>未確認の投稿に戻る</button>}{!heldMode && held > 0 && <button className="button secondary" disabled={locked} onClick={() => { setHeldMode(true); setHandled([]); setNotice(""); }}>保留した投稿をもう一度</button>}</div>}
      <div className="swipe-controls" aria-label="カードの操作">
        <div><button className="swipe-control undo" disabled={locked || !previous} aria-label="ひとつ前の操作を取り消す" title="ひとつ前の操作を取り消す" onClick={undo}><RotateCcw size={21} /></button><span>ひとつ戻る</span></div>
        <div><button className="swipe-control defer" disabled={locked || !review} aria-label="この投稿を修正または保留する" title="修正または保留" onClick={() => void decide("defer")}><X size={29} /></button><span>あとで</span></div>
        <div><button className="swipe-control approve" disabled={locked || !review} aria-label="この投稿を承認して次へ" aria-describedby={review ? `approval-note-${review.post.id}` : undefined} title={issue || (stale ? "最新の原稿を確認してください" : "承認して次へ")} onClick={() => void decide("approve")}><Check size={32} /></button><span>承認</span></div>
      </div>
    </div>
    {editorOpen && review && <QuickReviewEditor key={keyOf(review.post)} post={review.post} media={data.media} onUpload={onUpload} initialIssue={editorIssue} onClose={()=>setEditorOpen(false)} onSave={async(draft,defer,note,approve)=>{
      if(taking.current || busy) return;
      if(stale) throw new Error("別の人が更新しました。画面を閉じて最新の原稿を確認してください。入力内容はこの画面に残っています。");
      taking.current=true;setSaving(true);setError("");
      let saved:Post|undefined;
      try {
        saved=await onSave(draft,defer,note);
        const result=approve?await onApprove(saved,review.destinations):undefined;
        setHandled(keys=>[...keys,keyOf(review.post),keyOf(saved!)]);
        setPrevious({review,action:approve?"approve":"defer",approved:result,saved});
        setNotice(approve?"修正内容を保存して承認しました":"修正内容と保留メモを共有保存しました");
        setEditorOpen(false);setReview(null);
      } catch(failure) {
        if(saved){setEditorOpen(false);setReview(snapshot(saved));setError(`本文は保存済みです。承認は完了していません。${(failure as Error).message}`);}
        else throw failure;
      } finally { taking.current=false;setSaving(false); }
    }}/>}
  </section>;
}
