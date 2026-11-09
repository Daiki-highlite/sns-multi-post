import test from "node:test";
import assert from "node:assert/strict";
import { assertDestinationMatches, parseDestination } from "../lib/destinations.ts";

test("LinkedInの管理画面URLから会社IDと公開ページを取得する",()=>{
  const d=parseDestination("linkedin","https://www.linkedin.com/company/123456/admin/dashboard/");
  assert.equal(d.accountId,"123456");assert.equal(d.url,"https://www.linkedin.com/company/123456/");
});
test("FacebookのページIDを保持し、表示言語指定を除く",()=>{
  const d=parseDestination("facebook","https://www.facebook.com/profile.php?id=1234567890&locale=ja_JP");
  assert.equal(d.accountId,"1234567890");assert.equal(d.url,"https://www.facebook.com/profile.php?id=1234567890");
});
test("Xのユーザー名を保持し、照合は大文字小文字を区別しない",()=>{
  const d=parseDestination("x","https://x.com/Example_Brand");
  assert.equal(d.username,"Example_Brand");assert.doesNotThrow(()=>assertDestinationMatches(d,{accountId:"123",username:"example_brand"}));
  assert.throws(()=>assertDestinationMatches(d,{accountId:"123",username:"someone_else"}));
});
test("別のページやSNSを接続先として登録しない",()=>{
  assert.throws(()=>assertDestinationMatches(parseDestination("linkedin","https://www.linkedin.com/company/123456/"),{accountId:"987654"}));
  assert.throws(()=>parseDestination("x","https://x.com.evil.example/example"));
  assert.throws(()=>parseDestination("facebook","https://www.linkedin.com/company/123456/"));
  assert.throws(()=>parseDestination("x","https://x.com/home"));
});
