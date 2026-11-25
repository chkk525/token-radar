# Launch Scope — token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/chkk525/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/chkk525/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Scope reads a frozen DefiLlama snapshot of 758 protocols and ranks the ones that record no token yet by what a launch could plausibly be worth — quoted as a range, not false precision. It writes a 198-row board (`board.json`), a self-contained offline dashboard with three views (board, watchlist deep-dives, full method), and a dossier for review. Every one of the snapshot's 40 watchlist protocols is on the board and gets a written deep-dive.

## The model (v2)

Nothing on the board is hand-picked; every number is fitted from the snapshot itself.

- **Peer multiples, with a range.** Of the 416 token-bearing protocols, 128 carry both a market cap and a TVL, so their mcap/TVL ratios are usable evidence. Ratios are winsorised to [0.01, 5] (one peer trades at 400× its TVL and would otherwise bend its whole category). Each category is summarised by the first quartile, median and third quartile of its ratios, each shrunk toward the matching global quartile with K=8 pseudo-rows. The median prices the central value; the quartiles bound the quoted low–high range.
- **Momentum a freak week cannot bend.** 1 + 0.6 × tanh(7-day change / 40), bounded in (0.4, 1.6): this snapshot's changes run from −73% to +4,448% with a −8% median, and a linear factor would hand the top of the board to one inflow spike. Unreported change is neutral.
- **Maturity.** 0.45 + 0.55 × √(age / 5 years, capped); a null `listed_at` defaults to 365 days, stated in the code and flagged on the row's card.
- **Conviction, kept apart from value.** A 0–100 farm score per row — fitted launch prior ×40, TVL scale ×20, momentum ×15, age in the 180–1460-day prime window ×15, chain breadth ×10 — graded A/B/C/D and broken into its five parts in the detail view. It never moves the price.
- **Per-row write-ups.** Every row carries a generated thesis citing its own figures, risk flags (TVL outflow, stale giant, thin base, single-chain, rare-launch category, thin peer evidence), catalysts, and a six-step farm plan whose fees are priced per chain (mainnet dollars, L2 cents) with a total plan budget and an exit rule.
- **Watchlist deep-dives.** All 40 watchlist protocols get a full write-up — thesis, bull case, bear case, what would change the call, and the farm in one line — rendered in the dashboard's second view and in the generated `analysis.md` that ships inside the dashboard directory, so the dossier's text carries the radar's reasoning in full.
- **Candidacy.** Products of tokens that already trade — wrapped, staked and bridged products, versioned names, CEX and bridge records — are excluded using the snapshot field guide's own product classes, leaving 198 rankable pre-token protocols.

## Deliverables

- `main.ts` — the entry program; `lib/model.ts` — the fitted model, thesis/risk/catalyst generators, farm plans and the analysis writer; `vendor/makefun-board.ts` — the vendored dossier builder.
- `dashboard/` — the offline dashboard (`index.html`, `app.css`, `app.js`; no external requests): sortable/filterable board with implied-value ranges and conviction grades, per-protocol detail drawer, watchlist deep-dive view, full-method view. `analysis.md` is generated into the output dashboard by `main.ts`.
- `screenshots/` — board, detail (Sentora Curator) and watchlist deep-dive views at 1440×900.
- Output: `board.json` (198 rows, watchlist coverage 40/40), `data.js`, `dossier.json`; dossier text 61,188 of the 65,536-byte cap with nothing cut, in local verification.

## Run it

```sh
node main.ts --input <snapshot.json> --output <dir>
```

`main.ts` is a single dependency-free TypeScript program (Node 22, standard library only). It reads the snapshot, fits the model, and writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json` into the output directory. Two runs over the same snapshot produce byte-identical output (verified by diff).

## License

MIT — see [LICENSE](LICENSE).
