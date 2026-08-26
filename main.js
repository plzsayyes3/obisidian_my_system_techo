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
var import_obsidian3 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  sourceFolder: "techo",
  scope: "month",
  year: (/* @__PURE__ */ new Date()).getFullYear(),
  month: (/* @__PURE__ */ new Date()).getMonth() + 1
};

// src/settings.ts
var import_obsidian = require("obsidian");
var MySystemTechoSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "My-system-Techo" });
    new import_obsidian.Setting(containerEl).setName("Markdown\u30D5\u30A9\u30EB\u30C0").setDesc("\u624B\u5E33\u30C7\u30FC\u30BF\u3092\u4FDD\u5B58\u3059\u308BVault\u5185\u306E\u30D5\u30A9\u30EB\u30C0").addText((text) => text.setPlaceholder("techo").setValue(this.plugin.settings.sourceFolder).onChange(async (value) => {
      this.plugin.settings.sourceFolder = value.trim().replace(/^\/+|\/+$/g, "");
      await this.plugin.saveSettings();
    }));
  }
};

// src/views/month.ts
var import_obsidian2 = require("obsidian");

// src/data/markdown.ts
var DATE_HEADING = /^#{1,6}\s+(\d{4})-(\d{2})-(\d{2})\s*$/;
var ITEM = /^-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2})\s+)?(.+?)\s*$/;
function parseMarkdown(text, filePath) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let currentDate = "";
  lines.forEach((line, index) => {
    const heading = line.match(DATE_HEADING);
    if (heading) {
      currentDate = `${heading[1]}-${heading[2]}-${heading[3]}`;
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
  const headingIndex = lines.findIndex((line2) => line2.match(DATE_HEADING)?.slice(1).join("-") === item.date);
  const prefix = item.kind === "task" ? `- [${item.checked ? "x" : " "}] ` : "- ";
  const line = `${prefix}${item.time ? `${item.time} ` : ""}${item.title}`;
  if (headingIndex >= 0)
    lines.splice(headingIndex + 1, 0, line);
  else {
    if (lines.length && lines[lines.length - 1] !== "")
      lines.push("");
    lines.push(`## ${item.date}`, line);
  }
  await app.vault.modify(file, lines.join("\n"));
}
async function createMarkdownFile(app, path, date) {
  const content = `## ${date}
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
var MonthGridView = class extends import_obsidian2.ItemView {
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
    if (!(file instanceof import_obsidian2.TFile))
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
var MySystemTechoPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerView(MONTH_VIEW_TYPE, (leaf) => new MonthGridView(leaf, this));
    this.addRibbonIcon("calendar-days", "My-system-Techo", () => void this.activateView());
    this.addCommand({ id: "open-month-grid", name: "Open month grid", callback: () => void this.activateView() });
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
};
