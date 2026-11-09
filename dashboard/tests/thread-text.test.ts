import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThreadContent, stripThreadCounter } from "../lib/thread-text.ts";
import { importedPosts, makeTargetPayloads } from "../lib/domain.ts";

test("実際の枝番に一致する本文先頭の連投番号だけを取り除く",()=>{
 assert.equal(stripThreadCounter("(1/2) 親投稿",1,2),"親投稿");
 assert.equal(stripThreadCounter("（２／２）\n\n続きの本文",2,2),"続きの本文");
 assert.equal(stripThreadCounter("1/2\n親投稿",1,2),"親投稿");
 assert.equal(stripThreadCounter("(2/3) 別の番号",2,2),"(2/3) 別の番号");
});
test("日付・本文中の分数・単独投稿を誤って削除しない",()=>{
 for(const text of ["12/3（木）開催", "1/2に開催", "費用は(1/2)です", "本文\n(1/2)", "(12/3) 開催"])
  assert.equal(stripThreadCounter(text,1,2),text);
 assert.equal(stripThreadCounter("(1/2) 開催日",1,1),"(1/2) 開催日");
 assert.equal(stripThreadCounter("(1/1) 開催日",1,1),"(1/1) 開催日");
});
test("連投本文以外のSNS・改行・URL・元データを変えず、再実行しても同じになる",()=>{
 const content={x:["(1/2) 本文\n\nhttps://example.test/1/2", "(2/2) 続き"],linkedin:"(1/2) は日付の例",facebook:"費用の1/2"};
 const clean=normalizeThreadContent(content);
 assert.deepEqual(clean,{x:["本文\n\nhttps://example.test/1/2","続き"],linkedin:content.linkedin,facebook:content.facebook});
 assert.equal(content.x[0].startsWith("(1/2)"),true);
 assert.deepEqual(normalizeThreadContent(clean),clean);
});
test("カレンダーから取り込み、番号なしの本文のままXの自己返信を生成する",()=>{
 const header=["日付（JST）","主テーマ","投稿テーマ","枝番","X 本文","LinkedIn 本文","Facebook 本文","投稿時刻（案）","投稿ID"];
 const p=importedPosts({spreadsheetId:"example_calendar_id",tabs:[{name:"企画",sheetId:123,rows:[header,["2027/01/01","テーマ","投稿","1/2","(1/2) 親投稿","会社本文","ページ本文","12:00","POST-1"],["2027/01/01","テーマ","投稿","2/2","(2/2) 続き","","","続き","POST-1"]]}]})[0];
 const targets=makeTargetPayloads(p);
 assert.deepEqual(p.content.x,["親投稿","続き"]);
 assert.equal(targets[1].parentId,targets[0].id);
 assert.equal(targets[0].payload.text,p.content.x[0]);
 assert.equal(targets[1].payload.text,p.content.x[1]);
 assert.match(p.sourceHash,/1\/2/);
});
