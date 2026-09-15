# Changelog

All notable changes to ICOR for Life - Planner.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).
Releases before 0.12.0 carry their notes on the GitHub release itself
(the commit subjects since the previous tag).

## [0.14.0] - 2026-09-15

> Pending Flint review. Not released until he has read the new view
> registration, the manifest and the note the plugin now creates.

### Added
- **The week note, and a tab that reads and writes it.** Beside the board
  there is now one note per week in `02 Planner/Weeks/`, holding the two
  things the board could never answer: what you are trying to achieve this
  week, and what would make today a win. Open it from the board, from the
  command palette, or by opening the note itself; it is plain markdown with
  two headings, so writing in it by hand works exactly as well.
- **Weekly priorities.** One line per outcome with a box you tick. Ticking it
  in the tab writes the box in the note, and ticking it in the note shows up
  in the tab. Not tasks: outcomes. A task can serve one.
- **Daily highlights.** One sentence per day, set in the morning and
  confirmed in the evening as done, not done, or left pending. Only today's
  row takes input; the rest of the week shows what it already says, because
  the highlight belongs to the day it was chosen on.
- **The week note is created the first time you put something in it**, and
  never before. A week nobody planned leaves no file behind, and a note
  already there is never overwritten.
- **Link a task to the note it is for.** A card's menu can point a task at a
  project, a key element, or any other note, and open it from the same menu.
  The link lives on the planner side only: nothing is written into the note
  you point at, and no sync run ever changes it, the same way your day
  placement and your pins have always survived a sync.

### Changed
- **A starred task is now "pinned to this week", not a "weekly goal".** The
  tray section reads PINNED THIS WEEK, the tab reads PINNED, the chip on the
  card reads WEEK, and the card menu offers to pin and unpin. Nothing about
  what the star does has changed, and nothing in your notes changed: the
  field in the file keeps its name. The word "goal" now means one thing in
  the suite, the goal note in your own vault.

## [0.13.0] - 2026-09-15

### Fixed
- **Sync no longer marks live tasks as done when it could not read all of
  them.** When a source has more open items than one sync can read in one
  go, the planner used to treat everything it had not seen as finished,
  tick it off in your vault, and, if you had switched on completing at the
  source, close it in Todoist, ClickUp or your mailbox too. It now notices
  when it has only read part of your open list, shows one line on the board
  saying so, and marks nothing done until it has read the whole list. The
  same applies when a mailbox has more starred mail than one read takes,
  when Microsoft hands back a paging link the planner will not follow, and
  when you change your ClickUp filter, so switching subtasks off no longer
  records them as achievements. Everything it did read still lands on the
  board as usual.

  Reported by Ian Slattery in the bug reports channel.

## [0.12.0] - 2026-09-08

### Added
- Where your keys live: a switch in settings between Obsidian's keychain
  (Settings, General, Keychain; the default, unchanged for everyone who
  already has keys there) and an env file inside the vault
  (`06 AI Team/AI Team Knowledge/.env` by default, the path is a setting).
  The env file holds one `KEY=value` line per secret (`TODOIST_TOKEN`,
  `CLICKUP_TOKEN`, `IMAP_PASSWORD`, `OUTLOOK_REFRESH_TOKEN`,
  `OUTLOOK_ACCESS_TOKEN`, and `PLANNER_CALENDAR_<ID>` per pasted
  calendar); the plugin edits exactly that line and leaves every other
  byte of the file as it was.
- Only the selected backend is read. Choosing the other one moves
  nothing by itself; the settings tab shows, per key, where a value
  exists and offers "Move to ..." per key and for all of them at once.
- The env file is read again before every sync, so a line edited by hand
  is picked up without a restart.
- A key is blanked in `data.json` only after its line is on disk in the
  env file. When the file cannot be written, the key stays in `data.json`,
  the settings tab says so once, and the next save that succeeds moves it.

### Changed
- The settings tab and the README call the store by Obsidian's own name
  for it, "Obsidian's keychain (Settings, General, Keychain)". It is still
  never called the operating system's own store, because it is not one.
- On an Obsidian older than 1.11.4 the option for Obsidian's keychain is
  shown but cannot be picked; `data.json` stays the fallback there until the env file is
  chosen, as in every release since 0.9.0.
