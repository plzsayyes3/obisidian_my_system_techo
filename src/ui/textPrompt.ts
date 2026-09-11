import { App, Modal, Setting } from "obsidian";

class TextPromptModal extends Modal {
  private settled = false;
  private value: string;

  constructor(
    app: App,
    private readonly promptText: string,
    initialValue: string,
    private readonly resolveValue: (value: string | null) => void,
  ) {
    super(app);
    this.value = initialValue;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.promptText });

    let inputEl: HTMLInputElement | null = null;
    new Setting(this.contentEl).addText((text) => {
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

    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("キャンセル")
        .onClick(() => this.finish(null)))
      .addButton((button) => button
        .setButtonText("OK")
        .setCta()
        .onClick(() => this.finish(this.value)));

    window.setTimeout(() => {
      inputEl?.focus();
      inputEl?.select();
    }, 0);
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveValue(null);
    }
  }

  private finish(value: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
}

/** Obsidian-native replacement for unsupported window.prompt(). */
export function promptText(app: App, title: string, initialValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    new TextPromptModal(app, title, initialValue, resolve).open();
  });
}
