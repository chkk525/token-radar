// Launch Scope — board, filters, sorting and the per-protocol detail drawer.
// Reads window.RADAR from ../data.js, written by main.ts from the sealed
// snapshot. No network, no framework: the page is a pure function of the data.
'use strict';

const R = window.RADAR;
const rows = R.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const catFit = new Map(R.categories.map((c) => [c.category, c]));

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Compact dollars for table cells: $1.14B, $234M, $9.6M. */
function money(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v;
}
/** Full dollars with thousands separators, for the detail view. */
function moneyFull(v) {
  return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function pct(v) {
  if (v === null || v === undefined) return '<span class="muted">&mdash;</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
}
/* The model's two soft factors, recomputed from the row's own figures with
   the formulas stated in the rail, so the detail view can show its work. */
function momentum(change7d) {
  if (change7d === null || change7d === undefined || !isFinite(change7d)) return 1;
  const c = Math.min(100, Math.max(-50, change7d));
  return 1 + (c / 100) * 0.5;
}
function maturity(ageDays) {
  const days = ageDays === null || ageDays === undefined ? 365 : ageDays;
  return 0.5 + 0.5 * Math.sqrt(Math.min(days, 1460) / 1460);
}

/* ---------------- state ---------------- */
const params = new URLSearchParams(location.search);
const state = {
  q: '',
  category: params.get('cat') || '',
  chain: params.get('chain') || '',
  minTvl: 0,
  watchOnly: false,
  risingOnly: false,
  sortKey: 'rank',
  sortDir: 1,
  selected: null,
};

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    if (state.category && (r.category || '') !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (r.tvl_usd < state.minTvl) return false;
    if (state.watchOnly && !r.watchlist) return false;
    if (state.risingOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
    return true;
  });
}

function sortedRows(list) {
  const k = state.sortKey;
  const dir = state.sortDir;
  const val = (r) => (k === 'name' ? r.name.toLowerCase() : r[k] === null || r[k] === undefined ? -Infinity : r[k]);
  return [...list].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.rank - b.rank;
  });
}

/* ---------------- board ---------------- */
const maxValue = Math.max(...rows.map((r) => r.implied_value_usd));

function renderBoard() {
  const list = sortedRows(visibleRows());
  const body = $('boardBody');
  body.innerHTML = list
    .map((r) => {
      const chains = r.chains.length === 0 ? '&mdash;' : esc(r.chains[0]) + (r.chains.length > 1 ? ' <span class="muted">+' + (r.chains.length - 1) + '</span>' : '');
      const sel = state.selected === r.slug ? ' class="selected"' : '';
      return (
        '<tr data-slug="' + esc(r.slug) + '"' + sel + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="name-cell">' + (r.watchlist ? '<span class="watch-dot" title="On the watchlist"></span>' : '') +
        '<span class="pname">' + esc(r.name) + '</span><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="chains">' + chains + '</td>' +
        '<td class="money">' + money(r.tvl_usd) + '</td>' +
        '<td class="money">' + pct(r.change_7d) + '</td>' +
        '<td class="money">' + r.multiple.toFixed(3) + '&times;</td>' +
        '<td class="money">' + Math.round(r.launch_prior * 100) + '%</td>' +
        '<td class="value"><span class="vnum">' + money(r.implied_value_usd) + '</span>' +
        '<span class="vbar"><i style="width:' + Math.max(1.5, (r.implied_value_usd / maxValue) * 100).toFixed(1) + '%"></i></span></td>' +
        '</tr>'
      );
    })
    .join('');
  $('emptyState').hidden = list.length > 0;
  $('countNote').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' board rows.';
  $('boardSub').textContent =
    list.length + ' protocols in this sweep · click a column to re-sort, click a row for its detail and farm plan.';
  document.querySelectorAll('th.sortable').forEach((th) => {
    const arrow = th.dataset.sort === state.sortKey ? ' <span class="arrow">' + (state.sortDir === 1 ? '▲' : '▼') + '</span>' : '';
    th.innerHTML = th.dataset.label + arrow;
  });
}

