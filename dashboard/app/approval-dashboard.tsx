"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCheck, ChevronDown, Clock3, Images } from "lucide-react";
import twitterText from "twitter-text";
import { assertApprovable, PLATFORM_NAMES, statusOf } from "@/lib/domain";
import type { DashboardData, Platform, Post } from "@/lib/types";

const dateLabel = (date: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short",
}).format(new Date(`${date}T12:00:00+09:00`));

function approvalIssue(post: Post) {
  try {
    assertApprovable(post);
    if (post.platforms.includes("x") && post.content.x.some(text => !twitterText.parseTweet(text).valid)) {
      return "Xの文字数を確認してください。";
    }
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

export default function ApprovalDashboard({ data, busy, onApprove }: {
  data: DashboardData; busy: boolean; onApprove: (posts: Post[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, string>>({});
  const now = Date.now();
  const pending = data.posts.filter(post => statusOf(post) === "review").sort((a, b) => {
    const pastA = Date.parse(a.plannedAt) <= now, pastB = Date.parse(b.plannedAt) <= now;
    return Number(pastA) - Number(pastB) || a.plannedAt.localeCompare(b.plannedAt) || a.title.localeCompare(b.title);
  });
  const counts = {
    review: pending.length,
    approved: data.posts.filter(post => ["approved", "blocked", "sending"].includes(statusOf(post))).length,
    published: data.posts.filter(post => statusOf(post) === "published").length,
    attention: data.posts.filter(post => ["failed", "unknown", "partial"].includes(statusOf(post))).length,
  };
  // Recheck the current revisions and readiness when data refreshes or time passes.
  const selected = pending.filter(post => checked[post.id] === post.revision && !approvalIssue(post));
  useEffect(() => {
    setChecked(entries => Object.fromEntries(Object.entries(entries).filter(([id, revision]) => data.posts.some(post => post.id === id && post.revision === revision && statusOf(post) === "review" && !approvalIssue(post)))));
  }, [data.posts]);

  return <section className="approval-dashboard" aria-label="投稿の承認">
    <dl className="approval-counts" aria-label="投稿の件数">
      {([["review", "承認待ち"], ["approved", "予約済み"], ["published", "公開済み"], ["attention", "要確認"]] as const).map(([key, label]) =>
        <div key={key} className={key === "review" ? "current" : ""}><dt>{label}</dt><dd>{counts[key]}<small>件</small></dd></div>
      )}
    </dl>
    <div className="approval-inbox">
      <div className="approval-inbox-heading"><h2>承認待ちの投稿</h2><span>公開予定が近い順・日本時間</span></div>
      {selected.length > 0 && <div className="approval-selection" role="region" aria-label="選択した投稿の承認">
        <span>{selected.length}件を選択中</span>
        <button className="text-button" disabled={busy} onClick={() => setChecked({})}>選択を解除</button>
        <button className="button primary" disabled={busy} onClick={() => onApprove(selected)}><CheckCheck size={16} />選択した{selected.length}件を承認</button>
      </div>}
      {pending.map(post => {
        const issue = approvalIssue(post), expanded = openId === post.id;
        return <article key={post.id} className={`approval-item ${expanded ? "expanded" : ""}`}>
          <div className="approval-item-heading">
            <label className="approval-select" title={issue || "まとめて承認する投稿を選択"}>
              <input type="checkbox" aria-label={`${post.title}を承認対象に選択`} checked={selected.some(item => item.id === post.id)} disabled={busy || !!issue} onChange={event => setChecked(entries => { const next = { ...entries }; if (event.target.checked) next[post.id] = post.revision; else delete next[post.id]; return next; })} />
            </label>
            <button className="approval-open" aria-expanded={expanded} aria-controls={`review-${post.id}`} onClick={() => setOpenId(expanded ? null : post.id)}>
              <time dateTime={post.plannedAt}><span>{dateLabel(post.date)}</span><strong>{post.time}</strong></time>
              <span className="approval-item-title"><strong>{post.title}</strong><small>{post.category}<span aria-hidden="true"> ／ </span>{post.platforms.map(platform => PLATFORM_NAMES[platform]).join("・")}</small></span>
              <span className={`approval-readiness ${issue ? "needs-work" : ""}`}>{issue ? <><AlertCircle size={14} />準備が必要</> : <><Check size={14} />承認できます</>}</span>
              <span className="approval-open-label">{expanded ? "閉じる" : "内容を確認"}<ChevronDown size={16} /></span>
            </button>
          </div>
          {expanded && <div id={`review-${post.id}`} className="approval-item-body">
            <ReadOnlyPost post={post} data={data} />
            <div className="approval-item-actions">
              {issue ? <p className="approval-issue"><AlertCircle size={16} /><span>{issue}<small>「投稿管理」で原稿を整えてから承認してください。</small></span></p> : <p><Clock3 size={15} />{dateLabel(post.date)} {post.time} に公開予定</p>}
              <button className="button primary" disabled={busy || !!issue} onClick={() => onApprove([post])}><CheckCheck size={17} />承認する</button>
            </div>
          </div>}
        </article>;
      })}
      {!pending.length && <div className="approval-empty"><CheckCheck size={28} /><h3>承認待ちの投稿はありません</h3><p>新しい原稿が登録されると、ここに表示されます。</p></div>}
    </div>
  </section>;
}

function ReadOnlyPost({ post, data }: { post: Post; data: DashboardData }) {
  const [platform, setPlatform] = useState<Platform>(post.platforms[0] || "x");
  const active = post.platforms.includes(platform) ? platform : post.platforms[0];
  const content = active === "x" ? post.content.x : active ? [post.content[active]] : [];
  return <div className="approval-preview">
    <div className="approval-preview-tabs" role="tablist" aria-label="SNS別の投稿内容">
      {post.platforms.map(item => <button key={item} id={`tab-${post.id}-${item}`} role="tab" aria-selected={item === active} aria-controls={`content-${post.id}`} onClick={() => setPlatform(item)}>{PLATFORM_NAMES[item]}</button>)}
    </div>
    <div id={`content-${post.id}`} className="approval-copy" role="tabpanel" aria-labelledby={active ? `tab-${post.id}-${active}` : undefined}>
      {active && <div className="approval-account">投稿先：{data.connections.find(connection => connection.platform === active)?.label || `${PLATFORM_NAMES[active]}（未接続）`}</div>}
      {content.map((text, index) => <div className="approval-copy-part" key={index}>
        {content.length > 1 && <span>{index + 1} / {content.length}{index ? "　続きの投稿" : "　最初の投稿"}</span>}
        <p>{text || "本文がありません。"}</p>
      </div>)}
      {!content.length && <p>投稿先が設定されていません。</p>}
      {!!post.mediaIds.length && <div className="approval-images">{post.mediaIds.map(id => <img key={id} src={`/api/media/${id}`} alt="投稿に添付する画像" />)}</div>}
      {!post.mediaIds.length && <p className="approval-image-note"><Images size={14} />{post.needsImage ? "投稿画像は準備中です" : "画像なし"}</p>}
    </div>
  </div>;
}
