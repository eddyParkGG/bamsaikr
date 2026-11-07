# Community test posts (H2 · first run `bamsai_test1`)

Plan and metrics: [H2](../H2-preopen-return.md). One row per post; read GA4 by `first_source` / `first_content`.
H2 counts all visits from 2026-11-06 00:00 KST (internal traffic excluded); UTM only compares posts.

| Posted (KST) | Channel | Post | Message | `utm_content` | Numbers in the post | Image |
|---|---|---|---|---|---|---|
| 2026-11-05 (Thu) ~21:15 | DC 주식 갤러리 (`dc_stock`) | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7334766&page=1) | A (forecast) | `smsn_thu_A` | 삼전 202,100 (+0.3%) up 56% · 하닉 1,263,400 (+0.1%) up 52% | [smsn-chart.png](smsn-chart.png) |
| 2026-11-05 (Thu) 21:21 | DC 주식 갤러리 | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7334780&page=1) | B (fact) | `skhx_thu_B` (source tag `dc_skhynix`, see notes) | 하닉 −9.6% today; Hyperliquid +0.1% vs close 1,262,000 | [skhx-chart.png](skhx-chart.png) |
| 2026-11-06 (Fri) 10:25 | DC 주식 갤러리 | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7335194&page=1) | Result (last night's forecast vs actual open) | `result_fri_A` | 21:00 삼전 +0.3% 하닉 +0.1% → HL 07:00 −9.5% / −8% → actual 08:00–08:10 −11.9% / −13.9% | none (text only) |
| 2026-11-06 (Fri) 12:07 | DC 주식 갤러리 | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7335294&page=1) | Fact, in session (Hyperliquid right before the open vs live domestic price) | `smsn_fri_lunch` | 삼전 HL before 08:00 181,500 (−9.9%) → low 175,300 (−13%) → 12:01 194,500 (−3.5%); 하닉 HL −9.5% → low −15% → −5.4% | [smsn-lunch.png](smsn-lunch.png) (full service screen, local build) |
| 2026-11-06 (Fri) 15:06 | DC 주식 갤러리 | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7335439&page=1) | Fact, in session (pre-open Hyperliquid price vs where the domestic price ended up) | `skhx_fri_close` | 하닉 HL before 08:00 114.9만 → low 107만 → 15:01 114.1만; 삼전 18.2만 → low 17.5만 → 19.0만 | [skhx-fri-close.png](skhx-fri-close.png) (full service screen) |
| 2026-11-06 (Fri) 19:34 | DC 미국 주식 (`dc_stockus`) | [view](https://gall.dcinside.com/mgallery/board/view/?id=stockus&no=18285195&page=1) | **Maker disclosed** ("궁금해서 직접 사이트 만들어봤는데"), fact | `skhx_fri_eve_maker` | 하닉 HL before 08:00 114.9만 → low 107만 → 19:30 117.3만; past direction hit 85%+ for the post-US-close price | [fri-eve.png](fri-eve.png) |
| 2026-11-06 (Fri) 19:33 | DC 한국 주식 (krstock) | [view](https://gall.dcinside.com/mgallery/board/view/?id=krstock&no=3851986&page=1) | Fact, **no link** (gallery bans promoting your own site) | — | 삼전 18.2만 → 17.5 → 19.3 / 하닉 114.9 → 107 → 117.3 | [fri-eve.png](fri-eve.png) |
| 2026-11-07 (Sat) 10:23 | DC 미국 주식 (`dc_stockus`) | [view](https://gall.dcinside.com/mgallery/board/view/?id=stockus&no=18290189&page=1) | Fact, weekend after the US close | `smsn_sat_am` | 삼전 19.3만 (−0.15%) / 하닉 117.7만 (+0.08%) vs Friday close; "Friday −6% already priced in" | [sat-am.png](sat-am.png) |
| 2026-11-07 (Sat) 10:24 | DC 한국 주식 (krstock) | [view](https://gall.dcinside.com/mgallery/board/view/?id=krstock&no=3853821&page=1) | Fact, **no link** | — | same numbers; past weekend follow rate 삼전 70%, 하닉 76%, "basically flat" | [sat-am.png](sat-am.png) |
| 2026-11-07 (Sat) 10:25 | DC 주식 갤러리 (`dc_stock`) | [view](https://gall.dcinside.com/board/view/?id=neostock&no=7336093&page=1) | Fact, weekend after the US close | `skhx_sat_am` | 하닉 117.7만 (+0.08%) / 삼전 19.31만 (−0.15%); past weekend follow 76% / 70%, "too small to mean much" | [sat-am.png](sat-am.png) |
| 2026-11-07 (Sat) 12:50 | DC 미국 주식 (`dc_stockus`) | [view](https://gall.dcinside.com/mgallery/board/view/?id=stockus&no=18291586&page=1) | **Check format**: last 6 Mondays, overseas move vs actual open (4 of 6 right, misses shown) + this weekend live number | `skhx_sat_noon_check` | 하닉 HL 118.6만 (+0.9% vs Fri close 117.6만); night volume $268.6M (2× usual) | [sat-noon.png](sat-noon.png) |
| 2026-11-07 (Sat) 12:50 | DC 한국 주식 (krstock) | [view](https://gall.dcinside.com/mgallery/board/view/?id=krstock&no=3854301&page=1) | **Question format**, no link: "월요일 하닉 어디서 시작할 거 같음?" | — | 하닉 118.6만 (+0.9%), 삼전 19.44만 (+0.5%); last Monday was a miss (+1.1% → −2.1%) | [sat-noon.png](sat-noon.png) |
| 2026-11-05 (Thu) ~21:30 | Naver 종목토론방 삼성전자 (`naver_jongto`) | [431708763](https://stock.naver.com/domestic/stock/005930/discussion/431708763) — **deleted within minutes** | A (forecast) | `smsn_thu_A` | (posted by the owner directly) | — |

## Notes

- 11/06 12:07 lunch post: the image is the new screen from the local build; bamsai.kr still served the previous release (with '오를 확률') until main is deployed, so early visitors may see a different screen. Views at 12:08 = 1 (our own check).
- 11/06 15:06 post: title ends with "ㅋㅋ", image placed above the text (later posts put it below). Views at 15:07 = 1 (our own check).
- 11/06 19:33–19:34 posts: same time, two galleries. stockus says we built the site (one-off test), krstock has no link because its notice bans promoting your own site/program. Market was down that day, so neither post teases readers. Views at 19:40: stockus 31, krstock 44.
- 11/07 10:23–10:25 posts: the 07:30 slot, posted late. Overseas prices sat within 0.2% of Friday's close, so the posts say the direction means little this time. Views at ~10:30: stockus 36, krstock 30, neostock 8.
- 11/07 12:50 posts: reposted in the two fast galleries once the morning posts were well past page 5 (stockus ~20 min per 5 pages, krstock ~75 min), with new formats to lift clicks. Views a few minutes later: stockus 12, krstock 7.

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
- 10:28 prices for comparison: SMSN 186,500 (−7.4% vs 201,500), SKHX 1,131,000 (−10.5% vs 1,264,000) — both rebounded from
  the 08:00–08:10 low toward where Hyperliquid stood at 07:00.
- DC shows its own outbound-link warning on these posts (`OutLink.renderOutLinkWarning`), one more step before the visit.
- Decision: no conclusion on H2 (0 tracked visitors). Fix the compression bug, register GA custom dimensions, exclude the
  owner's IP, then repost.

