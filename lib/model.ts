// Token Launch Radar — the value model.
//
// Everything below is fitted from the sealed snapshot itself at run time; no
// protocol name is special-cased and no multiple is hardcoded. The peer set is
// the snapshot's token-bearing protocols (a CoinGecko id or a symbol is
// recorded): they are the launches that already happened, so what the market
// paid for a dollar of their TVL is the evidence for what a pre-token
// protocol's launch could be worth.
//
// Fitting, in order:
//   1. For every token-bearing protocol with both figures present, the raw
//      multiple is mcap_usd / tvl_usd, winsorised into [0.01, 5]: a ratio
//      outside that band measures TVL the token's cap does not belong to
//      (one peer in this snapshot sits at 400x because its token trades
//      against activity DefiLlama counts elsewhere), not a launch price.
//      The global multiple is the median of those ratios (a median, so a
//      few very large caps cannot drag it).
//   2. Each category's multiple is the median of its own ratios, shrunk
//      toward the global median with a prior weight of SHRINK_K pseudo-rows:
//      fitted = (n * categoryMedian + K * globalMedian) / (n + K). A category
//      with no usable ratio falls back to the global median outright.
//   3. Each category also gets a launch-odds prior: the share of its
//      protocols that already record a token, shrunk the same way toward the
//      global token-bearing share. The prior is reported on every row (and
//      used in the farm plan's expectations); it is context for the reader,
//      not a factor in the value itself.
//
// Implied value for a pre-token protocol:
//   implied = TVL x fitted category multiple x momentum x maturity
//   momentum = 1 + clamp(change_7d, -50, +100) / 100 x 0.5
//              (change_7d is in per cent; null is neutral, factor 1)
//   maturity = 0.5 + 0.5 x sqrt(min(age_days, 1460) / 1460)
//              (age is days from listed_at to the snapshot's as_of; a null
//              listed_at uses DEFAULT_AGE_DAYS, stated here: 365)
// The result is rounded to whole dollars, floored at 1 and capped at the
// gate's 1e14. Rows are ranked by implied value descending; ties break on
// TVL descending, then slug ascending, so two runs write the same bytes.
//
// Candidacy first: a protocol that records no token is still not a launch
// candidate when it is a wrapped, staked or bridged product of a token that
// already trades, or an exchange's own TVL record. The board applies the
// field guide's product classes: the categories Bridge, Canonical Bridge,
// Liquid Staking, Liquid Restaking, Restaked BTC and CEX are out, as are
// names ending in a version marker, names carrying the whole word wrapped,
// staked or staking, and names beginning with an exchange's name. In this
// snapshot those classes are exactly what keeps WBTC, Binance staked ETH
// and USDT0 off the board: each records no token here, and each is a
// product of one that trades. (The watchlist was built with the same
// classes, so coverage is unaffected.)
//
// The board's radar rule (which candidates get a row): all of them. The
// snapshot itself only carries protocols at or above $5,000,000 of TVL, so
// size has already been cut once by the data; a radar that quietly dropped
// the smaller half of its candidate universe would be hiding exactly the
// early protocols it exists to find. In this snapshot the rule yields 198
// rows: every protocol that records no token and is not a product of one
// that trades, the 40 watchlist slugs among them.
// Token-bearing protocols never appear on the board: they already launched.

/** One protocol of the snapshot: exactly the ten fields the sealed input carries. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot file, as read. */
export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** The fitted figures for one category (or the global row). */
export interface CategoryFit {
  category: string;
  peers: number; // token-bearing protocols in the category
  pre_token: number; // protocols recording no token
  ratio_count: number; // peers with both mcap and TVL usable for the fit
  multiple: number; // fitted mcap/TVL multiple, after shrinkage
  launch_prior: number; // fitted share of the category that records a token
}

/** The whole fit: the global row plus one row per category. */
export interface ModelFit {
  global: CategoryFit;
  by_category: Map<string, CategoryFit>;
  peer_count: number; // token-bearing protocols in the snapshot
  pre_token_count: number;
}

/** One row of the ranked board, as written to board.json. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  multiple: number;
  launch_prior: number;
  watchlist: boolean;
}

/** The dashboard's data: the board plus the model's own account of itself. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  rows: BoardRow[];
  categories: CategoryFit[];
  global: CategoryFit;
  peer_count: number;
  pre_token_count: number;
  board_size: number;
}

const DAY_MS = 86_400_000;
const SHRINK_K = 8; // pseudo-rows of global evidence in every category fit
const PRIOR_K = 10; // pseudo-rows of global evidence in every launch prior
const DEFAULT_AGE_DAYS = 365; // stated default when listed_at is null
const MATURITY_SPAN_DAYS = 1460; // four years to full maturity
const VALUE_CAP = 100_000_000_000_000; // the gate's implied-value cap

/** A protocol records a token when DefiLlama carries its gecko id or symbol. */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Days from listed_at to as_of, whole and never negative; null when unlisted. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

