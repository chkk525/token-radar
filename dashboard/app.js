// Launch Scope — board, filters, detail drawer, deep-dives, method views.
// Reads window.RADAR from ../data.js (written by main.ts from the sealed snapshot).
'use strict';

const R = window.RADAR;
const rows = R.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const diveBySlug = new Map(R.deep_dives.map((d) => [d.slug, d]));
const catFit = new Map(R.categories.map((c) => [c.category, c]));

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function money(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v;
}
function moneyFull(v) { return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function pct(v) {
  if (v === null || v === undefined) return '<span class="muted">&mdash;</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
}
const gradeChip = (r) => '<span class="grade g' + r.grade + '">' + r.grade + '</span>';

/* ---------------- state ---------------- */
const params = new URLSearchParams(location.search);
const state = {
  q: '', category: params.get('cat') || '', chain: params.get('chain') || '',
  minTvl: 0, minGrade: 0, watchOnly: false, risingOnly: false,
  sortKey: 'rank', sortDir: 1, selected: null,
  view: ['deep', 'method'].includes(params.get('view')) ? params.get('view') : 'board',
};

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    if (state.category && (r.category || '') !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (r.tvl_usd < state.minTvl) return false;
    if (r.conviction < state.minGrade) return false;
    if (state.watchOnly && !r.watchlist) return false;
    if (state.risingOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
    return true;
  });
}
function sortedRows(list) {
  const k = state.sortKey, dir = state.sortDir;
  const val = (r) => (k === 'name' ? r.name.toLowerCase() : r[k] === null || r[k] === undefined ? -Infinity : r[k]);
  return [...list].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.rank - b.rank;
  });
}

/* ---------------- board ---------------- */
const maxValue = Math.max(...rows.map((r) => r.implied_value_usd));
function renderBoard() {
  const list = sortedRows(visibleRows());
  $('boardBody').innerHTML = list.map((r) =>
    '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="selected"' : '') + '>' +
    '<td class="rank">' + r.rank + '</td>' +
    '<td class="name-cell">' + (r.watchlist ? '<span class="watch-dot" title="On the watchlist"></span>' : '') +
    '<span class="pname">' + esc(r.name) + '</span><span class="pslug">' + esc(r.slug) + '</span></td>' +
    '<td class="cat">' + esc(r.category || 'Uncategorised') + '</td>' +
    '<td class="money">' + money(r.tvl_usd) + '</td>' +
    '<td class="money">' + pct(r.change_7d) + '</td>' +
    '<td class="money">' + r.multiple.toFixed(2) + '&times;</td>' +
    '<td class="conv">' + gradeChip(r) + r.conviction + '</td>' +
    '<td class="value"><span class="vnum">' + money(r.implied_value_usd) + '</span>' +
    '<span class="vrange">' + money(r.value_lo_usd) + ' &ndash; ' + money(r.value_hi_usd) + '</span>' +
    '<span class="vbar"><i style="width:' + Math.max(1.5, (r.implied_value_usd / maxValue) * 100).toFixed(1) + '%"></i></span></td></tr>'
  ).join('');
  $('emptyState').hidden = list.length > 0;
  $('countNote').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' board rows.';
  $('boardSub').textContent = list.length + ' protocols in this sweep · click a column to re-sort, click a row for its thesis, risks and farm plan.';
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.innerHTML = th.dataset.label + (th.dataset.sort === state.sortKey ? ' <span class="arrow">' + (state.sortDir === 1 ? '▲' : '▼') + '</span>' : '');
  });
}

