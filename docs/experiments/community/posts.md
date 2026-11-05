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
