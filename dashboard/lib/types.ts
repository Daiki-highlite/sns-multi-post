export type Platform = "x" | "linkedin" | "facebook";
export type PostContent = { x: string[]; linkedin: string; facebook: string };
export type JobState = "queued" | "sending" | "published" | "failed" | "unknown" | "blocked" | "scheduled" | "cancelled";
export type Target = {
  id: string; postId: string; version: number; platform: Platform; sequence: number;
  state: JobState; scheduledAt: string; remoteId: string | null; url: string | null;
  error: string | null; attempts: number; claimedAt: string | null; parentId: string | null;
  payload: { text: string; mediaIds: string[]; accountId: string; publicationMode?: "immediate" | "scheduled"; nativeSchedule?: { url:string; plannedAt:string; confirmedAt:string; confirmedBy:string; note:string } }; updatedAt: string;
};
export type Post = {
  id: string; sourceKey: string; sourceRow: number; sourceSheet: string; sourcePostId: string;
  title: string; category: string; theme: string; date: string; time: string;
  plannedAt: string; content: PostContent; platforms: Platform[]; mediaIds: string[];
  imageIdea: string; imagePrompt: string; notes: string; source: string; productionStatus: string;
  needsImage: boolean; version: number; revision: string; approvedVersion: number | null;
  publicationMode?: "immediate" | "scheduled";
  approvedDestinations?: Destination[]; approvedDeliveryMode?: "browser_agent" | "api";
  approvedBy: string | null; approvedAt: string | null; status: "review" | "approved";
  reviewHold?: { note: string; at: string; by: string } | null;
  createdAt: string; updatedAt: string; sourceHash: string; targets?: Target[];
};
export type Media = { id: string; name: string; mime: string; size: number; createdAt: string };
export type Connection = { platform: Platform; label: string; accountId: string; configured: boolean; verifiedAt?: string; error?: string };
export type Destination = { platform: Platform; url: string; label: string; accountId?: string; username?: string };
export type CalendarExport = { spreadsheetId: string; tabs: { name: string; sheetId: number; rows: (string | null)[][] }[] };
export type Activity = { id: string; postId: string | null; action: string; actor: string; detail: string; createdAt: string };
export type PreviewReference = { platform: Platform; name: string; theme: "dark" | "light"; headerId: string; avatarId: string; capturedAt: string };
export type DashboardData = { deliveryMode?: "browser_agent" | "api"; previewReferences?: PreviewReference[]; posts: Post[]; media: Media[]; connections: Connection[]; destinations: Destination[]; activities: Activity[]; settings: { lastImportAt?: string; importedCount?: number; spreadsheetId?: string; tabs?: { name: string; sheetId: number }[] }; user: { displayName: string; email: string }; sheetsReady: boolean; schedulerReady: boolean };
