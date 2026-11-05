// 보조지표. 입력은 오름차순 캔들, 출력은 {t, v} (값이 없는 구간은 생략)
export interface Bar {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}
export interface Pt {
  t: number
  v: number
}

export function sma(bars: Bar[], n: number): Pt[] {
  const out: Pt[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c
    if (i >= n) sum -= bars[i - n].c
    if (i >= n - 1) out.push({ t: bars[i].t, v: sum / n })
  }
  return out
}

export function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1)
  const out: number[] = []
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

export function bollinger(bars: Bar[], n = 20, mult = 2) {
  const upper: Pt[] = []
  const mid: Pt[] = []
  const lower: Pt[] = []
  for (let i = n - 1; i < bars.length; i++) {
    let s = 0
    for (let j = i - n + 1; j <= i; j++) s += bars[j].c
    const m = s / n
    let v = 0
    for (let j = i - n + 1; j <= i; j++) v += (bars[j].c - m) ** 2
    const sd = Math.sqrt(v / n)
    const t = bars[i].t
    mid.push({ t, v: m })
    upper.push({ t, v: m + mult * sd })
    lower.push({ t, v: m - mult * sd })
  }
  return { upper, mid, lower }
}

/** 일목균형표: 전환선(9), 기준선(26), 선행스팬1·2(26 앞으로), 후행스팬(26 뒤로) */
export function ichimoku(bars: Bar[], step: number) {
  const hl = (from: number, to: number) => {
    let h = -Infinity
    let l = Infinity
    for (let i = Math.max(0, from); i <= to; i++) {
      h = Math.max(h, bars[i].h)
      l = Math.min(l, bars[i].l)
    }
    return (h + l) / 2
  }
  const tenkan: Pt[] = []
  const kijun: Pt[] = []
  const spanA: Pt[] = []
  const spanB: Pt[] = []
  const chikou: Pt[] = []
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].t
    if (i >= 8) tenkan.push({ t, v: hl(i - 8, i) })
    if (i >= 25) kijun.push({ t, v: hl(i - 25, i) })
    const future = t + 26 * step
    if (i >= 25) spanA.push({ t: future, v: (hl(i - 8, i) + hl(i - 25, i)) / 2 })
    if (i >= 51) spanB.push({ t: future, v: hl(i - 51, i) })
    if (i >= 26) chikou.push({ t: bars[i - 26].t, v: bars[i].c })
  }
  return { tenkan, kijun, spanA, spanB, chikou }
}

/** 일자별로 리셋되는 VWAP (KST 기준 날짜) */
export function vwap(bars: Bar[]): Pt[] {
  const out: Pt[] = []
  let day = -1
  let pv = 0
  let vol = 0
  for (const b of bars) {
    const d = Math.floor((b.t + 9 * 3600_000) / 86400_000)
    if (d !== day) {
      day = d
      pv = 0
      vol = 0
    }
    const typical = (b.h + b.l + b.c) / 3
    pv += typical * b.v
    vol += b.v
    if (vol > 0) out.push({ t: b.t, v: pv / vol })
  }
  return out
}

export function rsi(bars: Bar[], n = 14): Pt[] {
  const out: Pt[] = []
  let gain = 0
  let loss = 0
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].c - bars[i - 1].c
    const g = Math.max(d, 0)
    const l = Math.max(-d, 0)
    if (i <= n) {
      gain += g / n
      loss += l / n
      if (i === n) out.push({ t: bars[i].t, v: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) })
    } else {
      gain = (gain * (n - 1) + g) / n
      loss = (loss * (n - 1) + l) / n
      out.push({ t: bars[i].t, v: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) })
    }
  }
  return out
}

export function macd(bars: Bar[], fast = 12, slow = 26, signal = 9) {
  const closes = bars.map((b) => b.c)
  const f = ema(closes, fast)
  const s = ema(closes, slow)
  const line = closes.map((_, i) => f[i] - s[i])
  const sig = ema(line, signal)
  const start = slow - 1
  return {
    macd: line.slice(start).map((v, i) => ({ t: bars[i + start].t, v })),
    signal: sig.slice(start).map((v, i) => ({ t: bars[i + start].t, v })),
    hist: line.slice(start).map((v, i) => ({ t: bars[i + start].t, v: v - sig[i + start] })),
  }
}

// 이동평균 그물망: 짧은 것부터 긴 것까지 촘촘히
export const RIBBON = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120]
