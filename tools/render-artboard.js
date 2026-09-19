// Renders the Sentryfi phone artboard to a static contact sheet.
// It executes the artboard's own DCLogic class and expands its own markup,
// so every panel is the real screen, not a redrawing.

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || 'design/project/App.dc.html';
const OUT = process.argv[3] || 'design/preview/screens.html';

const file = fs.readFileSync(SRC, 'utf8');

// ---- pull the three parts out of the .dc.html --------------------------------
const helmetCss = (file.match(/<helmet>[\s\S]*?<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const fontLink = (file.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis[^"]+)"/) || [])[1] || '';
const markup = (file.match(/<x-dc>[\s\S]*?<\/helmet>([\s\S]*?)<\/x-dc>/) || [])[1] || '';
const script = (file.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '';

// ---- run the component's logic ----------------------------------------------
class DCLogic {
  constructor(props) { this.props = props || {}; }
  setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch); }
  forceUpdate() {}
}
const sandbox = {
  DCLogic,
  window: { matchMedia: () => ({ matches: false }) },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {}
};
const factory = new Function(...Object.keys(sandbox), script + '\nreturn Component;');
const Component = factory(...Object.values(sandbox));

// ---- the smallest template engine that runs this markup ----------------------
const esc = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lookup(scope, expr) {
  const parts = expr.split('.');
  let cur = scope;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function fillHoles(str, scope, only) {
  return str.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (whole, expr) => {
    if (only && expr.split('.')[0] !== only) return whole;
    if (expr === 'true') return 'true';
    if (expr === 'false') return 'false';
    const v = lookup(scope, expr);
    if (v === undefined || v === null) return '';
    if (typeof v === 'function' || typeof v === 'object') return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return esc(v);
  });
}

// find the first block whose body holds no further opening tag of the same name
function firstInnermost(src, tag) {
  const open = new RegExp('<' + tag + '\\b[^>]*>', 'g');
  let m, best = null;
  while ((m = open.exec(src))) {
    const bodyStart = m.index + m[0].length;
    const close = src.indexOf('</' + tag + '>', bodyStart);
    if (close === -1) continue;
    const body = src.slice(bodyStart, close);
    if (body.indexOf('<' + tag) === -1) {
      best = { start: m.index, openTag: m[0], bodyStart, body, end: close + ('</' + tag + '>').length };
      break;
    }
  }
  return best;
}

function truthy(v) {
  if (v === 'true') return true;
  if (v === 'false' || v === '' || v === undefined) return false;
  return !!v;
}

function render(src, scope) {
  // loops first: expand with per-item scope, resolving that item's holes
  let guard = 0;
  while (guard++ < 200) {
    const blk = firstInnermost(src, 'sc-for');
    if (!blk) break;
    const listName = (blk.openTag.match(/list="\{\{([a-zA-Z0-9_.]+)\}\}"/) || [])[1];
    const asName = (blk.openTag.match(/as="([a-zA-Z0-9_]+)"/) || [])[1] || 'item';
    const list = listName ? lookup(scope, listName) : [];
    let out = '';
    (Array.isArray(list) ? list : []).forEach((item) => {
      out += fillHoles(blk.body, { [asName]: item }, asName);
    });
    src = src.slice(0, blk.start) + out + src.slice(blk.end);
  }
  // then branches, innermost first
  guard = 0;
  while (guard++ < 400) {
    const blk = firstInnermost(src, 'sc-if');
    if (!blk) break;
    const raw = (blk.openTag.match(/value="([^"]*)"/) || [])[1] || '';
    let keep;
    if (/^\{\{[a-zA-Z0-9_.]+\}\}$/.test(raw)) keep = truthy(lookup(scope, raw.slice(2, -2)));
    else keep = truthy(raw);
    src = src.slice(0, blk.start) + (keep ? blk.body : '') + src.slice(blk.end);
  }
  // remaining holes, then strip the runtime-only attributes
  src = fillHoles(src, scope);
  src = src.replace(/\s(?:onClick|onChange|onKeyDown|ref)="[^"]*"/g, '');
  return src;
}

// ---- the panels to render ----------------------------------------------------
const heldSample = [{
  who: 'Fuel Supplies Maldives', vendor: 'Fuel Supplies Maldives', note: 'Waiting to be read',
  amount: 6120, date: '16 Sep', paidFrom: 'Site cash box · Hotel', category: 'Fuel', billNo: 'FS-2291'
}];
const billSample = {
  who: 'State Trading Organisation', what: 'Materials · Hotel', amount: 3450,
  date: '14 Sep', paidFrom: 'BML · MVR ····4471', billNo: 'INV-12345', dir: 'out'
};

const panels = [
  ['Home · everything works', { role: 'Owner', scenario: 'Everything works' }, { screen: 'home' }],
  ['Home · first day', { role: 'Owner', scenario: 'First day' }, { screen: 'home' }],
  ['Home · a bill kept for later', { role: 'Owner', scenario: 'Everything works' }, { screen: 'home', queue: 1, held: heldSample }],
  ['Snap', { role: 'Owner', scenario: 'Everything works' }, { screen: 'snap' }],
  ['Snap · offline on site', { role: 'Owner', scenario: 'Offline on site' }, { screen: 'snap' }],
  ['Snap · camera is off', { role: 'Owner', scenario: 'Camera is off' }, { screen: 'snap' }],
  ['Review · nothing to check', { role: 'Owner', scenario: 'Everything works' }, { screen: 'review' }],
  ['Review · bill number unclear', { role: 'Owner', scenario: 'Bill number unclear' }, { screen: 'review' }],
  ['Review · amount unclear', { role: 'Owner', scenario: 'Amount unclear' }, { screen: 'review' }],
  ['Review · amount being typed', { role: 'Owner', scenario: 'Amount unclear' }, { screen: 'review', amountEditing: true }],
  ['Review · account chooser', { role: 'Owner', scenario: 'Everything works' }, { screen: 'review', chooser: 'payer' }],
  ['Review · cost code chooser', { role: 'Owner', scenario: 'Everything works' }, { screen: 'review', chooser: 'category' }],
  ['Review · possible duplicate', { role: 'Owner', scenario: 'Might be a duplicate' }, { screen: 'review' }],
  ['Review · comparing the two', { role: 'Owner', scenario: 'Might be a duplicate' }, { screen: 'review', dupeDetail: true }],
  ['Review · recording a duplicate', { role: 'Owner', scenario: 'Might be a duplicate' }, { screen: 'review', dupeAsk: true }],
  ['Review · could not read it', { role: 'Owner', scenario: 'Could not read the bill' }, { screen: 'review' }],
  ['Review · typed in by hand', { role: 'Owner', scenario: 'Could not read the bill' }, { screen: 'review', blank: true, amountEditing: false }],
  ['Review · nothing filled in yet', { role: 'Owner', scenario: 'Could not read the bill' }, { screen: 'review', blank: true, amountEditing: false, amount: '', paidFrom: '', vendor: '' }],
  ['Review · leaving it', { role: 'Owner', scenario: 'Everything works' }, { screen: 'review', retakeAsk: true, touched: true }],
  ['Recorded', { role: 'Owner', scenario: 'Everything works' }, { screen: 'done', undoLeft: 8 }],
  ['Recorded · undo has lapsed', { role: 'Owner', scenario: 'Everything works' }, { screen: 'done', undoLeft: 0, explainBalanced: true }],
  ['Recorded · held offline', { role: 'Owner', scenario: 'Offline on site' }, { screen: 'done', undoLeft: 8 }],
  ['Bill detail', { role: 'Owner', scenario: 'Everything works' }, { screen: 'bill', viewBill: billSample }],
  ['Bill detail · why reverse it', { role: 'Owner', scenario: 'Everything works' }, { screen: 'bill', viewBill: billSample, voidAsk: true }],
  ['Bill detail · already reversed', { role: 'Owner', scenario: 'Everything works' }, { screen: 'bill', viewBill: Object.assign({}, billSample, { voided: true, voidReason: 'Paid twice' }) }],
  ['Waiting', { role: 'Owner', scenario: 'Everything works' }, { screen: 'uploads', queue: 1, held: heldSample }],
  ['Waiting · nothing held', { role: 'Owner', scenario: 'Everything works' }, { screen: 'uploads' }],
  ['Site cash · what is left', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'cash' }],
  ['Site cash · running low', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'cash', boxLeft: 600 }],
  ['Site cash · nothing spent yet', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'cash', boxSpends: [] }],
  ['Spend, no bill · empty', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'nobill' }],
  ['Spend, no bill · what for', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'nobill', nbAmount: '450' }],
  ['Spend, no bill · ready', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'nobill', nbAmount: '450', nbWhat: 'Boat or transport', nbNote: 'Maalhos to Male, 1 pax' }],
  ['Spend, no bill · I paid it myself', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'nobill', nbAmount: '450', nbWhat: 'Fuel', nbSelf: true }],
  ['Spend with a bill', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'nobill', nbPhoto: true, nbAmount: '1,200.00', nbWhat: 'Fuel' }],
  ['Count the box · empty', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'count' }],
  ['Count the box · it matches', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'count', countAmount: '2340' }],
  ['Count the box · 50 short', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'count', countAmount: '2290' }],
  ['Count the box · reason given', { role: 'Site staff · holds cash', scenario: 'Everything works' }, { screen: 'count', countAmount: '2290', countReason: 'Not sure' }],
  ['Owner · cash boxes', { role: 'Owner', scenario: 'Everything works' }, { screen: 'boxes' }],
  ['Owner · a box running low', { role: 'Owner', scenario: 'Everything works' }, { screen: 'boxes', boxLeft: 600 }],
  ['Site staff · first run', { role: 'Site staff', scenario: 'Everything works' }, { screen: 'snap' }],
  ['Site staff · camera', { role: 'Site staff', scenario: 'Everything works' }, { screen: 'snap', staffSeen: true }],
  ['Site staff · sent', { role: 'Site staff', scenario: 'Everything works' }, { screen: 'sent', staffSeen: true }],
  ['Site staff · held offline', { role: 'Site staff', scenario: 'Offline on site' }, { screen: 'sent', staffSeen: true, queue: 2 }]
];

