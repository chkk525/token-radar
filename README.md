# Launch Scope — token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/chkk525/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/chkk525/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Scope reads a frozen DefiLlama snapshot of 758 protocols and ranks the ones that have not issued a token yet by what a launch could plausibly be worth. It writes a 198-row board (`board.json`), a self-contained offline dashboard, and a dossier for review. Every one of the snapshot's 40 watchlist protocols is on the board.

## The model

Nothing on the board is hand-picked; every number is fitted from the snapshot itself.

- **Peer multiples.** Of the 416 token-bearing protocols, 128 carry both a market cap and a TVL, so their mcap/TVL ratios are usable evidence. Ratios are winsorised to [0.01, 5] (one peer trades at 400× its TVL and would otherwise bend its whole category), the median is taken per category, and thin categories are shrunk toward the global median of 0.214 with K=8 pseudo-rows.
- **Launch prior.** Each category's token-bearing share, shrunk toward the global 0.549, is reported on every row as the base-rate chance that a protocol in that category has a token at all.
- **Implied value.** TVL × the fitted category multiple, adjusted by a momentum factor from 7-day TVL change (clamped, nulls neutral) and a maturity factor from the protocol's age (null `listed_at` defaults to 365 days, stated in the code).
- **Candidacy.** Products of tokens that already trade — wrapped, staked and bridged products, versioned names, CEX and bridge records — are excluded using the snapshot field guide's own product classes, leaving 198 rankable pre-token protocols.
- **Farm plans.** Five steps per row, generated from the protocol's category, primary chain and TVL tier, each with explicit USD position and gas figures and week counts.

The dashboard shows the full working: every row's detail view breaks its implied value into TVL × multiple × momentum × maturity, and the side rail prints the fitted multiples table for all 53 categories.

## Deliverables

- `main.ts` — the entry program; `lib/model.ts` — the fitted model and farm-plan generator; `vendor/makefun-board.ts` — the vendored dossier builder.
- `dashboard/` — the offline dashboard (`index.html`, `app.css`, `app.js`; 29,425 bytes of source, no external requests): sortable and filterable board, per-protocol detail drawer, fitted-model rail.
- `screenshots/` — board, detail and filtered views at 1440×900.
- Output: `board.json` (198 rows, watchlist coverage 40/40), `data.js`, `dossier.json` (832,817 bytes in local verification).

## Run it

```sh
node main.ts --input <snapshot.json> --output <dir>
```

`main.ts` is a single dependency-free TypeScript program (Node 22, standard library only). It reads the snapshot, fits the model, and writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json` into the output directory. Two runs over the same snapshot produce byte-identical output.

## License

MIT — see [LICENSE](LICENSE).
