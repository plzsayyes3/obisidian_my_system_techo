# My-system-Techo

An Obsidian plugin for yearly, monthly, and weekly techo views.

## Views

One view, three scopes, switched from the 年 / 月 / 週 buttons in the toolbar (or the
`Open year view` / `Open month view` / `Open week view` commands):

- **年** — the paper techo's year table: 31 rows down, 12 months across. Each cell shows its
  weekday, marks the days that have entries with a count, and opens that month when clicked.
- **月** — the Monday-first month grid, with `+` and `G+` on every day.
- **週** — one row per day for the displayed week, headed `weekNN` with the week's date range,
  so a busy day is not squeezed into a grid cell.

`### 日付未定` and `### タスク` sections are shown below the grid: the month view shows the ones
written at month level, the week view the ones inside that `## weekNN` section.

## Status

This repository is being prepared as the public home of My-system-Techo.

The source plugin is being migrated from a private/personal vault repository. Personal vault data, settings, tokens, and other private information are intentionally excluded.

## Google Calendar

Google Calendar integration is being redesigned for desktop and Obsidian Mobile with PKCE and long-lived refresh-token handling. Credentials must never be committed to this repository.

### Bringing events into the techo

`Sync Google Calendar` (command palette, or the **Google取得** button in the month view) mirrors the
displayed month into `<Markdownフォルダ>/YYYY-MM.md`:

- Each event becomes one list item under its day, e.g. `- 15:00-15:30 打ち合わせ %%gcal:<event id>%%`.
  The `%%gcal:...%%` marker is an Obsidian comment, so it stays out of reading view.
- A day that is missing gets a heading in the file's own style, placed inside the `## weekNN`
  section for its ISO week.
- Re-syncing is idempotent. Events that moved or were renamed update their existing line, and
  events deleted in Google have their line removed. Lines without a marker are never touched.
- A line you already wrote by hand is claimed by the matching event (same day, time and title)
  instead of being duplicated, so an existing techo does not double up on the first sync.
- All-day events are written without a time and span every day they cover.

### Choosing calendars

Settings lists the calendars you are subscribed to (press **カレンダー一覧を取得**) and syncs the ones
you tick; an ID can also be typed in by hand if the list cannot be fetched. **予定の追加先** picks the
calendar that `Add Google Calendar event` writes to.

The marker carries the calendar as well as the event — `%%gcal:<calendar>:<event id>%%` — so an event
shared across two calendars keeps one line per calendar. Only calendars that were actually fetched
have their lines removed: unticking a calendar, or a calendar that fails to load, leaves the lines it
already wrote in place.

Reading the calendar list needs the `calendar.calendarlist.readonly` scope, so reconnect once after
upgrading from a version that synced a single calendar.

## Notes and items

The techo keeps one Markdown file per month, `<Markdownフォルダ>/YYYY-MM.md`. Both the month view's
`+` button and the Google sync write into that file, under the heading for the day. A day whose
heading is missing gets one in the file's own style, inside the `## weekNN` section for its ISO week.

An item is a list line under a day heading, optionally a task and optionally timed:

```markdown
## 9月1日(火)

- 15:00-15:30 打ち合わせ
- [ ] 09:00 資料を出す
```

Headings that are not days — `## week36`, `### 日付未定`, `### タスク` — end the previous day's
section, so the items under them are not counted as belonging to the day above.

## Development

```bash
npm install
npm run build      # bundles src/ into main.js
npm run typecheck  # tsc --noEmit
```

## License

MIT
