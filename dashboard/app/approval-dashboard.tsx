"use client";

import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { AlertCircle, Check, CheckCheck, Clock3, Images, Loader2, RotateCcw, X } from "lucide-react";
import twitterText from "twitter-text";
import { assertApprovable, PLATFORM_NAMES, statusOf } from "@/lib/domain";
import { reviewIsCurrent, swipeDecision, type SwipeAction } from "@/lib/swipe";
import type { Connection, DashboardData, Destination, Platform, Post } from "@/lib/types";

type Destinations = Partial<Record<Platform, string>>;
type Review = { post: Post; destinations: Destinations; connections: Connection[]; intended: Destination[] };
type Previous = { review: Review; action: SwipeAction; approved?: Post };
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

export default function ApprovalDashboard({ data, busy, onApprove, onUndo }: {
  data: DashboardData; busy: boolean;
  onApprove: (post: Post, destinations: Destinations) => Promise<Post>;
  onUndo: (post: Post) => Promise<Post>;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [deferred, setDeferred] = useState<string[]>([]), [handled, setHandled] = useState<string[]>([]);
  const [previous, setPrevious] = useState<Previous | null>(null);
  const [saving, setSaving] = useState(false), [exit, setExit] = useState<SwipeAction | null>(null);
  const [drag, setDrag] = useState(0), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const taking = useRef(false), card = useRef<HTMLElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; dx: number; dy: number; dragging: boolean } | null>(null);
  const focusNext = useRef(false);
  const snapshot = (post: Post): Review => ({ post, destinations: Object.fromEntries(data.connections.map(connection => [connection.platform, connection.accountId])), connections: data.connections, intended:data.destinations??[] });
  const now = Date.now();
  const pending = data.posts.filter(post => statusOf(post) === "review").sort((a, b) => {
    const pastA = Date.parse(a.plannedAt) <= now, pastB = Date.parse(b.plannedAt) <= now;
    return Number(pastA) - Number(pastB) || a.plannedAt.localeCompare(b.plannedAt) || a.title.localeCompare(b.title);
  });
  const available = pending.filter(post => !deferred.includes(keyOf(post)) && !handled.includes(keyOf(post)));
  const optimistic = pending.filter(post => handled.includes(keyOf(post))).length;
  const held = pending.filter(post => deferred.includes(keyOf(post))).length;
  const counts = {
    review: pending.length - optimistic,
    approved: data.posts.filter(post => ["approved", "blocked", "sending"].includes(statusOf(post))).length + optimistic,
    published: data.posts.filter(post => statusOf(post) === "published").length,
    attention: data.posts.filter(post => ["failed", "unknown", "partial"].includes(statusOf(post))).length,
  };
  useEffect(() => {
    if (!review && available.length) setReview(snapshot(available[0]));
  }, [review, data.posts, data.connections, deferred, handled]);
  useEffect(() => {
    if (review && focusNext.current) { card.current?.focus({ preventScroll: true }); focusNext.current = false; }
  }, [review]);
  const stale = !!review && (!reviewIsCurrent(review.post, data.posts.find(post => post.id === review.post.id), review.destinations, data.connections) || JSON.stringify(review.intended)!==JSON.stringify(data.destinations??[]));
  const issue = review ? approvalIssue(review.post) : "";
  const locked = busy || saving;
  const decide = async (action: SwipeAction, keyboard = false) => {
    if (!review || taking.current || busy) return;
    if (action === "approve" && (stale || issue)) { setError(stale ? "原稿や投稿先が更新されました。最新の内容を確認してください。" : issue); setDrag(0); return; }
    taking.current = true; setSaving(true); setExit(action); setError(""); setNotice("");
    try {
      const result = action === "approve" ? await onApprove(review.post, review.destinations) : undefined;
      await new Promise(resolve => setTimeout(resolve, 180));
      if (action === "approve") setHandled(keys => [...keys, keyOf(review.post)]);
      else setDeferred(keys => [...keys, keyOf(review.post)]);
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
      const restored = previous.action === "approve" && previous.approved ? await onUndo(previous.approved) : data.posts.find(post => post.id === previous.review.post.id);
      if (!restored || statusOf(restored) !== "review") throw new Error("この投稿は更新されました。最新の状態を確認してください。");
      const key = keyOf(previous.review.post);
      setDeferred(keys => keys.filter(item => item !== key)); setHandled(keys => keys.filter(item => item !== key));
      setReview(snapshot(restored)); setPrevious(null); setDrag(0); setNotice(previous.action === "approve" ? "承認を取り消しました" : "前の投稿に戻りました");
    } catch (failure) { setError((failure as Error).message); }
    finally { taking.current = false; setSaving(false); }
  };
  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (locked || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("button,a,input,summary")) return;
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
      {([["review", "承認待ち"], ["approved", "予約済み"], ["published", "公開済み"], ["attention", "要確認"]] as const).map(([key, label]) =>
        <div key={key} className={key === "review" ? "current" : ""}><dt>{label}</dt><dd>{counts[key]}<small>件</small></dd></div>
      )}
    </dl>
    <div className="swipe-workspace">
      <div className="swipe-queue-heading"><h2>投稿をチェック</h2><span>残り {available.length}件{held > 0 && ` ／ 保留 ${held}件`}</span></div>
      <div className="swipe-feedback" aria-live="polite" role={error ? "alert" : "status"}>{error || notice || "右へスワイプで承認、左へスワイプであとで確認"}</div>
      {review ? <div className={`swipe-stack ${locked ? "is-saving" : ""}`}>
        <div className="swipe-under-card" aria-hidden="true" />
        <article key={keyOf(review.post)} ref={card} tabIndex={0} aria-label={`${review.post.title}。右矢印で承認、左矢印で保留`} aria-busy={saving} className={`swipe-card ${drag ? "is-dragging" : ""} ${exit ? `is-exiting-${exit}` : ""}`} style={{ "--drag-x": `${drag}px`, "--drag-rotation": `${drag / 30}deg` } as CSSProperties}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { pointer.current = null; setDrag(0); }}
          onKeyDown={event => { if (event.target !== event.currentTarget || event.repeat || event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); void decide(event.key === "ArrowRight" ? "approve" : "defer", true); }}>
          {Math.abs(drag) > 30 && <div className={`swipe-stamp ${drag > 0 ? "approve" : "defer"}`} aria-hidden="true">{drag > 0 ? "承認" : "あとで"}</div>}
          <header className="swipe-card-heading"><span>{review.post.category}</span><h3>{review.post.title}</h3><p><Clock3 size={14} /><time dateTime={review.post.plannedAt}>{dateLabel(review.post.date)} {review.post.time}</time><small>日本時間</small></p></header>
          <ReadOnlyPost post={review.post} connections={review.connections} intended={review.intended} />
          <div className="swipe-card-note">
            {stale ? <div className="swipe-issue"><AlertCircle size={16} /><span>原稿や投稿先が更新されました。</span><button disabled={locked} onClick={() => { const latest = data.posts.find(post => post.id === review.post.id); setReview(latest && statusOf(latest) === "review" ? snapshot(latest) : null); setError(""); }}>最新を確認</button></div> : issue ? <div className="swipe-issue"><AlertCircle size={16} /><span>{issue}<small>「投稿管理」で準備できます。今は左へスワイプで保留できます。</small></span></div> : <p>✓を押すと、この原稿・投稿先・公開日時で承認します。</p>}
            {(!data.schedulerReady || review.post.platforms.some(platform => !review.destinations[platform])) && <p className="swipe-connection-note">SNS接続・予約実行は設定待ちです。接続後は投稿先を確認して再承認してください。</p>}
          </div>
        </article>
        {saving && <div className="swipe-saving" role="status"><Loader2 size={22} className="spin" />{exit === "approve" ? "承認を保存しています" : "処理しています"}</div>}
      </div> : <div className="swipe-complete"><CheckCheck size={36} /><h3>{held ? "ひと通り確認しました" : "承認待ちの投稿はありません"}</h3><p>{held ? `${held}件は、あとで確認する投稿として残っています。` : "新しい原稿が登録されると、ここに表示されます。"}</p>{held > 0 && <button className="button secondary" disabled={locked} onClick={() => { setDeferred([]); setNotice(""); }}>保留した投稿をもう一度</button>}</div>}
      <div className="swipe-controls" aria-label="カードの操作">
        <div><button className="swipe-control undo" disabled={locked || !previous} aria-label="ひとつ前の操作を取り消す" title="ひとつ前の操作を取り消す" onClick={undo}><RotateCcw size={21} /></button><span>ひとつ戻る</span></div>
        <div><button className="swipe-control defer" disabled={locked || !review} aria-label="この投稿を保留して次へ" title="保留して次へ" onClick={() => void decide("defer")}><X size={29} /></button><span>あとで</span></div>
        <div><button className="swipe-control approve" disabled={locked || !review || stale || !!issue} aria-label="この投稿を承認して次へ" title={issue || (stale ? "最新の原稿を確認してください" : "承認して次へ")} onClick={() => void decide("approve")}><Check size={32} /></button><span>承認</span></div>
      </div>
    </div>
  </section>;
}

