/* An incomplete fetch must never mark anything done (T14, Ian Slattery).
 *
 * The defect: every task connector reported `ok` whether it had read the
 * member's whole open set or only the first N pages of it, and reconcile
 * treats "not in the open set" as "finished at the source". Past the ceiling
 * the plugin wrote `status: done` and `done_at` onto live tasks in the
 * member's vault and, with completeOnSource armed, closed them in the
 * member's real Todoist, ClickUp or mailbox.
 *
 * Six ways the set was short while the result still said ok: the Todoist
 * cursor cap, the ClickUp page cap, the Outlook page cap, the IMAP read that
 * takes only the newest 50 of a larger flagged set, the Graph origin guard
 * ending a walk on a refused paging link, and a ClickUp filter change that
 * stops items being fetched at all. Plus a healthy fetch of zero items, which
 * would retire an entire source in one pass.
 *
 * The fix is `complete: false` on the result, not `degraded`: a degraded
 * source skips the upsert entirely and would freeze the board for good once
 * an account passed the ceiling. So every gate below asserts BOTH halves -
 * nothing is marked done, and the items still come back for the board.
 *
 * Every test here was run red against the 0.12.0 bytes through PLANNER_MAIN
 * before it counted.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const T = require('./harness.cjs');
const { fakeSocket, okReply } = require('./fake-imap.cjs');

const code = () => fs.readFileSync(T.__mainPath, 'utf8');
const bare = () => code().split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const json = (body) => ({ status: 200, json: body, text: JSON.stringify(body), headers: {} });

/* ---- the result contract ------------------------------------------------ */

test('okResult carries completeness, and a clean result still carries no extra keys', () => {
  const clean = T.okResult('todoist', []);
  assert.equal(clean.ok, true);
  assert.equal('complete' in clean, false, 'a complete result says nothing; absence is the default');
  assert.equal('warning' in clean, false);
  const short = T.okResult('todoist', [{ id: '1' }], 'more behind the cap', false);
  assert.equal(short.ok, true, 'incomplete is not a failure: the items are real');
  assert.equal(short.complete, false);
  assert.equal(short.warning, 'more behind the cap');
  assert.equal('complete' in T.okResult('todoist', [], 'w', true), false);
  assert.match(T.truncatedWarning(4000), /nothing was marked done/);
  assert.match(T.truncatedWarning(1), /after 1 item with/, 'one item is singular');
});

/* ---- 1. Todoist: the cursor cap ---------------------------------------- */

test('a truncated Todoist walk is healthy, incomplete, and marks nothing done', async () => {
  let pages = 0;
  // Todoist never runs out of pages: the cap is what stops the walk.
  const requestUrl = async () => {
    pages += 1;
    return json({ results: [{ id: `t${pages}`, content: `Task ${pages}` }], next_cursor: `c${pages}` });
  };
  const r = await T.todoistFetchOpen({ todoistToken: 'tok' }, { requestUrl });
  assert.equal(pages, 20, 'the cap is still 20 pages; this gate is about what the cap REPORTS');
  assert.equal(r.ok, true);
  assert.equal(r.complete, false, 'a cursor still in hand means Todoist has more open tasks');
  assert.match(r.warning, /nothing was marked done/);
  assert.equal(r.items.length, 20, 'the board still gets every task that was read');

  // and a walk that ends because Todoist said so is complete
  let n = 0;
  const finite = async () => {
    n += 1;
    return json({ results: [{ id: `t${n}`, content: 'x' }], next_cursor: n < 3 ? `c${n}` : null });
  };
  const full = await T.todoistFetchOpen({ todoistToken: 'tok' }, { requestUrl: finite });
  assert.equal('complete' in full, false);
  assert.equal('warning' in full, false);
  assert.equal(full.items.length, 3);
});

/* ---- 2. Outlook: the page cap and the refused paging link ---------------- */

const SIGNED = {
  outlookClientId: '11111111-2222-3333-4444-555555555555', outlookTenant: 'common',
  outlookRefreshToken: 'rt-1', outlookAccessToken: 'at-1',
  outlookExpiresAt: String(Date.now() + 3600000), outlookAccount: 'me@example.com',
  outlookScopes: 'Mail.Read Calendars.Read',
};
const signedIn = () => T.withSecrets(Object.assign({}, T.DEFAULT_SETTINGS, SIGNED), new T.SecretVault(null));
const message = (i) => ({ id: `AAMk${i}`, subject: `Flagged ${i}`, bodyPreview: '', importance: 'normal', flag: { flagStatus: 'flagged' } });

test('a truncated Outlook walk is healthy, incomplete, and marks nothing done', async () => {
  let pages = 0;
  const requestUrl = async () => {
    pages += 1;
    return json({ value: [message(pages)], '@odata.nextLink': `https://graph.microsoft.com/v1.0/me/messages?$skip=${pages * 50}` });
  };
  const r = await T.outlookFetchOpen(signedIn(), { requestUrl });
  assert.equal(pages, 10, 'the cap is still 10 pages');
  assert.equal(r.ok, true);
  assert.equal(r.complete, false, 'a nextLink still in hand means there is more flagged mail');
  assert.match(r.warning, /nothing was marked done/);
  assert.equal(r.items.length, 10, 'the board still gets every message that was read');
});

