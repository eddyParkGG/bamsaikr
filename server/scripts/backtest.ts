// 실행: npx tsx server/scripts/backtest.ts
import { ASSETS } from '../../shared/assets.js'
import { loadHistory, predictOpen } from '../services/predict.js'
import { arbSnapshot } from '../services/arb.js'

for (const a of ASSETS) {
  const h = await loadHistory(a)
  const wk = h.events.filter((e) => e.regime === 'weekend')
  console.log(a.id, 'events', h.events.length, 'weekend', wk.length, h.backtest, 'model', { ...h.model, sigma: h.model.sigma })
  const p = await predictOpen(a)
  console.log('  now', { status: p.status, refClose: p.refClose, perpKrw: p.perpKrw, gap: p.perpGapPct, exp: p.expectedOpen, up: p.probUp, band: p.band80 })
  const s = await arbSnapshot(a)
  console.log('  arb', s.mode, s.premiumPct, s.net.netPct, s.net.executable)
}