/* ---------------- detail drawer ---------------- */
function openDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  state.selected = slug;
  const fit = catFit.get(r.category || '(uncategorised)');
  const priorPct = Math.round(r.launch_prior * 100);
  const ageText = r.age_days === null ? 'no listing date (read as 365 days)' : r.age_days + ' days';
  const parts = [
    ['Launch prior', r.conviction_parts.prior, 40], ['TVL scale', r.conviction_parts.scale, 20],
    ['Momentum', r.conviction_parts.momentum, 15], ['Prime window', r.conviction_parts.window, 15],
    ['Chain breadth', r.conviction_parts.breadth, 10],
  ];
  $('drawerBody').innerHTML =
    '<p class="d-rank">Rank ' + r.rank + ' of ' + rows.length + (r.watchlist ? ' · on the watchlist' : '') + ' · conviction ' + r.conviction + ' (' + r.grade + ')</p>' +
    '<h2 class="d-name">' + esc(r.name) + '</h2>' +
    '<p class="d-sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + '</p>' +
    '<p class="d-thesis">' + esc(r.thesis) + '</p>' +
    '<p class="d-value"><small>Implied launch value</small>' + moneyFull(r.implied_value_usd) + '</p>' +
    '<p class="d-range">Peer range <b>' + moneyFull(r.value_lo_usd) + ' &ndash; ' + moneyFull(r.value_hi_usd) + '</b> at the fitted ' + esc(r.category || 'global') + ' quartiles ' + r.multiple_lo.toFixed(2) + '&times; / ' + r.multiple_hi.toFixed(2) + '&times;</p>' +
    '<div class="d-eq">' +
    '<div class="factor"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div><span class="op">&times;</span>' +
    '<div class="factor"><span>Multiple</span><b>' + r.multiple.toFixed(2) + '&times;</b></div><span class="op">&times;</span>' +
    '<div class="factor"><span>Momentum</span><b>' + r.momentum.toFixed(3) + '&times;</b></div><span class="op">&times;</span>' +
    '<div class="factor"><span>Maturity</span><b>' + r.maturity.toFixed(3) + '&times;</b></div></div>' +
    '<p class="d-note">Momentum from its 7-day TVL change (' + (r.change_7d === null ? 'unreported, neutral' : r.change_7d.toFixed(1) + '%') + ', tanh-bounded); maturity from ' + ageText + ' with no token recorded.</p>' +
    '<h3>Conviction — how good a farm</h3>' +
    '<div class="conv-rows">' + parts.map((p) =>
      '<div class="conv-row"><span>' + p[0] + '</span><span class="bar"><i style="width:' + (p[1] / p[2] * 100).toFixed(0) + '%"></i></span><span class="pts">' + p[1].toFixed(1) + ' / ' + p[2] + '</span></div>').join('') + '</div>' +
    '<dl class="d-grid">' +
    '<div><dt>Launch prior</dt><dd>' + priorPct + '%</dd></div>' +
    '<div><dt>Category peers launched</dt><dd>' + (fit ? fit.peers + ' of ' + (fit.peers + fit.pre_token) : '&mdash;') + '</dd></div>' +
    '<div><dt>TVL</dt><dd>' + moneyFull(r.tvl_usd) + '</dd></div>' +
    '<div><dt>7-day change</dt><dd>' + (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(1) + '%') + '</dd></div>' +
    '<div><dt>Age with no token</dt><dd>' + (r.age_days === null ? 'unknown' : r.age_days + ' days') + '</dd></div>' +
    '<div><dt>Chains</dt><dd>' + r.chains.length + '</dd></div></dl>' +
    '<h3>Risk flags</h3><ul class="flags">' + r.risks.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>' +
    '<h3>Catalysts</h3><ul class="flags go">' + r.catalysts.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>' +
    '<h3>Where it runs</h3><p class="d-note" style="color:var(--ink-dim)">' + (r.chains.length ? r.chains.map(esc).join(' · ') : 'No chains recorded.') + '</p>' +
    '<h3>Farm plan</h3><ol class="farm">' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
  $('drawer').hidden = false;
  $('scrim').hidden = false;
  renderBoardSelection();
}
function renderBoardSelection() {
  document.querySelectorAll('#boardBody tr').forEach((tr) => tr.classList.toggle('selected', tr.dataset.slug === state.selected));
}
function closeDetail() {
  state.selected = null;
  $('drawer').hidden = true;
  $('scrim').hidden = true;
  renderBoardSelection();
}

/* ---------------- deep-dives ---------------- */
function renderDeep() {
  $('deepList').innerHTML = rows.filter((r) => r.watchlist).map((r) => {
    const d = diveBySlug.get(r.slug);
    return '<article class="dive">' +
      '<div class="dive-head"><h3>' + esc(r.name) + '</h3>' + gradeChip(r) +
      '<span class="d-meta">rank ' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · TVL ' + money(r.tvl_usd) + ' · ' + r.chains.length + ' chains · week ' + (r.change_7d === null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</span>' +
      '<span class="d-val"><small>Implied (range)</small>' + money(r.implied_value_usd) + ' <span class="muted">(' + money(r.value_lo_usd) + '–' + money(r.value_hi_usd) + ')</span></span></div>' +
      '<p><span class="lbl">Thesis</span>' + esc(d.thesis_long) + '</p>' +
      '<p><span class="lbl">Bull case</span>' + esc(d.bull) + '</p>' +
      '<p><span class="lbl bear">Bear case</span>' + esc(d.bear) + '</p>' +
      '<p><span class="lbl flip">Changes the call</span>' + esc(d.change_mind) + '</p>' +
      '<p><span class="lbl farm">Farm</span>' + esc(d.farm_summary) + '</p></article>';
  }).join('');
}

