# H4 — The net spread turns viewing into an order intent

**Claim.** Showing the spread after fees, tax, FX and funding ("시세차익 기회") makes people press an order button.
Orders are not live yet: the button opens a "출시 예정" sheet that asks for an email.
That measures real demand without moving money.

## Funnel

| Step | Where | Event | Key params |
|---|---|---|---|
| 1. Spread seen | Stock detail (stats strip, chart note when there is a spread to take) / order panel | `arb_view` | `asset`, `net_pct`, `mode` (`live`/`gap`) |
| 1b. Chart note clicked | 시세차익 내기 on the chart → order panel opens on 시세차익 기회 | `arb_cta_click` | `asset`, `from`, `net_pct` |
| 2. Order button | Order panel: 국내 시장 / 하이퍼리퀴드 / 시세차익 기회 (실행하기) | `order_submit` | `market` (`krx`/`perp`/`pair`), `side`, `kind`, `leverage` |
| 3. Launch sign-up | 출시 예정 sheet → 알림 받기 (valid email; email is **not** stored) | `launch_notify_signup` | `what` (asset + market + side) |

## Metrics

| Metric | Pass | GA4 |
|---|---|---|
| Spread seen → order button | ≥ 5% | `arb_view` → `order_submit` |
| Order button → sign-up | ≥ 20% | `order_submit` → `launch_notify_signup` |
| Pair share of order buttons | read only | `order_submit` where `market = pair` |

## Guardrails

- Share of high-leverage (≥ 5x) or Hyperliquid order intents among first-week users (beginner risk)
- Home-originated users reaching an order button (watch for beginners drifting into derivatives)

## Readout

Funnel exploration with the three steps (closed funnel, within session). Break down by `market`.
Mark `launch_notify_signup` as a key event (conversion).
