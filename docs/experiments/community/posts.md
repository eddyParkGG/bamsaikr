# Community test posts (H2 · first run `bamsai_test1`)

Plan and metrics: [H2](../H2-preopen-return.md). One row per post; read GA4 by `first_source` / `first_content`.

| Posted (KST) | Channel | Post | Message | `utm_content` | Numbers in the post | Image |
|---|---|---|---|---|---|---|
| 2026-11-05 (Thu) ~21:15 | DC 주식 갤러리 (`dc_stock`) | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7334766&page=1) | A (forecast) | `smsn_thu_A` | 삼전 202,100 (+0.3%) up 56% · 하닉 1,263,400 (+0.1%) up 52% | [smsn-chart.png](smsn-chart.png) |
| 2026-11-05 (Thu) 21:21 | DC 주식 갤러리 | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7334780&page=1) | B (fact) | `skhx_thu_B` (source tag `dc_skhynix`, see notes) | 하닉 −9.6% today; Hyperliquid +0.1% vs close 1,262,000 | [skhx-chart.png](skhx-chart.png) |
| 2026-11-05 (Thu) ~21:30 | Naver 종목토론방 삼성전자 (`naver_jongto`) | [431708763](https://stock.naver.com/domestic/stock/005930/discussion/431708763) — **deleted within minutes** | A (forecast) | `smsn_thu_A` | (posted by the owner directly) | — |

## Notes

- Naver 종목토론방: the post was gone ("이미 삭제되었거나 존재하지 않는 토론글입니다") minutes after posting.
  Its rules ban ads/promotion ("광고, 홍보, 도배"), and the body URL was not turned into a link, so even a surviving post
  would only bring copy-paste visits. Reposting with a link risks limits on the account; if Naver is retried, post
  numbers and the screenshot only (visits then show up as direct traffic, not `naver_jongto`).
- The 21:21 post went to the 주식 갤러리 but carries `utm_source=dc_skhynix` (the link was drafted for the SK하이닉스 minor
  gallery). Read `dc_skhynix` as "주식 갤러리, B post"; `utm_content=skhx_thu_B` identifies it on its own.
- A third post (특이점 주식 minor gallery, A) was drafted and skipped: same message as post 1, and the gallery is small.
- **DC view counts for the 2026-11-05 posts are not usable**: the owner refreshed the posts, which inflates DC's view
  counter. Skip the acquisition step (visits ÷ post views) for these posts; judge them by GA visitors and returns only.
- The DC body link is `http://bamsai.kr/?utm_…`; it 308-redirects to https with the UTM query intact (checked).
- Numbers move every few seconds overnight; each post's text matches the screenshot taken just before posting.

## Baseline 2026-11-05 21:29 KST (subtract at the next readout)

The owner's refreshes and test visits are in these numbers, so later readouts use only the increase since this point.

| Post | DC views | DC upvotes | Comments |
|---|---|---|---|
| [7334766](https://gall.dcinside.com/board/view/?id=neostock&no=7334766) (A, `smsn_thu_A`) | 23 | 1 | 0 |
| [7334780](https://gall.dcinside.com/board/view/?id=neostock&no=7334780) (B, `skhx_thu_B`) | 52 | 1 | 0 |

GA at the same moment (realtime, last 30 min): 4 active users, all desktop — likely the owner and test browsers, not
community visitors. Events: page_view 8, prediction_view 5, user_engagement 4, scroll 3, first_visit 2,
session_start 2, arb_view 1. Standard (non-realtime) GA reports were still empty: a new property needs up to 24–48 h.

## Readout 2026-11-06 (Fri) 10:13 KST

| | A `smsn_thu_A` | B `skhx_thu_B` |
|---|---|---|
| DC views since baseline | +29 | +54 |
| Upvotes / comments since baseline | +0 / 0 | +0 / 0 |
| GA users with this `utm_source` | 0 (`dc_stock`) | 0 (`dc_skhynix`) |

- GA standard report (11/05–11/06, partial for today): every session is `(direct)` except `cli_test` (our test) and one
  `naver_jongto / smsn_thu_A` (someone copied the URL from the deleted Naver post). No DC-tagged visit at all.
- Page views between 06:00 and 08:00 on 11/06: none (hour dimension; the custom `kst_window` dimension is not registered yet).
- **Likely cause found**: Vercel's CDN cached API responses that Fly compressed with zstd and served them to browsers that
  did not ask for zstd (`Accept-Encoding: gzip, deflate, br`, e.g. older iPhone Safari). Those browsers cannot read the
  JSON and stay on the skeleton. Checked 15 requests with an iPhone Safari profile: 10 came back zstd. Fix pending.
- Forecast in the posts was a 21:00 snapshot; Hyperliquid kept falling overnight (SMSN 200,569 → 182,326 KRW by 07:00).
  Actual 08:00–08:10 VWAP: SMSN 177,495 (−11.9%), SKHX 1,086,809 (−13.9%). Direction right by the open, size larger.
- Decision: no conclusion on H2 (0 tracked visitors). Fix the compression bug, register GA custom dimensions, exclude the
  owner's IP, then repost.

