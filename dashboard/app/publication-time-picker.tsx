"use client";
import { CalendarClock,Clock3 } from 'lucide-react';
import { plannedTime } from '@/lib/domain';
import { timingFor,type PublicationMode } from '@/lib/publication';
export default function PublicationTimePicker({date,time,mode,disabled,onChange}:{date:string;time:string;mode?:PublicationMode;disabled?:boolean;onChange:(date:string,time:string,plannedAt:string,mode:PublicationMode)=>void}){
  const change=(value:string)=>{const [d='',t='']=value.split('T');try{const timing=timingFor(d,t);onChange(d,t,plannedTime(d,t),timing.mode);}catch{onChange(d,t,'','scheduled');}};
  const now=()=>{const d=new Date(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(d),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(d);onChange(day,clock,plannedTime(day,clock),'immediate');};
  let current=mode;try{current??=timingFor(date,time).mode;}catch{current='scheduled';}
  return <div className="publication-time-picker"><label>投稿日時（日本時間）<input type="datetime-local" step={60} aria-label="投稿日時（日本時間）" disabled={disabled} value={date&&time?`${date}T${time}`:''} onChange={e=>change(e.target.value)}/></label><div><span className={`publication-mode ${current}`}>{current==='scheduled'?<CalendarClock size={13}/>:<Clock3 size={13}/>} {current==='scheduled'?'予約投稿':'今すぐ投稿'}</span><button type="button" className="publication-now" disabled={disabled} onClick={now}>今すぐ</button></div></div>;
}
