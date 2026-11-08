// Oracle-anomaly guard.
// trade.xyz perps follow an oracle: the underlying market's own prints while it is open, an internal price
// while it is closed. One thin print on the underlying (2026-07-28 08:00, a single SK hynix share at the
// limit-down on Nextrade) moves the oracle, the perp follows within a minute (−17.9%) and liquidations
// cascade. Such a window should not drive the displayed overnight price, so:
//   - detect it from the perp ctx (mid / mark vs oracle) and the last 30 one-minute candles,
//   - cross-check with the Korea-wide perps (EWY, KR200): if they moved the same way in that minute,
//     it was a real market move, not a single-stock oracle glitch,
//   - while it lasts, the forecast uses a robust price (median of the window's 1m closes) instead of the mid.
// The arbitrage numbers stay on the real order book (that is what fills); they only carry a warning.
import { ASSET_BY_ID, type Asset } from '../../shared/assets.js'
import { cached } from '../lib/cache.js'
import { getPerpCandles, getPerpCtxs, type Candle } from '../sources/hyperliquid.js'
import { getUsdcKrw } from '../sources/upbit.js'

/** |mid − oracle| or |mark − oracle| over the oracle, in %, at or above which the price is off its oracle */
export const ORACLE_GAP_PCT = 3
/** One 1-minute candle reaching this far (%) from the previous close is a spike, whatever the volume */
export const SPIKE_1M_PCT = 5
/** A smaller jump (%) still counts when the candle had THIN_TRADES trades or fewer */
export const THIN_SPIKE_PCT = 2
export const THIN_TRADES = 3
/** Stock perp move minus the EWY/KR200 move in the same minute (%p) at or above which the move is stock-only */
export const INDEX_DIVERGENCE_PCT = 4
/** Look-back window (minutes): spikes inside it keep the flag on; the robust price is the median close over it */
export const WINDOW_MIN = 30
/** Fewer 1m candles than this in the window: use the last WINDOW_MIN candles; fewer than this in all: no robust price */
const MIN_BARS = 5

export type AnomalyReason = 'oracle_gap' | 'spike_1m' | 'thin_spike' | 'index_divergence'

export const REASON_TEXT: Record<AnomalyReason, string> = {
  oracle_gap: `가격이 오라클 가격과 ${ORACLE_GAP_PCT}% 이상 벌어짐`,
  spike_1m: `1분 만에 ${SPIKE_1M_PCT}% 이상 움직임`,
  thin_spike: `체결 ${THIN_TRADES}건 이하로 ${THIN_SPIKE_PCT}% 이상 움직임`,
  index_divergence: `코스피200·한국 ETF와 ${INDEX_DIVERGENCE_PCT}%p 이상 다르게 움직임`,
}

export interface AnomalyInput {
  mid: number
  mark: number
  oracle: number
  /** 1-minute candles of the perp, ascending (at least the last WINDOW_MIN minutes) */
  bars: Candle[]
  /** 1-minute candles of the cross-check perps (EWY, KR200); empty arrays are skipped */
  index: Candle[][]
  now: number
}

