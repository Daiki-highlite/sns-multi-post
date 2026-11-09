declare module "twitter-text" { export function parseTweet(text: string): { weightedLength: number; valid: boolean }; const api: { parseTweet: typeof parseTweet }; export default api; }
