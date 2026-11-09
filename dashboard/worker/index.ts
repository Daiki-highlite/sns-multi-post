import handler from "vinext/server/fetch-handler";
import { runWithRuntimeEnv } from "../lib/runtime-context";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { runDueJobs } from "../lib/jobs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    return runWithRuntimeEnv(env, async () => {
      let binding = ctx.props?.CONNECTORS;
      // Local preview emulates the same request-scoped capability. This branch and
      // the auxiliary service binding are absent from production builds.
      if (import.meta.env.DEV && !binding && env.CONNECTORS) {
        const preview = env.CONNECTORS;
        const expiresAt = Date.now() + 60_000;
        binding = {
          async getContext() {
            if (Date.now() >= expiresAt) return { status: "request_context_expired" };
            return preview.getContext?.() ?? { status: "binding_unavailable" };
          },
          async invoke(connectorId, actionName, args) {
            if (Date.now() >= expiresAt) {
              return { status: "request_context_expired", message: "This request has expired. Please try again." };
            }
            return preview.invoke(connectorId, actionName, args);
          },
        };
      }
      const response = await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
      if (response.ok && request.method === "POST" && new URL(request.url).pathname.endsWith("/approve")) ctx.waitUntil(runDueJobs());
      return response;
    });
  },
  async scheduled(_controller: ScheduledController, _env: Cloudflare.Env, ctx: ExecutionContext) { ctx.waitUntil(runWithRuntimeEnv(_env, () => runDueJobs())); },
};

export default worker;
