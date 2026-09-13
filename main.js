var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MySystemTechoPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  sourceFolder: "02_techo",
  scope: "month",
  year: (/* @__PURE__ */ new Date()).getFullYear(),
  month: (/* @__PURE__ */ new Date()).getMonth() + 1,
  day: (/* @__PURE__ */ new Date()).getDate(),
  googleClientId: "",
  googleClientSecret: "",
  googleCalendarId: "primary",
  googleCalendarIds: ["primary"],
  googleCalendarNames: {},
  googleCalendarPrefixes: {},
  googleWriteCalendarId: "primary"
};

// src/utils/date.ts
function pad2(value) {
  return String(value).padStart(2, "0");
}
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
function monthLabel(year, month) {
  return `${year}\u5E74${month}\u6708`;
}
var WEEKDAY_JA = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
function weekdayJa(isoDate2) {
  const [year, month, day] = isoDate2.split("-").map(Number);
  return WEEKDAY_JA[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
function isoWeek(isoDate2) {
  const [year, month, day] = isoDate2.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  target.setUTCDate(target.getUTCDate() - (target.getUTCDay() + 6) % 7 + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - (firstThursday.getUTCDay() + 6) % 7 + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 6048e5);
}
function addDays(isoDate2, amount) {
  const [year, month, day] = isoDate2.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}
function isoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}
function startOfWeek(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}
function clampDay(year, month, day) {
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}

// src/settings.ts
var import_obsidian2 = require("obsidian");

// src/google.ts
var import_obsidian = require("obsidian");
var AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
var TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
var CALENDAR_ENDPOINT = "https://www.googleapis.com/calendar/v3";
var SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";
var LOG_PREFIX = "[My-system-Techo][Google OAuth]";
function log(message, data) {
  console.log(LOG_PREFIX, message, data ?? "");
}
function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
function randomString(length = 32) {
  const { randomBytes } = require("crypto");
  return base64url(randomBytes(length));
}
function pkceChallenge(verifier) {
  const { createHash } = require("crypto");
  return base64url(createHash("sha256").update(verifier).digest());
}
function describeGoogleResponse(response) {
  const status = typeof response?.status === "number" ? response.status : void 0;
  const body = typeof response?.text === "string" ? response.text : "";
  let parsed = void 0;
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
    }
  }
  const errorCode = typeof parsed?.error === "string" ? parsed.error : void 0;
  const errorDescription = typeof parsed?.error_description === "string" ? parsed.error_description : void 0;
  return { status, error: errorCode, errorDescription, message: errorDescription || errorCode || body || `HTTP ${status ?? "unknown"}` };
}
async function authorizeGoogle(clientId, clientSecret) {
  log("start");
  if (!clientId.trim())
    throw new Error("Google Client ID is not configured.");
  if (!clientSecret.trim())
    throw new Error("Google Client Secret is not configured.");
  if (!window.require)
    throw new Error("Google OAuth\u306F\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u7248Obsidian\u3067\u5229\u7528\u3067\u304D\u307E\u3059\u3002\u30E2\u30D0\u30A4\u30EB\u7248\u306E\u8A8D\u8A3C\u306F\u6B21\u306E\u6BB5\u968E\u3067\u5BFE\u5FDC\u3057\u307E\u3059\u3002");
  const http = require("http");
  const { shell } = window.require("electron");
  const verifier = randomString(48), challenge = pkceChallenge(verifier), state = randomString(24);
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not start OAuth callback server.");
  const redirectUri = `http://127.0.0.1:${address.port}`;
  log("callback server ready", { redirectUri });
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
  log("opening Google authorization page");
  await shell.openExternal(authUrl.toString());
  try {
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        log("authorization timed out");
        reject(new Error("Google OAuth timed out."));
      }, 18e4);
      server.on("request", (req, res) => {
        try {
          const callbackUrl = new URL(req.url ?? "/", redirectUri);
          if (callbackUrl.pathname !== "/")
            return;
          log("callback received");
          if (callbackUrl.searchParams.get("state") !== state) {
            log("state validation failed");
            res.writeHead(400);
            res.end("Invalid OAuth state.");
            reject(new Error("Invalid OAuth state."));
            return;
          }
          const error = callbackUrl.searchParams.get("error");
          if (error) {
            log("Google returned an error", error);
            res.writeHead(400);
            res.end("Google authorization was cancelled.");
            reject(new Error(`Google authorization failed: ${error}`));
            return;
          }
          const value = callbackUrl.searchParams.get("code");
          if (!value)
            throw new Error("Google did not return an authorization code.");
          clearTimeout(timeout);
          log("authorization code received");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><p>Google Calendar connected. You can close this tab.</p></body></html>");
          resolve(value);
        } catch (error) {
          clearTimeout(timeout);
          log("callback processing failed", error instanceof Error ? error.message : String(error));
          reject(error);
        }
      });
    });
    log("token exchange started");
    const response = await (0, import_obsidian.requestUrl)({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), client_secret: clientSecret.trim(), code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri }).toString(), throw: false });
    const details = describeGoogleResponse(response);
    log("token exchange response", { status: details.status, error: details.error, errorDescription: details.errorDescription });
    if (details.status === void 0 || details.status < 200 || details.status >= 300) {
      log("token exchange failed", { status: details.status, error: details.error, errorDescription: details.errorDescription, message: details.message });
      throw new Error(`Google token exchange failed (${details.status ?? "unknown"}): ${details.message}`);
    }
    const data = response.json;
    log("token fields received", { accessToken: Boolean(data.access_token), refreshToken: Boolean(data.refresh_token), expiresIn: Boolean(data.expires_in) });
    if (!data.access_token || !data.expires_in)
      throw new Error("Google OAuth completed, but no usable access token was returned.");
    const tokens = { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1e3 };
    log("authorization completed");
    return tokens;
  } finally {
    server.close();
    log("callback server closed");
  }
}
async function refreshGoogleToken(clientId, clientSecret, refreshToken) {
  log("refresh started");
  const response = await (0, import_obsidian.requestUrl)({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), client_secret: clientSecret.trim(), refresh_token: refreshToken, grant_type: "refresh_token" }).toString(), throw: false });
  const details = describeGoogleResponse(response);
  log("refresh response", { status: details.status, error: details.error, errorDescription: details.errorDescription });
  if (details.status === void 0 || details.status < 200 || details.status >= 300) {
    throw new Error(`Google token refresh failed (${details.status ?? "unknown"}): ${details.message}`);
  }
  const data = response.json;
  if (!data.access_token || !data.expires_in)
    throw new Error("Google refresh succeeded, but no usable access token was returned.");
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1e3 };
}
function hash4(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(4, "0").slice(-4);
}
function calendarSlug(calendarId) {
  const local = (calendarId.split("@")[0] || calendarId).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${local.slice(0, 20) || "cal"}-${hash4(calendarId)}`;
}
async function listGoogleCalendars(accessToken) {
  log("calendar list request started");
  const calendars = [];
  let pageToken;
  do {
    const url = new URL(`${CALENDAR_ENDPOINT}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    if (pageToken)
      url.searchParams.set("pageToken", pageToken);
    const response = await (0, import_obsidian.requestUrl)({ url: url.toString(), headers: { Authorization: `Bearer ${accessToken}` }, throw: false });
    if (response.status < 200 || response.status >= 300) {
      const details = describeGoogleResponse(response);
      log("calendar list failed", details);
      if (details.status === 401 || details.status === 403) {
        throw new Error("\u30AB\u30EC\u30F3\u30C0\u30FC\u4E00\u89A7\u3092\u53D6\u5F97\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u8A2D\u5B9A\u304B\u3089\u518D\u8A8D\u8A3C\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      throw new Error(`Google calendar list failed (${details.status ?? "unknown"}): ${details.message}`);
    }
    const data = response.json;
    for (const item of data.items ?? []) {
      calendars.push({ id: item.id, summary: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary) });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  log("calendar list received", { count: calendars.length });
  return calendars.sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary));
}
async function listGoogleEvents(accessToken, calendarId, timeMin, timeMax) {
  log("calendar request started", { calendarId, timeMin, timeMax });
  const url = new URL(`${CALENDAR_ENDPOINT}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");
  const response = await (0, import_obsidian.requestUrl)({ url: url.toString(), headers: { Authorization: `Bearer ${accessToken}` } });
  log("calendar response", { status: response.status });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Google Calendar request failed (${response.status}).`);
  const data = response.json;
  log("calendar events received", { count: data.items?.length ?? 0 });
  return (data.items ?? []).map((event) => ({ id: event.id, summary: event.summary || "(\u7121\u984C)", start: event.start?.dateTime ?? event.start?.date ?? "", end: event.end?.dateTime ?? event.end?.date ?? "", allDay: !event.start?.dateTime }));
}
async function createGoogleEvent(accessToken, calendarId, title, start, end, allDay = false) {
  const payload = allDay ? { summary: title, start: { date: localDate(start) }, end: { date: localDate(end) } } : { summary: title, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } };
  log("calendar event create started", {
    calendarId,
    title,
    allDay,
    start: allDay ? localDate(start) : start.toISOString(),
    end: allDay ? localDate(end) : end.toISOString()
  });
  const url = new URL(`${CALENDAR_ENDPOINT}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("sendUpdates", "none");
  const response = await (0, import_obsidian.requestUrl)({
    url: url.toString(),
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    throw: false
  });
  log("calendar event create response", { status: response.status });
  if (response.status < 200 || response.status >= 300) {
    const details = describeGoogleResponse(response);
    log("calendar event create failed", details);
    throw new Error(`Google Calendar event creation failed (${details.status ?? "unknown"}): ${details.message}`);
  }
  const data = response.json;
  if (!data.id)
    throw new Error("Google Calendar event was created but no event ID was returned.");
  log("calendar event created", { id: data.id });
  return { id: data.id, htmlLink: data.htmlLink };
}
var MAX_ALL_DAY_SPAN = 62;
function localDate(value) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}
function localTime(value) {
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}
function sanitizeTitle(summary) {
  return summary.replace(/[\r\n\t]+/g, " ").replace(/%%/g, "%").trim() || "(\u7121\u984C)";
}
function allDayRange(event) {
  const start = event.start.slice(0, 10);
  if (!start)
    return [];
  const end = event.end.slice(0, 10);
  const days = [start];
  if (end && end > start) {
    let cursor = addDays(start, 1);
    while (cursor < end && days.length < MAX_ALL_DAY_SPAN) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return days;
}
function toTechoEntries(events, year, month, calendarId) {
  const prefix = `${year}-${pad2(month)}-`;
  const slug = calendarSlug(calendarId);
  const entries = [];
  for (const event of events) {
    const title = sanitizeTitle(event.summary);
    if (event.allDay) {
      const days = allDayRange(event);
      for (const date2 of days) {
        if (!date2.startsWith(prefix))
          continue;
        entries.push({ key: days.length > 1 ? `${slug}:${event.id}/${date2}` : `${slug}:${event.id}`, date: date2, title });
      }
      continue;
    }
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime()))
      continue;
    const date = localDate(start);
    if (!date.startsWith(prefix))
      continue;
    const end = event.end ? new Date(event.end) : null;
    const sameDay = end && !Number.isNaN(end.getTime()) && localDate(end) === date;
    entries.push({ key: `${slug}:${event.id}`, date, time: sameDay ? `${localTime(start)}-${localTime(end)}` : localTime(start), title });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title));
}
function notifyGoogleError(error) {
  log("error", error instanceof Error ? error.message : String(error));
  new import_obsidian.Notice(error instanceof Error ? error.message : "Google Calendar\u3068\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
}

// src/settings.ts
var MySystemTechoSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    /** Fetched on demand and kept across re-renders so the picker survives a toggle. */
    this.calendars = [];
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "My-system-Techo" });
    new import_obsidian2.Setting(containerEl).setName("Markdown\u30D5\u30A9\u30EB\u30C0").setDesc("\u624B\u5E33\u30C7\u30FC\u30BF\u3092\u4FDD\u5B58\u3059\u308BVault\u5185\u306E\u30D5\u30A9\u30EB\u30C0").addText((text) => text.setPlaceholder("techo").setValue(this.plugin.settings.sourceFolder).onChange(async (value) => {
      this.plugin.settings.sourceFolder = value.trim().replace(/^\/+|\/+$/g, "");
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Google Calendar" });
    containerEl.createEl("p", { text: "Google Calendar\u306E\u4E88\u5B9A\u3092\u53D6\u5F97\u30FB\u8FFD\u52A0\u3057\u307E\u3059\u3002OAuth\u30C8\u30FC\u30AF\u30F3\u3068Client Secret\u306F\u3053\u306EVault\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u30C7\u30FC\u30BF\u306B\u4FDD\u5B58\u3055\u308C\u3001GitHub\u306B\u306F\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093\u3002\u4E88\u5B9A\u306E\u8FFD\u52A0\u306B\u306F\u518D\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002" });
    new import_obsidian2.Setting(containerEl).setName("Google Client ID").setDesc("Google Cloud\u3067\u4F5C\u6210\u3057\u305FOAuth\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306EClient ID").addText((text) => text.setPlaceholder("xxxx.apps.googleusercontent.com").setValue(this.plugin.settings.googleClientId).onChange(async (value) => {
      this.plugin.settings.googleClientId = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Google Client Secret").setDesc("Google Cloud\u306E\u540C\u3058OAuth\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306B\u8868\u793A\u3055\u308C\u308BClient Secret\u3002GitHub\u306B\u306F\u4FDD\u5B58\u3055\u308C\u307E\u305B\u3093\u3002").addText((text) => text.setPlaceholder("GOCSPX-...").setValue(this.plugin.settings.googleClientSecret).onChange(async (value) => {
      this.plugin.settings.googleClientSecret = value.trim();
      await this.plugin.saveSettings();
    }));
    const tokens = this.plugin.settings.googleTokens;
    const isConnected = Boolean(tokens?.accessToken || tokens?.refreshToken);
    new import_obsidian2.Setting(containerEl).setName("Google Calendar\u306B\u63A5\u7D9A").setDesc("\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u7248Obsidian\u3067Google\u306E\u8A8D\u8A3C\u753B\u9762\u3092\u958B\u304D\u307E\u3059\u3002\u8AAD\u307F\u53D6\u308A\u30FB\u4E88\u5B9A\u8FFD\u52A0\u306E\u6A29\u9650\u3092\u53D6\u5F97\u3057\u307E\u3059\u3002").addButton((button) => button.setButtonText(isConnected ? "\u518D\u8A8D\u8A3C" : "\u63A5\u7D9A").setCta().onClick(async () => {
      if (!this.plugin.settings.googleClientId) {
        new import_obsidian2.Notice("\u5148\u306BGoogle Client ID\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      if (!this.plugin.settings.googleClientSecret) {
        new import_obsidian2.Notice("\u5148\u306BGoogle Client Secret\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      button.setDisabled(true);
      try {
        new import_obsidian2.Notice("Google OAuth: \u8A8D\u8A3C\u3092\u958B\u59CB\u3057\u307E\u3059\u3002");
        const newTokens = await authorizeGoogle(this.plugin.settings.googleClientId, this.plugin.settings.googleClientSecret);
        new import_obsidian2.Notice(`Google OAuth: \u30C8\u30FC\u30AF\u30F3\u53D6\u5F97\u6210\u529F\uFF08access token: ${newTokens.accessToken ? "\u3042\u308A" : "\u306A\u3057"} / refresh token: ${newTokens.refreshToken ? "\u3042\u308A" : "\u306A\u3057"}\uFF09`);
        if (!newTokens.accessToken)
          throw new Error("Google OAuth\u306F\u5B8C\u4E86\u3057\u307E\u3057\u305F\u304C\u3001\u30A2\u30AF\u30BB\u30B9\u30C8\u30FC\u30AF\u30F3\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
        this.plugin.settings.googleTokens = newTokens;
        await this.plugin.saveSettings();
        new import_obsidian2.Notice(`Google Calendar: \u8A2D\u5B9A\u4FDD\u5B58\u5B8C\u4E86\uFF08\u63A5\u7D9A\u72B6\u614B: ${this.plugin.settings.googleTokens?.accessToken ? "\u4FDD\u5B58\u6E08\u307F" : "\u672A\u4FDD\u5B58"}\uFF09`);
        this.display();
      } catch (error) {
        notifyGoogleError(error);
      } finally {
        button.setDisabled(false);
      }
    }));
    new import_obsidian2.Setting(containerEl).setName("\u63A5\u7D9A\u72B6\u614B").setDesc(isConnected ? "\u63A5\u7D9A\u6E08\u307F" : "\u672A\u63A5\u7D9A");
    new import_obsidian2.Setting(containerEl).setName("Google\u53D6\u5F97\u30C6\u30B9\u30C8").setDesc("Markdown\u306B\u306F\u66F8\u304D\u8FBC\u307E\u305A\u3001\u73FE\u5728\u8868\u793A\u4E2D\u306E\u6708\u306B\u3064\u3044\u3066Google\u304B\u3089\u30AB\u30EC\u30F3\u30C0\u30FC\u4E00\u89A7\u3068\u4E88\u5B9A\u3092\u53D6\u5F97\u3067\u304D\u308B\u304B\u78BA\u8A8D\u3057\u307E\u3059\u3002").addButton((button) => button.setButtonText("\u53D6\u5F97\u30C6\u30B9\u30C8").setDisabled(!isConnected).onClick(async () => {
      button.setDisabled(true);
      button.setButtonText("\u53D6\u5F97\u4E2D\u2026");
      try {
        await this.plugin.testGoogleCalendarRead();
      } finally {
        button.setDisabled(false);
        button.setButtonText("\u53D6\u5F97\u30C6\u30B9\u30C8");
      }
    }));
    this.renderCalendarPicker(containerEl, isConnected);
  }
  async setCalendarIds(ids) {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    this.plugin.settings.googleCalendarIds = unique.length ? unique : ["primary"];
    if (!this.plugin.settings.googleCalendarIds.includes(this.plugin.settings.googleWriteCalendarId)) {
      this.plugin.settings.googleWriteCalendarId = this.plugin.settings.googleCalendarIds[0];
    }
    await this.plugin.saveSettings();
    this.display();
  }
  async setCalendarPrefix(calendarId, value) {
    const prefixes = { ...this.plugin.settings.googleCalendarPrefixes };
    const prefix = value.trim();
    if (prefix)
      prefixes[calendarId] = prefix;
    else
      delete prefixes[calendarId];
    this.plugin.settings.googleCalendarPrefixes = prefixes;
    await this.plugin.saveSettings();
  }
  calendarName(calendarId) {
    return this.calendars.find((calendar) => calendar.id === calendarId)?.summary || this.plugin.settings.googleCalendarNames[calendarId] || calendarId;
  }
  renderCalendarPicker(containerEl, isConnected) {
    const selected = this.plugin.syncCalendarIds();
    containerEl.createEl("h3", { text: "\u540C\u671F\u3059\u308B\u30AB\u30EC\u30F3\u30C0\u30FC" });
    containerEl.createEl("p", { text: "\u9078\u3093\u3060\u30AB\u30EC\u30F3\u30C0\u30FC\u306E\u4E88\u5B9A\u304C\u624B\u5E33\u306EMarkdown\u306B\u66F8\u304D\u8FBC\u307E\u308C\u307E\u3059\u3002\u30AB\u30EC\u30F3\u30C0\u30FC\u540D\u3092\u8868\u793A\u3057\u3001ID\u306F\u305D\u306E\u4E0B\u306B\u8868\u793A\u3057\u307E\u3059\u3002\u5404\u30AB\u30EC\u30F3\u30C0\u30FC\u306E\u63A5\u982D\u8A18\u53F7\u306B\u306F \u{1F46A} \u3084 \u{1F4BC} \u306A\u3069\u4EFB\u610F\u306E\u6587\u5B57\u3092\u8A2D\u5B9A\u3067\u304D\u307E\u3059\u3002" });
    new import_obsidian2.Setting(containerEl).setName("\u30AB\u30EC\u30F3\u30C0\u30FC\u4E00\u89A7\u3092\u53D6\u5F97").setDesc(isConnected ? "Google\u304B\u3089\u8CFC\u8AAD\u4E2D\u306E\u30AB\u30EC\u30F3\u30C0\u30FC\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3059\u3002\u53D6\u5F97\u3057\u305F\u30AB\u30EC\u30F3\u30C0\u30FC\u540D\u306F\u6B21\u56DE\u4EE5\u964D\u3082\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002" : "\u5148\u306BGoogle Calendar\u3078\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002").addButton((button) => button.setButtonText("\u53D6\u5F97").setDisabled(!isConnected).onClick(async () => {
      button.setDisabled(true);
      try {
        this.calendars = await this.plugin.listGoogleCalendars();
        new import_obsidian2.Notice(`${this.calendars.length}\u4EF6\u306E\u30AB\u30EC\u30F3\u30C0\u30FC\u3092\u53D6\u5F97\u3057\u307E\u3057\u305F\u3002`);
        this.display();
      } catch (error) {
        notifyGoogleError(error);
        button.setDisabled(false);
      }
    }));
    if (this.calendars.length) {
      for (const calendar of this.calendars) {
        new import_obsidian2.Setting(containerEl).setName(calendar.primary ? `${calendar.summary}\uFF08\u30E1\u30A4\u30F3\uFF09` : calendar.summary).setDesc(`ID: ${calendar.id}`).addText((text) => {
          text.setPlaceholder("\u63A5\u982D\u8A18\u53F7 \u{1F46A}").setValue(this.plugin.settings.googleCalendarPrefixes[calendar.id] ?? "").onChange(async (value) => {
            await this.setCalendarPrefix(calendar.id, value);
          });
          text.inputEl.setAttribute("aria-label", `${calendar.summary} \u306E\u63A5\u982D\u8A18\u53F7`);
        }).addToggle((toggle) => toggle.setValue(selected.includes(calendar.id)).onChange(async (value) => {
          const next = value ? [...selected, calendar.id] : selected.filter((id) => id !== calendar.id);
          await this.setCalendarIds(next);
        }));
      }
    }
    for (const id of selected.filter((id2) => !this.calendars.some((calendar) => calendar.id === id2))) {
      const name = this.calendarName(id);
      new import_obsidian2.Setting(containerEl).setName(name).setDesc(name === id ? `\u540C\u671F\u5BFE\u8C61 / ID: ${id}` : `ID: ${id}`).addText((text) => {
        text.setPlaceholder("\u63A5\u982D\u8A18\u53F7 \u{1F46A}").setValue(this.plugin.settings.googleCalendarPrefixes[id] ?? "").onChange(async (value) => {
          await this.setCalendarPrefix(id, value);
        });
        text.inputEl.setAttribute("aria-label", `${name} \u306E\u63A5\u982D\u8A18\u53F7`);
      }).addExtraButton((button) => button.setIcon("trash").setTooltip("\u540C\u671F\u5BFE\u8C61\u304B\u3089\u5916\u3059").onClick(async () => {
        await this.setCalendarIds(selected.filter((value) => value !== id));
      }));
    }
    let manualId = "";
    new import_obsidian2.Setting(containerEl).setName("\u30AB\u30EC\u30F3\u30C0\u30FCID\u3092\u624B\u52D5\u3067\u8FFD\u52A0").setDesc("\u4E00\u89A7\u3092\u53D6\u5F97\u3067\u304D\u306A\u3044\u5834\u5408\u306B\u3001Google\u30AB\u30EC\u30F3\u30C0\u30FC\u306EID\u3092\u76F4\u63A5\u5165\u529B\u3057\u307E\u3059\u3002").addText((text) => text.setPlaceholder("xxxx@group.calendar.google.com").onChange((value) => {
      manualId = value;
    })).addButton((button) => button.setButtonText("\u8FFD\u52A0").onClick(async () => {
      if (!manualId.trim())
        return;
      await this.setCalendarIds([...selected, manualId]);
    }));
    new import_obsidian2.Setting(containerEl).setName("\u4E88\u5B9A\u306E\u8FFD\u52A0\u5148").setDesc("\u300CGoogle\u4E88\u5B9A\u8FFD\u52A0\u300D\u3067\u66F8\u304D\u8FBC\u3080\u30AB\u30EC\u30F3\u30C0\u30FC\u3002").addDropdown((dropdown) => {
      for (const id of selected)
        dropdown.addOption(id, this.calendarName(id));
      dropdown.setValue(this.plugin.settings.googleWriteCalendarId || selected[0]);
      dropdown.onChange(async (value) => {
        this.plugin.settings.googleWriteCalendarId = value;
        await this.plugin.saveSettings();
      });
    });
  }
};

// src/views/techo.ts
var import_obsidian4 = require("obsidian");

// src/data/markdown.ts
var import_obsidian3 = require("obsidian");
var MONTH_HEADING = /^#{1,6}\s+(\d{4})年(\d{1,2})月\s*$/;
var ISO_DATE_HEADING = /^#{1,6}\s+(\d{4})-(\d{2})-(\d{2})\s*$/;
var JP_DATE_HEADING = /^#{1,6}\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/;
var WEEK_HEADING = /^#{1,6}\s+week\s*(\d{1,2})\s*$/i;
var HEADING = /^(#{1,6})\s+/;
var ITEM = /^　*-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s+)?(.+?)\s*$/;
var GOOGLE_MARKER = /\s*%%gcal:([^%\s]+)%%\s*$/;
function scanHeadings(lines) {
  const headings = [];
  let year = 0;
  let month = 0;
  lines.forEach((line, index) => {
    const level = line.match(HEADING)?.[1].length;
    if (!level)
      return;
    const monthHeading = line.match(MONTH_HEADING);
    if (monthHeading) {
      year = Number(monthHeading[1]);
      month = Number(monthHeading[2]);
      headings.push({ index, level, kind: "month" });
      return;
    }
    const isoHeading = line.match(ISO_DATE_HEADING);
    if (isoHeading) {
      year = Number(isoHeading[1]);
      month = Number(isoHeading[2]);
      headings.push({ index, level, kind: "date", date: `${isoHeading[1]}-${isoHeading[2]}-${isoHeading[3]}` });
      return;
    }
    const jpHeading = line.match(JP_DATE_HEADING);
    if (jpHeading && year && month === Number(jpHeading[1])) {
      headings.push({ index, level, kind: "date", date: `${year}-${pad2(month)}-${pad2(Number(jpHeading[2]))}` });
      return;
    }
    const weekHeading = line.match(WEEK_HEADING);
    headings.push(weekHeading ? { index, level, kind: "week", week: Number(weekHeading[1]) } : { index, level, kind: "other" });
  });
  return headings;
}
function lineDates(lines) {
  const byIndex = new Map(scanHeadings(lines).map((heading) => [heading.index, heading]));
  const dates = [];
  let current = "";
  for (let index = 0; index < lines.length; index++) {
    const heading = byIndex.get(index);
    if (heading)
      current = heading.kind === "date" ? heading.date : "";
    dates.push(current);
  }
  return dates;
}
function parseMarkdown(text, filePath) {
  const lines = text.split(/\r?\n/);
  const dates = lineDates(lines);
  const items = [];
  lines.forEach((line, index) => {
    const date = dates[index];
    if (!date)
      return;
    const parsed = parseItemLine(line);
    if (!parsed)
      return;
    items.push({
      id: `${filePath}:${index + 1}`,
      date,
      time: parsed.time,
      title: parsed.title,
      kind: parsed.kind,
      checked: parsed.checked,
      sourceLine: index + 1,
      googleId: parsed.googleId
    });
  });
  return items;
}
function parseItemLine(line) {
  const marker = line.match(GOOGLE_MARKER);
  const match = (marker ? line.slice(0, marker.index) : line).match(ITEM);
  if (!match)
    return null;
  return {
    time: match[2] || void 0,
    title: match[3],
    kind: match[1] !== void 0 ? "task" : "event",
    checked: Boolean(match[1] && match[1].toLowerCase() === "x"),
    googleId: marker?.[1]
  };
}
function renderItemLine(item) {
  const checkbox = item.kind === "task" ? `[${item.checked ? "x" : " "}] ` : "";
  return `- ${checkbox}${item.time ? `${item.time} ` : ""}${item.title}`;
}
function joinPath(folder, name) {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${name}` : name;
}
function monthFilePath(folder, year, month) {
  return joinPath(folder, `${year}-${pad2(month)}.md`);
}
async function ensureFolder(app, folder) {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  if (!prefix)
    return;
  let current = "";
  for (const segment of prefix.split("/")) {
    current = current ? `${current}/${segment}` : segment;
    if (app.vault.getAbstractFileByPath(current))
      continue;
    try {
      await app.vault.createFolder(current);
    } catch {
    }
  }
}
async function openMonthFile(app, folder, year, month) {
  const path = monthFilePath(folder, year, month);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof import_obsidian3.TFile)
    return existing;
  if (existing)
    throw new Error(`\u540C\u671F\u5148 ${path} \u306F\u901A\u5E38\u306E\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002`);
  await ensureFolder(app, folder);
  try {
    return await app.vault.create(path, `# ${year}\u5E74${month}\u6708
`);
  } catch (error) {
    const raced = app.vault.getAbstractFileByPath(path);
    if (raced instanceof import_obsidian3.TFile)
      return raced;
    throw error;
  }
}
var DEFAULT_DATE_HEADING_STYLE = { level: 2, iso: false, weekday: true, blankAfterHeading: true };
function detectDateHeadingStyle(lines) {
  const heading = scanHeadings(lines).find((info) => info.kind === "date");
  if (!heading)
    return DEFAULT_DATE_HEADING_STYLE;
  const text = lines[heading.index];
  return {
    level: heading.level,
    iso: /\d{4}-\d{2}-\d{2}/.test(text),
    weekday: /\([^)]*\)\s*$/.test(text),
    blankAfterHeading: (lines[heading.index + 1] ?? "").trim() === ""
  };
}
function renderDateHeading(date, style) {
  const hashes = "#".repeat(style.level);
  if (style.iso)
    return `${hashes} ${date}`;
  const [, month, day] = date.split("-").map(Number);
  return `${hashes} ${month}\u6708${day}\u65E5${style.weekday ? `(${weekdayJa(date)})` : ""}`;
}
function insertItemLine(lines, date, text, style) {
  const dates = lineDates(lines);
  const headings = scanHeadings(lines);
  const headingIndexes = new Set(headings.map((info) => info.index));
  const next = [...lines];
  let lastOwned = -1;
  for (let index = 0; index < lines.length; index++) {
    if (dates[index] === date && lines[index].trim() !== "" && !headingIndexes.has(index))
      lastOwned = index;
  }
  if (lastOwned >= 0) {
    next.splice(lastOwned + 1, 0, text);
    return next;
  }
  const heading = headings.find((info) => info.kind === "date" && info.date === date);
  if (heading) {
    const position2 = heading.index + ((lines[heading.index + 1] ?? "").trim() === "" ? 2 : 1);
    next.splice(position2, 0, .../^#{1,6}\s/.test(lines[position2] ?? "") ? [text, ""] : [text]);
    return next;
  }
  const position = findNewDateHeadingPosition(lines, date);
  const block = style.blankAfterHeading ? [renderDateHeading(date, style), "", text] : [renderDateHeading(date, style), text];
  if (position > 0 && lines[position - 1]?.trim() !== "")
    block.unshift("");
  if (position < lines.length && lines[position]?.trim() !== "")
    block.push("");
  next.splice(position, 0, ...block);
  return next;
}
function findNewDateHeadingPosition(lines, date) {
  const headings = scanHeadings(lines);
  const weeks = headings.filter((info) => info.kind === "week");
  let start = 0;
  let end = lines.length;
  if (weeks.length) {
    const target = isoWeek(date);
    const exact = weeks.find((info) => info.week === target);
    if (exact) {
      start = exact.index + 1;
      end = weeks.find((info) => info.index > exact.index)?.index ?? lines.length;
    } else {
      const later = weeks.find((info) => (info.week ?? 0) > target);
      if (later) {
        const previous = [...weeks].reverse().find((info) => info.index < later.index);
        start = previous ? previous.index + 1 : 0;
        end = later.index;
      } else {
        start = weeks[weeks.length - 1].index + 1;
      }
    }
  }
  const next = headings.find((info) => info.kind === "date" && info.index >= start && info.index < end && info.date > date);
  if (next)
    return next.index;
  let position = end;
  while (position > start && lines[position - 1].trim() === "")
    position--;
  return position;
}
async function appendTechoItem(app, folder, item) {
  const [year, month] = item.date.split("-").map(Number);
  const file = await openMonthFile(app, folder, year, month);
  const lines = (await app.vault.read(file)).split(/\r?\n/);
  const updated = insertItemLine(lines, item.date, renderItemLine(item), detectDateHeadingStyle(lines));
  await app.vault.modify(file, updated.join("\n"));
  return file.path;
}
function techoFiles(app, folder) {
  const prefix = folder.replace(/\/+$/, "");
  return app.vault.getMarkdownFiles().filter((file) => !prefix || file.path.startsWith(`${prefix}/`));
}
async function readItems(app, folder, from, to) {
  const items = [];
  for (const file of techoFiles(app, folder)) {
    const text = await app.vault.cachedRead(file);
    items.push(...parseMarkdown(text, file.path).filter((item) => item.date >= from && item.date <= to));
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}
function parseUndatedItems(text, filePath) {
  const lines = text.split(/\r?\n/);
  const byIndex = new Map(scanHeadings(lines).map((heading) => [heading.index, heading]));
  const items = [];
  let section = "";
  let week;
  lines.forEach((line, index) => {
    const heading = byIndex.get(index);
    if (heading) {
      if (heading.kind === "week")
        week = heading.week;
      section = heading.kind === "other" ? line.replace(HEADING, "").trim() : "";
      if (heading.kind === "month")
        week = void 0;
      return;
    }
    if (!section)
      return;
    const parsed = parseItemLine(line);
    if (!parsed)
      return;
    items.push({ id: `${filePath}:${index + 1}`, section, week, time: parsed.time, title: parsed.title, kind: parsed.kind, checked: parsed.checked, sourceLine: index + 1 });
  });
  return items;
}
async function readUndatedItems(app, folder, year, month) {
  const file = app.vault.getAbstractFileByPath(monthFilePath(folder, year, month));
  if (!(file instanceof import_obsidian3.TFile))
    return [];
  return parseUndatedItems(await app.vault.cachedRead(file), file.path);
}

// src/views/techo.ts
var TECHO_VIEW_TYPE = "my-system-techo-month-grid";
var WEEKDAYS = ["\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F", "\u65E5"];
var SCOPES = [
  { scope: "year", label: "\u5E74" },
  { scope: "month", label: "\u6708" },
  { scope: "week", label: "\u9031" }
];
var TechoView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  get year() {
    return this.plugin.settings.year;
  }
  get month() {
    return this.plugin.settings.month;
  }
  get scope() {
    return this.plugin.settings.scope;
  }
  /** The week view anchors on this day; it is clamped because months differ in length. */
  get day() {
    return clampDay(this.year, this.month, this.plugin.settings.day || 1);
  }
  getViewType() {
    return TECHO_VIEW_TYPE;
  }
  getDisplayText() {
    return "My-system-Techo";
  }
  getIcon() {
    return "calendar-days";
  }
  async onOpen() {
    await this.render();
  }
  async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("mst-grid-root");
    if (this.scope === "year")
      await this.renderYear(root);
    else if (this.scope === "week")
      await this.renderWeek(root);
    else
      await this.renderMonth(root);
  }
  // --- shared chrome -------------------------------------------------------
  buildToolbar(root, title, shift, todayLabel) {
    const toolbar = root.createDiv({ cls: "mst-toolbar" });
    toolbar.createEl("button", { text: "\u2039" }).onclick = async () => {
      await shift(-1);
    };
    toolbar.createEl("strong", { text: title });
    toolbar.createEl("button", { text: "\u203A" }).onclick = async () => {
      await shift(1);
    };
    toolbar.createEl("button", { text: todayLabel }).onclick = async () => {
      await this.goToToday();
    };
    const scopes = toolbar.createDiv({ cls: "mst-scopes" });
    for (const { scope, label } of SCOPES) {
      const button = scopes.createEl("button", { cls: scope === this.scope ? "mst-scope is-active" : "mst-scope", text: label });
      button.onclick = async () => {
        this.plugin.settings.scope = scope;
        await this.plugin.saveSettings();
        await this.render();
      };
    }
    const sync = toolbar.createEl("button", { text: "\u4ECA\u65E5\u540C\u671F" });
    sync.setAttr("aria-label", "\u4ECA\u65E5\u306EGoogle Calendar\u4E88\u5B9A\u3092\u540C\u671F");
    sync.onclick = async () => {
      sync.disabled = true;
      sync.setText("\u540C\u671F\u4E2D\u2026");
      try {
        await this.plugin.syncGoogleCalendarToday();
      } finally {
        sync.disabled = false;
        sync.setText("\u4ECA\u65E5\u540C\u671F");
      }
    };
  }
  renderItem(cell, item) {
    const row = cell.createDiv({ cls: item.googleId ? "mst-item is-google" : "mst-item" });
    row.setText(`${item.time ? `${item.time} ` : ""}${item.kind === "task" ? `${item.checked ? "\u2611" : "\u2610"} ` : ""}${item.title}`);
  }
  /** Renders `### 日付未定` / `### タスク` blocks, which have no day to sit under in the grid. */
  renderUndated(root, items) {
    if (!items.length)
      return;
    const sections = /* @__PURE__ */ new Map();
    for (const item of items)
      sections.set(item.section, [...sections.get(item.section) ?? [], item]);
    const wrapper = root.createDiv({ cls: "mst-undated" });
    for (const [section, entries] of sections) {
      const box = wrapper.createDiv({ cls: "mst-undated-section" });
      box.createDiv({ cls: "mst-undated-title", text: section });
      for (const entry of entries) {
        box.createDiv({ cls: "mst-item" }).setText(`${entry.time ? `${entry.time} ` : ""}${entry.kind === "task" ? `${entry.checked ? "\u2611" : "\u2610"} ` : ""}${entry.title}`);
      }
    }
  }
  dayActions(cell, date) {
    const actions = cell.createDiv({ cls: "mst-day-actions" });
    const add = actions.createEl("button", { cls: "mst-add", text: "+" });
    add.setAttr("aria-label", `${date} \u306B\u30ED\u30FC\u30AB\u30EB\u4E88\u5B9A\u3092\u8FFD\u52A0`);
    add.onclick = () => void this.addItem(date);
    const google = actions.createEl("button", { cls: "mst-add-google", text: "G+" });
    google.setAttr("aria-label", `${date} \u306BGoogle Calendar\u4E88\u5B9A\u3092\u8FFD\u52A0`);
    google.onclick = () => void this.plugin.addGoogleCalendarEvent(date);
  }
  async byDate(from, to) {
    const items = await readItems(this.app, this.plugin.settings.sourceFolder, from, to);
    const byDate = /* @__PURE__ */ new Map();
    for (const item of items)
      byDate.set(item.date, [...byDate.get(item.date) ?? [], item]);
    return byDate;
  }
  // --- month ---------------------------------------------------------------
  async renderMonth(root) {
    this.buildToolbar(root, monthLabel(this.year, this.month), (delta) => this.shiftMonth(delta), "\u4ECA\u65E5");
    const count = daysInMonth(this.year, this.month);
    const byDate = await this.byDate(isoDate(this.year, this.month, 1), isoDate(this.year, this.month, count));
    const grid = root.createDiv({ cls: "mst-grid" });
    WEEKDAYS.forEach((label) => grid.createDiv({ cls: "mst-grid-header", text: label }));
    const offset = (new Date(this.year, this.month - 1, 1).getDay() + 6) % 7;
    const total = Math.ceil((offset + count) / 7) * 7;
    for (let index = 0; index < total; index++) {
      const day = index - offset + 1;
      const cell = grid.createDiv({ cls: "mst-day" });
      if (day < 1 || day > count) {
        cell.addClass("is-outside");
        continue;
      }
      const date = isoDate(this.year, this.month, day);
      cell.createDiv({ cls: "mst-day-number", text: String(day) });
      for (const item of byDate.get(date) ?? [])
        this.renderItem(cell, item);
      this.dayActions(cell, date);
    }
    const undated = await readUndatedItems(this.app, this.plugin.settings.sourceFolder, this.year, this.month);
    this.renderUndated(root, undated.filter((item) => item.week === void 0));
  }
  // --- week ----------------------------------------------------------------
  async renderWeek(root) {
    const monday = startOfWeek(isoDate(this.year, this.month, this.day));
    const sunday = addDays(monday, 6);
    const week = isoWeek(monday);
    this.buildToolbar(root, `week${week}\uFF08${monday} \u301C ${sunday}\uFF09`, (delta) => this.shiftWeek(delta), "\u4ECA\u9031");
    const byDate = await this.byDate(monday, sunday);
    const list = root.createDiv({ cls: "mst-week" });
    for (let index = 0; index < 7; index++) {
      const date = addDays(monday, index);
      const [, month, day] = date.split("-").map(Number);
      const row = list.createDiv({ cls: "mst-week-day" });
      if (date === todayIso())
        row.addClass("is-today");
      const head = row.createDiv({ cls: "mst-week-head" });
      head.createSpan({ cls: `mst-week-date is-${["mon", "tue", "wed", "thu", "fri", "sat", "sun"][index]}`, text: `${month}\u6708${day}\u65E5(${weekdayJa(date)})` });
      const body = row.createDiv({ cls: "mst-week-body" });
      for (const item of byDate.get(date) ?? [])
        this.renderItem(body, item);
      this.dayActions(head, date);
    }
    const undated = await readUndatedItems(this.app, this.plugin.settings.sourceFolder, this.year, this.month);
    this.renderUndated(root, undated.filter((item) => item.week === week));
  }
  // --- year ----------------------------------------------------------------
  async renderYear(root) {
    this.buildToolbar(root, `${this.year}\u5E74`, (delta) => this.shiftYear(delta), "\u4ECA\u5E74");
    const byDate = await this.byDate(isoDate(this.year, 1, 1), isoDate(this.year, 12, 31));
    const grid = root.createDiv({ cls: "mst-year" });
    grid.createDiv({ cls: "mst-year-corner" });
    for (let month = 1; month <= 12; month++) {
      const header = grid.createDiv({ cls: "mst-year-header", text: `${month}\u6708` });
      header.onclick = () => void this.openMonth(month, 1);
    }
    for (let day = 1; day <= 31; day++) {
      grid.createDiv({ cls: "mst-year-day", text: String(day) });
      for (let month = 1; month <= 12; month++) {
        const cell = grid.createDiv({ cls: "mst-year-cell" });
        if (day > daysInMonth(this.year, month)) {
          cell.addClass("is-empty");
          continue;
        }
        const date = isoDate(this.year, month, day);
        const weekday = new Date(this.year, month - 1, day).getDay();
        if (weekday === 0)
          cell.addClass("is-sun");
        else if (weekday === 6)
          cell.addClass("is-sat");
        if (date === todayIso())
          cell.addClass("is-today");
        cell.createSpan({ cls: "mst-year-weekday", text: weekdayJa(date) });
        const items = byDate.get(date) ?? [];
        if (items.length) {
          cell.addClass("has-items");
          cell.createSpan({ cls: "mst-year-count", text: String(items.length) });
        }
        cell.setAttr("aria-label", items.length ? `${date}\uFF08${items.length}\u4EF6\uFF09` : date);
        cell.setAttr("title", items.length ? `${date}
${items.map((item) => `${item.time ? `${item.time} ` : ""}${item.title}`).join("\n")}` : date);
        cell.onclick = () => void this.openMonth(month, day);
      }
    }
  }
  // --- navigation ----------------------------------------------------------
  async openMonth(month, day) {
    this.plugin.settings.month = month;
    this.plugin.settings.day = day;
    this.plugin.settings.scope = "month";
    await this.plugin.saveSettings();
    await this.render();
  }
  async goToToday() {
    const now = /* @__PURE__ */ new Date();
    this.plugin.settings.year = now.getFullYear();
    this.plugin.settings.month = now.getMonth() + 1;
    this.plugin.settings.day = now.getDate();
    await this.plugin.saveSettings();
    await this.render();
  }
  async addItem(date) {
    const title = window.prompt(`${date} \u306E\u4E88\u5B9A\u30FB\u30BF\u30B9\u30AF`);
    if (!title?.trim())
      return;
    const isTask = window.confirm("\u30BF\u30B9\u30AF\u3068\u3057\u3066\u767B\u9332\u3057\u307E\u3059\u304B\uFF1F\nOK = \u30BF\u30B9\u30AF / \u30AD\u30E3\u30F3\u30BB\u30EB = \u4E88\u5B9A");
    try {
      await appendTechoItem(this.app, this.plugin.settings.sourceFolder, { date, title: title.trim(), kind: isTask ? "task" : "event", checked: false });
    } catch (error) {
      new import_obsidian4.Notice(error instanceof Error ? error.message : "\u624B\u5E33\u3078\u306E\u66F8\u304D\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      return;
    }
    await this.render();
  }
  async shiftMonth(delta) {
    const shifted = new Date(this.year, this.month - 1 + delta, 1);
    this.plugin.settings.year = shifted.getFullYear();
    this.plugin.settings.month = shifted.getMonth() + 1;
    await this.plugin.saveSettings();
    await this.render();
  }
  async shiftWeek(delta) {
    const [year, month, day] = addDays(isoDate(this.year, this.month, this.day), delta * 7).split("-").map(Number);
    this.plugin.settings.year = year;
    this.plugin.settings.month = month;
    this.plugin.settings.day = day;
    await this.plugin.saveSettings();
    await this.render();
  }
  async shiftYear(delta) {
    this.plugin.settings.year += delta;
    await this.plugin.saveSettings();
    await this.render();
  }
};
function todayIso() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// src/data/googleSync.ts
function renderEntryLine(entry) {
  return `- ${entry.time ? `${entry.time} ` : ""}${entry.title}`;
}
function metadataFolder(folder) {
  return joinPath(folder, ".my-system-techo");
}
function metadataPath(folder, year, month) {
  return joinPath(metadataFolder(folder), `google-${year}-${String(month).padStart(2, "0")}.json`);
}
function validStoredEntry(value) {
  if (!value || typeof value !== "object")
    return false;
  const entry = value;
  return typeof entry.date === "string" && typeof entry.title === "string" && (entry.time === void 0 || typeof entry.time === "string");
}
async function ensureAdapterFolder(app, folder) {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  if (!prefix)
    return;
  let current = "";
  for (const segment of prefix.split("/")) {
    current = current ? `${current}/${segment}` : segment;
    if (await app.vault.adapter.exists(current))
      continue;
    try {
      await app.vault.adapter.mkdir(current);
    } catch (error) {
      if (!await app.vault.adapter.exists(current))
        throw error;
    }
  }
}
async function readMetadata(app, folder, year, month) {
  const path = metadataPath(folder, year, month);
  try {
    if (!await app.vault.adapter.exists(path))
      return { version: 1, entries: {} };
    const parsed = JSON.parse(await app.vault.adapter.read(path));
    const entries = {};
    if (parsed?.entries && typeof parsed.entries === "object") {
      for (const [key, value] of Object.entries(parsed.entries)) {
        if (validStoredEntry(value))
          entries[key] = value;
      }
    }
    return { version: 1, entries };
  } catch {
    return { version: 1, entries: {} };
  }
}
async function writeMetadata(app, folder, year, month, metadata) {
  const directory = metadataFolder(folder);
  await ensureAdapterFolder(app, directory);
  const path = metadataPath(folder, year, month);
  const text = `${JSON.stringify(metadata, null, 2)}
`;
  await app.vault.adapter.write(path, text);
}
function keySlug(key) {
  const separator = key.indexOf(":");
  return separator >= 0 ? key.slice(0, separator) : key;
}
function dateInScope(date, scope) {
  return !scope || date >= scope.from && date <= scope.to;
}
function findStoredLine(lines, stored, claimed) {
  const dates = lineDates(lines);
  for (let index = 0; index < lines.length; index++) {
    if (claimed.has(index) || dates[index] !== stored.date)
      continue;
    const parsed = parseItemLine(lines[index]);
    if (!parsed)
      continue;
    if ((parsed.time ?? "") === (stored.time ?? "") && parsed.title === stored.title)
      return index;
  }
  return null;
}
function findEntryLine(lines, entry, claimed) {
  return findStoredLine(lines, { date: entry.date, time: entry.time, title: entry.title }, claimed);
}
function migrateLegacyMarkers(lines, legacySlug, entries) {
  const dates = lineDates(lines);
  let migrated = 0;
  lines.forEach((line, index) => {
    const parsed = parseItemLine(line);
    const raw = parsed?.googleId;
    if (!parsed || !raw || !dates[index])
      return;
    const key = raw.includes(":") ? raw : `${legacySlug}:${raw}`;
    if (!entries[key])
      entries[key] = { date: dates[index], time: parsed.time, title: parsed.title };
    const clean = line.replace(GOOGLE_MARKER, "").replace(/\s+$/, "");
    if (clean !== line) {
      lines[index] = clean;
      migrated++;
    }
  });
  return migrated;
}
async function applyGoogleEvents(app, folder, year, month, entries, syncedSlugs, scope, legacySlug = syncedSlugs[0] ?? "primary") {
  const path = monthFilePath(folder, year, month);
  const file = await openMonthFile(app, folder, year, month);
  const original = await app.vault.read(file);
  let lines = original.split(/\r?\n/);
  const style = detectDateHeadingStyle(lines);
  const result = {
    path,
    added: 0,
    updated: 0,
    adopted: 0,
    removed: 0,
    migrated: 0,
    addedKeys: [],
    removedKeys: [],
    enteredKeys: [],
    leftKeys: []
  };
  const metadata = await readMetadata(app, folder, year, month);
  const previous = { ...metadata.entries };
  result.migrated = migrateLegacyMarkers(lines, legacySlug, previous);
  const scopedEntries = entries.filter((entry) => dateInScope(entry.date, scope));
  const wanted = new Map(scopedEntries.map((entry) => [entry.key, entry]));
  const replacements = /* @__PURE__ */ new Map();
  const removals = /* @__PURE__ */ new Set();
  const insertions = [];
  const claimed = /* @__PURE__ */ new Set();
  for (const entry of scopedEntries) {
    const stored = previous[entry.key];
    const desired = renderEntryLine(entry);
    if (stored) {
      const existingIndex = findStoredLine(lines, stored, claimed);
      if (existingIndex !== null) {
        claimed.add(existingIndex);
        if (stored.date === entry.date) {
          if (lines[existingIndex] !== desired) {
            replacements.set(existingIndex, desired);
            result.updated++;
          }
        } else {
          removals.add(existingIndex);
          insertions.push(entry);
          result.updated++;
        }
        continue;
      }
      const recoveredIndex = findEntryLine(lines, entry, claimed);
      if (recoveredIndex !== null) {
        claimed.add(recoveredIndex);
        result.adopted++;
      } else {
        insertions.push(entry);
        result.updated++;
      }
      continue;
    }
    result.enteredKeys.push(entry.key);
    const adoptable = findEntryLine(lines, entry, claimed);
    if (adoptable !== null) {
      claimed.add(adoptable);
      result.adopted++;
    } else {
      insertions.push(entry);
      result.added++;
      result.addedKeys.push(entry.key);
    }
  }
  for (const [key, stored] of Object.entries(previous)) {
    if (wanted.has(key) || !syncedSlugs.includes(keySlug(key)) || !dateInScope(stored.date, scope))
      continue;
    result.leftKeys.push(key);
    const existingIndex = findStoredLine(lines, stored, claimed);
    if (existingIndex !== null) {
      removals.add(existingIndex);
      result.removed++;
      result.removedKeys.push(key);
    }
  }
  for (const [index, text] of replacements)
    lines[index] = text;
  if (removals.size)
    lines = lines.filter((_, index) => !removals.has(index));
  for (const entry of insertions)
    lines = insertItemLine(lines, entry.date, renderEntryLine(entry), style);
  const nextEntries = { ...previous };
  for (const [key, stored] of Object.entries(nextEntries)) {
    if (!wanted.has(key) && syncedSlugs.includes(keySlug(key)) && dateInScope(stored.date, scope))
      delete nextEntries[key];
  }
  for (const entry of scopedEntries) {
    nextEntries[entry.key] = { date: entry.date, time: entry.time, title: entry.title };
  }
  const updated = lines.join("\n");
  if (updated !== original)
    await app.vault.modify(file, updated);
  await writeMetadata(app, folder, year, month, { version: 1, entries: nextEntries });
  return result;
}

// src/ui/textPrompt.ts
var import_obsidian5 = require("obsidian");
var TextPromptModal = class extends import_obsidian5.Modal {
  constructor(app, promptText2, initialValue, resolveValue) {
    super(app);
    this.promptText = promptText2;
    this.resolveValue = resolveValue;
    this.settled = false;
    this.value = initialValue;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.promptText });
    let inputEl = null;
    new import_obsidian5.Setting(this.contentEl).addText((text) => {
      text.setValue(this.value);
      text.onChange((value) => {
        this.value = value;
      });
      inputEl = text.inputEl;
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          this.finish(this.value);
        }
      });
    });
    new import_obsidian5.Setting(this.contentEl).addButton((button) => button.setButtonText("\u30AD\u30E3\u30F3\u30BB\u30EB").onClick(() => this.finish(null))).addButton((button) => button.setButtonText("OK").setCta().onClick(() => this.finish(this.value)));
    window.setTimeout(() => {
      inputEl?.focus();
      inputEl?.select();
    }, 0);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveValue(null);
    }
  }
  finish(value) {
    if (this.settled)
      return;
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
};
function promptText(app, title, initialValue = "") {
  return new Promise((resolve) => {
    new TextPromptModal(app, title, initialValue, resolve).open();
  });
}

