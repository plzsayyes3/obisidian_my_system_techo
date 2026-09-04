import { Notice, requestUrl } from "obsidian";
import { addDays, pad2 } from "./utils/date";
import type { GoogleTechoEntry } from "./data/googleSync";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_ENDPOINT = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const LOG_PREFIX = "[My-system-Techo][Google OAuth]";

export interface GoogleTokens { accessToken: string; refreshToken?: string; expiresAt: number; }
export interface GoogleCalendarEvent { id: string; summary: string; start: string; end: string; allDay: boolean; }
export interface GoogleCalendarSummary { id: string; summary: string; primary: boolean; }
function log(message: string, data?: unknown): void { console.log(LOG_PREFIX, message, data ?? ""); }
function base64url(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64url"); }
function randomString(length = 32): string { const { randomBytes } = require("crypto"); return base64url(randomBytes(length)); }
function pkceChallenge(verifier: string): string { const { createHash } = require("crypto"); return base64url(createHash("sha256").update(verifier).digest()); }

function describeGoogleResponse(response: any): { status?: number; error?: string; errorDescription?: string; message: string } {
  const status = typeof response?.status === "number" ? response.status : undefined;
  const body = typeof response?.text === "string" ? response.text : "";
  let parsed: any = undefined;
  if (body) { try { parsed = JSON.parse(body); } catch { /* Google may return non-JSON text. */ } }
  const errorCode = typeof parsed?.error === "string" ? parsed.error : undefined;
  const errorDescription = typeof parsed?.error_description === "string" ? parsed.error_description : undefined;
  return { status, error: errorCode, errorDescription, message: errorDescription || errorCode || body || `HTTP ${status ?? "unknown"}` };
}

export async function authorizeGoogle(clientId: string, clientSecret: string): Promise<GoogleTokens> {
  log("start");
  if (!clientId.trim()) throw new Error("Google Client ID is not configured.");
  if (!clientSecret.trim()) throw new Error("Google Client Secret is not configured.");
  if (!(window as any).require) throw new Error("Google OAuthはデスクトップ版Obsidianで利用できます。モバイル版の認証は次の段階で対応します。");
  const http = require("http");
  const { shell } = (window as any).require("electron");
  const verifier = randomString(48), challenge = pkceChallenge(verifier), state = randomString(24);
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start OAuth callback server.");
  const redirectUri = `http://127.0.0.1:${address.port}`;
  log("callback server ready", { redirectUri });
  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", clientId.trim()); authUrl.searchParams.set("redirect_uri", redirectUri); authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE); authUrl.searchParams.set("access_type", "offline"); authUrl.searchParams.set("prompt", "consent"); authUrl.searchParams.set("code_challenge", challenge); authUrl.searchParams.set("code_challenge_method", "S256"); authUrl.searchParams.set("state", state);
  log("opening Google authorization page");
  await shell.openExternal(authUrl.toString());
  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => { log("authorization timed out"); reject(new Error("Google OAuth timed out.")); }, 180000);
      server.on("request", (req: any, res: any) => {
        try {
          const callbackUrl = new URL(req.url ?? "/", redirectUri);
          if (callbackUrl.pathname !== "/") return;
          log("callback received");
          if (callbackUrl.searchParams.get("state") !== state) { log("state validation failed"); res.writeHead(400); res.end("Invalid OAuth state."); reject(new Error("Invalid OAuth state.")); return; }
          const error = callbackUrl.searchParams.get("error");
          if (error) { log("Google returned an error", error); res.writeHead(400); res.end("Google authorization was cancelled."); reject(new Error(`Google authorization failed: ${error}`)); return; }
          const value = callbackUrl.searchParams.get("code");
          if (!value) throw new Error("Google did not return an authorization code.");
          clearTimeout(timeout); log("authorization code received");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end("<html><body><p>Google Calendar connected. You can close this tab.</p></body></html>"); resolve(value);
        } catch (error) { clearTimeout(timeout); log("callback processing failed", error instanceof Error ? error.message : String(error)); reject(error); }
      });
    });
    log("token exchange started");
    const response: any = await requestUrl({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), client_secret: clientSecret.trim(), code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri }).toString(), throw: false });
    const details = describeGoogleResponse(response);
    log("token exchange response", { status: details.status, error: details.error, errorDescription: details.errorDescription });
    if (details.status === undefined || details.status < 200 || details.status >= 300) {
      log("token exchange failed", { status: details.status, error: details.error, errorDescription: details.errorDescription, message: details.message });
      throw new Error(`Google token exchange failed (${details.status ?? "unknown"}): ${details.message}`);
    }
    const data = response.json as { access_token?: string; refresh_token?: string; expires_in?: number };
    log("token fields received", { accessToken: Boolean(data.access_token), refreshToken: Boolean(data.refresh_token), expiresIn: Boolean(data.expires_in) });
    if (!data.access_token || !data.expires_in) throw new Error("Google OAuth completed, but no usable access token was returned.");
    const tokens = { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
    log("authorization completed");
    return tokens;
  } finally { server.close(); log("callback server closed"); }
}

