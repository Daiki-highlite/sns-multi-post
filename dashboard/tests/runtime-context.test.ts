import test from 'node:test';
import assert from 'node:assert/strict';
import {runWithRuntimeEnv,requestRuntimeEnv} from '../lib/runtime-context.ts';

test('遅延ルート・並行リクエストでもDBと画像保管先を混ぜない',async()=>{
 const a={BUCKET:{name:'a'},DB:{name:'a'}} as unknown as Cloudflare.Env;
 const b={BUCKET:{name:'b'},DB:{name:'b'}} as unknown as Cloudflare.Env;
 assert.equal(requestRuntimeEnv(),undefined);
 await Promise.all([a,b].map(env=>runWithRuntimeEnv(env,async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requestRuntimeEnv(),env);
  assert.equal(await runWithRuntimeEnv(a,async()=>{await Promise.resolve();return requestRuntimeEnv();}),a);
  assert.equal(requestRuntimeEnv(),env);
 })));
 assert.equal(requestRuntimeEnv(),undefined);
});
