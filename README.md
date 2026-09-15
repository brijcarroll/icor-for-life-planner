# ICOR for Life - Planner

**Plan your week once, in one place.**

Your tasks are in Todoist, in ClickUp, in starred emails and in four
calendars. Planning a week means re-reading all of them and holding the
answer in your head. This brings them into one board: drag a card onto a
morning or an afternoon, and that part of the week is decided.

Part of the [ICOR for Life](https://myicor.com) suite.

## What it is for

Planning fails at the gathering step, not the deciding step. By the time you
have checked four apps you have spent the energy you needed for the actual
choice, and you are choosing from whatever you still remember.

Put everything on one surface and the choice becomes easy, because you can
finally see all of it at once.

Everything lands in your vault as plain markdown notes, so your plan is yours
and readable without this plugin.

## Getting started

You do not need an account to start. Open the Planner from the button under
the sidebar logo, add a task by hand in the tray, and drag it onto a day.

Connect sources when you want them, one at a time, from the settings page.

## What you can connect

**Tasks.** Todoist and ClickUp.

**Email.** Starred or flagged mail becomes a task. Gmail, iCloud and Fastmail
have one-click presets and ask for an app password, never your account
password. Any other IMAP host works by typing it in. Outlook and Microsoft
365 connect through their own sign-in.

**Calendars.** As many as you like, one iCal address each: Google, iCloud,
Proton, Outlook or anything else that publishes a feed. Each gets a name and
a colour, an event in two calendars shows once, and one feed failing leaves
the others working and tells you which one broke.

Every source is optional. Connect none and the board still works.

## The board and the tray

The **board** is your week in morning and afternoon lanes. Drag a card onto
one and it is scheduled.

The **tray** sits in the right sidebar with four tabs: unscheduled tasks,
your calendar, your routines and your habits.

**Routines and habits** live here too, so the things you do every week are on
the same surface as the things you only do once.

Any card can be **pinned to this week** from its menu. Pinned cards sit at the
top of the tray under PINNED THIS WEEK and wear a WEEK chip on the board.

## The week note

Beside the board there is one note per week, in `02 Planner/Weeks/`, and a tab
that reads and writes it. It holds two things.

**Weekly priorities.** What you are trying to achieve this week, one line
each, with a box you tick when it is done. Not tasks: outcomes. A task can
serve one.

**Daily highlights.** One sentence per day: the one thing that, if it happens,
makes the day a win. You set it in the morning and confirm it in the evening,
done or not done. Only today's row takes input; the rest of the week is what
it already says.

The note is plain markdown with two headings, so you can write in it by hand
and the tab reads exactly what you wrote. It is created the first time you put
something in it, and never before.

## Linking a task to a note

A card's menu can point it at the note the work is really for, usually a
project or a key element. The link lives on the planner side only, nothing is
written into the note you point at, and no sync run ever changes it.

## Where your keys live

One setting decides whether your keys stay on this device or follow the vault
to every device you sync. The setting explains both options in plain words
before you choose.

Keys are held in Obsidian's own keychain, outside your notes.

## What it touches

**Your vault.** Every task, event, routine and habit becomes a plain markdown
note in `02 Planner/`. You can read and edit them without this plugin.

**The services you connect, and only those.** With a key configured it talks
to Todoist, ClickUp, your own IMAP host, the iCal addresses you paste, and
Microsoft's sign-in if you use Outlook. Nothing passes through myICOR: your
Microsoft registration is yours, and so are the tokens.

**It reads by default.** The only things it ever writes back to a source are
completing a task and clearing an email flag, and each sits behind its own
switch that is off until you turn it on.

Without a key for a source, that source is simply off.

## Good to know

- **Desktop and mobile.**
- **Proton Mail** connects through Proton Bridge, which must be running.
- **Outlook** needs about ten minutes of one-time setup in your own Microsoft
  account; there is a step-by-step guide in `docs/`.
- **Beta.** In daily use in a real vault, and you will find rough edges.
  Questions and ideas go in the
  [planner channel](https://app.myicor.com/icor-for-life?channel=planner);
  defects go in
  [bug reports](https://app.myicor.com/icor-for-life?channel=bug-reports).

## Support

Open an issue on this repository. For security problems, see `SECURITY.md`.

## Licence

Source-available, see `LICENSE`. Not open source. Bundled third-party
components: see `THIRD-PARTY-NOTICES.md`.