test('a paging link from another host ends the walk AND says the walk is short', async () => {
  // The origin guard is right to refuse the link: the request carries the
  // bearer token. What was wrong is that the refusal looked like "no more
  // pages", and reconcile then retired every flagged mail behind it.
  let pages = 0;
  const requestUrl = async () => {
    pages += 1;
    return json({
      value: [message(pages)],
      '@odata.nextLink': pages === 1
        ? 'https://graph.microsoft.com.evil.example/v1.0/me/messages?$skip=50'
        : null,
    });
  };
  const r = await T.outlookFetchOpen(signedIn(), { requestUrl });
  assert.equal(pages, 1, 'the walk still stops at the refused link');
  assert.equal(T.graphNextLink('https://graph.microsoft.com.evil.example/x'), null, 'the guard itself is unchanged');
  assert.equal(r.ok, true);
  assert.equal(r.complete, false);
  assert.match(r.warning, /another host/);
  assert.equal(r.items.length, 1, 'what was read still reaches the board');
});

/* ---- 3. Email: the flagged set is larger than the slice that is read ----- */

const IMAP = { host: 'mail.example.org', port: 993, security: 'tls' };
const tlsDeps = (sock) => ({ tls: { connect: () => sock } });
const uids = (n) => Array.from({ length: n }, (_, i) => String(i + 1)).join(' ');
const searching = (n) => fakeSocket({
  reply: okReply((cmd) => (cmd === 'UID SEARCH FLAGGED' ? [`* SEARCH ${uids(n)}`, '$TAG OK'] : undefined)),
});

test('a flagged set larger than the cap is incomplete: the OLDEST stars were never read', async () => {
  assert.equal(T.EMAIL_MAX_ITEMS, 50);
  const settings = { imapHost: IMAP.host, imapUser: 'u', imapPassword: 'p' };
  const over = await T.emailFetchStarred(settings, tlsDeps(searching(51)));
  assert.equal(over.ok, true);
  assert.equal(over.complete, false, '51 starred mails, 50 read: uid 1 is open, not finished');
  assert.match(over.warning, /51 starred mails/);
  assert.match(over.warning, /nothing was marked done/);

  // exactly at the cap is complete, and so is an empty mailbox
  const at = await T.emailFetchStarred(settings, tlsDeps(searching(50)));
  assert.equal('complete' in at, false);
  const none = await T.emailFetchStarred(settings, tlsDeps(searching(0)));
  assert.equal('complete' in none, false);

  // the raw read still reports the whole flagged count beside the items
  const report = {};
  await T.imapFetchStarredRaw(IMAP, 'u', 'p', 50, tlsDeps(searching(51)), report);
  assert.equal(report.flagged, 51, 'SEARCH found 51; FETCH asked for 50');
});

/* ---- 4. ClickUp: the page cap and the filter that narrows --------------- */

test('a truncated ClickUp walk is healthy, incomplete, and marks nothing done', async () => {
  let calls = 0;
  const requestUrl = async (req) => {
    calls += 1;
    if (/\/user$/.test(req.url)) return json({ user: { id: 42 } });
    if (/\/team$/.test(req.url)) return json({ teams: [{ id: '900' }] });
    // last_page never arrives: the cap is what stops the walk.
    return json({ tasks: [{ id: `c${calls}`, name: 'Task', status: { type: 'open' } }] });
  };
  const r = await T.clickupFetchOpen({ clickupToken: 'pk_1' }, { requestUrl });
  assert.equal(r.ok, true);
  assert.equal(r.complete, false, 'the page counter ran out; ClickUp never said last_page');
  assert.match(r.warning, /nothing was marked done/);
  assert.equal(r.items.length, 20, 'the board still gets every task that was read');
  assert.equal(r.scope, 'sub=0|team=*|me=42', 'the query that produced this answer travels with it');

  // a walk ClickUp itself ended is complete
  let n = 0;
  const finite = async (req) => {
    if (/\/user$/.test(req.url)) return json({ user: { id: 42 } });
    if (/\/team$/.test(req.url)) return json({ teams: [{ id: '900' }] });
    n += 1;
    return json({ tasks: [{ id: `c${n}`, name: 'Task', status: { type: 'open' } }], last_page: true });
  };
  const full = await T.clickupFetchOpen({ clickupToken: 'pk_1' }, { requestUrl: finite });
  assert.equal('complete' in full, false);
  assert.equal(full.items.length, 1);
});

test('clickupScopeKey names everything that can shrink the open set without a completion', () => {
  assert.equal(T.clickupScopeKey({}, 42), 'sub=0|team=*|me=42');
  assert.notEqual(T.clickupScopeKey({ clickupIncludeSubtasks: true }, 42), T.clickupScopeKey({}, 42));
  assert.notEqual(T.clickupScopeKey({ clickupTeamId: '900' }, 42), T.clickupScopeKey({}, 42));
  assert.notEqual(T.clickupScopeKey({}, 7), T.clickupScopeKey({}, 42), 'another token is another account');
  assert.equal(T.clickupScopeKey({ clickupTeamId: '  900  ' }, 42), T.clickupScopeKey({ clickupTeamId: '900' }, 42));
});

