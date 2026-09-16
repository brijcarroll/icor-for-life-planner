/* The two cross-links between a habit's two notes carry the folder.
 *
 * A habit exists twice by design: `04 Inner World/My Life/Habits/X.md`,
 * where the person and the AI team write about it, and
 * `02 Planner/Habits/X.md`, where its schedule and its check-ins live. The
 * two notes share a name ON PURPOSE, so a bare `[[X]]` cannot say which one
 * a link means. Obsidian resolves a bare link by proximity to the note it
 * sits in, so the planner note's "Open linked note" resolved back to the
 * planner note itself, and the vault's own quality check read the My Life
 * note as an orphan because nothing pointed at that path.
 *
 * So both fields are stored path-qualified:
 *   `linked_note`   on the planner note  -> [[04 Inner World/My Life/Habits/X]]
 *   `planner_habit` on the My Life note  -> [[02 Planner/Habits/X]]
 * and the folders come from the two settings, never from a literal string.
 *
 * A value that already names a folder is authority: it is read as it is and
 * never rewritten, which is what makes the one-time rewrite idempotent.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const T = require('./harness.cjs');

const PluginClass = require(T.__mainPath);
const { TFile, TFolder } = T.__obsidian;
const main = fs.readFileSync(T.__mainPath, 'utf8');

const MY = '04 Inner World/My Life/Habits';
const PL = '02 Planner/Habits';
const slice = (from, to) => main.slice(main.indexOf(from), main.indexOf(to));

/* ---- the pure layer ------------------------------------------------------ */

test('a link target keeps its folders; the basename question is a different one', () => {
  assert.equal(T.wikilinkTarget('[[04 Inner World/My Life/Habits/Walk]]'), '04 Inner World/My Life/Habits/Walk');
  assert.equal(T.wikilinkTarget('[[a/b|c]]'), 'a/b', 'the alias goes, the folder stays');
  assert.equal(T.wikilinkTarget('[[a/b#Log]]'), 'a/b', 'and so does the heading');
  assert.equal(T.wikilinkTarget('[[a/b#^ref]]'), 'a/b');
  assert.equal(T.wikilinkTarget('02 Planner/Habits/Walk.md'), '02 Planner/Habits/Walk', 'a path is a target: the extension goes');
  assert.equal(T.wikilinkTarget('Walk'), 'Walk');
  assert.equal(T.wikilinkTarget(''), null);
  assert.equal(T.wikilinkTarget(null), null);
  // the companion still answers the display question, folders stripped
  assert.equal(T.wikilinkBasename('[[04 Inner World/My Life/Habits/Walk]]'), 'Walk');
});

test('qualifying adds the folder a bare name is known to live in, and never overrides one', () => {
  assert.equal(T.qualifyLinkTarget('Walk', MY), `${MY}/Walk`);
  assert.equal(T.qualifyLinkTarget('[[Walk]]', MY), `${MY}/Walk`);
  assert.equal(T.qualifyLinkTarget(`[[${PL}/Walk]]`, MY), `${PL}/Walk`, 'a folder that is already there is authority');
  assert.equal(T.qualifyLinkTarget('Walk', ''), 'Walk', 'no folder to add: the bare name, not a leading slash');
  assert.equal(T.qualifyLinkTarget('', MY), null);
  assert.equal(T.wikilinkOf(`${MY}/Walk`), `[[${MY}/Walk]]`);
  assert.equal(T.wikilinkOf(null), null);
});

/* ---- the writers --------------------------------------------------------- */

