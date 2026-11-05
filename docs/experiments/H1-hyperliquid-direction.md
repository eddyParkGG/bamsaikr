# H1 — The domestic market re-opens the way Hyperliquid moved

**Claim.** While the whole domestic market is closed (KRX regular session and Nextrade, 20:00 → next trading day 08:00 KST),
the trade.xyz perp on Hyperliquid moves. On nights it trades at least $1M (notional), When the domestic market re-opens at 08:00, it goes the same direction at least 80% of the time.
This is the product's premise: closed-hours Hyperliquid prices are worth looking at.

## Why this basis

- Retail can trade 08:00–20:00 (Nextrade 08:00–08:50 and 15:30–20:00, regular session 09:00–15:30). Only 20:00 → 08:00 is truly closed.
- The earlier basis (15:30 regular close → 09:00 regular open) counted moves already visible on Nextrade 15:30–20:00 as "prediction",
  which overstated accuracy. Kept below as history.
- The first 08:00 trade is thin, so the outcome is the 08:00–08:10 volume-weighted average (see the comparison table).

## Scoring

For each domestic trading day:

| Field | Definition | Source |
|---|---|---|
| `prevClose` | Last domestic print at or before 20:00 on the previous trading day | Toss Securities minute bars (integrated KRX + NXT) |
| `gapPct` | Hyperliquid price at 08:00 (KRW-converted) vs `prevClose` | perp 1h bar 07:00–07:59 close |
| `openGapPct` | 08:00–08:10 VWAP vs `prevClose` | minute bars 08:01–08:10, typical price (h+l+c)/3 weighted by volume |
| `follow` | `yes` same sign, `no` opposite, `flat` if either is within ±0.05% | `server/services/predict.ts` (`FLAT_PCT`) |

Rate = `yes / (yes + no)`; `flat` days are shown but excluded.

Liquidity condition: `nightUsd` = Hyperliquid notional (Σ volume × close of 1h bars, 20:00 → 08:00) ≥ `THIN_USD` ($1M).
Below that a handful of orders can move the price. API: `backtest.liquidRatePct`, `liquidScored`, `liquidYes`; per day `events[].nightUsd`.

## Data window

- 2026-04-13 → today, 139 opens per stock. Hyperliquid keeps only the latest 5,000 candles per interval, so 1h bars
  (needed for the 08:00 price) cover ~7 months. The window grows as the server keeps collecting.
- Domestic days are bundled in `server/data/krx-days.json` (built by `server/scripts/build-sessions.ts`) plus live minute bars.
- KRW conversion uses Upbit KRW-USDC hourly closes at the same hour.

## Result (2026-11-05)

| Asset | Scored opens | Same direction | Rate | Flat (excluded) |
|---|---|---|---|---|
| Samsung Electronics | 134 | 115 | **85.8%** | 5 |
| SK hynix | 137 | 117 | **85.4%** | 2 |
| Hyundai Motor | 135 | 90 | **66.7%** | 4 |

With the liquidity condition (the H1 line):

| Asset | Liquid nights scored | Same direction | Rate |
|---|---|---|---|
| Samsung Electronics | 119 | 105 | **88.2%** |
| SK hynix | 130 | 111 | **85.4%** |
| Hyundai Motor | 7 | 5 | n/a (too few) |

Pass line 80% → **passed for Samsung and SK hynix; Hyundai undecided** (median overnight notional $0.23M, so almost every night is thin).

Why $1M (all three pooled): below $1M 67.3% (101/150), at or above 86.3% (221/256); thresholds $0.5M / $2M give 84.8% / 87.1%.
Within an asset, busier nights follow more often: Samsung 78.8% → 92.6%, SK hynix 81.2% → 89.7% (below / above own median).
The line was chosen after seeing the data; re-check it on new nights.
Live flag (`prediction.thin`): max(tonight's notional so far, median of the last 20 nights) < $1M.

Which outcome price to score against (same window):

| Asset | 08:00 first trade | 08:00–08:05 VWAP | **08:00–08:10 VWAP** | 08:00–08:30 VWAP | 09:00 regular open |
|---|---|---|---|---|---|
| Samsung Electronics | 80.5% | 85.3% | **85.8%** | 84.6% | 83.5% |
| SK hynix | 85.9% | 85.4% | **85.4%** | 84.2% | 84.1% |
| Hyundai Motor | 70.1% | 66.9% | **66.7%** | 69.9% | 73.3% |

Secondary (walk-forward; first 20 opens train only, 119 scored):

| Asset | 80% band coverage | Mean open error | Naive "open = 20:00 price" error |
|---|---|---|---|
| Samsung Electronics | 83.2% | 1.22%p | 2.40%p |
| SK hynix | 89.1% | 1.10%p | 2.84%p |
| Hyundai Motor | 88.2% | 1.26%p | 1.53%p |

Previous basis (15:30 → 09:00, 2026-02-20 → 11-05, ~170 opens): 91.2% / 90.8% / 85.5%. Superseded.

## Reproduce

- API: `GET /api/v1/convergence?asset=SKHX&limit=500` → `backtest.followRatePct`, `followScored`, `followYes`,
  `followFlat`, `since`, plus per-day `events[].follow`
- Script: `npx tsx --env-file=.env.local server/scripts/backtest.ts` (stop the dev server first: a new Toss token revokes the old one)
- UI: About → 가설과 지금까지의 결과; stock detail → 내일 예측 (얼마나 맞았나) and 예측 기록 (filter 하이퍼리퀴드 방향대로)

## Next decision

- Hyundai: label its forecast as low confidence or hide it until the rate clears 80%.

## Guardrail after launch

If the 4-week rolling rate falls below 75%, hide the forecast and show only raw prices until reviewed.
