import { env } from "cloudflare:workers";
import { requestRuntimeEnv } from "./runtime-context";

export function runtimeBindings(): Cloudflare.Env {
  return requestRuntimeEnv() ?? env;
}
