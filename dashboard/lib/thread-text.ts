import type { PostContent } from "./types.ts";

// Only remove a counter at the beginning that matches the actual X thread.
// Dates, fractions in prose, and the calendar's branch metadata are untouched.
export function stripThreadCounter(text:string,sequence:number,total:number):string {
  if(total<2 || sequence<1 || sequence>total)return text;
  const prefix=text.match(/^\s*[(（]\s*([0-9０-９]{1,2})\s*[/／]\s*([0-9０-９]{1,2})\s*[)）]/u)
    || text.match(/^\s*([0-9０-９]{1,2})[ \t　]*[/／][ \t　]*([0-9０-９]{1,2})[ \t　]*(?=\r?\n|$)/u);
  if(!prefix || Number(prefix[1].normalize("NFKC"))!==sequence || Number(prefix[2].normalize("NFKC"))!==total)return text;
  return text.slice(prefix[0].length).trimStart();
}
export function normalizeThreadContent(content:PostContent):PostContent {
  return {...content,x:content.x.map((text,index)=>stripThreadCounter(text,index+1,content.x.length))};
}
