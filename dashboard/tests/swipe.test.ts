import test from "node:test";
import assert from "node:assert/strict";
import { reviewIsCurrent, swipeDecision } from "../lib/swipe.ts";
import type { Connection, Post } from "../lib/types.ts";

test("十分な横スワイプだけを承認・保留にする", () => {
  assert.equal(swipeDecision(130, 10, 624), "approve");
  assert.equal(swipeDecision(-130, 10, 624), "defer");
  assert.equal(swipeDecision(20, 0, 624), null);
  assert.equal(swipeDecision(130, 200, 624), null);
});
test("狭い画面でもタップや短い動きを承認にしない", () => {
  assert.equal(swipeDecision(90, 5, 340), "approve");
  assert.equal(swipeDecision(60, 0, 340), null);
  assert.equal(swipeDecision(0, 0, 340), null);
});
const post = { id:"post",revision:"r1",version:1,approvedVersion:null,platforms:["x"],targets:[] } as unknown as Post;
const connection = { platform:"x",accountId:"original",label:"Original",configured:true } as Connection;
test("画面で確認した版と異なる原稿をクイック承認しない", () => {
  assert.equal(reviewIsCurrent(post,post,{x:"original"},[connection]),true);
  assert.equal(reviewIsCurrent(post,{...post,revision:"r2"},{x:"original"},[connection]),false);
  assert.equal(reviewIsCurrent(post,undefined,{x:"original"},[connection]),false);
});
test("確認中にSNS投稿先が変わった場合は再確認する", () => {
  assert.equal(reviewIsCurrent(post,post,{x:"original"},[{...connection,accountId:"different"}]),false);
  assert.equal(reviewIsCurrent(post,post,{x:"original"},[]),false);
  assert.equal(reviewIsCurrent(post,post,{},[]),true);
});
