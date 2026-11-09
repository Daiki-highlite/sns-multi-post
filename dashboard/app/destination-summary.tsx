"use client";
import { ExternalLink, Link2 } from "lucide-react";
import { PLATFORM_NAMES } from "@/lib/domain";
import type { DashboardData } from "@/lib/types";

export default function DestinationSummary({ data }: { data: DashboardData }) {
  if (!data.destinations?.length) return null;
  return <section className="settings-panel destination-summary">
    <div className="panel-heading"><div><h2>指定した投稿先</h2><p>接続情報の登録時に、この投稿先と一致するか確認します。</p></div><Link2 size={21}/></div>
    <div className="destination-summary-grid">{data.destinations.map(destination => {
      const connection = data.connections.find(item => item.platform === destination.platform);
      return <div key={destination.platform}><strong>{PLATFORM_NAMES[destination.platform]}</strong><a href={destination.url} target="_blank" rel="noreferrer">{destination.label}<ExternalLink size={13}/></a><span>{connection ? "接続済み" : "投稿先指定済み・接続情報待ち"}</span></div>;
    })}</div>
  </section>;
}
