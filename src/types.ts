export type TechoScope = "year" | "month" | "week";
export type ItemKind = "event" | "task";

export interface TechoItem {
  id: string;
  date: string;
  time?: string;
  title: string;
  kind: ItemKind;
  checked: boolean;
  sourceLine: number;
}

export interface MySystemTechoSettings {
  sourceFolder: string;
  scope: TechoScope;
  year: number;
  month: number;
}

export const DEFAULT_SETTINGS: MySystemTechoSettings = {
  sourceFolder: "techo",
  scope: "month",
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
};