export async function refreshGoogleToken(clientId: string, clientSecret: string, refreshToken: string): Promise<GoogleTokens> {
  log("refresh started");
  const response: any = await requestUrl({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), client_secret: clientSecret.trim(), refresh_token: refreshToken, grant_type: "refresh_token" }).toString(), throw: false });
  const details = describeGoogleResponse(response);
  log("refresh response", { status: details.status, error: details.error, errorDescription: details.errorDescription });
  if (details.status === undefined || details.status < 200 || details.status >= 300) {
    throw new Error(`Google token refresh failed (${details.status ?? "unknown"}): ${details.message}`);
  }
  const data = response.json as { access_token?: string; expires_in?: number };
  if (!data.access_token || !data.expires_in) throw new Error("Google refresh succeeded, but no usable access token was returned.");
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
}

/** FNV-1a, only needs to be stable and short. */
function hash4(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(4, "0").slice(-4);
}

/**
 * Short stable identity for a calendar, used to namespace line markers. Two calendars can share
 * a local part (`you@a.com` and `you@b.com`), so the hash of the full id disambiguates them.
 */
export function calendarSlug(calendarId: string): string {
  const local = (calendarId.split("@")[0] || calendarId).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${local.slice(0, 20) || "cal"}-${hash4(calendarId)}`;
}

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarSummary[]> {
  log("calendar list request started");
  const calendars: GoogleCalendarSummary[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${CALENDAR_ENDPOINT}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response: any = await requestUrl({ url: url.toString(), headers: { Authorization: `Bearer ${accessToken}` }, throw: false });
    if (response.status < 200 || response.status >= 300) {
      const details = describeGoogleResponse(response);
      log("calendar list failed", details);
      if (details.status === 401 || details.status === 403) {
        throw new Error("カレンダー一覧を取得する権限がありません。設定から再認証してください。");
      }
      throw new Error(`Google calendar list failed (${details.status ?? "unknown"}): ${details.message}`);
    }
    const data = response.json as { items?: Array<{ id: string; summary?: string; summaryOverride?: string; primary?: boolean }>; nextPageToken?: string };
    for (const item of data.items ?? []) {
      calendars.push({ id: item.id, summary: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary) });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  log("calendar list received", { count: calendars.length });
  return calendars.sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary));
}

export async function listGoogleEvents(accessToken: string, calendarId: string, timeMin: string, timeMax: string): Promise<GoogleCalendarEvent[]> {
  log("calendar request started", { calendarId, timeMin, timeMax });
  const url = new URL(`${CALENDAR_ENDPOINT}/calendars/${encodeURIComponent(calendarId)}/events`); url.searchParams.set("timeMin", timeMin); url.searchParams.set("timeMax", timeMax); url.searchParams.set("singleEvents", "true"); url.searchParams.set("orderBy", "startTime"); url.searchParams.set("maxResults", "2500");
  const response = await requestUrl({ url: url.toString(), headers: { Authorization: `Bearer ${accessToken}` } });
  log("calendar response", { status: response.status });
  if (response.status < 200 || response.status >= 300) throw new Error(`Google Calendar request failed (${response.status}).`);
  const data = response.json as { items?: Array<{ id: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }> };
  log("calendar events received", { count: data.items?.length ?? 0 });
  return (data.items ?? []).map((event) => ({ id: event.id, summary: event.summary || "(無題)", start: event.start?.dateTime ?? event.start?.date ?? "", end: event.end?.dateTime ?? event.end?.date ?? "", allDay: !event.start?.dateTime }));
}

export async function createGoogleEvent(accessToken: string, calendarId: string, title: string, start: Date, end: Date): Promise<{ id: string; htmlLink?: string }> {
  log("calendar event create started", { calendarId, title, start: start.toISOString(), end: end.toISOString() });
  const url = new URL(`${CALENDAR_ENDPOINT}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("sendUpdates", "none");
  const response = await requestUrl({
    url: url.toString(),
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: title, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }),
    throw: false,
  });
  log("calendar event create response", { status: response.status });
  if (response.status < 200 || response.status >= 300) {
    const details = describeGoogleResponse(response);
    log("calendar event create failed", details);
    throw new Error(`Google Calendar event creation failed (${details.status ?? "unknown"}): ${details.message}`);
  }
  const data = response.json as { id?: string; htmlLink?: string };
  if (!data.id) throw new Error("Google Calendar event was created but no event ID was returned.");
  log("calendar event created", { id: data.id });
  return { id: data.id, htmlLink: data.htmlLink };
}