test('THE SUBTASK CASE: turning ClickUp subtasks off must not record 18 subtasks as achievements', () => {
  const on = T.clickupScopeKey({ clickupIncludeSubtasks: true }, 42);
  const off = T.clickupScopeKey({ clickupIncludeSubtasks: false }, 42);
  // A shadow last confirmed while subtasks were fetched cannot be read by a
  // sync that no longer asks for them.
  assert.equal(T.scopeAgrees({ scope: on }, off), false);
  assert.equal(T.scopeAgrees({ scope: off }, off), true, 'same question, so absence is an answer');
  assert.equal(T.scopeAgrees({ scope: on }, null), true, 'a source with no scope narrows nothing');
  assert.equal(T.scopeAgrees(null, off), true, 'never seen under a recorded scope: the upgrade window');
  assert.equal(T.scopeAgrees(undefined, off), true);

  const item = (o) => Object.assign({ source: 'clickup', status: 'open', reopenPending: false }, o);
  const items = [item({ id: 'parent' }), item({ id: 'sub-1' }), item({ id: 'sub-2' })];
  const shadows = { 'clickup:sub-1': { scope: on }, 'clickup:sub-2': { scope: on }, 'clickup:parent': { scope: off } };
  const openIds = new Set(['parent']);
  const stale = T.reconcileStaleIds('clickup', items, openIds, (it) => T.scopeAgrees(shadows[`clickup:${it.id}`], off));
  assert.deepEqual(stale.map((i) => i.id), [], 'the subtasks are out of scope, not finished');
  // without the predicate the old behaviour is still visible, which is what
  // makes the predicate the guard rather than a coincidence
  assert.deepEqual(T.reconcileStaleIds('clickup', items, openIds).map((i) => i.id), ['sub-1', 'sub-2']);
});

/* ---- 5. The sync engine: the gate itself -------------------------------- */

test('THE GATE: upsertSource reconciles only a complete, non-empty, same-scope fetch', () => {
  const src = code();
  const sync = src.slice(src.indexOf('async upsertSource('), src.indexOf('async readBody('));
  assert.ok(/async upsertSource\(source, result\) \{/.test(sync), 'the whole result reaches the upsert, not just the items');
  assert.ok(/const complete = !\(result && result\.complete === false\);/.test(sync), 'completeness is read from the result');
  assert.ok(/const stale = complete && items\.length > 0\s*\n?\s*\? reconcileStaleIds\(source, allItems, openIds, \(it\) => scopeAgrees\(/.test(sync),
    'reconcile runs behind the completeness gate, the empty-result gate and the scope predicate');
  assert.ok(/for \(const stale2? of \[\]\)/.test(sync) === false);
  assert.ok(/for \(const it of stale\) \{/.test(sync), 'the write loop consumes the gated list');
  // the half that must NOT be gated: the board stays live
  assert.ok(sync.indexOf('await this.createItemFile(folder, source, t);') < sync.indexOf('const complete ='),
    'creates and updates run before the gate, so an over-ceiling source still renders');
  assert.ok(/if \(scope\) nextShadow\.scope = scope;/.test(sync), 'every item the source returned is stamped with the current scope');
});

test('THE GATE: a healthy fetch of zero items reconciles nothing', () => {
  // reconcileStaleIds is happy to retire the whole source; the gate is what
  // refuses to ask it. The expression is the assertion.
  const src = code();
  const sync = src.slice(src.indexOf('async upsertSource('), src.indexOf('async readBody('));
  assert.ok(/items\.length > 0/.test(sync), 'an empty open set is never evidence of completion');
  const item = (id) => ({ source: 'todoist', id, status: 'open', reopenPending: false });
  const all = [item('a'), item('b')];
  assert.equal(T.reconcileStaleIds('todoist', all, new Set()).length, 2, 'unguarded, an empty set retires everything');
});

test('the sync loop carries completeness and the warning into syncStatus', () => {
  const src = bare();
  assert.match(src, /warning: result\.warning \|\| null, complete: result\.complete !== false,/, 'both ride into syncStatus');
  assert.match(src, /if \(result\.ok\) await this\.upsertSource\(source, result\);/, 'the upsert still runs on every healthy result');
});

test('the board shows one line for a healthy but incomplete sync', () => {
  const src = bare();
  assert.match(src, /\} else if \(st && st\.ok && st\.warning\) \{\n\s*notices\.push\(`\$\{SOURCES\[key\]\.label\}: \$\{st\.warning\}`\);/,
    'a healthy source with a warning gets a notice row');
  const board = src.slice(src.indexOf('const notices = [];'), src.indexOf('/* ---- board ---- */'));
  assert.ok(!/iplan-notice-/.test(board), 'no new notice class; the existing row styling carries it');
});