/** Winsorise one mcap/TVL ratio into the band the fit trusts. */
function winsorise(ratio: number): number {
  return Math.min(5, Math.max(0.01, ratio));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function categoryKey(p: Protocol): string {
  return p.category ?? '(uncategorised)';
}

/** Fit the multiples and launch priors from the snapshot's token-bearing peers. */
export function fitModel(snapshot: Snapshot): ModelFit {
  const peers = snapshot.protocols.filter(recordsToken);
  const ratios: number[] = [];
  for (const p of peers) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) ratios.push(winsorise(p.mcap_usd / p.tvl_usd));
  }
  const globalMultiple = ratios.length > 0 ? median(ratios) : 1;
  const globalShare = snapshot.protocols.length > 0 ? peers.length / snapshot.protocols.length : 0;

  const groups = new Map<string, Protocol[]>();
  for (const p of snapshot.protocols) {
    const key = categoryKey(p);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [p]);
    else list.push(p);
  }

  const byCategory = new Map<string, CategoryFit>();
  for (const [category, list] of groups) {
    const catPeers = list.filter(recordsToken);
    const catRatios: number[] = [];
    for (const p of catPeers) {
      if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) catRatios.push(winsorise(p.mcap_usd / p.tvl_usd));
    }
    const n = catRatios.length;
    const multiple =
      n === 0 ? globalMultiple : (n * median(catRatios) + SHRINK_K * globalMultiple) / (n + SHRINK_K);
    const share = list.length > 0 ? catPeers.length / list.length : 0;
    const prior = (list.length * share + PRIOR_K * globalShare) / (list.length + PRIOR_K);
    byCategory.set(category, {
      category,
      peers: catPeers.length,
      pre_token: list.length - catPeers.length,
      ratio_count: n,
      multiple,
      launch_prior: prior,
    });
  }

  const global: CategoryFit = {
    category: '(all protocols)',
    peers: peers.length,
    pre_token: snapshot.protocols.length - peers.length,
    ratio_count: ratios.length,
    multiple: globalMultiple,
    launch_prior: globalShare,
  };
  return { global, by_category: byCategory, peer_count: peers.length, pre_token_count: global.pre_token };
}

/** The momentum factor from the 7-day TVL change (per cent); null is neutral. */
export function momentumFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  const clamped = Math.min(100, Math.max(-50, change7d));
  return 1 + (clamped / 100) * 0.5;
}

/** The maturity factor from age in days; null age uses the stated default. */
export function maturityFactor(age: number | null): number {
  const days = age === null ? DEFAULT_AGE_DAYS : age;
  return 0.5 + 0.5 * Math.sqrt(Math.min(days, MATURITY_SPAN_DAYS) / MATURITY_SPAN_DAYS);
}

/** The model's implied value for one pre-token protocol, in whole dollars. */
export function impliedValue(p: Protocol, fit: CategoryFit, age: number | null): number {
  const raw = p.tvl_usd * fit.multiple * momentumFactor(p.change_7d) * maturityFactor(age);
  return Math.min(VALUE_CAP, Math.max(1, Math.round(raw)));
}

const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * A wrapped, staked or bridged product of a token that already trades, or an
 * exchange's own record: not a launch candidate, whatever its TVL. Mirrors
 * the field guide's product classes for the watchlist.
 */
export function isProductOfTradedToken(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSIONED_NAME.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}



// ---------------------------------------------------------------------------
// Farm plans. Steps are generated per row from the protocol's category, its
// primary chain and its TVL tier, with explicit dollar costs and durations.
// ---------------------------------------------------------------------------

type Tier = 'large' | 'mid' | 'small';

function tierOf(tvl: number): Tier {
  if (tvl >= 100_000_000) return 'large';
  if (tvl >= 25_000_000) return 'mid';
  return 'small';
}

const TIER_CAPITAL: Record<Tier, { position: string; gas: string; weeks: number }> = {
  large: { position: '$5,000-$25,000', gas: '$40-$120', weeks: 12 },
  mid: { position: '$1,000-$5,000', gas: '$15-$50', weeks: 10 },
  small: { position: '$250-$1,000', gas: '$5-$25', weeks: 8 },
};

/** The core on-chain action a category's users actually perform. */
function coreAction(category: string | null): string {
  switch (category) {
    case 'Lending':
    case 'Uncollateralized Lending':
      return 'supply assets to its lending markets and borrow a small amount against them';
    case 'Dexs':
      return 'swap through its exchange and add two-sided liquidity to one of its main pools';
    case 'Derivatives':
    case 'Options':
    case 'Options Vault':
      return 'open small hedged positions on its markets and roll them weekly';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Leveraged Farming':
      return 'deposit into its flagship vault and keep the position through each epoch';
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
      return 'stake through its contract and hold the liquid receipt token in the same wallet';
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return 'bridge funds across its routes in both directions, varying the amount each time';
    case 'CDP':
    case 'CDP Manager':
      return 'open a collateralised position and mint a modest amount of its stablecoin';
    case 'RWA':
      return 'onboard through its portal and hold one of its tokenised real-world positions';
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'deposit into one of its curated vaults and keep the allocation through each rebalancing epoch';
    case 'Chain':
      return 'bridge funds to the chain, pay gas with real transactions every week and use its flagship apps';
    case 'Launchpad':
      return 'register for its sales and take part in one launch with a small ticket';
    default:
      return 'use its core product the way a regular user would, with real funds at risk';
  }
}