test('THE ASK: a fresh import writes both fields with the full path', async () => {
  const { p, files, calls } = importApp();
  const r = await p.importHabits(p.importCandidates());
  assert.deepEqual(r, { done: 2, skipped: 0, failed: [] });
  // the planner note points at the My Life note, by path
  assert.match(calls.create[0].content, new RegExp(`^linked_note: "\\[\\[${MY}/Morning pages\\]\\]"$`, 'm'));
  assert.match(calls.create[1].content, new RegExp(`^linked_note: "\\[\\[${MY}/Walk\\]\\]"$`, 'm'));
  // and the My Life note back at the planner note, by path
  assert.equal(files[`${MY}/Morning pages.md`].fm.planner_habit, `[[${PL}/Morning pages]]`);
  assert.equal(files[`${MY}/Walk.md`].fm.planner_habit, `[[${PL}/Walk]]`);
  // neither field is ever a bare name again
  for (const path of Object.keys(files)) {
    const m = /^(linked_note|planner_habit): "\[\[([^\]]+)\]\]"$/m.exec(files[path].text);
    if (m) assert.ok(m[2].includes('/'), `${path} still writes a folderless ${m[1]}`);
  }
});

test('THE ASK: the dialog and the mapper both write the folder from the setting, not a literal', () => {
  // the New habit dialog hands a basename from the folder listing; the
  // frontmatter it produces names the folder it came from
  const fm = T.habitFrontmatterOf({ name: 'Walk', cadence: 'daily', linkedNote: 'Walk' }, { nowIso: 'T', today: '2026-09-16', linkFolder: MY });
  assert.equal(fm.linked_note, `[[${MY}/Walk]]`);
  assert.match(T.habitTemplate({ name: 'Walk', cadence: 'daily', linkedNote: 'Walk' }, { nowIso: 'T', linkFolder: MY }),
    new RegExp(`^linked_note: "\\[\\[${MY}/Walk\\]\\]"$`, 'm'));
  // a different room in the settings is a different folder in the link
  assert.equal(T.habitFrontmatterOf({ name: 'Walk', cadence: 'daily', linkedNote: 'Walk' }, { nowIso: 'T', linkFolder: 'Life/Habits' }).linked_note, '[[Life/Habits/Walk]]');
  // the import mapper takes the note's own path
  assert.equal(T.importMapping({ type: 'habit', cadence: 'daily' }, 'Walk', `${MY}/Walk.md`).linkedNote, `[[${MY}/Walk]]`);
  // and the back-link writer takes a target, never a slug it has to guess at
  assert.match(T.importSourceFrontmatterText('---\ncadence: daily\n---\n', `${PL}/Walk`),
    new RegExp(`^planner_habit: "\\[\\[${PL}/Walk\\]\\]"$`, 'm'));
});

/* ---- the one-time rewrite ------------------------------------------------ */

test('THE ASK: a bare value is rewritten once, and a second run changes nothing', () => {
  const before = [
    '---',
    'name: Walk        # the name it is known by',
    '',
    '# where the schedule lives',
    'planner_habit: "[[Walk]]"',
    'type: habit',
    '---',
    '',
    '# Walk',
    '',
    'Schedule and check-ins: [[Walk]]',
    '',
  ].join('\n');
  const once = T.qualifyFrontmatterLink(before, 'planner_habit', PL);
  assert.equal(once, before.replace('planner_habit: "[[Walk]]"', `planner_habit: "[[${PL}/Walk]]"`));
  assert.equal(T.qualifyFrontmatterLink(once, 'planner_habit', PL), once, 'idempotent: a second run is a no-op');
  // only that one line moved: the comments, the blank line and the body stay
  assert.ok(once.includes('name: Walk        # the name it is known by'));
  assert.ok(once.includes('\n# where the schedule lives\n'));
  assert.ok(once.includes('\nSchedule and check-ins: [[Walk]]\n'), 'the body is not touched');
  assert.equal(once.split('\n').length, before.split('\n').length, 'no line added, none removed');
  // CRLF survives, and so does an unquoted value
  const crlf = before.replace(/\n/g, '\r\n');
  assert.equal(T.qualifyFrontmatterLink(crlf, 'planner_habit', PL), once.replace(/\n/g, '\r\n'));
  assert.equal(T.qualifyFrontmatterLink('---\nplanner_habit: [[Walk]]\n---\n', 'planner_habit', PL), `---\nplanner_habit: "[[${PL}/Walk]]"\n---\n`);
  assert.equal(T.qualifyFrontmatterLink('---\nlinked_note: "[[Walk]]"\n---\n', 'linked_note', MY), `---\nlinked_note: "[[${MY}/Walk]]"\n---\n`);
});

