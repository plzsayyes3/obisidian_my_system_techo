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
  /** Set when the line carries a %%gcal:...%% marker, i.e. it is mirrored from Google Calendar. */
  googleId?: string;
}

export interface MySystemTechoSettings {
  sourceFolder: string;
  scope: TechoScope;
  year: number;
  month: number;
  googleClientId: string;
  googleClientSecret: string;
  googleCalendarId: string;
  googleTokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  };
}

export const DEFAULT_SETTINGS: MySystemTechoSettings = {
  sourceFolder: "techo",
  scope: "month",
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  googleClientId: "",
  googleClientSecret: "",
  googleCalendarId: "primary",
};
