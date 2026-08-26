export type TechoScope = "year" | "month" | "week";

export type TechoStyle =
  | "techo-year"
  | "month-block"
  | "month-list"
  | "month-block-series"
  | "month-chronos"
  | "week-vertical"
  | "week-block";

export interface MySystemTechoSettings {
  scope: TechoScope;
  style: TechoStyle;
  // Google settings intentionally excluded from this public baseline.
}

export const DEFAULT_SETTINGS: MySystemTechoSettings = {
  scope: "month",
  style: "month-block",
};
