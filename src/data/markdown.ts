import { TFile, Vault } from "obsidian";

export async function readMarkdown(vault: Vault, path: string): Promise<string | null> {
  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  return vault.read(file);
}

export async function writeMarkdown(vault: Vault, path: string, content: string): Promise<void> {
  const existing = vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await vault.modify(existing, content);
    return;
  }
  await vault.create(path, content);
}