export interface AnomalyResult {
  active: boolean
  reasons: AnomalyReason[]
  /** Start of the first spike candle in the window (or now for an oracle gap alone) */
  since: number | null
  /** Median of the window's 1-minute closes (perp units); the last WINDOW_MIN candles when the window is sparse */
  robustPx: number | null
  /** Largest 1-minute move in the window (%, signed) and the cross-check perps' move in that minute */
  movePct: number | null
  indexMovePct: number | null
  /** max(|mid − oracle|, |mark − oracle|) / oracle (%) */
  oracleGapPct: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Signed move (%) of bars[i] from the previous close to its extreme in `dir` (or the larger extreme) */
function barMove(bars: Candle[], i: number, dir?: 1 | -1): number {
  const b = bars[i]
  const ref = i > 0 ? bars[i - 1].c : b.o
  const up = (b.h / ref - 1) * 100
  const down = (b.l / ref - 1) * 100
  if (dir === 1) return up
  if (dir === -1) return down
  return Math.abs(down) > Math.abs(up) ? down : up
}

/** Pure detection on one snapshot; see the constants above for the rules */
export function detectOracleAnomaly({ mid, mark, oracle, bars, index, now }: AnomalyInput): AnomalyResult {
  const from = now - WINDOW_MIN * 60_000
  const reasons: AnomalyReason[] = []
  let since: number | null = null

  const oracleGapPct = oracle > 0 ? Math.max(Math.abs(mid / oracle - 1), Math.abs(mark / oracle - 1)) * 100 : 0
  if (oracleGapPct >= ORACLE_GAP_PCT) reasons.push('oracle_gap')

  // Spikes inside the window; remember the largest one for the index cross-check
  let spike = false
  let thin = false
  let top = -1
  let topMove = 0
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].t < from) continue
    const m = barMove(bars, i)
    if (Math.abs(m) > Math.abs(topMove)) {
      topMove = m
      top = i
    }
    const isSpike = Math.abs(m) >= SPIKE_1M_PCT
    const isThin = !isSpike && Math.abs(m) >= THIN_SPIKE_PCT && (bars[i].n ?? Infinity) <= THIN_TRADES
    if (isSpike) spike = true
    if (isThin) thin = true
    if ((isSpike || isThin) && since == null) since = bars[i].t
  }

  // Same minute on EWY / KR200, toward the same side as the stock's move
  let indexMovePct: number | null = null
  if (top >= 0) {
    const dir = topMove < 0 ? -1 : 1
    const moves = index.flatMap((ib) => {
      const j = ib.findIndex((k) => k.t === bars[top].t)
      return j >= 0 ? [barMove(ib, j, dir)] : []
    })
    if (moves.length) indexMovePct = moves.reduce((a, b) => a + b, 0) / moves.length
  }
  const divergent = indexMovePct != null && Math.abs(topMove - indexMovePct) >= INDEX_DIVERGENCE_PCT
  // The whole market moved with it (index within INDEX_DIVERGENCE_PCT): a real move, not an oracle glitch
  const confirmedByIndex = indexMovePct != null && !divergent
  if ((spike || thin) && !confirmedByIndex) {
    if (spike) reasons.push('spike_1m')
    if (thin) reasons.push('thin_spike')
    if (divergent) reasons.push('index_divergence')
  }

  const active = reasons.length > 0
  if (active && since == null) since = now
  // Sparse trading (fewer than MIN_BARS candles in the window): the last WINDOW_MIN candles available instead
  const inWindow = bars.filter((k) => k.t >= from && k.c > 0)
  const closes = (inWindow.length >= MIN_BARS ? inWindow : bars.filter((k) => k.c > 0 && k.t < now).slice(-WINDOW_MIN)).map((k) => k.c)
  const r2 = (x: number) => Math.round(x * 100) / 100
  return {
    active,
    reasons,
    since: active ? since : null,
    robustPx: closes.length >= MIN_BARS ? median(closes) : null,
    movePct: top >= 0 ? r2(topMove) : null,
    indexMovePct: indexMovePct == null ? null : r2(indexMovePct),
    oracleGapPct: r2(oracleGapPct),
  }
}

export interface OracleAnomaly extends AnomalyResult {
  /** robustPx in KRW (USDC × Upbit rate for USDC-quoted perps) */
  robustKrw: number | null
  /** Plain-language reasons for display */
  reasonText: string[]
}

const CROSS = [ASSET_BY_ID.EWY.perp, ASSET_BY_ID.KR200.perp]

/**
 * Live check for one asset. Reuses the cached ctx and 1m candles; the candle start is bucketed to 10 minutes
 * the same way as the arbitrage volatility, so both share one cache entry per coin
 */
export function oracleAnomaly(asset: Asset): Promise<OracleAnomaly> {
  return cached(`oracle:${asset.id}`, 10_000, async () => {
    const since = Math.floor((Date.now() - 70 * 60_000) / 600_000) * 600_000
    const [ctxs, bars, fx, ...index] = await Promise.all([
      getPerpCtxs(),
      getPerpCandles(asset.perp, '1m', since),
      asset.fx ? getUsdcKrw() : null,
      ...CROSS.filter((c) => c !== asset.perp).map((c) => getPerpCandles(c, '1m', since).catch(() => [] as Candle[])),
    ])
    const ctx = ctxs.get(asset.perp)
    if (!ctx) throw new Error(`perp 시세 없음: ${asset.perp}`)
    const r = detectOracleAnomaly({ mid: ctx.midPx ?? ctx.markPx, mark: ctx.markPx, oracle: ctx.oraclePx, bars, index, now: Date.now() })
    const krw = r.robustPx == null ? null : asset.fx ? (fx ? r.robustPx * fx.rate : null) : r.robustPx
    return { ...r, robustKrw: krw == null ? null : Math.round(krw * 100) / 100, reasonText: r.reasons.map((x) => REASON_TEXT[x]) }
  })
}

/** Shown on the arbitrage numbers while the flag is on (the numbers themselves are left as they are) */
export const ARB_WARNING = '오라클 이상 구간: 추가 급변 시 청산 위험 · 레버리지는 1~2배로 낮게 잡으세요'
