import test from "node:test";
import assert from "node:assert/strict";
import { assertApprovable, importedPosts, makeTargetPayloads, plannedTime, statusOf } from "../lib/domain.ts";
import type { CalendarExport, Post, Target } from "../lib/types.ts";
import { csvRows } from "../lib/csv.ts";
const header = ["日付（JST）","主テーマ","投稿テーマ","枝番","X 本文","LinkedIn 本文","Facebook 本文","投稿時刻（案）","投稿ID"];
function source(): CalendarExport { return { spreadsheetId:"example_calendar_id", tabs:[{name:"企画",sheetId:12,rows:[header,["2027/01/01","ナレッジ","テーマ","1/2","親の原稿","会社ページの本文","Facebookの本文","08:00","PLAN-1"],["2027/01/01","ナレッジ","テーマ","2/2","続き",null,null,"親投稿の直後","PLAN-1"]]}] }; }
function post(): Post { return importedPosts(source())[0]; }
test("JSTの日付をUTCの予約日時へ変換する",()=>assert.equal(plannedTime("2027-01-01","08:00"),"2026-12-31T23:00:00.000Z"));
test("存在しない日付や時刻を予約に使わない",()=>{assert.throws(()=>plannedTime("2027-02-30","08:00"));assert.throws(()=>plannedTime("2027-01-01","24:00"));});
test("Xの続きは1つの企画にまとめ、会社ページは1本にする",()=>{const posts=importedPosts(source());assert.equal(posts.length,1);assert.deepEqual(posts[0].content.x,["親の原稿","続き"]);assert.equal(posts[0].content.linkedin,"会社ページの本文");assert.equal(makeTargetPayloads(posts[0]).length,4);});
test("取り込んだ日付と制作状況で自動承認しない",()=>{const p=post();assert.equal(p.approvedVersion,null);assert.equal(statusOf(p),"review");});
test("同じ企画IDと枝番の重複は取り込まない",()=>{const input=source();input.tabs[0].rows.push([...input.tabs[0].rows[1]]);assert.throws(()=>importedPosts(input),/同じ投稿ID/);});
test("枝番が不足している企画は取り込まない",()=>{const input=source();input.tabs[0].rows.pop();assert.throws(()=>importedPosts(input),/枝番/);});
test("続き行に会社ページの原稿がある場合は構成確認を求める",()=>{const input=source();input.tabs[0].rows[2][5]="重複の可能性";assert.throws(()=>importedPosts(input),/続き行/);});
test("列の並びが違うカレンダーを誤って解釈しない",()=>{const input=source();input.tabs[0].rows[0]=["別の列"];assert.throws(()=>importedPosts(input),/列名/);});
test("企画の照合は行番号に依存しない",()=>{const a=post();const input=source();input.tabs[0].rows.splice(1,0,[]);const b=importedPosts(input)[0];assert.equal(a.sourceKey,b.sourceKey);assert.notEqual(a.sourceRow,b.sourceRow);});
test("過去の日時の承認には設定し直しが必要",()=>assert.throws(()=>assertApprovable(post(),Date.parse("2028-01-01")),/公開日時/));
test("画像付きの企画は完成画像が必要",()=>{const p={...post(),needsImage:true};assert.throws(()=>assertApprovable(p,0),/画像を登録/);p.mediaIds=["image"];assert.doesNotThrow(()=>assertApprovable(p,0));});
test("選択したSNSの本文だけを検証する",()=>{const p=post();p.platforms=["linkedin"];p.content.x=[];assert.doesNotThrow(()=>assertApprovable(p,0));p.content.linkedin="";assert.throws(()=>assertApprovable(p,0),/LinkedIn/);});
test("送信対象は版・媒体・枝番に対応し、承認時の投稿先と画像を保持する",()=>{const p=post();p.mediaIds=["one"];const targets=makeTargetPayloads(p,{x:"account-a"});assert.equal(targets[1].parentId,targets[0].id);assert.equal(targets[0].payload.accountId,"account-a");assert.deepEqual(targets[1].payload.mediaIds,[]);p.mediaIds.push("two");assert.deepEqual(targets[0].payload.mediaIds,["one"]);const revised=makeTargetPayloads({...p,version:2});assert.notEqual(targets[0].id,revised[0].id);});
test("一部成功と結果不明を全件成功として表示しない",()=>{const p=post();p.approvedVersion=p.version;p.targets=[{state:"published"},{state:"failed"}] as Target[];assert.equal(statusOf(p),"partial");p.targets[1].state="unknown";assert.equal(statusOf(p),"unknown");p.approvedVersion=null;assert.equal(statusOf(p),"review");});
test("Google Sheets CSVの改行・カンマ・引用符を失わない",()=>assert.deepEqual(csvRows('\uFEFF列1,列2\r\n"改行\nあり","a,b"\r\n"二重""引用",末尾\r\n'),[["列1","列2"],["改行\nあり","a,b"],["二重\"引用","末尾"]]));
test("壊れたCSVは途中まで取り込まない",()=>assert.throws(()=>csvRows('a,b\n"閉じない,b'),/閉じられて/));
