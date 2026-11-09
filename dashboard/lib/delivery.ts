import type { Connection, Destination, Platform } from "./types.ts";
export type DeliveryMode = "browser_agent" | "api";
export function approvalAccounts(connections:Connection[],destinations:Destination[],mode:DeliveryMode="browser_agent"):Partial<Record<Platform,string>> {
  return Object.fromEntries(mode==="browser_agent" ? destinations.map(d=>[d.platform,`web:${d.url}`]) : connections.map(c=>[c.platform,c.accountId]));
}