/* ---------------- chrome: stats, fit table, filters ---------------- */
function renderChrome() {
  const totalImplied = rows.reduce((a, r) => a + r.implied_value_usd, 0);
  const aCount = rows.filter((r) => r.grade === 'A').length;
  $('statStrip').innerHTML =
    '<div><dt>Board rows</dt><dd>' + rows.length + '</dd></div>' +
    '<div><dt>Watchlist covered</dt><dd><em>' + rows.filter((r) => r.watchlist).length + ' / 40</em></dd></div>' +
    '<div><dt>Grade A farms</dt><dd>' + aCount + '</dd></div>' +
    '<div><dt>Global multiple</dt><dd>' + R.global.multiple.toFixed(2) + '&times;</dd></div>' +
    '<div><dt>Board value, summed</dt><dd>' + money(totalImplied) + '</dd></div>' +
    '<div><dt>Snapshot</dt><dd>' + esc(R.as_of) + '</dd></div>';
  $('fitNote').textContent = R.peer_count + ' token-bearing peers across ' + R.categories.length + ' categories; ' +
    R.pre_token_count + ' protocols record no token, of which this board ranks ' + rows.length + '.';
  $('asOf').textContent = R.as_of;
  const cats = [...new Set(rows.map((r) => r.category || ''))].sort();
  $('fCategory').innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c || 'Uncategorised') + '</option>').join('');
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  $('fChain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  const fitRows = [...R.categories].sort((a, b) => b.multiple - a.multiple);
  document.querySelector('#fitTable tbody').innerHTML =
    '<tr class="global-row"><td>All protocols</td><td class="num">' + R.global.multiple.toFixed(2) + '&times;</td><td class="num">' + R.global.multiple_lo.toFixed(2) + '–' + R.global.multiple_hi.toFixed(2) + '</td><td class="num">' + Math.round(R.global.launch_prior * 100) + '%</td></tr>' +
    fitRows.map((c) => '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(2) + '&times;</td><td class="num">' + c.multiple_lo.toFixed(2) + '–' + c.multiple_hi.toFixed(2) + '</td><td class="num">' + Math.round(c.launch_prior * 100) + '%</td></tr>').join('');
}

/* ---------------- views & wiring ---------------- */
function setView(v) {
  state.view = v;
  $('viewBoard').hidden = v !== 'board';
  $('viewDeep').hidden = v !== 'deep';
  $('viewMethod').hidden = v !== 'method';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
document.querySelectorAll('th.sortable').forEach((th) => {
  th.dataset.label = th.textContent;
  th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (state.sortKey === k) state.sortDir = -state.sortDir;
    else { state.sortKey = k; state.sortDir = k === 'name' || k === 'rank' ? 1 : -1; }
    renderBoard();
  });
});
$('boardBody').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-slug]');
  if (tr) openDetail(tr.dataset.slug);
});
$('drawerClose').addEventListener('click', closeDetail);
$('scrim').addEventListener('click', closeDetail);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDetail(); });
$('q').addEventListener('input', (ev) => { state.q = ev.target.value; renderBoard(); });
$('fCategory').addEventListener('change', (ev) => { state.category = ev.target.value; renderBoard(); });
$('fChain').addEventListener('change', (ev) => { state.chain = ev.target.value; renderBoard(); });
$('fTvl').addEventListener('change', (ev) => { state.minTvl = Number(ev.target.value); renderBoard(); });
$('fGrade').addEventListener('change', (ev) => { state.minGrade = Number(ev.target.value); renderBoard(); });
$('fWatch').addEventListener('change', (ev) => { state.watchOnly = ev.target.checked; renderBoard(); });
$('fRising').addEventListener('change', (ev) => { state.risingOnly = ev.target.checked; renderBoard(); });
$('reset').addEventListener('click', () => {
  Object.assign(state, { q: '', category: '', chain: '', minTvl: 0, minGrade: 0, watchOnly: false, risingOnly: false, sortKey: 'rank', sortDir: 1 });
  $('q').value = ''; $('fCategory').value = ''; $('fChain').value = ''; $('fTvl').value = '0'; $('fGrade').value = '0';
  $('fWatch').checked = false; $('fRising').checked = false;
  renderBoard();
});

renderChrome();
if (state.chain) $('fChain').value = state.chain;
renderBoard();
renderDeep();
setView(state.view);
const startSlug = params.get('p');
if (startSlug && bySlug.has(startSlug)) openDetail(startSlug);
