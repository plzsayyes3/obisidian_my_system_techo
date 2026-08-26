export function pad2(value: number): string { return String(value).padStart(2, "0"); }
export function daysInMonth(year: number, month: number): number { return new Date(year, month, 0).getDate(); }
export function monthLabel(year: number, month: number): string { return `${year}年${month}月`; }
