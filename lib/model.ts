// Token Launch Radar — the value model, v2.
//
// Everything below is fitted from the sealed snapshot itself at run time; no
// protocol name is special-cased and no multiple is hardcoded. The peer set is
// the snapshot's token-bearing protocols (a CoinGecko id or a symbol is
// recorded): they are the launches that already happened, so what the market
// paid for a dollar of their TVL is the evidence for what a pre-token
// protocol's launch could be worth.
//
// What v2 adds over a single point estimate:
//   * A valuation RANGE per protocol. The peer multiples inside a category
//     spread widely (in this snapshot the middle half of all usable ratios
//     runs from about 0.05x to about 1.06x), so pretending to one number is
//     false precision. Each category fit carries the first quartile, the
//     median and the third quartile of its peers' mcap/TVL ratios, each
//     winsorised and shrunk toward the matching global quartile, and a row's
//     implied value is quoted as low / central / high from those three.
//   * A smoother momentum factor. The snapshot's 7-day changes run from
//     -73% to +4,448%, so a linear factor would let one freak week mint a
//     top row. momentum = 1 + 0.6 * tanh(change_7d / 40) is bounded in
//     (0.4, 1.6), near-linear for ordinary weeks and flat for freak ones.
//   * A conviction score kept SEPARATE from value: how good a farm this is,
//     0-100, from the category launch prior, the protocol's scale, its
//     momentum, its age inside the prime launch window and its chain
//     breadth. Value says what a launch could be worth; conviction says how
//     hard to farm it. The two never mix.
//   * Per-row thesis, risk flags and catalysts, each generated from the
//     row's own figures, and a deep-dive for every watchlist protocol.
//
// Implied value for a pre-token protocol:
//   implied = TVL x fitted category multiple x momentum x maturity
//   momentum = 1 + 0.6 x tanh(change_7d / 40)   (per cent; null is neutral)
//   maturity = 0.45 + 0.55 x sqrt(min(age_days, 1825) / 1825)
//              (age is days from listed_at to the snapshot's as_of; a null
//              listed_at uses DEFAULT_AGE_DAYS, stated here: 365)
// The central result is rounded to whole dollars, floored at 1 and capped
// at the gate's 1e14. Rows are ranked by central implied value descending;
// ties break on TVL descending, then slug ascending, so two runs write the
// same bytes.
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
  multiple: number; // fitted median mcap/TVL multiple, after shrinkage
  multiple_lo: number; // fitted first-quartile multiple
  multiple_hi: number; // fitted third-quartile multiple
  launch_prior: number; // fitted share of the category that records a token
}

/** The whole fit: the global row plus one row per category. */
export interface ModelFit {
  global: CategoryFit;
  by_category: Map<string, CategoryFit>;
  peer_count: number; // token-bearing protocols in the snapshot
  pre_token_count: number;
}

/** The five parts of a row's conviction score, each already weighted. */
export interface ConvictionParts {
  prior: number; // of 40: the category launch prior
  scale: number; // of 20: TVL scale toward $250M
  momentum: number; // of 15: the 7-day change, clamped
  window: number; // of 15: age inside the prime launch window
  breadth: number; // of 10: chains, toward 8
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
  multiple_lo: number;
  multiple_hi: number;
  value_lo_usd: number;
  value_hi_usd: number;
  momentum: number;
  maturity: number;
  launch_prior: number;
  conviction: number;
  grade: string;
  conviction_parts: ConvictionParts;
  thesis: string;
  risks: string[];
  catalysts: string[];
  watchlist: boolean;
}

/** The deep-dive written for one watchlist protocol. */
export interface DeepDive {
  slug: string;
  name: string;
  rank: number;
  thesis_long: string;
  bull: string;
  bear: string;
  change_mind: string;
  farm_summary: string;
  farm_short: string;
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
  deep_dives: DeepDive[];
}

const DAY_MS = 86_400_000;
const SHRINK_K = 8; // pseudo-rows of global evidence in every category fit
const PRIOR_K = 10; // pseudo-rows of global evidence in every launch prior
const DEFAULT_AGE_DAYS = 365; // stated default when listed_at is null
const MATURITY_SPAN_DAYS = 1825; // five years to full maturity
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

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 1;
  const at = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[at]!;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function categoryKey(p: Protocol): string {
  return p.category ?? '(uncategorised)';
}

