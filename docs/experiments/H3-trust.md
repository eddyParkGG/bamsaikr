# H3 — The record makes the forecast credible

**Claim.** People trust a probability more when they can see how often the signal was right,
and they check that evidence before acting.

## Where the evidence is

| Place | What it shows | Event fired |
|---|---|---|
| Stock detail → top bar "내일 예측" | Opens the 개장 예측 tab | `model_explain_open` (`tab=predict`, `from=notice_bar`) |
| Stock detail → 개장 예측 tab | "얼마나 맞았나": Hyperliquid-direction rate, band coverage, error | `model_explain_open` (`tab=predict`) |
| Stock detail → 예측 기록 tab | Per-open record with filters | `model_explain_open` (`tab=conv`) and `convergence_view` |

## Metrics

| Metric | Definition | Pass | GA4 |
|---|---|---|---|
| Evidence-check rate | Users with `model_explain_open` / users with `prediction_view` | ≥ 10% | both events, user-level |
| Trust lift (after launch) | Pre-open return of evidence-checkers minus non-checkers | +10%p | segment on `model_explain_open`, return as in H2 |

## Readout

Funnel exploration: step 1 `prediction_view`, step 2 `model_explain_open` (open funnel, within 1 day).
Segment comparison: users who triggered `model_explain_open` vs not, metric = H2 return.