const MAX_ALL_DAY_SPAN = 62;

function localDate(value: Date): string { return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`; }
function localTime(value: Date): string { return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`; }

/**
 * `%%` would break the line marker and newlines would break the list item. Interior spacing is
 * left alone: summaries often contain full-width spaces that must survive to match hand-written lines.
 */
function sanitizeTitle(summary: string): string {
  return summary.replace(/[\r\n\t]+/g, " ").replace(/%%/g, "%").trim() || "(無題)";
}

function allDayRange(event: GoogleCalendarEvent): string[] {
  const start = event.start.slice(0, 10);
  if (!start) return [];
  const end = event.end.slice(0, 10);
  const days = [start];
  if (end && end > start) {
    let cursor = addDays(start, 1);
    while (cursor < end && days.length < MAX_ALL_DAY_SPAN) { days.push(cursor); cursor = addDays(cursor, 1); }
  }
  return days;
}

/**
 * Flattens Google events into one techo line per day, dropping anything outside the target month.
 * Times are rendered in the local timezone, which is what the techo records. Keys carry the
 * calendar slug, because the same event id appears on every calendar it is shared with.
 */
export function toTechoEntries(events: GoogleCalendarEvent[], year: number, month: number, calendarId: string): GoogleTechoEntry[] {
  const prefix = `${year}-${pad2(month)}-`;
  const slug = calendarSlug(calendarId);
  const entries: GoogleTechoEntry[] = [];

  for (const event of events) {
    const title = sanitizeTitle(event.summary);
    if (event.allDay) {
      const days = allDayRange(event);
      for (const date of days) {
        if (!date.startsWith(prefix)) continue;
        entries.push({ key: days.length > 1 ? `${slug}:${event.id}/${date}` : `${slug}:${event.id}`, date, title });
      }
      continue;
    }

    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) continue;
    const date = localDate(start);
    if (!date.startsWith(prefix)) continue;
    const end = event.end ? new Date(event.end) : null;
    const sameDay = end && !Number.isNaN(end.getTime()) && localDate(end) === date;
    entries.push({ key: `${slug}:${event.id}`, date, time: sameDay ? `${localTime(start)}-${localTime(end!)}` : localTime(start), title });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title));
}

export function notifyGoogleError(error: unknown): void { log("error", error instanceof Error ? error.message : String(error)); new Notice(error instanceof Error ? error.message : "Google Calendarとの通信に失敗しました。"); }
