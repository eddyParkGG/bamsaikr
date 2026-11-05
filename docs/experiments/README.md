# Experiments

Hypotheses behind 밤사이, how each one is tested, and where the numbers come from.
The PRD (repo `README.md`, Korean) states *why*; these files state *how to run and read* each test.
Analytics wiring for every metric is in [ga-events.md](ga-events.md).

| # | Hypothesis | Status | Primary metric | Pass line | Doc |
|---|---|---|---|---|---|
| H1 | On nights with ≥ $1M traded on Hyperliquid while the domestic market is closed (20:00 → 08:00), it re-opens the way Hyperliquid moved | **Passed** for Samsung 88.2 / SK hynix 85.4%; Hyundai undecided (7 liquid nights) | Hyperliquid-direction rate | ≥ 80% | [H1](H1-hyperliquid-direction.md) |
| H2 | Showing "오를 확률" brings people back before the next open | **Running** (community test from 2026-11-05) | Pre-open return of first-time visitors | ≥ 15% | [H2](H2-preopen-return.md) |
| H3 | Showing the record makes people trust and act on the forecast | Planned | Evidence-check rate | ≥ 10% | [H3](H3-trust.md) |
| H4 | Showing the net spread turns viewing into an order intent | Planned | Spread viewed → order button | ≥ 5% | [H4](H4-spread-to-order.md) |
| H5 | Opening the API/MCP creates off-site (agent) usage | Planned | Weekly external API calls | 1,000 / week | [H5](H5-agents.md) |

Order of risk: H1 → H2 → H3/H4 → H5. A failed H1 ends the product; a failed H2 changes it from a daily habit
to event-driven content (weekend/holiday gap reports).

## Running order

1. **H1** is checked continuously by the server (no traffic needed). It is recomputed on every history load and
   shown on the About page and the stock detail's 개장 예측 tab.
2. **H2** runs first with real users: a 4-day community test (Thu close → Mon 09:00). H3/H4 metrics are read from
   the same traffic.
3. **H5** is read from server logs after the API page is public.

## Results log

Append one row per readout. Keep raw exports next to this folder, not in the repo.

| Date | Hypothesis | Sample | Result | Decision |
|---|---|---|---|---|
| 2026-11-05 | H1 (old basis, 15:30 → 09:00) | 170 / 173 / 166 scored opens (2026-02-20 → 11-05) | 91.2% / 90.8% / 85.5% | Superseded: counted Nextrade 15:30–20:00 moves as prediction |
| 2026-11-05 | H1 (20:00 → 08:00–08:10 VWAP) | 134 / 137 / 135 scored opens (2026-04-13 → 11-05) | 85.8% / 85.4% / 66.7% | Superseded the same day by the liquidity condition below |
| 2026-11-05 | H1 + liquidity (≥ $1M overnight on Hyperliquid) | 119 / 130 / 7 liquid nights | 88.2% / 85.4% / n/a | Pass for Samsung and SK hynix. Thin nights flagged 거래 적어 덜 정확; Hyundai undecided |
| 2026-11-05 | H2 (channels) | First posts | Naver stock forum post removed within minutes (ads/promotion ban; links not clickable) | Run on the DC 주식 갤러리 only — see [community/posts.md](community/posts.md) |
