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
var import_obsidian5 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  sourceFolder: "techo",
  scope: "month",
  year: (/* @__PURE__ */ new Date()).getFullYear(),
  month: (/* @__PURE__ */ new Date()).getMonth() + 1,
  day: (/* @__PURE__ */ new Date()).getDate(),
  googleClientId: "",
  googleClientSecret: "",
  googleCalendarId: "primary",
  googleCalendarIds: ["primary"],
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
async function createGoogleEvent(accessToken, calendarId, title, start, end) {
  log("calendar event create started", { calendarId, title, start: start.toISOString(), end: end.toISOString() });
  const url = new URL(`${CALENDAR_ENDPOINT}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("sendUpdates", "none");
  const response = await (0, import_obsidian.requestUrl)({
    url: url.toString(),
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: title, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }),
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
  renderCalendarPicker(containerEl, isConnected) {
    const selected = this.plugin.syncCalendarIds();
    containerEl.createEl("h3", { text: "\u540C\u671F\u3059\u308B\u30AB\u30EC\u30F3\u30C0\u30FC" });
    containerEl.createEl("p", { text: "\u9078\u3093\u3060\u30AB\u30EC\u30F3\u30C0\u30FC\u306E\u4E88\u5B9A\u304C\u624B\u5E33\u306EMarkdown\u306B\u66F8\u304D\u8FBC\u307E\u308C\u307E\u3059\u3002\u30C1\u30A7\u30C3\u30AF\u3092\u5916\u3057\u305F\u30AB\u30EC\u30F3\u30C0\u30FC\u306F\u540C\u671F\u3055\u308C\u306A\u304F\u306A\u308A\u307E\u3059\u304C\u3001\u3059\u3067\u306B\u66F8\u304D\u8FBC\u307E\u308C\u305F\u884C\u306F\u305D\u306E\u307E\u307E\u6B8B\u308A\u307E\u3059\u3002" });
    new import_obsidian2.Setting(containerEl).setName("\u30AB\u30EC\u30F3\u30C0\u30FC\u4E00\u89A7\u3092\u53D6\u5F97").setDesc(isConnected ? "Google\u304B\u3089\u8CFC\u8AAD\u4E2D\u306E\u30AB\u30EC\u30F3\u30C0\u30FC\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3059\u3002" : "\u5148\u306BGoogle Calendar\u3078\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002").addButton((button) => button.setButtonText("\u53D6\u5F97").setDisabled(!isConnected).onClick(async () => {
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
        new import_obsidian2.Setting(containerEl).setName(calendar.primary ? `${calendar.summary}\uFF08\u30E1\u30A4\u30F3\uFF09` : calendar.summary).setDesc(calendar.id).addToggle((toggle) => toggle.setValue(selected.includes(calendar.id)).onChange(async (value) => {
          const next = value ? [...selected, calendar.id] : selected.filter((id) => id !== calendar.id);
          await this.setCalendarIds(next);
        }));
      }
    }
    for (const id of selected.filter((id2) => !this.calendars.some((calendar) => calendar.id === id2))) {
      new import_obsidian2.Setting(containerEl).setName(id).setDesc("\u540C\u671F\u5BFE\u8C61").addExtraButton((button) => button.setIcon("trash").setTooltip("\u540C\u671F\u5BFE\u8C61\u304B\u3089\u5916\u3059").onClick(async () => {
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
      for (const id of selected) {
        dropdown.addOption(id, this.calendars.find((calendar) => calendar.id === id)?.summary || id);
      }
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
  await ensureFolder(app, folder);
  return app.vault.create(path, `# ${year}\u5E74${month}\u6708
`);
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
    const sync = toolbar.createEl("button", { text: "Google\u53D6\u5F97" });
    sync.onclick = async () => {
      sync.disabled = true;
      sync.setText("\u53D6\u5F97\u4E2D\u2026");
      try {
        await this.plugin.syncGoogleCalendar();
      } finally {
        sync.disabled = false;
        sync.setText("Google\u53D6\u5F97");
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
  return `- ${entry.time ? `${entry.time} ` : ""}${entry.title} %%gcal:${entry.key}%%`;
}
async function applyGoogleEvents(app, folder, year, month, entries, syncedSlugs) {
  const path = monthFilePath(folder, year, month);
  const file = await openMonthFile(app, folder, year, month);
  const original = await app.vault.read(file);
  let lines = original.split(/\r?\n/);
  const style = detectDateHeadingStyle(lines);
  const result = { path, added: 0, updated: 0, adopted: 0, removed: 0 };
  const marked = collectMarkedLines(lines, syncedSlugs[0]);
  const wanted = new Map(entries.map((entry) => [entry.key, entry]));
  const replacements = /* @__PURE__ */ new Map();
  const removals = /* @__PURE__ */ new Set();
  const insertions = [];
  const claimed = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    const existing = marked.get(entry.key);
    const desired = renderEntryLine(entry);
    if (existing) {
      if (existing.date === entry.date && lines[existing.index] === desired)
        continue;
      if (existing.date === entry.date) {
        replacements.set(existing.index, desired);
        result.updated++;
      } else {
        removals.add(existing.index);
        insertions.push(entry);
        result.updated++;
      }
      continue;
    }
    const adoptable = findAdoptableLine(lines, entry, claimed);
    if (adoptable !== null) {
      claimed.add(adoptable);
      replacements.set(adoptable, `${lines[adoptable].replace(/\s+$/, "")} %%gcal:${entry.key}%%`);
      result.adopted++;
      continue;
    }
    insertions.push(entry);
    result.added++;
  }
  for (const [key, existing] of marked) {
    if (wanted.has(key) || !syncedSlugs.includes(keySlug(key)))
      continue;
    removals.add(existing.index);
    result.removed++;
  }
  for (const [index, text] of replacements)
    lines[index] = text;
  if (removals.size)
    lines = lines.filter((_, index) => !removals.has(index));
  for (const entry of insertions)
    lines = insertItemLine(lines, entry.date, renderEntryLine(entry), style);
  const updated = lines.join("\n");
  if (updated !== original)
    await app.vault.modify(file, updated);
  return result;
}
function keySlug(key) {
  return key.slice(0, key.indexOf(":"));
}
function collectMarkedLines(lines, legacySlug) {
  const dates = lineDates(lines);
  const marked = /* @__PURE__ */ new Map();
  lines.forEach((line, index) => {
    const raw = parseItemLine(line)?.googleId;
    if (!raw)
      return;
    const key = raw.includes(":") ? raw : `${legacySlug}:${raw}`;
    if (!marked.has(key))
      marked.set(key, { index, date: dates[index] });
  });
  return marked;
}
function findAdoptableLine(lines, entry, claimed) {
  const dates = lineDates(lines);
  for (let index = 0; index < lines.length; index++) {
    if (dates[index] !== entry.date || claimed.has(index))
      continue;
    const parsed = parseItemLine(lines[index]);
    if (!parsed || parsed.googleId)
      continue;
    if ((parsed.time ?? "") === (entry.time ?? "") && parsed.title === entry.title)
      return index;
  }
  return null;
}

// src/main.ts
var MySystemTechoPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!Array.isArray(saved?.googleCalendarIds) || !saved.googleCalendarIds.length) {
      this.settings.googleCalendarIds = [saved?.googleCalendarId || DEFAULT_SETTINGS.googleCalendarIds[0]];
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
    this.addCommand({ id: "sync-google-calendar", name: "Sync Google Calendar", callback: () => void this.syncGoogleCalendar() });
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
    return listGoogleCalendars(await this.getGoogleAccessToken());
  }
  /** Mirrors the displayed month of every selected calendar into `<sourceFolder>/YYYY-MM.md`. */
  async syncGoogleCalendar() {
    try {
      const { year, month } = this.settings;
      const accessToken = await this.getGoogleAccessToken();
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      const entries = [];
      const syncedSlugs = [];
      const failed = [];
      for (const calendarId of this.syncCalendarIds()) {
        try {
          const events = await listGoogleEvents(accessToken, calendarId, start, end);
          entries.push(...toTechoEntries(events, year, month, calendarId));
          syncedSlugs.push(calendarSlug(calendarId));
        } catch (error) {
          failed.push(calendarId);
          notifyGoogleError(error);
        }
      }
      if (!syncedSlugs.length)
        throw new Error("\u3069\u306E\u30AB\u30EC\u30F3\u30C0\u30FC\u304B\u3089\u3082\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      const result = await applyGoogleEvents(this.app, this.settings.sourceFolder, year, month, entries, syncedSlugs);
      const summary = `${result.path}: \u8FFD\u52A0${result.added} / \u66F4\u65B0${result.updated} / \u65E2\u5B58\u306B\u7D10\u4ED8\u3051${result.adopted} / \u524A\u9664${result.removed}`;
      new import_obsidian5.Notice(failed.length ? `${summary}\uFF08${failed.length}\u4EF6\u306E\u30AB\u30EC\u30F3\u30C0\u30FC\u306F\u53D6\u5F97\u5931\u6557\uFF09` : summary);
      await this.refreshMonthViews();
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
  /** Today when the displayed month is the current one, otherwise its first day: `2月30日` is not a date. */
  defaultEventDate() {
    const { year, month } = this.settings;
    const today = /* @__PURE__ */ new Date();
    const day = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : 1;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }
  async addGoogleCalendarEvent(date) {
    try {
      const targetDate = date || this.defaultEventDate();
      const title = window.prompt(`${targetDate} \u306BGoogle Calendar\u3078\u8FFD\u52A0\u3059\u308B\u4E88\u5B9A\u306E\u30BF\u30A4\u30C8\u30EB`);
      if (!title?.trim())
        return;
      const startTime = window.prompt("\u958B\u59CB\u6642\u523B\uFF08\u4F8B: 09:00\uFF09\u3002\u7A7A\u6B04\u306A\u3089\u7D42\u65E5\u4E88\u5B9A", "09:00");
      if (startTime === null)
        return;
      let start;
      let end;
      if (!startTime.trim()) {
        start = /* @__PURE__ */ new Date(`${targetDate}T00:00:00`);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim()))
          throw new Error("\u958B\u59CB\u6642\u523B\u306F HH:MM \u5F62\u5F0F\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        const endTime = window.prompt("\u7D42\u4E86\u6642\u523B\uFF08\u4F8B: 10:00\uFF09", "10:00");
        if (endTime === null)
          return;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime.trim()))
          throw new Error("\u7D42\u4E86\u6642\u523B\u306F HH:MM \u5F62\u5F0F\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        start = /* @__PURE__ */ new Date(`${targetDate}T${startTime.trim()}:00`);
        end = /* @__PURE__ */ new Date(`${targetDate}T${endTime.trim()}:00`);
        if (end <= start)
          throw new Error("\u7D42\u4E86\u6642\u523B\u306F\u958B\u59CB\u6642\u523B\u3088\u308A\u5F8C\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      const accessToken = await this.getGoogleAccessToken();
      const result = await createGoogleEvent(accessToken, this.settings.googleWriteCalendarId || this.syncCalendarIds()[0], title.trim(), start, end);
      new import_obsidian5.Notice(`Google Calendar\u306B\u300C${title.trim()}\u300D\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002`);
      await this.syncGoogleCalendar();
      if (result.htmlLink)
        console.log("[My-system-Techo][Google OAuth] created event link", result.htmlLink);
    } catch (error) {
      notifyGoogleError(error);
    }
  }
};
