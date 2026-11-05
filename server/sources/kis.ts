// 한국투자증권 KIS Developers 오픈API
// https://apiportal.koreainvestment.com  /  https://github.com/koreainvestment/open-trading-api
import { cached, fetchJson } from '../lib/cache.js'

const DOMAIN = {
  prod: 'https://openapi.koreainvestment.com:9443',
  vps: 'https://openapivts.koreainvestment.com:29443',
} as const

export type KisEnv = keyof typeof DOMAIN

export function kisConfig() {
  const appKey = process.env.KIS_APP_KEY
  const appSecret = process.env.KIS_APP_SECRET
  if (!appKey || !appSecret) return null
  const env: KisEnv = process.env.KIS_ENV === 'prod' ? 'prod' : 'vps'
  const [cano, prdt] = (process.env.KIS_ACCOUNT ?? '').split('-')
  return { appKey, appSecret, env, base: DOMAIN[env], cano, prdt: prdt || '01' }
}

export const kisEnabled = () => kisConfig() !== null

// 접근토큰: 유효기간 24시간, 1분에 1회만 발급 가능 → 인스턴스 메모리에 23시간 캐시
function getToken(): Promise<string> {
  const cfg = kisConfig()!
  return cached(`kis:token:${cfg.env}`, 23 * 3600_000, async () => {
    const r = await fetchJson<{ access_token: string }>(`${cfg.base}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey: cfg.appKey, appsecret: cfg.appSecret }),
    })
    return r.access_token
  })
}

/** 웹소켓 접속키 (실시간 체결/호가 구독용) */
export function getApprovalKey(): Promise<string> {
  const cfg = kisConfig()!
  return cached(`kis:approval:${cfg.env}`, 12 * 3600_000, async () => {
    const r = await fetchJson<{ approval_key: string }>(`${cfg.base}/oauth2/Approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey: cfg.appKey, secretkey: cfg.appSecret }),
    })
    return r.approval_key
  })
}

export class KisError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

type KisRes = { rt_cd: string; msg_cd: string; msg1: string; [k: string]: unknown }

export async function kisGet<T extends KisRes>(path: string, trId: string, params: Record<string, string>): Promise<T> {
  const cfg = kisConfig()
  if (!cfg) throw new KisError('NO_KEY', 'KIS 키가 설정되지 않았어요')
  const token = await getToken()
  const res = await fetchJson<T>(`${cfg.base}${path}?${new URLSearchParams(params)}`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: cfg.appKey,
      appsecret: cfg.appSecret,
      tr_id: trId,
      custtype: 'P',
    },
  })
  if (res.rt_cd !== '0') throw new KisError(res.msg_cd, res.msg1)
  return res
}

