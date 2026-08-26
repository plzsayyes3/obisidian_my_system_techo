import * as http from "http";
import { randomBytes, createHash } from "crypto";
import { requestUrl, Notice } from "obsidian";
import { shell } from "electron";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_ENDPOINT = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function randomString(length = 32): string {
  return base64url(randomBytes(length));
}

function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export async function authorizeGoogle(clientId: string): Promise<GoogleTokens> {
  if (!clientId.trim()) throw new Error("Google Client ID is not configured.");

  const verifier = randomString(48);
  const challenge = pkceChallenge(verifier);
  const state = randomString(24);

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start OAuth callback server.");
  const redirectUri = `http://127.0.0.1:${address.port}`;

  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", clientId.trim());
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  await shell.openExternal(authUrl.toString());

  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Google OAuth timed out.")), 180000);
      server.on("request", (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? "/", redirectUri);
          if (requestUrl.pathname !== "/") return;
          if (requestUrl.searchParams.get("state") !== state) {
            res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Invalid OAuth state.");
            reject(new Error("Invalid OAuth state."));
            return;
          }
          const error = requestUrl.searchParams.get("error");
          if (error) {
            res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Google authorization was cancelled.");
            reject(new Error(`Google authorization failed: ${error}`));
            return;
          }
          const value = requestUrl.searchParams.get("code");
          if (!value) throw new Error("Google did not return an authorization code.");
          clearTimeout(timeout);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><p>Google Calendar connected. You can close this tab.</p></body></html>");
          resolve(value);
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });

    const response = await requestUrl({
      url: TOKEN_ENDPOINT,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId.trim(),
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Google token exchange failed (${response.status}).`);
    }

    const data = response.json as { access_token: string; refresh_token?: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  } finally {
    server.close();
  }
}

export async function refreshGoogleToken(clientId: string, refreshToken: string): Promise<GoogleTokens> {
  const response = await requestUrl({
    url: TOKEN_ENDPOINT,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId.trim(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`Google token refresh failed (${response.status}).`);
  const data = response.json as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
}

export async function listGoogleEvents(accessToken: string, calendarId: string, timeMin: string, timeMax: string): Promise<GoogleCalendarEvent[]> {
  const url = new URL(`${CALENDAR_ENDPOINT}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");

  const response = await requestUrl({
    url: url.toString(),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`Google Calendar request failed (${response.status}).`);

  const data = response.json as { items?: Array<{ id: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }> };
  return (data.items ?? []).map((event) => ({
    id: event.id,
    summary: event.summary || "(無題)",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    allDay: !event.start?.dateTime,
  }));
}

export function notifyGoogleError(error: unknown): void {
  new Notice(error instanceof Error ? error.message : "Google Calendarとの通信に失敗しました。");
}
