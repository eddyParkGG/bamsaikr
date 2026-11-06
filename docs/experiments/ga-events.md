# GA4 events and parameters

Source of truth: `src/lib/ga.ts` (`GaEvent` union). Every event also carries `kst_window`.
Nothing is sent without `VITE_GA_ID` (local dev logs events to the console instead).

## Global

| Name | Type | Values | Set in |
|---|---|---|---|
| `kst_window` | event param (all events and `page_view`) | `preopen` 06–08 (before the 08:00 re-open), `premarket` 08–09 (Nextrade only), `regular` 09–15:30, `after` 15:30–20, `night` 20–06, `weekend` | `kstWindow()` |
| `first_source` | user property | first `utm_source` seen, else `(direct)` | `initGa()` → `firstTouch()` |
| `first_content` | user property | first `utm_content` (asset_day_variant) | same |

`page_view` is sent manually on load and on every in-app navigation (`src/main.tsx`, `src/lib/router.tsx`);
the default automatic page view is off.

## Events

| Event | Fired when | Where | Params | Used by |
|---|---|---|---|---|
| `prediction_view` | Forecasts load on home / a stock detail | `pages/EasyHome.tsx`, `pages/ProTerminal.tsx` | `from` (`home`/`stock`), `asset`, `session`, `stage` (US session: `before`/`during`/`after`), `follow_rate`, `ready` | H2 activation, H3 denominator |
| `prediction_detail_open` | A stock row on home is clicked | `pages/EasyHome.tsx` | `asset`, `from` | H2 activation |
| `model_explain_open` | 개장 예측 or 예측 기록 tab opened, or 자세히 on the chart's 내일 아침 예상 note | `pages/ProTerminal.tsx` | `asset`, `tab` (`predict`/`conv`), `from` (`chart` for the note) | H3 |
| `convergence_view` | 예측 기록 tab opened | `pages/ProTerminal.tsx` | `asset` | H3 detail |
| `arb_view` | Spread data shown on a stock detail | `pages/ProTerminal.tsx` | `asset`, `net_pct`, `mode` | H4 step 1 |
| `arb_cta_click` | 시세차익 내기 on the chart's spread note (only shown when there is a spread to take) | `pages/ProTerminal.tsx` | `asset`, `from` (`chart`), `net_pct` | H4 |
| `order_submit` | Any order button (orders not live; opens the launch sheet) | `pro/OrderPanel.tsx` | `market`, `side`, `asset`, `kind`, `leverage` | H4 step 2 |
| `launch_notify_signup` | Valid email submitted on the launch sheet (not stored) | `components/LaunchNotify.tsx` | `what` | H4 step 3 (key event) |
| `asset_switch` | Asset picked in the search | `components/AssetSearch.tsx` | `asset`, `query` (`typed`/`list`) | navigation |
| `news_open` | News pin or today's issue opened | `pages/ProTerminal.tsx`, `components/TodayIssue.tsx` | `asset`, `date`, `kind`, `from` | engagement |
| `chart_market_toggle` | 국내 시장 / 하이퍼리퀴드 toggled on the chart | `pages/ProTerminal.tsx` | `market`, `on` | chart usage |
| `chart_indicator_toggle` | Indicator toggled | `pages/ProTerminal.tsx` | `indicator`, `on` | chart usage |
| `chart_interval_change` | Interval changed | `pages/ProTerminal.tsx` | `interval` | chart usage |
| `api_docs_view` | API menu clicked | `components/Header.tsx` | — | H5 |
| `mcp_copy` | MCP config copied | `pages/Developers.tsx` | — | H5 |

## GA4 admin setup

1. Admin → Data streams → Web → copy the measurement ID (`G-…`) into Vercel env `VITE_GA_ID`, redeploy.
2. Admin → Custom definitions
   - Event-scoped: `kst_window`, `asset`, `from`, `market`, `tab`, `mode`, `side`
   - Event-scoped metric: `net_pct`, `follow_rate`
   - User-scoped: `first_source`, `first_content`
3. Admin → Key events: `launch_notify_signup`, `order_submit`, `model_explain_open`.
4. Explorations
   - H2: Cohort — return criterion `page_view` with `kst_window = preopen`, breakdown `first_source`
   - H3: Funnel — `prediction_view` → `model_explain_open`
   - H4: Funnel — `arb_view` → `order_submit` → `launch_notify_signup`, breakdown `market`

## Changing events

Add the name to `GaEvent` in `src/lib/ga.ts`, fire it with `track()`, then add a row here and to the hypothesis doc
that reads it. Remove names that no longer fire (the type keeps the list honest).