/** Build the farm plan for one row: 5 steps, each with a cost and a duration. */
export function farmSteps(p: Protocol, fit: CategoryFit, age: number | null): string[] {
  const tier = tierOf(p.tvl_usd);
  const plan = TIER_CAPITAL[tier];
  const chain = p.chains[0] ?? 'its main chain';
  const chainNote =
    p.chains.length > 1
      ? ` It runs on ${p.chains.length} chains; repeat the same steps on ${p.chains[1]} in week 3 so the wallet shows multi-chain use.`
      : '';
  const priorPct = Math.round(fit.launch_prior * 100);
  const ageNote =
    age === null
      ? 'DefiLlama gives no listing date for it, so treat its track record as unproven'
      : `it has run ${age} days with no token recorded`;
  const steps = [
    `Set up a dedicated wallet for ${p.name} and fund it on ${chain} with ${plan.position} plus ${plan.gas} set aside for gas; setup takes about 30 minutes and the gas reserve covers the whole plan at normal network fees.`,
    `Start with the core loop: ${coreAction(p.category)} on ${chain}. Keep the first transaction small (about 10% of the position) to confirm the route, then size up over the first week.${chainNote}`,
    `Stay active for ${plan.weeks} weeks: interact at least twice a week, vary amounts by 20-40% between visits, and never let the position sit untouched for more than 10 days; expect ${plan.gas} of total transaction costs across the plan.`,
    `Cover the side quests in weeks 2-4: join its community channels, vote in any governance poll that opens, and test one secondary feature (about $10-$30 in extra fees); ${ageNote}, and ${priorPct}% of its ${fit.category} peers already record a token, which is the base rate this plan is betting against.`,
    `Keep records as you go: save transaction hashes and a dated note of each session (15 minutes a week), watch for a points program or snapshot announcement, and be ready to claim within 48 hours of any launch post; if nothing is announced within 6 months, wind the position down over 2 weeks and redeploy the capital.`,
  ];
  return steps;
}

// ---------------------------------------------------------------------------
// Board assembly
// ---------------------------------------------------------------------------

/** Build the ranked board and the dashboard data from the snapshot. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const rows: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (recordsToken(p)) continue;
    if (isProductOfTradedToken(p) && !watchlist.has(p.slug)) continue;
    const age = ageDays(snapshot.as_of, p.listed_at);
    const catFit = fit.by_category.get(categoryKey(p)) ?? fit.global;
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0, // assigned after the sort
      implied_value_usd: impliedValue(p, catFit, age),
      farm_steps: farmSteps(p, catFit, age),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      multiple: Math.round(catFit.multiple * 1e4) / 1e4,
      launch_prior: Math.round(catFit.launch_prior * 1e4) / 1e4,
      watchlist: watchlist.has(p.slug),
    });
  }
  rows.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1),
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  const categories = [...fit.by_category.values()].sort(
    (a, b) => b.peers + b.pre_token - (a.peers + a.pre_token) || (a.category < b.category ? -1 : 1),
  );
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows,
    categories,
    global: fit.global,
    peer_count: fit.peer_count,
    pre_token_count: fit.pre_token_count,
    board_size: rows.length,
  };
  return { board: rows, radar };
}

/** Parse and lightly validate the snapshot file's text. */
export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!Array.isArray(data.protocols) || !Array.isArray(data.watchlist) || typeof data.as_of !== 'string') {
    throw new Error('snapshot: expected {as_of, protocols[], watchlist[]}');
  }
  return data;
}

/** The first gate-shape problem with the board, or null when it is clean. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set<string>();
  for (const [i, row] of board.entries()) {
    if (row.rank !== i + 1) return `row ${row.slug}: rank ${row.rank}, expected ${i + 1}`;
    if (slugs.has(row.slug)) return `slug ${row.slug} appears twice`;
    slugs.add(row.slug);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > VALUE_CAP)
      return `row ${row.slug}: implied value ${row.implied_value_usd} out of range`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd)
      return `row ${row.slug}: implied value rises at rank ${row.rank}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12)
      return `row ${row.slug}: ${row.farm_steps.length} farm steps, outside 3-12`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug}: a farm step is ${len} characters, outside 20-600`;
    }
  }
  if (board.length > 1 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd))
    return 'every implied value is the same: not a ranking';
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: the whole radar as one script assignment. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