/** The three fitted multiples for one ratio set, shrunk toward the global row. */
function fitMultiples(ratios: number[], global: { lo: number; mid: number; hi: number }): { lo: number; mid: number; hi: number } {
  const n = ratios.length;
  if (n === 0) return { ...global };
  const sorted = [...ratios].sort((a, b) => a - b);
  const shrink = (own: number, g: number): number => (n * own + SHRINK_K * g) / (n + SHRINK_K);
  const mid = shrink(median(ratios), global.mid);
  const lo = Math.min(mid, shrink(quantile(sorted, 0.25), global.lo));
  const hi = Math.max(mid, shrink(quantile(sorted, 0.75), global.hi));
  return { lo, mid, hi };
}

/** Fit the multiples and launch priors from the snapshot's token-bearing peers. */
export function fitModel(snapshot: Snapshot): ModelFit {
  const peers = snapshot.protocols.filter(recordsToken);
  const ratios: number[] = [];
  for (const p of peers) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) ratios.push(winsorise(p.mcap_usd / p.tvl_usd));
  }
  const sortedGlobal = [...ratios].sort((a, b) => a - b);
  const globalRaw = {
    lo: ratios.length > 0 ? quantile(sortedGlobal, 0.25) : 1,
    mid: ratios.length > 0 ? median(ratios) : 1,
    hi: ratios.length > 0 ? quantile(sortedGlobal, 0.75) : 1,
  };
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
    const mult = fitMultiples(catRatios, globalRaw);
    const share = list.length > 0 ? catPeers.length / list.length : 0;
    const prior = (list.length * share + PRIOR_K * globalShare) / (list.length + PRIOR_K);
    byCategory.set(category, {
      category,
      peers: catPeers.length,
      pre_token: list.length - catPeers.length,
      ratio_count: catRatios.length,
      multiple: mult.mid,
      multiple_lo: mult.lo,
      multiple_hi: mult.hi,
      launch_prior: prior,
    });
  }

  const global: CategoryFit = {
    category: '(all protocols)',
    peers: peers.length,
    pre_token: snapshot.protocols.length - peers.length,
    ratio_count: ratios.length,
    multiple: globalRaw.mid,
    multiple_lo: globalRaw.lo,
    multiple_hi: globalRaw.hi,
    launch_prior: globalShare,
  };
  return { global, by_category: byCategory, peer_count: peers.length, pre_token_count: global.pre_token };
}

/** The momentum factor from the 7-day TVL change (per cent); null is neutral. */
export function momentumFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  return 1 + 0.6 * Math.tanh(change7d / 40);
}

/** The maturity factor from age in days; null age uses the stated default. */
export function maturityFactor(age: number | null): number {
  const days = age === null ? DEFAULT_AGE_DAYS : age;
  return 0.45 + 0.55 * Math.sqrt(Math.min(days, MATURITY_SPAN_DAYS) / MATURITY_SPAN_DAYS);
}

/** The model's central implied value for one pre-token protocol, in whole dollars. */
export function impliedValue(p: Protocol, fit: CategoryFit, age: number | null): number {
  const raw = p.tvl_usd * fit.multiple * momentumFactor(p.change_7d) * maturityFactor(age);
  return Math.min(VALUE_CAP, Math.max(1, Math.round(raw)));
}

/** A value at one fitted multiple (lo / mid / hi), same soft factors. */
function valueAt(p: Protocol, multiple: number, age: number | null): number {
  const raw = p.tvl_usd * multiple * momentumFactor(p.change_7d) * maturityFactor(age);
  return Math.min(VALUE_CAP, Math.max(1, Math.round(raw)));
}

/**
 * Conviction, 0-100: how good a farm this row is, kept apart from value.
 * prior 40 (the category's fitted launch share), scale 20 (TVL toward
 * $250M, square-rooted so the first dollars count most), momentum 15 (the
 * 7-day change clamped to [-20, +30]), window 15 (age 180-1460 days is the
 * prime launch window; younger tapers in, older tapers out, unknown age
 * scores a flat 6), breadth 10 (chains toward 8).
 */
