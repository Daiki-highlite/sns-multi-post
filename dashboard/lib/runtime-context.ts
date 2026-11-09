import { AsyncLocalStorage } from "node:async_hooks";

// Keep resource bindings with the request that supplied them, including lazy routes.
const contexts = new AsyncLocalStorage<Cloudflare.Env>();
export function runWithRuntimeEnv<T>(env: Cloudflare.Env, run: () => T): T {
  return contexts.run(env, run);
}
export function requestRuntimeEnv(): Cloudflare.Env | undefined {
  return contexts.getStore();
}