function ReadOnlyPost({ post, connections, intended }: { post: Post; connections: Connection[]; intended: Destination[] }) {
  const [platform, setPlatform] = useState<Platform>(post.platforms[0] || "x");
  const active = post.platforms.includes(platform) ? platform : post.platforms[0];
  const content = active === "x" ? post.content.x : active ? [post.content[active]] : [];
  return <div className="swipe-preview">
    <div className="approval-preview-tabs" role="tablist" aria-label="SNS別の投稿内容">
      {post.platforms.map(item => <button key={item} id={`tab-${post.id}-${item}`} role="tab" aria-selected={item === active} aria-controls={`content-${post.id}`} onClick={() => setPlatform(item)}>{PLATFORM_NAMES[item]}</button>)}
    </div>
    <div id={`content-${post.id}`} className="swipe-copy" role="tabpanel" aria-labelledby={active ? `tab-${post.id}-${active}` : undefined}>
      {active && <div className="approval-account">投稿先：{intended.find(d=>d.platform===active)?<a href={intended.find(d=>d.platform===active)!.url} target="_blank" rel="noreferrer">{connections.find(connection=>connection.platform===active)?.label||intended.find(d=>d.platform===active)!.label}</a>:connections.find(connection=>connection.platform===active)?.label||PLATFORM_NAMES[active]}{!connections.some(connection=>connection.platform===active)&&"（未接続）"}</div>}
      {content.map((text, index) => <div className="approval-copy-part" key={index}>{content.length > 1 && <span>{index + 1} / {content.length}{index ? "　続きの投稿" : "　最初の投稿"}</span>}<p>{text || "本文がありません。"}</p></div>)}
      {!content.length && <p>投稿先が設定されていません。</p>}
      {!!post.mediaIds.length && <div className="approval-images">{post.mediaIds.map(id => <img key={id} src={`/api/media/${id}`} alt="投稿に添付する画像" draggable={false} />)}</div>}
      {!post.mediaIds.length && <p className="swipe-image-note"><Images size={14} />{post.needsImage ? "投稿画像は準備中です" : "画像なし"}</p>}
    </div>
  </div>;
}