test('THE ASK: a value that already names a folder is never rewritten', () => {
  const done = `---\nplanner_habit: "[[${PL}/Walk]]"\n---\n`;
  assert.equal(T.qualifyFrontmatterLink(done, 'planner_habit', PL), done);
  assert.equal(T.qualifyFrontmatterLink(done, 'planner_habit', 'Somewhere Else'), done, 'even when the setting now says another folder: the note wins');
  // and nothing else is ever touched
  for (const text of [
    '---\nplanner_habit:\n---\n',                      // empty
    '---\nplanner_habit: # set me\n---\n',             // a comment for a value
    '---\nplanner_habit: "[[Walk]]" # keep\n---\n',    // a shape we do not parse
    '---\nplanner_habit: "[[a|b]]"\n---\n',            // an alias we do not rewrite blind
    '---\nname: Walk\n---\n',                          // the key is not there
    'no frontmatter at all\n',
    '---\nplanner_habit: "[[Walk]]"\nno closing fence\n',
  ]) assert.equal(T.qualifyFrontmatterLink(text, 'planner_habit', PL), text, `left alone: ${JSON.stringify(text)}`);
});

test('THE ASK: the plan names every bare cross-link and nothing else, and empties itself', () => {
  const habit = (linked, path) => T.habitFromFrontmatter({ type: 'planner-habit', name: 'x', cadence: 'daily', linked_note: linked }, path, '');
  const plan = T.qualifyLinkPlan(
    [habit('[[Walk]]', `${PL}/Walk.md`), habit(`[[${MY}/Pages]]`, `${PL}/Pages.md`), habit(null, `${PL}/Solo.md`)],
    [
      { path: `${MY}/Walk.md`, fm: { planner_habit: '[[Walk]]' } },
      { path: `${MY}/Pages.md`, fm: { planner_habit: `[[${PL}/Pages]]` } },
      { path: `${MY}/New.md`, fm: { cadence: 'daily' } },
    ],
    { importFolder: MY, plannerFolder: PL },
  );
  assert.deepEqual(plan, [
    { path: `${PL}/Walk.md`, field: 'linked_note', folder: MY },
    { path: `${MY}/Walk.md`, field: 'planner_habit', folder: PL },
  ]);
  assert.deepEqual(T.qualifyLinkPlan([], [], { importFolder: MY, plannerFolder: PL }), [], 'nothing bare, nothing to do');
  assert.deepEqual(T.qualifyLinkPlan(null, null, null), []);
});

test('THE ASK: the import rewrites a bare pair once, writes each note once, and the next import writes nothing', async () => {
  const { p, files, calls } = importApp();
  // an already-imported pair from before this release, both links bare
  files[`${MY}/Old.md`] = { text: '---\ntype: habit\nplanner_habit: "[[Old]]"\n---\n\n# Old\n', fm: { type: 'habit', planner_habit: '[[Old]]' } };
  files[`${PL}/Old.md`] = { text: '---\ntype: planner-habit\nname: Old\ncadence: daily\nlinked_note: "[[Old]]"\n---\n\n# Old\n', fm: { type: 'planner-habit', name: 'Old', cadence: 'daily', linked_note: '[[Old]]' } };
  p.habits = [T.habitFromFrontmatter(files[`${PL}/Old.md`].fm, `${PL}/Old.md`, files[`${PL}/Old.md`].text)];
  await p.importHabits([]);
  assert.equal(files[`${MY}/Old.md`].fm.planner_habit, `[[${PL}/Old]]`);
  assert.equal(files[`${PL}/Old.md`].fm.linked_note, `[[${MY}/Old]]`);
  assert.ok(files[`${MY}/Old.md`].text.endsWith('\n\n# Old\n'), 'the body is untouched');
  const writes = calls.process.filter((x) => x.endsWith('Old.md'));
  assert.deepEqual(writes, [`${PL}/Old.md`, `${MY}/Old.md`], 'one write per note, no more');
  // and the run after it writes nothing at all
  p.habits = [T.habitFromFrontmatter(files[`${PL}/Old.md`].fm, `${PL}/Old.md`, files[`${PL}/Old.md`].text)];
  calls.process.length = 0;
  await p.importHabits([]);
  assert.deepEqual(calls.process, [], 'a qualified pair is left alone');
});

