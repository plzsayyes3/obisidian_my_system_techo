export function pad2(value: number): string { return String(value).padStart(2, "0"); }
export function daysInMonth(year: number, month: number): number { return new Date(year, month, 0).getDate(); }
export function monthLabel(year: number, month: number): string { return `${year}年${month}月`; }

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function weekdayJa(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAY_JA[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** ISO-8601 week number. The techo files use these for their `## weekNN` sections. */
export function isoWeek(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  target.setUTCDate(target.getUTCDate() - ((target.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
}

export function addDays(isoDate: string, amount: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}