// src/main.ts
var MySystemTechoPlugin = class extends import_obsidian6.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.googleSyncInProgress = false;
  }
  async onload() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!Array.isArray(saved?.googleCalendarIds) || !saved.googleCalendarIds.length) {
      this.settings.googleCalendarIds = [saved?.googleCalendarId || DEFAULT_SETTINGS.googleCalendarIds[0]];
    }
    if (!saved?.googleCalendarNames || typeof saved.googleCalendarNames !== "object" || Array.isArray(saved.googleCalendarNames)) {
      this.settings.googleCalendarNames = {};
    }
    if (!saved?.googleCalendarPrefixes || typeof saved.googleCalendarPrefixes !== "object" || Array.isArray(saved.googleCalendarPrefixes)) {
      this.settings.googleCalendarPrefixes = {};
    }
    if (!this.settings.googleCalendarIds.includes(this.settings.googleWriteCalendarId)) {
      this.settings.googleWriteCalendarId = this.settings.googleCalendarIds[0];
    }
    await this.saveSettings();
    this.registerView(TECHO_VIEW_TYPE, (leaf) => new TechoView(leaf, this));
    this.addRibbonIcon("calendar-days", "My-system-Techo", () => void this.activateView());
    this.addCommand({ id: "open-month-grid", name: "Open techo", callback: () => void this.activateView() });
    for (const scope of ["year", "month", "week"]) {
      this.addCommand({ id: `open-${scope}-view`, name: `Open ${scope} view`, callback: () => void this.openScope(scope) });
    }
    this.addCommand({ id: "test-google-calendar-read", name: "Test Google Calendar read (current month)", callback: () => void this.testGoogleCalendarRead() });
    this.addCommand({ id: "sync-google-calendar-day", name: "Sync Google Calendar: today", callback: () => void this.syncGoogleCalendarToday() });
    this.addCommand({ id: "sync-google-calendar", name: "Sync Google Calendar: current + next month", callback: () => void this.syncGoogleCalendar() });
    this.addCommand({ id: "sync-google-calendar-range", name: "Sync Google Calendar: date range (fiscal year default)", callback: () => void this.syncGoogleCalendarCustomRange() });
    this.addCommand({ id: "add-google-calendar-event", name: "Add Google Calendar event", callback: () => void this.addGoogleCalendarEvent() });
    this.addSettingTab(new MySystemTechoSettingTab(this.app, this));
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(TECHO_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: TECHO_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  describeError(error) {
    if (error instanceof Error && error.message)
      return error.message;
    if (typeof error === "string" && error.trim())
      return error.trim();
    if (error && typeof error === "object") {
      const value = error;
      for (const key of ["message", "error", "statusText", "text"]) {
        const candidate = value[key];
        if (typeof candidate === "string" && candidate.trim())
          return candidate.trim();
      }
      const status = value.status ?? value.statusCode;
      if (typeof status === "number" || typeof status === "string")
        return `HTTP ${status}`;
      try {
        const json = JSON.stringify(error);
        if (json && json !== "{}")
          return json;
      } catch {
      }
    }
    return "Google Calendar\u3068\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
  }
  async getGoogleAccessToken() {
    const config = this.settings.googleTokens;
    if (!this.settings.googleClientId || !config?.accessToken)
      throw new Error("Google Calendar\u304C\u63A5\u7D9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u8A2D\u5B9A\u304B\u3089\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    if (config.expiresAt > Date.now() + 6e4)
      return config.accessToken;
    if (!config.refreshToken)
      throw new Error("Google refresh token is unavailable. Please reconnect.");
    if (!this.settings.googleClientSecret)
      throw new Error("Google Client Secret is unavailable. Please reconnect.");
    const refreshed = await refreshGoogleToken(this.settings.googleClientId, this.settings.googleClientSecret, config.refreshToken);
    this.settings.googleTokens = refreshed;
    await this.saveSettings();
    return refreshed.accessToken;
  }
  syncCalendarIds() {
    const ids = this.settings.googleCalendarIds.map((id) => id.trim()).filter(Boolean);
    return ids.length ? ids : ["primary"];
  }
  async listGoogleCalendars() {
    const calendars = await listGoogleCalendars(await this.getGoogleAccessToken());
    this.settings.googleCalendarNames = {
      ...this.settings.googleCalendarNames,
      ...Object.fromEntries(calendars.map((calendar) => [calendar.id, calendar.summary]))
    };
    await this.saveSettings();
    return calendars;
  }
  /**
   * Read-only diagnostic. It never changes Markdown or Google Calendar.
   * The diagnostic follows the same rule as the normal commands: today's date is the baseline,
   * not whichever month happens to be open in the Techo view.
   */
  async testGoogleCalendarRead() {
    try {
      const accessToken = await this.getGoogleAccessToken();
      const now = /* @__PURE__ */ new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      let calendarListCount = null;
      let calendarListError = null;
      try {
        const calendars = await listGoogleCalendars(accessToken);
        calendarListCount = calendars.length;
        console.log("[My-system-Techo][Google read test] calendar list", calendars);
      } catch (error) {
        calendarListError = this.describeError(error);
        console.warn(`[My-system-Techo][Google read test] calendar list failed | ${calendarListError}`);
      }
      const results = [];
      const failures = [];
      for (const calendarId of this.syncCalendarIds()) {
        try {
          const events = await listGoogleEvents(accessToken, calendarId, start, end);
          results.push({ calendarId, count: events.length });
          console.log("[My-system-Techo][Google read test] events", { calendarId, count: events.length, sample: events.slice(0, 5) });
        } catch (error) {
          const message = this.describeError(error);
          failures.push({ calendarId, message });
          console.warn(`[My-system-Techo][Google read test] events failed | ${calendarId} | ${message}`);
        }
      }
      if (!results.length) {
        const detail = failures.map((item) => `${item.calendarId}: ${item.message}`).join(" / ");
        throw new Error(`Google Calendar\u306E\u4E88\u5B9A\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002${detail ? ` ${detail}` : ""}`);
      }
      const total = results.reduce((sum, item) => sum + item.count, 0);
      const eventSummary = results.map((item) => `${item.calendarId}=${item.count}\u4EF6`).join(" / ");
      const listSummary = calendarListCount === null ? `\u30AB\u30EC\u30F3\u30C0\u30FC\u4E00\u89A7\u306F\u5931\u6557\uFF08${calendarListError ?? "\u539F\u56E0\u4E0D\u660E"}\uFF09` : `\u30AB\u30EC\u30F3\u30C0\u30FC\u4E00\u89A7${calendarListCount}\u4EF6`;
      const failureSummary = failures.length ? ` / \u53D6\u5F97\u5931\u6557${failures.length}\u4EF6` : "";
      new import_obsidian6.Notice(`Google\u53D6\u5F97\u30C6\u30B9\u30C8\u6210\u529F: ${listSummary} / ${year}-${pad2(month)} \u4E88\u5B9A\u5408\u8A08${total}\u4EF6 / ${eventSummary}${failureSummary}`, 12e3);
    } catch (error) {
      notifyGoogleError(error);
    }
  }
  isoLocal(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  parseSyncDate(value, label) {
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match)
      throw new Error(`${label}\u306F YYYY-MM-DD \u5F62\u5F0F\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
      throw new Error(`${label}\u306E\u65E5\u4ED8\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002`);
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }
  fiscalYearRange(reference = /* @__PURE__ */ new Date()) {
    const startYear = reference.getMonth() + 1 >= 4 ? reference.getFullYear() : reference.getFullYear() - 1;
    return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
  }
  /** Mirrors one calendar month (or a clipped range within it) into its month file. */
  async syncGoogleCalendarMonth(accessToken, year, month, requestedScope) {
    const monthFrom = `${year}-${pad2(month)}-01`;
    const monthTo = `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}`;
    const scope = {
      from: requestedScope && requestedScope.from > monthFrom ? requestedScope.from : monthFrom,
      to: requestedScope && requestedScope.to < monthTo ? requestedScope.to : monthTo
    };
    if (scope.from > scope.to)
      throw new Error(`${year}-${pad2(month)} \u306F\u6307\u5B9A\u671F\u9593\u306B\u542B\u307E\u308C\u3066\u3044\u307E\u305B\u3093\u3002`);
    const start = (/* @__PURE__ */ new Date(`${scope.from}T00:00:00`)).toISOString();
    const end = (/* @__PURE__ */ new Date(`${addDays(scope.to, 1)}T00:00:00`)).toISOString();
    const calendarIds = this.syncCalendarIds();
    const entries = [];
    const syncedSlugs = [];
    const failedCalendars = [];
    const failureMessages = [];
    for (const calendarId of calendarIds) {
      try {
        const events = await listGoogleEvents(accessToken, calendarId, start, end);
        const calendarPrefix = this.settings.googleCalendarPrefixes[calendarId]?.trim() ?? "";
        const calendarEntries = toTechoEntries(events, year, month, calendarId).filter((entry) => entry.date >= scope.from && entry.date <= scope.to);
        entries.push(...calendarEntries.map((entry) => calendarPrefix ? { ...entry, title: `${calendarPrefix}${entry.title}` } : entry));
        syncedSlugs.push(calendarSlug(calendarId));
      } catch (error) {
        const message = this.describeError(error);
        failedCalendars.push(calendarId);
        failureMessages.push(message);
        console.warn(`[My-system-Techo][Google sync][Google API] failed | ${scope.from}\u301C${scope.to} | ${calendarId} | ${message}`);
      }
    }
    if (!syncedSlugs.length) {
      const reasons = [...new Set(failureMessages)].join(" / ");
      throw new Error(`${year}-${pad2(month)} \u306F\u3069\u306E\u30AB\u30EC\u30F3\u30C0\u30FC\u304B\u3089\u3082\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002${reasons ? ` \u539F\u56E0: ${reasons}` : ""}`);
    }
    let sync;
    try {
      sync = await applyGoogleEvents(
        this.app,
        this.settings.sourceFolder,
        year,
        month,
        entries,
        syncedSlugs,
        scope,
        calendarSlug(calendarIds[0] ?? "primary")
      );
    } catch (error) {
      const message = this.describeError(error);
      console.error(`[My-system-Techo][Google sync][Techo save] failed | ${scope.from}\u301C${scope.to} | ${message}`);
      throw new Error(`Techo\u3078\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${message}`);
    }
    return {
      summary: `${scope.from}\u301C${scope.to}: \u8FFD\u52A0${sync.added} / \u66F4\u65B0${sync.updated} / \u65E2\u5B58\u306B\u7D10\u4ED8\u3051${sync.adopted} / \u524A\u9664${sync.removed}`,
      failedCalendars,
      sync
    };
  }
  async runGoogleCalendarRange(scope, label) {
    const period = scope.from === scope.to ? scope.from : `${scope.from}\u301C${scope.to}`;
    if (this.googleSyncInProgress) {
      new import_obsidian6.Notice("Google Calendar\u3092\u540C\u671F\u4E2D\u3067\u3059\u3002\u5B8C\u4E86\u5F8C\u306B\u3082\u3046\u4E00\u5EA6\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    this.googleSyncInProgress = true;
    try {
      if (scope.from > scope.to)
        throw new Error("\u7D42\u4E86\u65E5\u306F\u958B\u59CB\u65E5\u4EE5\u964D\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      const accessToken = await this.getGoogleAccessToken();
      const [fromYear, fromMonth] = scope.from.split("-").map(Number);
      const [toYear, toMonth] = scope.to.split("-").map(Number);
      let cursor = new Date(fromYear, fromMonth - 1, 1);
      const lastMonth = new Date(toYear, toMonth - 1, 1);
      let monthCount = 0;
      const failedCalendars = /* @__PURE__ */ new Set();
      const addedKeys = /* @__PURE__ */ new Set();
      const removedKeys = /* @__PURE__ */ new Set();
      const enteredKeys = /* @__PURE__ */ new Set();
      const leftKeys = /* @__PURE__ */ new Set();
      const totals = { added: 0, updated: 0, adopted: 0, removed: 0, migrated: 0 };
      while (cursor <= lastMonth) {
        const result = await this.syncGoogleCalendarMonth(accessToken, cursor.getFullYear(), cursor.getMonth() + 1, scope);
        monthCount++;
        result.failedCalendars.forEach((calendarId) => failedCalendars.add(calendarId));
        result.sync.addedKeys.forEach((key) => addedKeys.add(key));
        result.sync.removedKeys.forEach((key) => removedKeys.add(key));
        result.sync.enteredKeys.forEach((key) => enteredKeys.add(key));
        result.sync.leftKeys.forEach((key) => leftKeys.add(key));
        totals.added += result.sync.added;
        totals.updated += result.sync.updated;
        totals.adopted += result.sync.adopted;
        totals.removed += result.sync.removed;
        totals.migrated += result.sync.migrated;
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      let crossMonthUpdates = 0;
      for (const key of enteredKeys) {
        if (!leftKeys.has(key))
          continue;
        crossMonthUpdates++;
        if (addedKeys.has(key))
          totals.added--;
        if (removedKeys.has(key))
          totals.removed--;
      }
      totals.updated += crossMonthUpdates;
      const failedCalendarCount = failedCalendars.size;
      console.log("[My-system-Techo][Google sync] completed", {
        label,
        scope,
        monthCount,
        failedCalendarCount,
        crossMonthUpdates,
        ...totals
      });
      const status = failedCalendarCount ? "\u4E00\u90E8\u5931\u6557" : "\u540C\u671F\u6210\u529F";
      const failureSummary = failedCalendarCount ? `\uFF5C\u53D6\u5F97\u5931\u6557 ${failedCalendarCount}\u4EF6` : "";
      new import_obsidian6.Notice(
        `${status}\uFF5C${period}\uFF5C\u8FFD\u52A0 ${totals.added}\u30FB\u66F4\u65B0 ${totals.updated}\u30FB\u524A\u9664 ${totals.removed}${failureSummary}`,
        8e3
      );
      await this.refreshMonthViews();
    } catch (error) {
      const message = this.describeError(error);
      console.error(`[My-system-Techo][Google sync] failed | ${label} | ${period} | ${message}`);
      if (error instanceof Error && error.stack)
        console.error(error.stack);
      new import_obsidian6.Notice(`\u540C\u671F\u5931\u6557\uFF5C${period}\uFF5C${message}`, 1e4);
    } finally {
      this.googleSyncInProgress = false;
    }
  }
  /** Minimal daily sync: always refresh today, regardless of the open Techo view. */
  async syncGoogleCalendarToday() {
    const today = this.isoLocal(/* @__PURE__ */ new Date());
    await this.runGoogleCalendarRange({ from: today, to: today }, "\u4ECA\u65E5");
  }
  /** Broad sync: current calendar month plus the following calendar month, always based on today. */
  async syncGoogleCalendar() {
    const now = /* @__PURE__ */ new Date();
    const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const to = this.isoLocal(nextMonth);
    await this.runGoogleCalendarRange({ from, to }, "\u4ECA\u6708\uFF0B\u7FCC\u6708");
  }
  /** Opens Obsidian input dialogs for an arbitrary range. Defaults to the current Japanese fiscal year, 4/1–3/31. */
  async syncGoogleCalendarCustomRange() {
    try {
      const defaults = this.fiscalYearRange();
      const fromInput = await promptText(this.app, "Google Calendar\u53D6\u5F97\u306E\u958B\u59CB\u65E5\uFF08YYYY-MM-DD\uFF09", defaults.from);
      if (fromInput === null)
        return;
      const toInput = await promptText(this.app, "Google Calendar\u53D6\u5F97\u306E\u7D42\u4E86\u65E5\uFF08YYYY-MM-DD\uFF09", defaults.to);
      if (toInput === null)
        return;
      const from = this.parseSyncDate(fromInput, "\u958B\u59CB\u65E5");
      const to = this.parseSyncDate(toInput, "\u7D42\u4E86\u65E5");
      if (from > to)
        throw new Error("\u7D42\u4E86\u65E5\u306F\u958B\u59CB\u65E5\u4EE5\u964D\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      await this.runGoogleCalendarRange({ from, to }, "\u6307\u5B9A\u671F\u9593");
    } catch (error) {
      notifyGoogleError(error);
    }
  }
  async openScope(scope) {
    this.settings.scope = scope;
    await this.saveSettings();
    await this.activateView();
    await this.refreshMonthViews();
  }
  async refreshMonthViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TECHO_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof TechoView)
        await view.render();
    }
  }
  async addGoogleCalendarEvent(date) {
    try {
      const initialDate = date ? this.parseSyncDate(date, "\u65E5\u4ED8") : this.isoLocal(/* @__PURE__ */ new Date());
      const dateInput = await promptText(this.app, "Google Calendar\u3078\u8FFD\u52A0\u3059\u308B\u65E5\u4ED8\uFF08YYYY-MM-DD\uFF09", initialDate);
      if (dateInput === null)
        return;
      const targetDate = this.parseSyncDate(dateInput, "\u65E5\u4ED8");
      const title = await promptText(this.app, `${targetDate} \u306BGoogle Calendar\u3078\u8FFD\u52A0\u3059\u308B\u4E88\u5B9A\u306E\u30BF\u30A4\u30C8\u30EB`);
      if (!title?.trim())
        return;
      const startTime = await promptText(this.app, "\u958B\u59CB\u6642\u523B\uFF08\u4F8B: 09:00\uFF09\u3002\u7A7A\u6B04\u306A\u3089\u7D42\u65E5\u4E88\u5B9A", "09:00");
      if (startTime === null)
        return;
      const allDay = !startTime.trim();
      let start;
      let end;
      if (allDay) {
        start = /* @__PURE__ */ new Date(`${targetDate}T00:00:00`);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim()))
          throw new Error("\u958B\u59CB\u6642\u523B\u306F HH:MM \u5F62\u5F0F\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        const endTime = await promptText(this.app, "\u7D42\u4E86\u6642\u523B\uFF08\u4F8B: 10:00\uFF09", "10:00");
        if (endTime === null)
          return;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime.trim()))
          throw new Error("\u7D42\u4E86\u6642\u523B\u306F HH:MM \u5F62\u5F0F\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        start = /* @__PURE__ */ new Date(`${targetDate}T${startTime.trim()}:00`);
        end = /* @__PURE__ */ new Date(`${targetDate}T${endTime.trim()}:00`);
        if (end <= start)
          throw new Error("\u7D42\u4E86\u6642\u523B\u306F\u958B\u59CB\u6642\u523B\u3088\u308A\u5F8C\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      if (this.googleSyncInProgress) {
        new import_obsidian6.Notice("Google Calendar\u3092\u540C\u671F\u4E2D\u3067\u3059\u3002\u5B8C\u4E86\u5F8C\u306B\u3082\u3046\u4E00\u5EA6\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      this.googleSyncInProgress = true;
      try {
        const accessToken = await this.getGoogleAccessToken();
        const result = await createGoogleEvent(
          accessToken,
          this.settings.googleWriteCalendarId || this.syncCalendarIds()[0],
          title.trim(),
          start,
          end,
          allDay
        );
        new import_obsidian6.Notice(`Google Calendar\u306B\u300C${title.trim()}\u300D\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002`);
        const [targetYear, targetMonth] = targetDate.split("-").map(Number);
        await this.syncGoogleCalendarMonth(accessToken, targetYear, targetMonth, { from: targetDate, to: targetDate });
        await this.refreshMonthViews();
        if (result.htmlLink)
          console.log("[My-system-Techo][Google OAuth] created event link", result.htmlLink);
      } finally {
        this.googleSyncInProgress = false;
      }
    } catch (error) {
      notifyGoogleError(error);
    }
  }
};