/* ---- the readers --------------------------------------------------------- */

test('THE ASK: a qualified link resolves to the right file when two notes share a name', () => {
  const app = resolverApp([`${MY}/Walk.md`, `${PL}/Walk.md`]);
  const source = `${PL}/Walk.md`;
  // the bug, stated: the basename resolves to the note the link SITS in
  assert.equal(app.metadataCache.getFirstLinkpathDest('Walk', source).path, source, 'Obsidian picks the closest, which is the wrong one here');
  // the fix: the reader hands the resolver the stored target
  assert.equal(T.linkedFileOf(app, `[[${MY}/Walk]]`, source).path, `${MY}/Walk.md`);
  // and a bare value still works, for a name that IS unique
  assert.equal(T.linkedFileOf(app, '[[Walk]]', `${MY}/Pages.md`).path, `${MY}/Walk.md`, 'no folder on the source side: the first match');
  assert.equal(T.linkedFileOf(app, '[[Nothing]]', source), null, 'a name that matches nothing is null, never a throw');
  assert.equal(T.linkedFileOf(app, '', source), null);
  assert.equal(T.linkedFileOf(app, null, source), null);
  // an alias and a heading survive the trip
  assert.equal(T.linkedFileOf(app, `[[${MY}/Walk|the walk]]`, source).path, `${MY}/Walk.md`);
  assert.equal(T.linkedFileOf(app, `[[${MY}/Walk#Log]]`, source).path, `${MY}/Walk.md`);
});

test('every reader of the two fields takes both shapes, bare and qualified', () => {
  const habit = (v) => T.habitFromFrontmatter({ type: 'planner-habit', name: 'Walk', cadence: 'daily', linked_note: v }, `${PL}/Walk.md`, '');
  for (const v of ['[[Walk]]', `[[${MY}/Walk]]`, `[[${MY}/Walk|the walk]]`, 'Walk']) {
    assert.equal(habit(v).linkedBasename, 'Walk', `the chip and the tooltip read ${v} as a name`);
    assert.equal(T.wikilinkTarget(habit(v).linkedTarget), T.wikilinkTarget(v), `and the resolver reads ${v} as a target`);
  }
  // the item side, the same two questions and the same two answers
  const item = (v) => T.itemFromFrontmatter({ type: 'planner-item', source: 'todoist', external_id: '1', title: 'x', linked_note: v }, '02 Planner/Todoist/x.md', 'x');
  assert.equal(item(`[[${MY}/Walk]]`).linkedNote, 'Walk', 'the menu label stays the short name');
  assert.equal(item(`[[${MY}/Walk]]`).linkedNoteTarget, `${MY}/Walk`, 'the resolver and the editor get the whole thing');
  assert.equal(item('[[Walk]]').linkedNoteTarget, 'Walk');
  assert.equal(item(null).linkedNoteTarget, null, 'no link is no target, not an empty string');
  // the import's own reader keys by basename on purpose: the two notes of a
  // habit share one, which is the whole reason the fields carry the folder
  const planner = [T.habitFromFrontmatter({ type: 'planner-habit', name: 'Walk', cadence: 'daily', linked_note: `[[${MY}/Walk]]` }, `${PL}/Walk.md`, '')];
  assert.deepEqual(T.importPlan([{ path: `${MY}/Walk.md`, basename: 'Walk', fm: { type: 'habit', cadence: 'daily' } }], planner)
    .map((c) => c.existingPlanner), [`${PL}/Walk.md`], 'a qualified link still resumes into the planner note it names');
});