const cards = panels.map(([title, props, state]) => {
  const c = new Component(props);
  // seed through the component's own reset so derived fields (billSettled and
  // friends) hold the values the live flow would give them, not constructor ones
  const seed = state.blank ? c.blankReview(state) : c.freshReview(state);
  Object.assign(c.state, seed);
  const vals = c.renderVals();
  const body = render(markup, vals);
  return '<figure class="card">\n<div class="phone">' + body + '</div>\n<figcaption>' + esc(title) + '</figcaption>\n</figure>';
}).join('\n');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sentryfi screens</title>
${fontLink ? '<link rel="stylesheet" href="' + fontLink + '">' : ''}
<style>
${helmetCss}
body { margin: 0; background: #E9EAEC; font-family: Barlow, "Helvetica Neue", Arial, sans-serif; }
.sheet { padding: 40px 32px 64px; }
.sheet h1 { margin: 0 0 6px; font: 700 40px/1 "Barlow Condensed", sans-serif; text-transform: uppercase; color: #141414; }
.sheet p.lead { margin: 0 0 32px; font: 400 15px/1.5 Barlow, sans-serif; color: #44474E; max-width: 62ch; }
.grid { display: flex; flex-wrap: wrap; gap: 32px; }
.card { margin: 0; display: flex; flex-direction: column; gap: 10px; }
.phone { width: 390px; height: 844px; position: relative; overflow: hidden; background: #FFFFFF; box-shadow: 0 18px 44px rgba(20,20,20,0.22); }
.phone > div { position: absolute; inset: 0; }
figcaption { font: 700 13px "Barlow Condensed", sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #141414; }
</style>
</head>
<body>
<div class="sheet">
<h1>Sentryfi · every screen</h1>
<p class="lead">Rendered from the artboard's own markup and logic: each panel runs the real component, so what you see is what the prototype draws. Figures are illustrative. Interaction, motion and focus rings are not shown here; press Play on the canvas for those.</p>
<div class="grid">
${cards}
</div>
</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
console.log('rendered ' + panels.length + ' panels to ' + OUT);
