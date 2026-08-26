import { Notice, requestUrl } from "obsidian";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_ENDPOINT = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const LOG_PREFIX = "[My-system-Techo][Google OAuth]";

export interface GoogleTokens { accessToken: string; refreshToken?: string; expiresAt: number; }
export interface GoogleCalendarEvent { id: string; summary: string; start: string; end: string; allDay: boolean; }
function log(message: string, data?: unknown): void { console.log(LOG_PREFIX, message, data ?? ""); }
function base64url(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64url"); }
function randomString(length = 32): string { const { randomBytes } = require("crypto"); return base64url(randomBytes(length)); }
function pkceChallenge(verifier: string): string { const { createHash } = require("crypto"); return base64url(createHash("sha256").update(verifier).digest()); }

function describeGoogleHttpError(error: unknown): { status?: number; error?: string; errorDescription?: string; message: string } {
  const value = error as any;
  const status = typeof value?.status === "number" ? value.status : undefined;
  let body = value?.text ?? value?.responseText ?? value?.body;
  if (typeof body !== "string") body = "";
  let parsed: any = undefined;
  if (body) { try { parsed = JSON.parse(body); } catch { /* Google may return non-JSON text. */ } }
  const errorCode = typeof parsed?.error === "string" ? parsed.error : undefined;
  const errorDescription = typeof parsed?.error_description === "string" ? parsed.error_description : undefined;
  const message = errorDescription || errorCode || (error instanceof Error ? error.message : String(error));
  return { status, error: errorCode, errorDescription, message };
}

export async function authorizeGoogle(clientId: string): Promise<GoogleTokens> {
  log("start");
  if (!clientId.trim()) throw new Error("Google Client ID is not configured.");
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
    let response: any;
    try {
      response = await requestUrl({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri }).toString() });
    } catch (error) {
      const details = describeGoogleHttpError(error);
      log("token exchange failed", { status: details.status, error: details.error, errorDescription: details.errorDescription, message: details.message });
      throw new Error(`Google token exchange failed (${details.status ?? "unknown"}): ${details.message}`);
    }
    log("token exchange response", { status: response.status });
    if (response.status < 200 || response.status >= 300) {
      const details = describeGoogleHttpError(response);
      log("token exchange failed", { status: response.status, error: details.error, errorDescription: details.errorDescription });
      throw new Error(`Google token exchange failed (${response.status}): ${details.message}`);
    }
    const data = response.json as { access_token?: string; refresh_token?: string; expires_in?: number };
    log("token fields received", { accessToken: Boolean(data.access_token), refreshToken: Boolean(data.refresh_token), expiresIn: Boolean(data.expires_in) });
    if (!data.access_token || !data.expires_in) throw new Error("Google OAuth completed, but no usable access token was returned.");
    const tokens = { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
    log("authorization completed");
    return tokens;
  } finally { server.close(); log("callback server closed"); }
}

export async function refreshGoogleToken(clientId: string, refreshToken: string): Promise<GoogleTokens> {
  log("refresh started");
  const response = await requestUrl({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), refresh_token: refreshToken, grant_type: "refresh_token" }).toString() });
  log("refresh response", { status: response.status });
  if (response.status < 200 || response.status >= 300) throw new Error(`Google token refresh failed (${response.status}).`);
  const data = response.json as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
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

export function notifyGoogleError(error: unknown): void { log("error", error instanceof Error ? error.message : String(error)); new Notice(error instanceof Error ? error.message : "Google Calendarとの通信に失敗しました。"); }
