# H1 — The KRX opens the way Hyperliquid moved

**Claim.** While the Korean market is closed (previous 15:30 → 08:59 KST), the trade.xyz perp on Hyperliquid moves.
The next KRX open goes the same direction at least 80% of the time.
This is the product's premise: closed-hours Hyperliquid prices are worth looking at.

## Scoring

For each KRX open day:

| Field | Definition | Source |
|---|---|---|
| `gapPct` | Hyperliquid price just before 09:00 (KRW-converted) vs the previous KRX regular close | perp 1h bar 08:00–08:59 close; before the 1h retention window, the 4h bar 05:00–08:59 close (both end at 09:00 KST) |
| `openGapPct` | KRX regular-session open (09:00) vs the previous regular close | Toss Securities minute bars (09:01 bar open, 15:31 bar close) |
| `follow` | `yes` if both have the same sign, `no` if opposite, `flat` if either is within ±0.05% | `server/services/predict.ts` (`FLAT_PCT`) |

Rate = `yes / (yes + no)`; `flat` days are shown but excluded.

Why ±0.05%: below that the open is effectively unchanged, and calling it right or wrong would be noise.

## Data window

- From the trade.xyz listing of Korean stocks (2026-02-19 KST evening) to today; first scored open is 2026-02-20
  (SK hynix) / 2026-02-23 (Samsung, Hyundai).
- Hyperliquid keeps only the latest 5,000 candles per interval. 1h covers ~7 months, so older days fall back to 4h bars.
- KRW conversion uses Upbit KRW-USDC hourly closes at the same hour.

## Result (2026-11-05)

| Asset | Scored opens | Same direction | Rate | Flat (excluded) |
|---|---|---|---|---|
| Samsung Electronics | 170 | 155 | **91.2%** | 3 |
| SK hynix | 173 | 157 | **90.8%** | 1 |
| Hyundai Motor | 166 | 142 | **85.5%** | 7 |

Pass line 80% → **passed** for all three.

Secondary (shown on the 개장 예측 tab, not part of the pass line):

| Asset | 80% band coverage | Mean open error | Naive "open = previous close" error |
|---|---|---|---|
| Samsung Electronics | 92.2% | 0.88%p | 2.92%p |
| SK hynix | 91.6% | 0.89%p | 3.42%p |
| Hyundai Motor | 77.8% | 0.99%p | 1.93%p |

## Reproduce

- API: `GET /api/v1/convergence?asset=SKHX&limit=500` → `backtest.followRatePct`, `followScored`, `followYes`,
  `followFlat`, `since`, plus per-day `events[].follow`
- Script: `npx tsx --env-file=.env.local server/scripts/backtest.ts`
- UI: About → 가설과 지금까지의 결과; stock detail → 개장 예측 (얼마나 맞았나) and 예측 기록 (filter 하이퍼리퀴드 방향대로)

## Guardrail after launch

If the 4-week rolling rate falls below 75%, hide the forecast and show only raw prices until reviewed.