/* ---- the source-level guard ---------------------------------------------- */

test('SOURCE GUARD: no writer of the two habit cross-links can emit a folderless link', () => {
  // The behavioural half: drive every writer with the barest input there is
  // and none of them comes back with a folderless value.
  const bare = [
    T.habitFrontmatterOf({ name: 'Walk', cadence: 'daily', linkedNote: 'Walk' }, { nowIso: 'T', linkFolder: MY }).linked_note,
    T.importMapping({ cadence: 'daily' }, 'Walk', `${MY}/Walk.md`).linkedNote,
    /planner_habit: "(.*)"/.exec(T.importSourceFrontmatterText('---\ncadence: daily\n---\n', `${PL}/Walk`))[1],
    T.qualifyFrontmatterLink('---\nlinked_note: "[[Walk]]"\n---\n', 'linked_note', MY).match(/linked_note: "(.*)"/)[1],
  ];
  for (const v of bare) assert.match(v, /^\[\[.+\/.+\]\]$/, `a writer emitted ${v} with no folder`);

  // The source half: the folder comes from the settings, at the call site.
  const create = slice('  async createHabit(', '  // The notes the import could take');
  assert.match(create, /const linkFolder = this\.habitsImportFolder\(\);/, 'the room is read from the setting, never written as a literal');
  assert.match(create, /habitTemplate\(input, \{ nowIso, today, lenient, linkFolder, logBlock: o\.logBlock \}\)/);
  assert.match(create, /habitFrontmatterOf\(input, \{ nowIso, today, lenient, linkFolder \}\)/, 'and the cache entry agrees with the note');

  const imp = slice('  async importHabits(', '  /* ---- manual items');
  assert.match(imp, /await this\.qualifyHabitLinks\(\);/, 'the one-time rewrite runs inside the consented write window');
  assert.match(imp, /const plannerLink = wikilinkTarget\(path\);/);
  assert.match(imp, /importSourceFrontmatterText\(data, plannerLink\)/, 'the back-link gets a path');
  assert.match(imp, /moveHabitLog\(data, slug\)/, 'the body pointer keeps the short name it always had');

  // No writer of these two fields composes a link from a name any more.
  const writers = [
    slice('function habitFrontmatterOf(', 'function habitTemplate('),
    slice('function importMapping(', "// The import's rows"),
    slice('function normalizeLinkedNote(', 'function itemFromFrontmatter('),
  ];
  for (const w of writers) {
    assert.doesNotMatch(w, /wikilinkBasename\(/, 'the basename is the DISPLAY question; a stored link is a target');
    assert.doesNotMatch(w, /\[\[\$\{basename\}\]\]/);
  }

  // And the two resolvers go through the one helper, never the basename.
  const tray = slice('  openLinkedNote(h) {', '  // The row menu.');
  assert.match(tray, /linkedFileOf\(this\.app, h\.linkedTarget, h\.path\)/);
  assert.doesNotMatch(tray, /getFirstLinkpathDest\(h\.linkedBasename/, 'the bug: a basename handed to the resolver');
  const menu = slice('function showCardMenu(', '// Tap-to-plan');
  assert.match(menu, /linkedFileOf\(plugin\.app, item\.linkedNoteTarget, item\.path\)/);
  assert.doesNotMatch(menu, /getFirstLinkpathDest\(item\.linkedNote,/);

  // The Obsidian surface is unchanged: the My Life note is still edited as
  // text, so its YAML comments survive (0.11.0).
  const qualify = slice('  async qualifyHabitLinks(', '  // The import, for the chosen candidates.');
  assert.doesNotMatch(qualify, /processFrontMatter/, 'never the frontmatter editor on a note with comments');
  assert.match(qualify, /vault\.process\(/);
});

/* ---- fakes --------------------------------------------------------------- */

// A vault with two My Life notes and an empty planner room, the shape the
// import test uses: enough YAML for the fixtures, reparsed after every write
// the way Obsidian's cache reparses after one.
function fmOf(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key) { if (!Array.isArray(fm[key])) fm[key] = []; fm[key].push(item[1].trim()); continue; }
    const kv = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    if (v === '') fm[key] = null;
    else if (/^\[.*\]$/.test(v) && !/^\[\[/.test(v)) fm[key] = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    else fm[key] = v.replace(/^"(.*)"$/, '$1');
  }
  for (const k of Object.keys(fm)) if (fm[k] === null) delete fm[k];
  return fm;
}

function importApp() {
  const files = {
    [`${MY}/Morning pages.md`]: { text: '---\nname: Morning pages\ncadence: weekly\nstatus: active\nstarted_on: 2026-08-27\n---\n\n# Morning pages\n', fm: { name: 'Morning pages', cadence: 'weekly', status: 'active', started_on: '2026-08-27' } },
    [`${MY}/Walk.md`]: { text: '---\ntype: habit\ncadence: daily\nsince: 2026-08-01\n---\n\n# Walk\n', fm: { type: 'habit', cadence: 'daily', since: '2026-08-01' } },
  };
  const folders = new Set([MY, '02 Planner', PL]);
  const calls = { process: [], frontmatter: [], create: [], notices: [] };
  const fileOf = (p) => { const f = new TFile(); f.path = p; f.basename = p.split('/').pop().replace(/\.md$/, ''); f.extension = 'md'; f.stat = { mtime: 1 }; return f; };
  const folderOf = (p) => { const f = new TFolder(); f.path = p; f.children = Object.keys(files).filter((k) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes('/')).map(fileOf); return f; };
  const app = {
    vault: {
      getAbstractFileByPath: (p) => (files[p] ? fileOf(p) : (folders.has(p) ? folderOf(p) : null)),
      read: async (f) => files[f.path].text,
      cachedRead: async (f) => files[f.path].text,
      process: async (f, fn) => { calls.process.push(f.path); files[f.path].text = fn(files[f.path].text); files[f.path].fm = fmOf(files[f.path].text); },
      create: async (p, content) => { calls.create.push({ path: p, content }); files[p] = { text: content, fm: fmOf(content) }; return fileOf(p); },
      createFolder: async (p) => { folders.add(p); },
    },
    fileManager: { processFrontMatter: async (f, fn) => { calls.frontmatter.push(f.path); fn(files[f.path].fm); } },
    metadataCache: { getFileCache: (f) => ({ frontmatter: files[f.path] && files[f.path].fm }) },
  };
  const p = Object.create(PluginClass.prototype);
  p.settings = { plannerFolder: '02 Planner', habitsImportFolder: MY };
  p.app = app;
  p.habits = [];
  p._habitCache = new Map();
  p.emitModelChanged = () => { };
  return { p, files, calls };
}

// A metadataCache that resolves a linkpath the way Obsidian does: an exact
// path wins; a bare name falls back to the match closest to the note the
// link sits in, which for two notes of the same name is the source's own.
function resolverApp(paths) {
  const fileOf = (p) => { const f = new TFile(); f.path = p; f.basename = p.split('/').pop().replace(/\.md$/, ''); return f; };
  return {
    metadataCache: {
      getFirstLinkpathDest(linkpath, sourcePath) {
        const want = String(linkpath == null ? '' : linkpath).replace(/\.md$/i, '');
        if (!want) return null;
        const exact = paths.find((p) => p.replace(/\.md$/i, '') === want);
        if (exact) return fileOf(exact);
        if (want.includes('/')) return null;
        const hits = paths.filter((p) => p.split('/').pop().replace(/\.md$/i, '') === want);
        if (!hits.length) return null;
        const dir = String(sourcePath || '').split('/').slice(0, -1).join('/');
        return fileOf(hits.find((p) => dir && p.startsWith(`${dir}/`)) || hits[0]);
      },
    },
  };
}