/* ---------------- detail drawer ---------------- */
function openDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  state.selected = slug;
  const fit = catFit.get(r.category || '(uncategorised)');
  const mom = momentum(r.change_7d);
  const mat = maturity(r.age_days);
  const priorPct = Math.round(r.launch_prior * 100);
  const ageText = r.age_days === null ? 'no listing date (read as 365 days)' : r.age_days + ' days';
  $('drawerBody').innerHTML =
    '<p class="d-rank">Rank ' + r.rank + ' of ' + rows.length + (r.watchlist ? ' · on the watchlist' : '') + '</p>' +
    '<h2 class="d-name">' + esc(r.name) + '</h2>' +
    '<p class="d-sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + '</p>' +
    '<p class="d-value"><small>Implied launch value</small>' + moneyFull(r.implied_value_usd) + '</p>' +
    '<div class="d-eq">' +
    '<div class="factor"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div><span class="op">&times;</span>' +
    '<div class="factor"><span>Category multiple</span><b>' + r.multiple.toFixed(3) + '&times;</b></div><span class="op">&times;</span>' +
    '<div class="factor"><span>Momentum</span><b>' + mom.toFixed(3) + '&times;</b></div><span class="op">&times;</span>' +
    '<div class="factor"><span>Maturity</span><b>' + mat.toFixed(3) + '&times;</b></div>' +
    '</div>' +
    '<p class="d-note">Momentum from its 7-day TVL change (' + (r.change_7d === null ? 'unreported, neutral' : r.change_7d.toFixed(1) + '%') +
    '); maturity from ' + ageText + ' with no token recorded. The multiple is the fitted ' + esc(r.category || 'global') +
    ' figure, shown rounded; the headline value is the board\'s stored figure.</p>' +
    '<dl class="d-grid">' +
    '<div><dt>Launch prior</dt><dd>' + priorPct + '%</dd></div>' +
    '<div><dt>Category peers launched</dt><dd>' + (fit ? fit.peers + ' of ' + (fit.peers + fit.pre_token) : '&mdash;') + '</dd></div>' +
    '<div><dt>TVL</dt><dd>' + moneyFull(r.tvl_usd) + '</dd></div>' +
    '<div><dt>7-day change</dt><dd>' + (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(1) + '%') + '</dd></div>' +
    '<div><dt>Age with no token</dt><dd>' + (r.age_days === null ? 'unknown' : r.age_days + ' days') + '</dd></div>' +
    '<div><dt>Chains</dt><dd>' + r.chains.length + '</dd></div>' +
    '</dl>' +
    '<h3>Launch prior in its category</h3>' +
    '<div class="prior-bar"><i style="width:' + priorPct + '%"></i></div>' +
    '<p class="d-note">' + priorPct + '% of ' + esc(r.category || 'its category') + '\'s protocols already record a token (fitted, shrunk toward the market). The prior sets the farm plan\'s expectations; it does not move the price.</p>' +
    '<h3>Where it runs</h3>' +
    '<p class="d-note" style="color:var(--ink-dim)">' + (r.chains.length ? r.chains.map(esc).join(' · ') : 'No chains recorded.') + '</p>' +
    '<h3>Farm plan</h3>' +
    '<ol class="farm">' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
  $('drawer').hidden = false;
  $('scrim').hidden = false;
  renderBoardSelection();
}
function renderBoardSelection() {
  document.querySelectorAll('#boardBody tr').forEach((tr) => {
    tr.classList.toggle('selected', tr.dataset.slug === state.selected);
  });
}
function closeDetail() {
  state.selected = null;
  $('drawer').hidden = true;
  $('scrim').hidden = true;
  renderBoardSelection();
}

/* ---------------- chrome: stats, fit table, filters ---------------- */
function renderChrome() {
  const totalImplied = rows.reduce((a, r) => a + r.implied_value_usd, 0);
  $('statStrip').innerHTML =
    '<div><dt>Board rows</dt><dd>' + rows.length + '</dd></div>' +
    '<div><dt>Watchlist covered</dt><dd><em>' + rows.filter((r) => r.watchlist).length + ' / ' + rows.filter((r) => r.watchlist).length + '</em></dd></div>' +
    '<div><dt>Already launched (peers)</dt><dd>' + R.peer_count + '</dd></div>' +
    '<div><dt>Global multiple</dt><dd>' + R.global.multiple.toFixed(3) + '&times;</dd></div>' +
    '<div><dt>Board value, summed</dt><dd>' + money(totalImplied) + '</dd></div>' +
    '<div><dt>Snapshot</dt><dd>' + esc(R.as_of) + '</dd></div>';
  $('fitNote').textContent =
    R.peer_count + ' token-bearing peers across ' + R.categories.length + ' categories; ' +
    R.pre_token_count + ' protocols record no token, of which this board ranks ' + rows.length + '.';
  $('asOf').textContent = R.as_of;

  const cats = [...new Set(rows.map((r) => r.category || ''))].sort();
  $('fCategory').innerHTML =
    '<option value="">All categories</option>' + cats.map((c) => '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c || 'Uncategorised') + '</option>').join('');
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  $('fChain').innerHTML =
    '<option value="">All chains</option>' + chains.map((c) => '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('');

  const fitRows = [...R.categories].sort((a, b) => b.multiple - a.multiple);
  document.querySelector('#fitTable tbody').innerHTML =
    '<tr class="global-row"><td>All protocols</td><td class="num">' + R.global.multiple.toFixed(3) + '&times;</td><td class="num">' +
    Math.round(R.global.launch_prior * 100) + '%</td><td class="num">' + R.global.peers + '</td></tr>' +
    fitRows.map((c) =>
      '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(3) + '&times;</td><td class="num">' +
      Math.round(c.launch_prior * 100) + '%</td><td class="num">' + c.peers + '</td></tr>').join('');
}

/* ---------------- wiring ---------------- */
document.querySelectorAll('th.sortable').forEach((th) => {
  th.dataset.label = th.textContent;
  th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (state.sortKey === k) state.sortDir = -state.sortDir;
    else {
      state.sortKey = k;
      state.sortDir = k === 'name' || k === 'rank' ? 1 : -1;
    }
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
$('fWatch').addEventListener('change', (ev) => { state.watchOnly = ev.target.checked; renderBoard(); });
$('fRising').addEventListener('change', (ev) => { state.risingOnly = ev.target.checked; renderBoard(); });
$('reset').addEventListener('click', () => {
  Object.assign(state, { q: '', category: '', chain: '', minTvl: 0, watchOnly: false, risingOnly: false, sortKey: 'rank', sortDir: 1 });
  $('q').value = ''; $('fCategory').value = ''; $('fChain').value = ''; $('fTvl').value = '0';
  $('fWatch').checked = false; $('fRising').checked = false;
  renderBoard();
});

renderChrome();
if (state.chain) $('fChain').value = state.chain;
renderBoard();
const startSlug = params.get('p');
if (startSlug && bySlug.has(startSlug)) openDetail(startSlug);
