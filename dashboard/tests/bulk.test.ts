import test from "node:test";
import assert from "node:assert/strict";
import { bulkPlan, type BulkOptions } from "../lib/bulk.ts";
import { importedPosts } from "../lib/domain.ts";
const header=["日付（JST）","主テーマ","投稿テーマ","枝番","X 本文","LinkedIn 本文","Facebook 本文","投稿時刻（案）","投稿ID"];
function posts(){return importedPosts({spreadsheetId:"example_calendar_id",tabs:[{name:"企画",sheetId:123,rows:[header,["2026/11/04","テーマ","企画1","1/1","原稿1","LinkedIn原稿1","Facebook原稿1","08:00","P-1"],["2026/11/05","テーマ","企画2","1/1","原稿2","LinkedIn原稿2","Facebook原稿2","18:00","P-2"]]}]}).map(p=>({...p,needsImage:true}));}
function config(ps=posts()):BulkOptions{return {entries:ps.map(p=>({id:p.id,revision:p.revision})),platforms:["x","linkedin","facebook"],dateMode:"shift",startDate:"2027-01-01",imageMode:"text",mediaIds:[]};}
test("一度の開始日指定で日付間隔と投稿時刻を保つ",()=>{const ps=posts(),r=bulkPlan(ps,config(ps),0);assert.deepEqual(r.map(p=>[p.draft.date,p.draft.time]),[["2027-01-01","08:00"],["2027-01-02","18:00"]]);assert.ok(r.every(p=>!p.errors.length));assert.equal(ps[0].date,"2026-11-04");});
test("文章のみを明示選択したときだけ画像条件を外す",()=>{const ps=posts(),c=config(ps);assert.ok(bulkPlan(ps,c,0).every(p=>!p.draft.needsImage));c.imageMode="keep";assert.ok(bulkPlan(ps,c,0).every(p=>p.errors.some(e=>e.includes("画像"))));});
test("共通画像を別配列で適用し、原稿を混ぜない",()=>{const ps=posts(),c={...config(ps),imageMode:"shared" as const,mediaIds:["image-1"]};const r=bulkPlan(ps,c,0);c.mediaIds.push("image-2");assert.deepEqual(r[0].draft.mediaIds,["image-1"]);assert.equal(r[1].draft.content.x[0],"原稿2");});
test("承認済み・古い版の投稿を一括設定で上書きしない",()=>{const ps=posts(),c=config(ps);ps[0].revision="updated";ps[1].approvedVersion=1;const r=bulkPlan(ps,c,0);assert.ok(r.every(p=>!p.canSave&&p.errors.length>0));});
test("日付を保つ設定では、過去の予定を承認可能にしない",()=>{const ps=posts(),c={...config(ps),dateMode:"keep" as const};assert.ok(bulkPlan(ps,c,Date.parse("2027-01-01")).every(p=>p.errors.some(e=>e.includes("公開日時"))));});
test("Xの重み付き文字数違反を一括承認前に見つける",()=>{const ps=posts();ps[0].content.x=["あ".repeat(150)];const r=bulkPlan(ps,config(ps),0);assert.ok(r[0].errors.some(e=>e.includes("Xの本文")));assert.equal(r[1].errors.length,0);});

test("一括確認も本文の連投番号を外し、元の原稿を変更しない",()=>{
 const original=posts()[0];original.content.x=["(1/2) 親投稿","(2/2) 続き"];
 const entry=bulkPlan([original],{entries:[{id:original.id,revision:original.revision}],platforms:["x"],dateMode:"shift",startDate:"2027-01-01",imageMode:"text",mediaIds:[]},Date.parse("2026-01-01T00:00:00Z"))[0];
 assert.deepEqual(entry.draft.content.x,["親投稿","続き"]);
 assert.deepEqual(original.content.x,["(1/2) 親投稿","(2/2) 続き"]);
});
