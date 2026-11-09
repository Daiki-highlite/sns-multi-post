"use client";

import { useEffect, useRef, useState } from "react";
import { Globe2, Heart, MessageCircle, MoreHorizontal, Repeat2, Send, Share, ThumbsUp, Bookmark, X } from "lucide-react";
import { makeTargetPayloads, PLATFORM_NAMES } from "@/lib/domain";
import type { Connection, Destination, Platform, Post, PreviewReference } from "@/lib/types";

const timestamp = (post: Post) => `${Number(post.date.slice(5,7))}月${Number(post.date.slice(8))}日 ${post.time}`;

export default function PlatformMobilePreview({ post, connections, intended, references }: { post: Post; connections: Connection[]; intended: Destination[]; references: PreviewReference[] }) {
  const [platform, setPlatform] = useState<Platform>(post.platforms[0] || "x");
  const active = post.platforms.includes(platform) ? platform : post.platforms[0];
  const connection = connections.find(item => item.platform === active);
  const destination = intended.find(item => item.platform === active);
  const reference = references.find(item => item.platform === active);
  const name = reference?.name || (connection?.label && !connection.label.startsWith("@") ? connection.label : "Highlite");
  const handle = destination?.username ? `@${destination.username}` : connection?.label.startsWith("@") ? connection.label : "";
  const parts = makeTargetPayloads(post).filter(item => item.platform === active);
  return <div className="swipe-preview platform-preview">
    <div className="approval-preview-tabs" role="tablist" aria-label="SNS別のスマートフォン表示">
      {post.platforms.map(item => <button key={item} id={`tab-${post.id}-${item}`} role="tab" tabIndex={item === active ? 0 : -1} aria-selected={item === active} aria-controls={`content-${post.id}`} onClick={() => setPlatform(item)} onKeyDown={event => {
        if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
        event.preventDefault(); const index = post.platforms.indexOf(item), count = post.platforms.length;
        const next = post.platforms[event.key === "Home" ? 0 : event.key === "End" ? count-1 : (index + (event.key === "ArrowRight" ? 1 : count-1)) % count];
        setPlatform(next); document.getElementById(`tab-${post.id}-${next}`)?.focus();
      }}><span className={`preview-platform-mark ${item}`} aria-hidden="true">{item === "x" ? "𝕏" : item === "linkedin" ? "in" : "f"}</span>{PLATFORM_NAMES[item]}</button>)}
    </div>
    <div id={`content-${post.id}`} className={`platform-preview-scroll screen-${active} theme-${reference?.theme || (active === "linkedin" ? "light" : "dark")}`} role="tabpanel" aria-labelledby={active ? `tab-${post.id}-${active}` : undefined} key={`${post.revision}:${active}`}>
      {active && <div className="platform-destination"><span>投稿先：{destination ? <a href={destination.url} target="_blank" rel="noreferrer">{connection?.label || destination.label}</a> : connection?.label || PLATFORM_NAMES[active]}</span><small>{connection ? "接続済み" : "未接続"}</small></div>}
      <div className="social-screen">
        {reference ? <img className="social-screen-header" src={`/api/preview-assets/${reference.headerId}`} alt={`${PLATFORM_NAMES[reference.platform]}実画面ヘッダー`} draggable={false}/> : <div className="social-screen-missing">実画面ヘッダーは未登録です</div>}
      <div className="social-screen-feed">
      {active === "x" ? <div className="native-feed native-x" aria-label="Xの投稿詳細プレビュー">
        {parts.map((part,index) => <section className="native-x-post" key={part.id}>
          <div className="native-x-detail-author"><Avatar platform="x" reference={reference}/><div><strong>{name}</strong><span>{handle}</span></div><MoreHorizontal size={19}/></div>
          <div className="native-x-post-main">
            {index>0&&<small className="native-thread-label">自己返信 {index+1} / {parts.length}</small>}
            <NativeText text={part.payload.text} platform="x" />
            <NativeMedia ids={part.payload.mediaIds} platform="x" />
            <span className="native-x-time">{timestamp(post)}</span>
            <div className="native-x-reactions" aria-label="返信・リポスト・いいね・ブックマーク・共有の表示イメージ"><MessageCircle/><Repeat2/><Heart/><Bookmark/><Share/></div>
          </div>
        </section>)}
      </div> : active && parts[0] ? <div className={`native-feed native-${active}`} aria-label={`${PLATFORM_NAMES[active]}のスマートフォン投稿プレビュー`}>
        <div className="native-company-author"><Avatar platform={active} reference={reference}/><div><strong>{name}</strong>{active === "linkedin" && <span>会社ページ</span>}<small>{timestamp(post)}<span aria-hidden="true"> · </span><Globe2 size={11}/></small></div><MoreHorizontal size={21}/>{active === "facebook" ? <X size={20} className="native-close"/> : <span className="native-follow" aria-hidden="true">＋ フォロー</span>}</div>
        <NativeText text={parts[0].payload.text} platform={active}/>
        <NativeMedia ids={parts[0].payload.mediaIds} platform={active}/>
        <div className="native-company-reactions" aria-label="投稿後の操作アイコンの表示イメージ"><span><ThumbsUp/>いいね！</span><span><MessageCircle/>コメント</span>{active === "linkedin" ? <><span><Repeat2/>再投稿</span><span><Send/>送信</span></> : <span><Share/>シェア</span>}</div>
      </div> : <div className="native-empty">投稿先が設定されていません。</div>}
      </div></div>
      <p className="platform-preview-caption">{reference ? `実画面ヘッダー・実アイコン + 保存原稿 · ${reference.capturedAt.slice(0,10)}参照` : "実画面参照の登録待ち"}<br/>390px幅のWeb表示を基準に再現。アプリ・端末・テーマで表示が変わります。</p>
    </div>
  </div>;
}

function Avatar({ platform, reference }: { platform: Platform; reference?: PreviewReference }) {
  return <span className={`native-avatar ${platform}`}><img src={reference ? `/api/preview-assets/${reference.avatarId}` : "/brand/highlite-symbol-color.svg"} width="40" height="40" alt={reference ? `${reference.name}の実プロフィール画像` : "仮のプロフィール画像"} draggable={false}/></span>;
}

function NativeText({ text, platform }: { text: string; platform: Platform }) {
  const [expanded,setExpanded] = useState(platform === "x"), [overflow,setOverflow] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (expanded || platform === "x") return;
    const element = paragraph.current; if (!element) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 2);
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, [text, platform, expanded]);
  const pieces = text.split(/(https?:\/\/[^\s<>]+|[#＃][\p{L}\p{N}_]+|@[A-Za-z0-9_]+)/gu);
  return <div className={`native-text ${expanded ? "expanded" : "collapsed"}`}>
    <p ref={paragraph}>{pieces.map((piece,index) => /^https?:\/\//.test(piece) ? <a key={index} href={piece} target="_blank" rel="noreferrer">{piece}</a> : /^[#＃@]/.test(piece) ? <span className="native-text-link" key={index}>{piece}</span> : piece)}</p>
    {overflow && platform !== "x" && <button className="native-read-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "一部を表示" : "…さらに表示"}</button>}
  </div>;
}

function NativeMedia({ ids, platform }: { ids: string[]; platform: Platform }) {
  if (!ids.length) return null;
  return <div className={`native-media ${platform} media-${ids.length}`} aria-label={`添付画像${ids.length}枚`}>
    {ids.map((id,index) => <img key={id} src={`/api/media/${id}`} alt={`添付画像 ${index+1}`} draggable={false}/>) }
  </div>;
}
