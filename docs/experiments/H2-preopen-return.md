# H2 — "오를 확률" brings people back before the next open

**Claim.** People who see the next-open probability come back before the domestic market re-opens (06:00–08:00 KST; Nextrade opens at 08:00)
to check it again. That return is the habit the product needs.

## Test: 4-day community run

| Item | Plan |
|---|---|
| Channels | Naver stock forum (Samsung, SK hynix boards), DC Inside stock gallery |
| Timing | Post after the 20:00 close on Thu, Fri, Sun evening → measure Fri and Mon pre-open returns (weekend gap included) |
| Duration | 4 days (Thu 20:00 → Mon 08:00) |
| Message A/B | A forecast: "내일 장 시작 가격, 오를 확률 56%" / B fact: "지금 해외에선 삼성전자 -2.6%" |
| Links | `https://<domain>/?utm_source={naver_jongto|dc_stock}&utm_medium=community&utm_campaign=bamsai_test1&utm_content={asset}_{day}_{A|B}` e.g. `smsn_thu_A` |
| Minimum sample | 200 visitors; below that, no conclusion and one more post |
| Rules | Information-sharing format, one link per post, no buy/sell wording (avoid unregistered-advisory misreading) |

## Metrics

| Stage | Metric | Pass | GA4 |
|---|---|---|---|
| Acquisition | Visits / post views | ≥ 3% | `session_start` × user property `first_source` |
| Activation | Visitors who saw a forecast | ≥ 70% | `prediction_view` |
| Activation | Forecast → stock detail | ≥ 30% | `prediction_detail_open` |
| **Core** | First-time visitors returning before the next open | **≥ 15%** | `page_view` with `kst_window = preopen` on a later day |
| Retention | Visited on 2+ of the 4 days | ≥ 20% | Cohort exploration |

Assumption behind 15%: one-off community traffic usually returns 5–10% next day; twice that is a habit signal.

## Decision

- ≥ 15% → build the 07:30 pre-open push next
- 5–15% → change message (winning A/B) and posting time, rerun once
- < 5% → reject the daily habit; pivot to event content (weekend/holiday gap reports)
- Compare messages before channels (only two channels → weak comparison)

## Readout (GA4)

Cohort exploration: inclusion = first `session_start`, cohort granularity = daily, return criterion = `page_view`
where `kst_window = preopen`, breakdown = `first_source`, then `first_content` for A/B.
