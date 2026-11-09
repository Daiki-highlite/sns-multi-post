import { runtime } from "./security";
import type { DeliveryMode } from "./delivery";
export function deliveryMode():DeliveryMode { return runtime("DELIVERY_MODE") === "api" ? "api" : "browser_agent"; }
