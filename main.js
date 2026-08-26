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
var import_obsidian4 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  sourceFolder: "techo",
  scope: "month",
  year: (/* @__PURE__ */ new Date()).getFullYear(),
  month: (/* @__PURE__ */ new Date()).getMonth() + 1,
  googleClientId: "",
  googleClientSecret: "",
  googleCalendarId: "primary"
};

// src/settings.ts
var import_obsidian2 = require("obsidian");

// src/google.ts
var import_obsidian = require("obsidian");
var AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
var TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
var CALENDAR_ENDPOINT = "https://www.googleapis.com/calendar/v3";
var SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
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
async function authorizeGoogle(clientId) {
  log("start");
  if (!clientId.trim())
    throw new Error("Google Client ID is not configured.");
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
    const response = await (0, import_obsidian.requestUrl)({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri }).toString(), throw: false });
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
async function refreshGoogleToken(clientId, refreshToken) {
  log("refresh started");
  const response = await (0, import_obsidian.requestUrl)({ url: TOKEN_ENDPOINT, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), refresh_token: refreshToken, grant_type: "refresh_token" }).toString() });
  log("refresh response", { status: response.status });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Google token refresh failed (${response.status}).`);
  const data = response.json;
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1e3 };
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
function notifyGoogleError(error) {
  log("error", error instanceof Error ? error.message : String(error));
  new import_obsidian.Notice(error instanceof Error ? error.message : "Google Calendar\u3068\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
}

// src/settings.ts
var MySystemTechoSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
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
    containerEl.createEl("p", { text: "\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067Google Calendar\u306E\u4E88\u5B9A\u3092\u53D6\u5F97\u3057\u307E\u3059\u3002OAuth\u30C8\u30FC\u30AF\u30F3\u306F\u3053\u306EVault\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u30C7\u30FC\u30BF\u306B\u4FDD\u5B58\u3055\u308C\u3001GitHub\u306B\u306F\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093\u3002" });
    new import_obsidian2.Setting(containerEl).setName("Google Client ID").setDesc("Google Cloud\u3067\u4F5C\u6210\u3057\u305FOAuth\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u306EClient ID\u3002Secret\u306F\u5165\u529B\u3057\u307E\u305B\u3093\u3002").addText((text) => text.setPlaceholder("xxxx.apps.googleusercontent.com").setValue(this.plugin.settings.googleClientId).onChange(async (value) => {
      this.plugin.settings.googleClientId = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Calendar ID").setDesc("\u53D6\u5F97\u3059\u308B\u30AB\u30EC\u30F3\u30C0\u30FC\u3002\u901A\u5E38\u306F primary\u3002").addText((text) => text.setPlaceholder("primary").setValue(this.plugin.settings.googleCalendarId).onChange(async (value) => {
      this.plugin.settings.googleCalendarId = value.trim() || "primary";
      await this.plugin.saveSettings();
    }));
    const tokens = this.plugin.settings.googleTokens;
    const isConnected = Boolean(tokens?.accessToken || tokens?.refreshToken);
    new import_obsidian2.Setting(containerEl).setName("Google Calendar\u306B\u63A5\u7D9A").setDesc("\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u7248Obsidian\u3067Google\u306E\u8A8D\u8A3C\u753B\u9762\u3092\u958B\u304D\u307E\u3059\u3002").addButton((button) => button.setButtonText(isConnected ? "\u518D\u8A8D\u8A3C" : "\u63A5\u7D9A").setCta().onClick(async () => {
      if (!this.plugin.settings.googleClientId) {
        new import_obsidian2.Notice("\u5148\u306BGoogle Client ID\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
        return;
      }
      button.setDisabled(true);
      try {
        new import_obsidian2.Notice("Google OAuth: \u8A8D\u8A3C\u3092\u958B\u59CB\u3057\u307E\u3059\u3002");
        const newTokens = await authorizeGoogle(this.plugin.settings.googleClientId);
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
  }
};

// src/views/month.ts
var import_obsidian3 = require("obsidian");

// src/data/markdown.ts
var MONTH_HEADING = /^#{1,6}\s+(\d{4})年(\d{1,2})月\s*$/;
var ISO_DATE_HEADING = /^#{1,6}\s+(\d{4})-(\d{2})-(\d{2})\s*$/;
var JP_DATE_HEADING = /^#{1,6}\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/;
var ITEM = /^-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s+)?(.+?)\s*$/;
function parseMarkdown(text, filePath) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let currentDate = "";
  let currentYear = 0;
  let currentMonth = 0;
  lines.forEach((line, index) => {
    const monthHeading = line.match(MONTH_HEADING);
    if (monthHeading) {
      currentYear = Number(monthHeading[1]);
      currentMonth = Number(monthHeading[2]);
      currentDate = "";
      return;
    }
    const isoHeading = line.match(ISO_DATE_HEADING);
    if (isoHeading) {
      currentDate = `${isoHeading[1]}-${isoHeading[2]}-${isoHeading[3]}`;
      currentYear = Number(isoHeading[1]);
      currentMonth = Number(isoHeading[2]);
      return;
    }
    const jpHeading = line.match(JP_DATE_HEADING);
    if (jpHeading && currentYear && currentMonth === Number(jpHeading[1])) {
      currentDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(Number(jpHeading[2])).padStart(2, "0")}`;
      return;
    }
    const match = line.match(ITEM);
    if (!match || !currentDate)
      return;
    items.push({
      id: `${filePath}:${index + 1}`,
      date: currentDate,
      time: match[2] || void 0,
      title: match[3],
      kind: match[1] !== void 0 ? "task" : "event",
      checked: Boolean(match[1] && match[1].toLowerCase() === "x"),
      sourceLine: index + 1
    });
  });
  return items;
}
async function readFolder(app, folder, year, month) {
  const prefix = folder.replace(/\/+$/, "");
  const files = app.vault.getMarkdownFiles().filter((file) => !prefix || file.path.startsWith(`${prefix}/`));
  const result = [];
  for (const file of files) {
    const items = parseMarkdown(await app.vault.cachedRead(file), file.path).filter((item) => {
      const d = /* @__PURE__ */ new Date(`${item.date}T00:00:00`);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
    if (items.length)
      result.push({ file, items });
  }
  return result;
}
async function appendItem(app, file, item) {
  const current = await app.vault.read(file);
  const lines = current.split(/\r?\n/);
  const isoHeading = `## ${item.date}`;
  const dateParts = item.date.split("-").map(Number);
  const jpHeading = `## ${dateParts[1]}\u6708${dateParts[2]}\u65E5`;
  const headingIndex = lines.findIndex((line2) => line2.trim() === isoHeading || line2.trim() === jpHeading || line2.match(JP_DATE_HEADING)?.[0] === line2.trim() && line2.includes(`${dateParts[1]}\u6708${dateParts[2]}\u65E5`));
  const prefix = item.kind === "task" ? `- [${item.checked ? "x" : " "}] ` : "- ";
  const line = `${prefix}${item.time ? `${item.time} ` : ""}${item.title}`;
  if (headingIndex >= 0)
    lines.splice(headingIndex + 1, 0, line);
  else {
    if (lines.length && lines[lines.length - 1] !== "")
      lines.push("");
    lines.push(isoHeading, line);
  }
  await app.vault.modify(file, lines.join("\n"));
}
async function createMarkdownFile(app, path, date) {
  const [year, month, day] = date.split("-").map(Number);
  const content = `# ${year}\u5E74${month}\u6708

## ${month}\u6708${day}\u65E5
`;
  return app.vault.create(path, content);
}

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

// src/views/month.ts
var MONTH_VIEW_TYPE = "my-system-techo-month-grid";
var MonthGridView = class extends import_obsidian3.ItemView {
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
  getViewType() {
    return MONTH_VIEW_TYPE;
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
    const toolbar = root.createDiv({ cls: "mst-toolbar" });
    const prev = toolbar.createEl("button", { text: "\u2039" });
    const title = toolbar.createEl("strong", { text: monthLabel(this.year, this.month) });
    const next = toolbar.createEl("button", { text: "\u203A" });
    const today = toolbar.createEl("button", { text: "\u4ECA\u65E5" });
    prev.onclick = async () => {
      await this.shift(-1);
    };
    next.onclick = async () => {
      await this.shift(1);
    };
    today.onclick = async () => {
      const d = /* @__PURE__ */ new Date();
      this.plugin.settings.year = d.getFullYear();
      this.plugin.settings.month = d.getMonth() + 1;
      await this.plugin.saveSettings();
      await this.render();
    };
    const data = await readFolder(this.app, this.plugin.settings.sourceFolder, this.year, this.month);
    const byDate = /* @__PURE__ */ new Map();
    for (const entry of data)
      for (const item of entry.items) {
        const list = byDate.get(item.date) ?? [];
        list.push(item);
        byDate.set(item.date, list);
      }
    const grid = root.createDiv({ cls: "mst-grid" });
    ["\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F", "\u65E5"].forEach((label) => grid.createDiv({ cls: "mst-grid-header", text: label }));
    const first = new Date(this.year, this.month - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const count = daysInMonth(this.year, this.month);
    const total = Math.ceil((offset + count) / 7) * 7;
    for (let index = 0; index < total; index++) {
      const day = index - offset + 1;
      const cell = grid.createDiv({ cls: "mst-day" });
      if (day < 1 || day > count) {
        cell.addClass("is-outside");
        continue;
      }
      const date = `${this.year}-${pad2(this.month)}-${pad2(day)}`;
      cell.createDiv({ cls: "mst-day-number", text: String(day) });
      for (const item of byDate.get(date) ?? [])
        this.renderItem(cell, item);
      const add = cell.createEl("button", { cls: "mst-add", text: "+" });
      add.onclick = () => void this.addItem(date);
    }
  }
  renderItem(cell, item) {
    const row = cell.createDiv({ cls: "mst-item" });
    row.setText(`${item.time ? `${item.time} ` : ""}${item.kind === "task" ? `${item.checked ? "\u2611" : "\u2610"} ` : ""}${item.title}`);
  }
  async addItem(date) {
    const title = window.prompt(`${date} \u306E\u4E88\u5B9A\u30FB\u30BF\u30B9\u30AF`);
    if (!title?.trim())
      return;
    const isTask = window.confirm("\u30BF\u30B9\u30AF\u3068\u3057\u3066\u767B\u9332\u3057\u307E\u3059\u304B\uFF1F\nOK = \u30BF\u30B9\u30AF / \u30AD\u30E3\u30F3\u30BB\u30EB = \u4E88\u5B9A");
    const folder = this.plugin.settings.sourceFolder.replace(/\/+$/, "");
    const path = `${folder}/${date}.md`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian3.TFile))
      file = await createMarkdownFile(this.app, path, date);
    await appendItem(this.app, file, { date, title: title.trim(), kind: isTask ? "task" : "event", checked: false });
    await this.render();
  }
  async shift(delta) {
    const d = new Date(this.year, this.month - 1 + delta, 1);
    this.plugin.settings.year = d.getFullYear();
    this.plugin.settings.month = d.getMonth() + 1;
    await this.plugin.saveSettings();
    await this.render();
  }
};

// src/main.ts
var MySystemTechoPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerView(MONTH_VIEW_TYPE, (leaf) => new MonthGridView(leaf, this));
    this.addRibbonIcon("calendar-days", "My-system-Techo", () => void this.activateView());
    this.addCommand({ id: "open-month-grid", name: "Open month grid", callback: () => void this.activateView() });
    this.addCommand({ id: "sync-google-calendar", name: "Sync Google Calendar", callback: () => void this.syncGoogleCalendar() });
    this.addSettingTab(new MySystemTechoSettingTab(this.app, this));
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(MONTH_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: MONTH_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async syncGoogleCalendar() {
    const config = this.settings.googleTokens;
    if (!this.settings.googleClientId || !config?.accessToken) {
      new import_obsidian4.Notice("Google Calendar\u304C\u63A5\u7D9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u8A2D\u5B9A\u304B\u3089\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    try {
      let accessToken = config.accessToken;
      if (config.expiresAt <= Date.now() + 6e4) {
        if (!config.refreshToken)
          throw new Error("Google refresh token is unavailable. Please reconnect.");
        const refreshed = await refreshGoogleToken(this.settings.googleClientId, config.refreshToken);
        this.settings.googleTokens = refreshed;
        await this.saveSettings();
        accessToken = refreshed.accessToken;
      }
      const start = new Date(this.settings.year, this.settings.month - 1, 1);
      const end = new Date(this.settings.year, this.settings.month, 1);
      const events = await listGoogleEvents(accessToken, this.settings.googleCalendarId || "primary", start.toISOString(), end.toISOString());
      await this.saveData({ ...this.settings, googleLastSyncCount: events.length });
      new import_obsidian4.Notice(`Google Calendar: ${events.length}\u4EF6\u53D6\u5F97\u3057\u307E\u3057\u305F\u3002`);
    } catch (error) {
      notifyGoogleError(error);
    }
  }
};