export async function kisPost<T extends KisRes>(path: string, trId: string, body: Record<string, string>): Promise<T> {
  const cfg = kisConfig()
  if (!cfg) throw new KisError('NO_KEY', 'KIS 키가 설정되지 않았어요')
  const token = await getToken()
  const res = await fetchJson<T>(`${cfg.base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: cfg.appKey,
      appsecret: cfg.appSecret,
      tr_id: trId,
      custtype: 'P',
    },
    body: JSON.stringify(body),
  })
  if (res.rt_cd !== '0') throw new KisError(res.msg_cd, res.msg1)
  return res
}

// ───────── 시세 ─────────
// FID_COND_MRKT_DIV_CODE: J=KRX, NX=넥스트레이드, UN=통합, U=업종(지수)

export type KisMarket = 'J' | 'NX' | 'UN'

export interface KisQuote {
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  volume: number
  tradeValue: number
  changePct: number
  viActive: boolean
}

/** 주식현재가 시세 FHKST01010100 */
export function kisQuote(code: string, market: KisMarket = 'UN'): Promise<KisQuote> {
  return cached(`kis:quote:${market}:${code}`, 1000, async () => {
    const r = await kisGet<KisRes & { output: Record<string, string> }>(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      { FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code },
    )
    const o = r.output
    return {
      price: +o.stck_prpr,
      prevClose: +o.stck_sdpr,
      open: +o.stck_oprc,
      high: +o.stck_hgpr,
      low: +o.stck_lwpr,
      volume: +o.acml_vol,
      tradeValue: +o.acml_tr_pbmn,
      changePct: +o.prdy_ctrt,
      viActive: o.vi_cls_code !== 'N' && !!o.vi_cls_code,
    }
  })
}

/** 업종(지수) 현재가 FHPUP02100000 */
export function kisIndexQuote(code: string) {
  return cached(`kis:index:${code}`, 1000, async () => {
    const r = await kisGet<KisRes & { output: Record<string, string> }>(
      '/uapi/domestic-stock/v1/quotations/inquire-index-price',
      'FHPUP02100000',
      { FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: code },
    )
    const o = r.output
    const price = +o.bstp_nmix_prpr
    const change = +o.bstp_nmix_prdy_vrss
    return {
      price,
      prevClose: price - change,
      open: +o.bstp_nmix_oprc,
      high: +o.bstp_nmix_hgpr,
      low: +o.bstp_nmix_lwpr,
      volume: +o.acml_vol,
      tradeValue: +o.acml_tr_pbmn,
      changePct: +o.bstp_nmix_prdy_ctrt,
      viActive: false,
    } satisfies KisQuote
  })
}

/** 호가 + 예상체결가 FHKST01010200 */
export function kisOrderbook(code: string, market: KisMarket = 'J') {
  return cached(`kis:book:${market}:${code}`, 800, async () => {
    const r = await kisGet<KisRes & { output1: Record<string, string>; output2: Record<string, string> }>(
      '/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn',
      'FHKST01010200',
      { FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code },
    )
    const o = r.output1
    const asks = []
    const bids = []
    for (let i = 1; i <= 10; i++) {
      asks.push({ px: +o[`askp${i}`], sz: +o[`askp_rsqn${i}`] })
      bids.push({ px: +o[`bidp${i}`], sz: +o[`bidp_rsqn${i}`] })
    }
    const e = r.output2
    return {
      asks: asks.filter((l) => l.px > 0),
      bids: bids.filter((l) => l.px > 0),
      expected: e?.antc_cnpr ? { price: +e.antc_cnpr, volume: +e.antc_vol, changePct: +e.antc_cntg_prdy_ctrt } : null,
    }
  })
}

/** 일봉 FHKST03010100 (최대 100개) */
export async function kisDaily(code: string, from: string, to: string) {
  const r = await kisGet<KisRes & { output2: Record<string, string>[] }>(
    '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    'FHKST03010100',
    { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_DATE_1: from, FID_INPUT_DATE_2: to, FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '0' },
  )
  return r.output2
    .filter((k) => k.stck_bsop_date)
    .map((k) => ({ date: k.stck_bsop_date, o: +k.stck_oprc, h: +k.stck_hgpr, l: +k.stck_lwpr, c: +k.stck_clpr, v: +k.acml_vol }))
}

/** 일별 분봉 FHKST03010230 (해당 일자, 지정 시각 이전 120개) */
export async function kisMinutes(code: string, date: string, hhmmss: string, market: KisMarket = 'J') {
  const r = await kisGet<KisRes & { output2: Record<string, string>[] }>(
    '/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice',
    'FHKST03010230',
    { FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code, FID_INPUT_HOUR_1: hhmmss, FID_INPUT_DATE_1: date, FID_PW_DATA_INCU_YN: 'Y', FID_FAKE_TICK_INCU_YN: '' },
  )
  return r.output2
    .filter((k) => k.stck_bsop_date)
    .map((k) => ({ date: k.stck_bsop_date, time: k.stck_cntg_hour, o: +k.stck_oprc, h: +k.stck_hgpr, l: +k.stck_lwpr, c: +k.stck_prpr, v: +k.cntg_vol }))
}

/** 국내휴장일조회 CTCA0903R (실전 전용, 1일 1회 권장) */
export function kisHolidays(baseDate: string) {
  return cached(`kis:holiday:${baseDate}`, 12 * 3600_000, async () => {
    const r = await kisGet<KisRes & { output: { bass_dt: string; opnd_yn: string }[] }>(
      '/uapi/domestic-stock/v1/quotations/chk-holiday',
      'CTCA0903R',
      { BASS_DT: baseDate, CTX_AREA_NK: '', CTX_AREA_FK: '' },
    )
    return r.output.map((d) => ({ date: d.bass_dt, open: d.opnd_yn === 'Y' }))
  })
}

export interface KisNews {
  date: string
  time: string
  title: string
  source: string
  id: string
}

/** 종합 시황/공시 제목 FHKST01011800 */
export function kisNews(code: string, date = '') {
  return cached(`kis:news:${code}:${date}`, 60_000, async () => {
    const r = await kisGet<KisRes & { output: Record<string, string>[] }>(
      '/uapi/domestic-stock/v1/quotations/news-title',
      'FHKST01011800',
      { FID_NEWS_OFER_ENTP_CODE: '', FID_COND_MRKT_CLS_CODE: '', FID_INPUT_ISCD: code, FID_TITL_CNTT: '', FID_INPUT_DATE_1: date, FID_INPUT_HOUR_1: '', FID_RANK_SORT_CLS_CODE: '', FID_INPUT_SRNO: '' },
    )
    return r.output.map<KisNews>((n) => ({
      date: n.data_dt,
      time: n.data_tm,
      title: n.hts_pbnt_titl_cntt,
      source: n.dorg,
      id: n.cntt_usiq_srno,
    }))
  })
}

/** 투자자별 매매동향 FHKST01010900 (개인/외국인/기관 순매수) */
export function kisInvestors(code: string) {
  return cached(`kis:investor:${code}`, 60_000, async () => {
    const r = await kisGet<KisRes & { output: Record<string, string>[] }>(
      '/uapi/domestic-stock/v1/quotations/inquire-investor',
      'FHKST01010900',
      { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code },
    )
    return r.output.slice(0, 20).map((d) => ({
      date: d.stck_bsop_date,
      individual: +d.prsn_ntby_qty,
      foreign: +d.frgn_ntby_qty,
      institution: +d.orgn_ntby_qty,
    }))
  })
}

/** 종목별 프로그램매매추이(체결) FHPPG04650101 */
export function kisProgramTrade(code: string) {
  return cached(`kis:program:${code}`, 30_000, async () => {
    const r = await kisGet<KisRes & { output: Record<string, string>[] }>(
      '/uapi/domestic-stock/v1/quotations/program-trade-by-stock',
      'FHPPG04650101',
      { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code },
    )
    return r.output.slice(0, 30).map((d) => ({ time: d.bsop_hour, netQty: +d.whol_smtn_ntby_qty, netValue: +d.whol_smtn_ntby_tr_pbmn }))
  })
}

// ───────── 주문/계좌 ─────────

export type OrderSide = 'buy' | 'sell'

/** 현금 주문. 실전 TTTC0012U(매수)/TTTC0011U(매도), 모의 VTTC0012U/VTTC0011U */
export async function kisOrder(p: { code: string; side: OrderSide; qty: number; price?: number; exchange?: 'KRX' | 'NXT' | 'SOR' }) {
  const cfg = kisConfig()
  if (!cfg) throw new KisError('NO_KEY', 'KIS 키가 설정되지 않았어요')
  const prefix = cfg.env === 'prod' ? 'T' : 'V'
  const trId = `${prefix}TTC00${p.side === 'buy' ? '12' : '11'}U`
  const r = await kisPost<KisRes & { output: { ODNO: string; ORD_TMD: string; KRX_FWDG_ORD_ORGNO: string } }>(
    '/uapi/domestic-stock/v1/trading/order-cash',
    trId,
    {
      CANO: cfg.cano,
      ACNT_PRDT_CD: cfg.prdt,
      PDNO: p.code,
      ORD_DVSN: p.price ? '00' : '01', // 00 지정가, 01 시장가
      ORD_QTY: String(p.qty),
      ORD_UNPR: String(p.price ?? 0),
      EXCG_ID_DVSN_CD: cfg.env === 'prod' ? (p.exchange ?? 'SOR') : 'KRX',
      SLL_TYPE: p.side === 'sell' ? '01' : '',
      CNDT_PRIC: '',
    },
  )
  return { orderId: r.output.ODNO, branch: r.output.KRX_FWDG_ORD_ORGNO, time: r.output.ORD_TMD, message: r.msg1 }
}

/** 정정/취소 TTTC0013U */
export async function kisCancel(p: { orderId: string; branch: string; qty?: number }) {
  const cfg = kisConfig()
  if (!cfg) throw new KisError('NO_KEY', 'KIS 키가 설정되지 않았어요')
  const r = await kisPost<KisRes & { output: { ODNO: string } }>('/uapi/domestic-stock/v1/trading/order-rvsecncl', `${cfg.env === 'prod' ? 'T' : 'V'}TTC0013U`, {
    CANO: cfg.cano,
    ACNT_PRDT_CD: cfg.prdt,
    KRX_FWDG_ORD_ORGNO: p.branch,
    ORGN_ODNO: p.orderId,
    ORD_DVSN: '00',
    RVSE_CNCL_DVSN_CD: '02', // 02 취소
    ORD_QTY: String(p.qty ?? 0),
    ORD_UNPR: '0',
    QTY_ALL_ORD_YN: p.qty ? 'N' : 'Y',
    EXCG_ID_DVSN_CD: 'KRX',
  })
  return { orderId: r.output.ODNO, message: r.msg1 }
}

/** 매수가능조회 TTTC8908R */
export async function kisBuyable(code: string, price: number) {
  const cfg = kisConfig()
  if (!cfg) throw new KisError('NO_KEY', 'KIS 키가 설정되지 않았어요')
  const r = await kisGet<KisRes & { output: Record<string, string> }>('/uapi/domestic-stock/v1/trading/inquire-psbl-order', `${cfg.env === 'prod' ? 'T' : 'V'}TTC8908R`, {
    CANO: cfg.cano,
    ACNT_PRDT_CD: cfg.prdt,
    PDNO: code,
    ORD_UNPR: String(price),
    ORD_DVSN: '00',
    CMA_EVLU_AMT_ICLD_YN: 'N',
    OVRS_ICLD_YN: 'N',
  })
  return { cash: +r.output.ord_psbl_cash, maxQty: +r.output.nrcvb_buy_qty }
}

/** 주식잔고조회 TTTC8434R */
export async function kisBalance() {
  const cfg = kisConfig()
  if (!cfg) throw new KisError('NO_KEY', 'KIS 키가 설정되지 않았어요')
  const r = await kisGet<KisRes & { output1: Record<string, string>[]; output2: Record<string, string>[] }>(
    '/uapi/domestic-stock/v1/trading/inquire-balance',
    `${cfg.env === 'prod' ? 'T' : 'V'}TTC8434R`,
    {
      CANO: cfg.cano,
      ACNT_PRDT_CD: cfg.prdt,
      AFHR_FLPR_YN: 'N',
      OFL_YN: '',
      INQR_DVSN: '02',
      UNPR_DVSN: '01',
      FUND_STTL_ICLD_YN: 'N',
      FNCG_AMT_AUTO_RDPT_YN: 'N',
      PRCS_DVSN: '00',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
    },
  )
  return {
    positions: r.output1.map((p) => ({ code: p.pdno, name: p.prdt_name, qty: +p.hldg_qty, avgPrice: +p.pchs_avg_pric, price: +p.prpr, pnl: +p.evlu_pfls_amt, pnlPct: +p.evlu_pfls_rt })),
    summary: r.output2[0] ? { cash: +r.output2[0].dnca_tot_amt, totalEval: +r.output2[0].tot_evlu_amt } : null,
  }
}