export function convictionParts(p: Protocol, fit: CategoryFit, age: number | null): ConvictionParts {
  const prior = fit.launch_prior * 40;
  const scale = Math.sqrt(Math.min(p.tvl_usd, 250_000_000) / 250_000_000) * 20;
  const c = p.change_7d === null || !Number.isFinite(p.change_7d) ? 0 : Math.min(30, Math.max(-20, p.change_7d));
  const momentum = ((c + 20) / 50) * 15;
  let window: number;
  if (age === null) window = 6;
  else if (age < 90) window = 4;
  else if (age < 180) window = 9;
  else if (age <= 1460) window = 15;
  else if (age <= 2190) window = 9;
  else window = 5;
  const breadth = (Math.min(p.chains.length, 8) / 8) * 10;
  return { prior, scale, momentum, window, breadth };
}

export function gradeOf(score: number): string {
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'D';
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
// Formatting helpers shared by the thesis, the farm plans and the analysis.
// ---------------------------------------------------------------------------

/** Whole dollars with thousands separators: $1,141,000,000. */
export function moneyFull(v: number): string {
  return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Compact dollars: $1.14B, $234M, $9.6M. */
export function money(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(v);
}

function mult(x: number): string {
  return x.toFixed(2) + 'x';
}

function signedPct(x: number | null): string {
  if (x === null) return 'unreported';
  return (x > 0 ? '+' : '') + x.toFixed(1) + '%';
}

// ---------------------------------------------------------------------------
// Thesis, risk flags and catalysts: every sentence is built from the row's
// own figures, so the text and the numbers can never drift apart.
// ---------------------------------------------------------------------------

/** The two-sentence investment thesis for one row. */
export function thesisOf(p: Protocol, fit: CategoryFit, age: number | null, value: number, lo: number, hi: number, grade: string): string {
  const years = age === null ? null : Math.round((age / 365) * 10) / 10;
  const ageText =
    age === null
      ? 'with no listing date on record'
      : `tracked for ${age} days (${years} years) with no token recorded`;
  const trend =
    p.change_7d === null
      ? 'its 7-day TVL change is unreported, so momentum is read as neutral'
      : p.change_7d > 2
        ? `TVL is growing, ${signedPct(p.change_7d)} in 7 days`
        : p.change_7d < -2
          ? `TVL is shrinking, ${signedPct(p.change_7d)} in 7 days, which the model prices in rather than excuses`
          : `TVL is roughly flat this week (${signedPct(p.change_7d)})`;
  return (
    `${p.name} holds ${moneyFull(p.tvl_usd)} of TVL across ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}, ${ageText}. ` +
    `At the fitted ${fit.category} multiple of ${mult(fit.multiple)} (peer middle half ${mult(fit.multiple_lo)}-${mult(fit.multiple_hi)}), its record prices a launch near ${money(value)} within a ${money(lo)}-${money(hi)} range; ` +
    `its category's fitted launch prior is ${Math.round(fit.launch_prior * 100)}%, and ${trend} — a grade ${grade} farm on this board's conviction score.`
  );
}

/** Risk flags for one row, each naming the figure that raised it. */
export function risksOf(p: Protocol, fit: CategoryFit, age: number | null): string[] {
  const risks: string[] = [];
  if (p.change_7d !== null && p.change_7d <= -20)
    risks.push(`TVL outflow: down ${Math.abs(p.change_7d).toFixed(1)}% in 7 days — a launch into shrinking TVL usually prices at the low end of the range.`);
  if (p.change_7d !== null && p.change_7d > 100)
    risks.push(`Extreme 7-day move (${signedPct(p.change_7d)}): one week of inflow this size is often a single depositor or an incentive spike, not a trend.`);
  if (age === null)
    risks.push('No listing date on record: the maturity factor uses the stated 365-day default, so the value carries an assumption a dated peer does not.');
  else if (age < 90)
    risks.push(`Unproven: tracked for only ${age} days, so neither the TVL nor the team has been tested by a market turn.`);
  if (age !== null && age > 1095 && p.change_7d !== null && p.change_7d < 0)
    risks.push(`Stale giant: ${Math.round(age / 365)}+ years with no token and TVL falling this week — long-lived protocols that meant to launch usually have.`);
  if (p.tvl_usd < 10_000_000)
    risks.push(`Thin base: ${moneyFull(p.tvl_usd)} of TVL is small enough that one whale entering or leaving rewrites the valuation.`);
  if (p.chains.length <= 1)
    risks.push('Single-chain exposure: all of its TVL sits on one chain, so one chain incident or fee spike reaches the whole position.');
  if (fit.launch_prior < 0.25)
    risks.push(`Category rarely launches: the fitted launch prior for ${fit.category} is only ${Math.round(fit.launch_prior * 100)}%, so the wait may be long or permanent.`);
  if (fit.ratio_count < 3)
    risks.push(`Thin evidence: the ${fit.category} multiple rests on ${fit.ratio_count} usable peer ratio${fit.ratio_count === 1 ? '' : 's'}, so it leans on the global fit more than on its own category.`);
  if (risks.length === 0)
    risks.push('No flag from its own figures: TVL is material, the week is unremarkable, the age is inside the launch window and its category launches at a normal rate. The standing risk is the board-wide one: it may simply never issue a token.');
  return risks;
}

/** Catalysts for one row: the concrete things that could bring a launch closer. */
export function catalystsOf(p: Protocol, fit: CategoryFit, age: number | null, watchlist: boolean): string[] {
  const out: string[] = [];
  if (p.change_7d !== null && p.change_7d >= 15)
    out.push(`TVL breakout: ${signedPct(p.change_7d)} in 7 days is the growth pattern that has preceded points programmes and launch announcements in peer protocols.`);
  if (p.chains.length >= 5)
    out.push(`Multi-chain footprint: live on ${p.chains.length} chains, the distribution work a launch needs is already done.`);
  if (fit.launch_prior >= 0.6)
    out.push(`Category tailwind: the fitted launch prior for ${fit.category} is ${Math.round(fit.launch_prior * 100)}%, so launching is the category norm, not the exception.`);
  if (age !== null && age >= 365 && age <= 1460)
    out.push(`Prime window: ${Math.round((age / 365) * 10) / 10} years of operating history with no token is where this board's launches cluster.`);
  if (watchlist)
    out.push('Watchlist scale: its TVL is above the $50,000,000 floor the house set, the size at which a token becomes worth issuing.');
  if (out.length === 0)
    out.push('No near-term catalyst in its figures: the case rests on scale and category base rates, so this is a patient farm, not a momentum trade.');
  return out;
}

// ---------------------------------------------------------------------------
// Farm plans. Steps are generated per row from the protocol's category, its
// primary chain's fee level and its TVL tier, with explicit dollar costs and
// durations. Six steps: fund, test, size up, broaden, track, exit.
// ---------------------------------------------------------------------------

type Tier = 'large' | 'mid' | 'small';

function tierOf(tvl: number): Tier {
  if (tvl >= 100_000_000) return 'large';
  if (tvl >= 25_000_000) return 'mid';
  return 'small';
}

const TIER_CAPITAL: Record<Tier, { position: string; positionMid: number; weeks: number }> = {
  large: { position: '$5,000-$25,000', positionMid: 15000, weeks: 12 },
  mid: { position: '$1,000-$5,000', positionMid: 3000, weeks: 10 },
  small: { position: '$250-$1,000', positionMid: 625, weeks: 8 },
};

/** Per-transaction fee band (USD) by chain: mainnet is dear, L2s are cents. */
const CHAIN_FEES: Record<string, [number, number]> = {
  Ethereum: [2, 8],
  Arbitrum: [0.05, 0.4],
  Base: [0.02, 0.25],
  Optimism: [0.05, 0.4],
  Linea: [0.05, 0.35],
  Scroll: [0.05, 0.4],
  'zkSync Era': [0.05, 0.35],
  Polygon: [0.01, 0.1],
  Solana: [0.01, 0.05],
  Binance: [0.1, 0.6],
  Avalanche: [0.1, 0.8],
  Tron: [0.3, 1.5],
  Bitcoin: [0.5, 3],
};

function feeBand(chain: string): [number, number] {
  return CHAIN_FEES[chain] ?? [0.2, 2];
}

function feeText(chain: string): string {
  const [lo, hi] = feeBand(chain);
  return `$${lo.toFixed(2)}-$${hi.toFixed(2)}`;
}

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

/** The plan's shape for one row: capital, weeks, transaction count, fee total. */
export function planShape(p: Protocol): { tier: Tier; weeks: number; txs: number; feeLo: number; feeHi: number; position: string; chain: string } {
  const tier = tierOf(p.tvl_usd);
  const plan = TIER_CAPITAL[tier];
  const chain = p.chains[0] ?? 'its main chain';
  const txs = plan.weeks * 2 + 6; // twice-weekly cadence plus setup and side quests
  const [flo, fhi] = feeBand(chain);
  return { tier, weeks: plan.weeks, txs, feeLo: Math.round(flo * txs), feeHi: Math.round(fhi * txs), position: plan.position, chain };
}

/** Build the farm plan for one row: 6 steps, each with a cost and a duration. */
export function farmSteps(p: Protocol, fit: CategoryFit, age: number | null): string[] {
  const shape = planShape(p);
  const chain = shape.chain;
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
    `Set up a dedicated wallet for ${p.name} and fund it on ${chain} with ${shape.position} plus a ${moneyFull(Math.max(25, shape.feeHi))} fee reserve; setup takes about 30 minutes and one funding transaction (${feeText(chain)} on ${chain}).`,
    `Start with the core loop: ${coreAction(p.category)} on ${chain}. Keep the first transaction near 10% of the position (about ${moneyFull(TIER_CAPITAL[shape.tier].positionMid / 10)}) to confirm the route, then size up over the first week.${chainNote}`,
    `Stay active for ${shape.weeks} weeks: interact at least twice a week, vary amounts by 20-40% between visits and never let the position sit untouched for more than 10 days; the plan totals about ${shape.txs} transactions at ${feeText(chain)} each, ${moneyFull(shape.feeLo)}-${moneyFull(shape.feeHi)} in fees across the whole plan.`,
    `Cover the side quests in weeks 2-4: join its community channels, vote in any governance poll that opens and test one secondary feature (about $10-$30 in extra fees); ${ageNote}, and the fitted launch prior for ${fit.category} is ${priorPct}%, which is the base rate this plan is betting on.`,
    `Keep records as you go: save transaction hashes and a dated note of each session (15 minutes a week), and check weekly whether a points programme or snapshot has been announced; if one opens, shift the cadence to its rules within the same fee budget.`,
    `Exit on evidence, not hope: be ready to claim within 48 hours of any launch post; if nothing is announced within 6 months, or TVL falls 40% from your entry week, wind the position down over 2 weeks and redeploy the capital. Total plan cost stays ${moneyFull(shape.feeLo)}-${moneyFull(shape.feeHi)} in fees plus the position itself.`,
  ];
  return steps;
}

// ---------------------------------------------------------------------------
// Deep-dives for the watchlist: the 40 protocols the house floor names get a
// longer treatment — thesis, bull case, bear case, what would change the
// call, and the farm plan in one line.
// ---------------------------------------------------------------------------

function deepDiveOf(row: BoardRow, p: Protocol, fit: CategoryFit): DeepDive {
  const shape = planShape(p);
  const bull =
    `If ${p.name} launches at the top of its peer range (${mult(fit.multiple_hi)}), the token prices near ${money(row.value_hi_usd)}; ` +
    `its ${p.chains.length}-chain footprint and ${moneyFull(p.tvl_usd)} TVL are already at the scale where ${fit.category} peers have issued, ` +
    `and the fitted launch prior for the category is ${Math.round(fit.launch_prior * 100)}%, so the base rate is on the farmer's side.`;
  const bear =
    row.risks[0] ??
    'It may never issue a token at all: nothing in the snapshot obliges it to, and a pre-token protocol can run for years on fees alone.';
  const changeMind =
    `Downgrade this call if a token appears on its DefiLlama record (the farm is over), if TVL falls below ${money(Math.max(5_000_000, Math.round(p.tvl_usd / 4)))} ` +
    `(a quarter of today's base), or if 6 more months pass with no points programme, governance or launch signal; upgrade it if a points programme opens or TVL growth holds above +15% for a second month.`;
  return {
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    thesis_long: row.thesis,
    bull,
    bear,
    change_mind: changeMind,
    farm_summary: `Farm: ${shape.position} on ${shape.chain} for ${shape.weeks} weeks, about ${shape.txs} transactions, ${moneyFull(shape.feeLo)}-${moneyFull(shape.feeHi)} in total fees at ${feeText(shape.chain)} per transaction.`,
    farm_short: `Farm: ${shape.position} · ${shape.chain} · ${shape.weeks} wks · ~${shape.txs} tx · ${money(shape.feeLo)}-${money(shape.feeHi)} fees.`,
  };
}

// ---------------------------------------------------------------------------
// Board assembly
// ---------------------------------------------------------------------------

/** Build the ranked board and the dashboard data from the snapshot. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const rows: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (recordsToken(p)) continue;
    if (isProductOfTradedToken(p) && !watchlist.has(p.slug)) continue;
    const age = ageDays(snapshot.as_of, p.listed_at);
    const catFit = fit.by_category.get(categoryKey(p)) ?? fit.global;
    const value = impliedValue(p, catFit, age);
    const lo = valueAt(p, catFit.multiple_lo, age);
    const hi = valueAt(p, catFit.multiple_hi, age);
    const parts = convictionParts(p, catFit, age);
    const conviction = Math.round(parts.prior + parts.scale + parts.momentum + parts.window + parts.breadth);
    const grade = gradeOf(conviction);
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0, // assigned after the sort
      implied_value_usd: value,
      farm_steps: farmSteps(p, catFit, age),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      multiple: Math.round(catFit.multiple * 1e4) / 1e4,
      multiple_lo: Math.round(catFit.multiple_lo * 1e4) / 1e4,
      multiple_hi: Math.round(catFit.multiple_hi * 1e4) / 1e4,
      value_lo_usd: lo,
      value_hi_usd: hi,
      momentum: Math.round(momentumFactor(p.change_7d) * 1e4) / 1e4,
      maturity: Math.round(maturityFactor(age) * 1e4) / 1e4,
      launch_prior: Math.round(catFit.launch_prior * 1e4) / 1e4,
      conviction,
      grade,
      conviction_parts: {
        prior: Math.round(parts.prior * 10) / 10,
        scale: Math.round(parts.scale * 10) / 10,
        momentum: Math.round(parts.momentum * 10) / 10,
        window: Math.round(parts.window * 10) / 10,
        breadth: Math.round(parts.breadth * 10) / 10,
      },
      thesis: thesisOf(p, catFit, age, value, lo, hi, grade),
      risks: risksOf(p, catFit, age),
      catalysts: catalystsOf(p, catFit, age, watchlist.has(p.slug)),
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
  const deepDives: DeepDive[] = [];
  for (const row of rows) {
    if (!row.watchlist) continue;
    const p = bySlug.get(row.slug)!;
    const catFit = fit.by_category.get(categoryKey(p)) ?? fit.global;
    deepDives.push(deepDiveOf(row, p, catFit));
  }
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
    deep_dives: deepDives,
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

// ---------------------------------------------------------------------------
// The written analysis. main.ts writes this into the output's dashboard/ as
// analysis.md, so the dossier's text carries the radar's reasoning in full —
// the methodology, the fitted multiples with their ranges, the top of the
// board, and a deep-dive on every watchlist protocol — in the same words the
// page itself shows. It is generated from the same RadarData as the page, so
// the two can never disagree.
// ---------------------------------------------------------------------------

/** Cut a sentence at a clause boundary near `max` characters, for the compact analysis. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf('; '), cut.lastIndexOf(', '), cut.lastIndexOf(' — '));
  return (at > max * 0.5 ? cut.slice(0, at) : cut.replace(/\s+\S*$/, '')) + '…';
}

/** The radar's written analysis, as markdown, sized to sit inside the dossier's text cap beside the page source. */
export function analysisMarkdown(radar: RadarData): string {
  const g = radar.global;
  const top = radar.rows.slice(0, 12);
  const lines: string[] = [];
  lines.push('# Launch Scope — the written analysis');
  lines.push('');
  lines.push(
    `Snapshot as of ${radar.as_of} (DefiLlama, frozen). ${radar.peer_count + radar.pre_token_count} protocols at $5M TVL or more: ` +
      `${radar.peer_count} already record a token and are the peer evidence; ${radar.pre_token_count} record none, and this board ranks ${radar.board_size} of them ` +
      `after removing wrapped, staked, bridged and exchange products of tokens that already trade. All ${radar.deep_dives.length} watchlist protocols are covered. ` +
      `"Records no token" is DefiLlama's record, not proof a protocol has none; every implied value is this board's own claim about what a launch could be worth if the record held — never a prediction that a token will be issued.`,
  );
  lines.push('');
  lines.push('## How a price is made');
  lines.push('');
  lines.push(
    'implied value = TVL x category multiple x momentum x maturity. The multiple is fitted per category from the protocols that already launched: ' +
      'their mcap/TVL ratios, winsorised to [0.01, 5], summarised by the first quartile, median and third quartile, each shrunk toward the matching global quartile ' +
      `with 8 pseudo-rows of weight, so a thin category borrows the market's evidence. Globally the fit rests on ${g.ratio_count} usable peer ratios: quartiles ${mult(g.multiple_lo)} / ${mult(g.multiple)} / ${mult(g.multiple_hi)}. ` +
      'The median gives the central value; the quartiles bound the quoted range. Momentum = 1 + 0.6 x tanh(7-day change / 40), bounded in (0.4, 1.6) because this snapshot\'s changes run from -73% to +4,448% ' +
      'and one freak week must not mint a top row; unreported is neutral. Maturity = 0.45 + 0.55 x sqrt(age / 5 years, capped); a missing listing date uses a stated 365-day default. ' +
      'Conviction (0-100) separately scores how good a farm a row is — launch prior 40, TVL scale 20, momentum 15, age in the 180-1460 day prime window 15, chain breadth 10 — and never moves the price. Grades: A 70+, B 55+, C 40+, else D.',
  );
  lines.push('');
  lines.push('## Fitted multiples by category (only categories the board prices)');
  lines.push('');
  lines.push('| Category | Peers | Ratios | Mult (lo-hi) | Prior |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const c of radar.categories) {
    if (c.pre_token === 0) continue;
    lines.push(`| ${c.category} | ${c.peers} | ${c.ratio_count} | ${mult(c.multiple)} (${mult(c.multiple_lo)}-${mult(c.multiple_hi)}) | ${Math.round(c.launch_prior * 100)}% |`);
  }
  lines.push('');
  lines.push('## The top of the board');
  lines.push('');
  for (const r of top) {
    lines.push(
      `${r.rank}. **${r.name}** (${r.category ?? 'Uncategorised'}) — TVL ${money(r.tvl_usd)}, implied ${money(r.implied_value_usd)} (range ${money(r.value_lo_usd)}-${money(r.value_hi_usd)}), conviction ${r.conviction} (${r.grade}), week ${signedPct(r.change_7d)}.`,
    );
  }
  lines.push('');
  lines.push('## Watchlist deep-dives');
  lines.push('');
  lines.push('Every protocol on the house watchlist (TVL at or above the $50,000,000 floor, no token recorded, not a product of one that trades), in board order. The dashboard\'s deep-dive view carries each of these in full.');
  lines.push('');
  const diveBySlug = new Map(radar.deep_dives.map((d) => [d.slug, d]));
  for (const r of radar.rows) {
    if (!r.watchlist) continue;
    const d = diveBySlug.get(r.slug)!;
    lines.push(`### ${r.name} — rank ${r.rank} · ${money(r.implied_value_usd)} (${money(r.value_lo_usd)}-${money(r.value_hi_usd)}) · conviction ${r.conviction} (${r.grade})`);
    lines.push(
      `TVL ${money(r.tvl_usd)} · ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'} · ${r.age_days === null ? 'age unrecorded' : `${r.age_days}d`} · week ${signedPct(r.change_7d)} · mult ${mult(r.multiple)} (peers ${mult(r.multiple_lo)}-${mult(r.multiple_hi)}) · prior ${Math.round(r.launch_prior * 100)}%.`,
    );
    lines.push(`Bear: ${clip(d.bear, 115)}`);
    lines.push(`Flip: ${clip(d.change_mind, 135)}`);
    lines.push(d.farm_short);
    lines.push('');
  }
  lines.push('## How to use this board');
  lines.push('');
  lines.push(
    'Farm the conviction, size by the range. On a grade A or B row the farm plan\'s fee budget — printed per chain in every plan — is the real cost of the option on a launch; ' +
      'a grade C or D row is a watch, not a position. Re-check a row when its inputs move: TVL crossing a quarter of its base, a token appearing on its record, or a points programme opening each rewrite its card. ' +
      'The board is rebuilt from the snapshot alone by the entry\'s program, so every number above re-derives from the sealed input and the formulas stated here.',
  );
  lines.push('');
  return lines.join('\n');
}
