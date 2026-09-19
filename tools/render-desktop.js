// Renders the desktop artboards to a static contact sheet, the same way
// render-artboard.js does for the phone: the real component, the real markup.
// Usage: node tools/render-desktop.js [out.html]

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'design/preview/desktop.html';

// Each board plus the states worth showing. A board with no interactive script
// renders once, from an empty state.
const BOARDS = [
  {
    file: 'design/project/Tax.dc.html',
    w: 1280, h: 800,
    panels: [
      ['Tax centre · things to check', {}, {}],
      ['Tax centre · ready to file', { period: 'Ready to file' }, { resolved: { quote: true, inter: true, convention: true, waiting: true } }],
      ['Tax centre · filed', { period: 'Filed' }, {}],
      ['Tax centre · due today', { daysToDeadline: 0 }, {}]
    ]
  },
  { file: 'design/project/Desktop.dc.html', w: 1280, h: 800, panels: [['Accountant journal', {}, {}]] }
];

class DCLogic {
  constructor(props) { this.props = props || {}; }
  setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch); }
  forceUpdate() {}
}
const sandbox = {
  DCLogic,
  window: { matchMedia: () => ({ matches: false }) },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  setInterval: () => 0, clearInterval: () => {},
  setTimeout: () => 0, clearTimeout: () => {}
};

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lookup = (scope, expr) => {
  let cur = scope;
  for (const p of expr.split('.')) { if (cur === null || cur === undefined) return undefined; cur = cur[p]; }
  return cur;
};
const fillHoles = (str, scope, only) => str.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (whole, expr) => {
  if (only && expr.split('.')[0] !== only) return whole;
  if (expr === 'true') return 'true';
  if (expr === 'false') return 'false';
  const v = lookup(scope, expr);
  if (v === undefined || v === null) return '';
  if (typeof v === 'function' || typeof v === 'object') return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return esc(v);
});
const firstInnermost = (src, tag) => {
  const open = new RegExp('<' + tag + '\\b[^>]*>', 'g');
  let m;
  while ((m = open.exec(src))) {
    const bodyStart = m.index + m[0].length;
    const close = src.indexOf('</' + tag + '>', bodyStart);
    if (close === -1) continue;
    const body = src.slice(bodyStart, close);
    if (body.indexOf('<' + tag) === -1) {
      return { start: m.index, openTag: m[0], body, end: close + ('</' + tag + '>').length };
    }
  }
  return null;
};
const truthy = (v) => v === 'true' ? true : (v === 'false' || v === '' || v === undefined ? false : !!v);

function render(markup, scope) {
  let src = markup, guard = 0;
  while (guard++ < 300) {
    const blk = firstInnermost(src, 'sc-for');
    if (!blk) break;
    const listName = (blk.openTag.match(/list="\{\{([a-zA-Z0-9_.]+)\}\}"/) || [])[1];
    const asName = (blk.openTag.match(/as="([a-zA-Z0-9_]+)"/) || [])[1] || 'item';
    const list = listName ? lookup(scope, listName) : [];
    let out = '';
    (Array.isArray(list) ? list : []).forEach((item) => { out += fillHoles(blk.body, { [asName]: item }, asName); });
    src = src.slice(0, blk.start) + out + src.slice(blk.end);
  }
  guard = 0;
  while (guard++ < 600) {
    const blk = firstInnermost(src, 'sc-if');
    if (!blk) break;
    const raw = (blk.openTag.match(/value="([^"]*)"/) || [])[1] || '';
    const keep = /^\{\{[a-zA-Z0-9_.]+\}\}$/.test(raw) ? truthy(lookup(scope, raw.slice(2, -2))) : truthy(raw);
    src = src.slice(0, blk.start) + (keep ? blk.body : '') + src.slice(blk.end);
  }
  src = fillHoles(src, scope);
  return src.replace(/\s(?:onClick|onChange|onKeyDown|ref)="[^"]*"/g, '');
}

let css = '', fontLink = '', cards = [], count = 0;

for (const board of BOARDS) {
  const file = fs.readFileSync(board.file, 'utf8');
  const helmetCss = (file.match(/<helmet>[\s\S]*?<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const link = (file.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis[^"]+)"/) || [])[1] || '';
  const markup = (file.match(/<x-dc>[\s\S]*?<\/helmet>([\s\S]*?)<\/x-dc>/) || [])[1] || '';
  const script = (file.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '';
  if (!fontLink) fontLink = link;
  css += helmetCss + '\n';

  let Component = null;
  if (script.trim()) {
    Component = new Function(...Object.keys(sandbox), script + '\nreturn Component;')(...Object.values(sandbox));
  }

  for (const [title, props, state] of board.panels) {
    let body;
    if (Component) {
      const c = new Component(props);
      if (!c.state) { c.state = {}; }
      Object.assign(c.state, state);
      body = render(markup, c.renderVals());
    } else {
      body = render(markup, {});
    }
    count++;
    cards.push(
      '<figure class="card">\n<div class="board" style="width:' + board.w + 'px;height:' + board.h + 'px">'
      + body + '</div>\n<figcaption>' + esc(title) + '</figcaption>\n</figure>'
    );
  }
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sentryfi desktop screens</title>
${fontLink ? '<link rel="stylesheet" href="' + fontLink + '">' : ''}
<style>
${css}
body { margin: 0; background: #E9EAEC; font-family: Barlow, "Helvetica Neue", Arial, sans-serif; }
.sheet { padding: 40px 32px 64px; }
.sheet h1 { margin: 0 0 6px; font: 700 40px/1 "Barlow Condensed", sans-serif; text-transform: uppercase; color: #141414; }
.sheet p.lead { margin: 0 0 32px; font: 400 15px/1.5 Barlow, sans-serif; color: #44474E; max-width: 66ch; }
.grid { display: flex; flex-direction: column; gap: 36px; }
.card { margin: 0; display: flex; flex-direction: column; gap: 10px; }
.board { position: relative; overflow: hidden; background: #FFFFFF; box-shadow: 0 18px 44px rgba(20,20,20,0.22); }
.board > div { position: absolute; inset: 0; }
figcaption { font: 700 13px "Barlow Condensed", sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #141414; }
</style>
</head>
<body>
<div class="sheet">
<h1>Sentryfi · desktop suite</h1>
<p class="lead">Rendered from each artboard's own markup and logic, so what you see is what the prototype draws. Figures are illustrative. Under the platform split the phone captures and shows what is being spent; these screens keep the books. Interaction and focus rings are not shown here; press Play on the canvas for those.</p>
<div class="grid">
${cards.join('\n')}
</div>
</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
console.log('rendered ' + count + ' desktop panels to ' + OUT);
