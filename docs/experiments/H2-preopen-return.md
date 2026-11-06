# H2 — tonight's Hyperliquid price and "how often the open followed it" bring people back before the next open

**Claim.** People who see the next-open probability come back before the domestic market re-opens (06:00–08:00 KST; Nextrade opens at 08:00)
to check it again. That return is the habit the product needs.

## Test: 4-day community run

| Item | Plan |
|---|---|
| Channels | DC Inside 주식 갤러리. Stock-specific minor galleries were checked and skipped as nearly inactive (SK하이닉스: a few posts a day; 하이퍼리퀴드, 삼성전자 주주: none for months). Naver stock forum dropped: its rules ban ads/promotion, the first post was removed within minutes, and body URLs are not linked |
| Timing | Post 21:00–22:00 (after the 20:00 close, when the forecast exists) on Thu, Fri, Sun → measure Fri and Mon pre-open returns (weekend gap included). Thu: one A and one B post, spaced apart (back-to-back posts read as spam) |
| Duration | 4 days (Thu 20:00 → Mon 08:00) |
| Message A/B | A forecast: run 1 (11/05) used "내일 장 시작 가격, 오를 확률 56%"; from 11/07 A posts after the US close: "미국장 마감 때 하이퍼리퀴드 -x% · 과거 이 시간대엔 n%가 이 방향대로 열렸어요" / B fact: "지금 해외에선 삼성전자 -2.6%" |
| Links | `https://bamsai.kr/?utm_source=dc_stock&utm_medium=community&utm_campaign=bamsai_test1&utm_content={asset}_{day}_{A|B}` e.g. `smsn_thu_A` |
| Minimum sample | 200 visitors; below that, no conclusion and one more post |
| Rules | Information-sharing format, one link per post, no buy/sell wording (avoid unregistered-advisory misreading), a 밤사이 screenshot whose numbers match the text, different wording each post |
| Log | Every post (time, gallery, link, message, numbers, image): [community/posts.md](community/posts.md) |

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
