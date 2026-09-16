/* The scanner findings of 0.14.2, as gates rather than a one-time cleanup.
 *
 * Three families came out of the eslint-plugin-obsidianmd pass, all of them
 * pre-existing and none of them a behaviour change:
 *   - obsidianmd/no-static-styles-assignment: a surface shown and hidden by
 *     writing element.style.display, which a theme cannot reach and a
 *     stylesheet cannot override;
 *   - no-empty: a catch block that swallows an error and says nothing, so a
 *     reader cannot tell a deliberate swallow from a forgotten handler;
 *   - no-useless-escape: a backslash in a regular expression that escapes a
 *     character needing no escape, which reads as meaning something.
 *
 * What these gates can prove: the source still says the right thing, and the
 * behaviour the escape sat in front of is unchanged. What they cannot prove
 * is the paint. That still needs a real Obsidian and an eye.
 *
 * PLANNER_ROOT / PLANNER_MAIN point every check at another copy of the
 * plugin, which is how each of these was run red against the 0.14.1 bytes.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('./harness.cjs');

const root = process.env.PLANNER_ROOT
  ? path.resolve(process.env.PLANNER_ROOT)
  : path.join(__dirname, '..');
const main = fs.readFileSync(T.__mainPath, 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('THE ASK: nothing is shown or hidden by writing an inline display', () => {
  // The two sites the scanner named were the today countdown bar, shown and
  // hidden as the day moves in and out of a named segment. A class is the
  // codebase's own idiom for this already (the habit modal's conditional
  // rows), and unlike an inline style it can be reached from the stylesheet.
  assert.doesNotMatch(main, /\.style\.display\s*=/, 'display is a stylesheet decision, not an assignment');
  assert.match(main, /this\._countdown\.wrap\.classList\.toggle\('is-hidden', !seg\);/,
    'one toggle, driven by the same condition the old branch was');
  assert.match(css, /\.iplan-countdown\.is-hidden \{ display: none; \}/,
    'and the rule that makes the class mean something');
  // (0,2,0), so it beats the display: flex the element carries by default.
  assert.match(css, /\.iplan-countdown \{\n  display: flex;/, 'the default it has to win against');
});

test('THE ASK: no catch block swallows an error without saying why', () => {
  // A bare `catch {}` and a deliberate swallow look identical six months
  // later. Every one of them now carries either a handler or one line saying
  // what is being swallowed and on what grounds.
  const empty = main.match(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g) || [];
  assert.deepEqual(empty, [], 'a catch block with nothing in it, not even a reason');
  // The five socket teardowns and the folder create keep swallowing; they
  // just say so now.
  assert.match(main, /try \{ plain\.destroy\(\); \} catch \{ \/\* .+ \*\/ \}/);
  assert.match(main, /try \{ socket\.end\(\); \} catch \{ \/\* .+ \*\/ \}/);
  assert.match(main, /await this\.app\.vault\.createFolder\(path\); \} catch \{ \/\* .+ \*\/ \}/);
});

test('THE ASK: the HTML-soup probe escapes nothing that needs no escape', () => {
  // Inside a character class a forward slash is an ordinary character, so
  // `[a-z!\/]` reads as if the backslash carried a meaning it does not.
  assert.doesNotMatch(main, /\[a-z!\\\/\]/, 'the useless escape is gone');
  assert.match(main, /if \(!\/<\[a-z!\/\]\[\^>\]\*>\/i\.test\(x\)\) return x;/, 'and the probe is otherwise the same');
  // the behaviour it gates, unchanged: soup is flattened, plain text passes
  assert.equal(T.htmlishToText('plain text, no tags'), 'plain text, no tags');
  assert.equal(T.htmlishToText('<p>one<br>two</p>'), 'one\ntwo');
  assert.equal(T.htmlishToText('</div>closing tag first'), 'closing tag first', 'a closing tag still opens the class');
  assert.equal(T.htmlishToText('<!-- a comment -->x'), 'x', 'and so does the comment the ! is in the class for');
  assert.equal(T.htmlishToText('<a href="http://x">link</a>'), 'link http://x');
  assert.equal(T.htmlishToText('2 &lt; 3'), '2 &lt; 3', 'no tag, no flattening: the probe is what returns early here');
});
