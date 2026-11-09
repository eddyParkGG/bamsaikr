import type { Page } from '@playwright/test'
import { expect, test } from './mock'

// Reads the chart through window.__chart (set by ChartController in `vite --mode test` only)
type View = { from: number; to: number; width: number; interval: string; lastIdx: number; bars: number; lastTime: number; gapPx: number; panes: number; krxUp: string }
const view = (page: Page) =>
  page.evaluate((): View | null => {
    const c = (window as any).__chart
    const ts = c?.chart.timeScale()
    const r = ts?.getVisibleLogicalRange()
    if (!r) return null
    const line = c.perpSeries.line.data()
    return {
      from: r.from,
      to: r.to,
      width: r.to - r.from,
      interval: c.interval,
      lastIdx: c.lastIdx,
      bars: line.length,
      lastTime: line.at(-1)?.time,
      // Pixels between the latest bar and the right edge of the plot
      gapPx: ts.width() - ts.logicalToCoordinate(c.lastIdx),
      panes: c.chart.panes().length,
      krxUp: c.krxSeries.options().upColor,
    }
  })

/** Wait until the chart for `interval` has data and its initial right gap */
async function chartReady(page: Page, interval: string) {
  await expect.poll(async () => {
    const v = await view(page)
    return v != null && v.interval === interval && v.bars > 0 && v.to - v.lastIdx > 1
  }).toBe(true)
  return (await view(page))!
}

test.beforeEach(async ({ page, api }) => {
  // Recording time: the last 1m bar of the fixture is 17:43 KST
  await page.clock.install({ time: api.data['series-SKHX-1m'].perp.at(-1).t + 20_000 })
})

test('stock detail: pan, zoom, interval, market toggle and a sub-pane', async ({ page }) => {
  await page.goto('/s/SKHX')
  await expect(page.locator('.chart__canvas canvas').first()).toBeVisible()
  const v0 = await chartReady(page, '1d')

  const box = (await page.locator('.chart__canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 3

  // Drag left → later bars come into view, zoom unchanged
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - 300, cy, { steps: 10 })
  await page.mouse.up()
  const v1 = (await view(page))!
  expect(v1.from).not.toBeCloseTo(v0.from, 0)
  expect(v1.width).toBeCloseTo(v0.width, 0)

  // Wheel up → zoom in
  await page.mouse.wheel(0, -400)
  await expect.poll(async () => (await view(page))!.width).toBeLessThan(v1.width - 1)

  // Interval: the chart is rebuilt with hourly bars
  await page.getByRole('button', { name: '1시간', exact: true }).click()
  await expect(page.getByRole('button', { name: '1시간', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await chartReady(page, '1h')

  // Market toggle: domestic candles turn transparent, and back
  const krx = page.locator('.chart-tools').getByRole('button', { name: '국내 시장' })
  await krx.click()
  await expect(krx).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await view(page))!.krxUp).toBe('rgba(0,0,0,0)')
  await krx.click()
  await expect.poll(async () => (await view(page))!.krxUp).not.toBe('rgba(0,0,0,0)')

  // Sub-pane indicator: RSI adds a pane with its title
  const panes = (await view(page))!.panes
  await page.locator('.chart-tools').getByRole('button', { name: /지표/ }).click()
  // Click the label side: the row also holds an 'RSI 설정' gear button, which the row's center can land on
  await page.getByRole('menuitemcheckbox', { name: /^RSI/ }).click({ position: { x: 12, y: 12 } })
  await expect.poll(async () => (await view(page))!.panes).toBe(panes + 1)
  await expect(page.locator('.pane-label', { hasText: 'RSI 14' })).toBeVisible()
})

test('stock detail: a live tick opens a new 1m bar, and a late REST response keeps it', async ({ page, api }) => {
  await page.goto('/s/SKHX')
  await page.getByRole('button', { name: '1분', exact: true }).click()
  const v0 = await chartReady(page, '1m')
  await expect.poll(() => api.hlSubs).toContainEqual({ type: 'candle', coin: 'xyz:SKHX', interval: '1m' })

  const last = api.data['series-SKHX-1m'].perp.at(-1)
  const candle = (t: number, c: number) => ({ channel: 'candle', data: { t, T: t + 59_999, s: 'xyz:SKHX', i: '1m', o: String(last.c), h: String(Math.max(c, last.c)), l: String(Math.min(c, last.c)), c: String(c), v: '1', n: 1 } })

  // Same minute: updates the last bar in place
  await api.hlSend(candle(last.t, last.c + 1))
  await page.waitForTimeout(100)
  expect((await view(page))!.bars).toBe(v0.bars)

  // Next minute: one more bar; the view moves left by one bar and keeps its gap on the right
  await api.hlSend(candle(last.t + 60_000, last.c + 2))
  await expect.poll(async () => (await view(page))!.bars).toBe(v0.bars + 1)
  const v1 = (await view(page))!
  expect(v1.lastIdx).toBe(v0.lastIdx + 1)
  expect(v1.from).toBeCloseTo(v0.from + 1, 5)
  expect(v1.to).toBeCloseTo(v0.to + 1, 5)
  expect(Math.abs(v1.gapPx - v0.gapPx)).toBeLessThan(2)

  // The REST series refreshes (every 15 s) but still ends at the old minute: the live bar must stay
  const isSeries = (r: { url: string }) => r.url === '/api/v1/series?asset=SKHX&interval=1m'
  const fetched = api.requests.filter(isSeries).length
  await page.clock.fastForward(16_000)
  await expect.poll(() => api.requests.filter(isSeries).length).toBeGreaterThan(fetched)
  await page.waitForTimeout(200)
  const v2 = (await view(page))!
  expect(v2.bars).toBe(v1.bars)
  expect(v2.lastTime).toBe(v1.lastTime)
  expect(v2.lastIdx).toBe(v1.lastIdx)
})

test('order button opens the launch sign-up and sends no order', async ({ page, api }) => {
  await page.goto('/s/SKHX')
  await page.getByRole('button', { name: '매수하기' }).click()
  const sheet = page.getByRole('dialog', { name: '주문 출시 알림' })
  await expect(sheet.getByText('주문은 곧 열려요')).toBeVisible()
  await sheet.getByPlaceholder('이메일 주소').fill('e2e@example.com')
  await sheet.getByRole('button', { name: '알림 받기' }).click()
  await expect(sheet.getByText('알림 신청을 마쳤어요')).toBeVisible()

  expect(api.requests.filter((r) => r.url.includes('/orders') || r.body?.includes('"dryRun":false'))).toEqual([])
  expect(api.requests.filter((r) => r.method !== 'GET')).toEqual([])
})

test('spread order tab: no profit figure while the domestic market is closed', async ({ page, api }) => {
  // In session (fixture): the pair tab shows the net after costs
  await page.goto('/s/SKHX')
  await page.getByRole('button', { name: '시세차익 기회' }).click()
  await expect(page.locator('.pair-box')).toContainText('비용 뺀 수익')

  // After the close the server answers with mode 'gap' (no stock leg can trade)
  api.data.arb = { ...api.data.arb, items: api.data.arb.items.map((s: object) => ({ ...s, session: 'closed', mode: 'gap' })) }
  await page.goto('/s/SKHX')
  await page.getByRole('button', { name: '시세차익 기회' }).click()
  const box = page.locator('.pair-box')
  await expect(box).toContainText('시세차익 계산은 국장 중에만 가능해요')
  await expect(box).not.toContainText('비용 뺀 수익')
  await expect(page.getByText(/예상 순이익/)).toHaveCount(0)
})

test('chart toolbar: scrolls inside its panel when narrow, fades only the hidden side', async ({ page }) => {
  // 3 columns: the chart gets what the order book and order form leave, too little for the whole toolbar
  await page.setViewportSize({ width: 1300, height: 900 })
  await page.goto('/s/SKHX')
  const tools = page.locator('.pro-chart .chart-tools')
  const state = () =>
    tools.evaluate((el) => ({
      overflows: el.scrollWidth > el.clientWidth,
      inside: el.getBoundingClientRect().right <= el.closest('.panel')!.getBoundingClientRect().right,
      left: el.hasAttribute('data-fade-left'),
      right: el.hasAttribute('data-fade-right'),
    }))
  await expect.poll(state).toEqual({ overflows: true, inside: true, left: false, right: true })
  await tools.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect.poll(state).toEqual({ overflows: true, inside: true, left: true, right: false })
  // The indicator menu is not clipped or faded by the scrolling toolbar
  await page.locator('.pro-chart .menu .chip').click()
  const pop = (await page.locator('.menu__pop').boundingBox())!
  expect(pop.height).toBeGreaterThan(200)

  // Tablet: the chart spans the page and the toolbar fits, so no fade at all
  await page.setViewportSize({ width: 1000, height: 900 })
  await expect.poll(state).toEqual({ overflows: false, inside: true, left: false, right: false })
})

test.describe('iPhone width', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true })

  test('stock: stats strip holds still, indicator menu opens whole, full-window chart fills the screen', async ({ page }) => {
    await page.goto('/s/SKHX')
    await chartReady(page, '1d')
    // Stats strip: no attribute churn on its groups while nothing changes
    const churn = await page.locator('dl.stats').evaluate(async (dl) => {
      let n = 0
      const mo = new MutationObserver((ms) => (n += ms.length))
      mo.observe(dl, { subtree: true, attributes: true })
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      mo.disconnect()
      return n
    })
    expect(churn).toBe(0)
    // Indicator menu: not clipped by the sideways-scrolling toolbar
    await page.locator('.pro-chart .menu .chip').click()
    const pop = (await page.locator('.menu__pop').boundingBox())!
    expect(pop.height).toBeGreaterThan(200)
    expect(pop.y + pop.height).toBeLessThanOrEqual(852)
    // A tap outside closes it
    await page.locator('body').dispatchEvent('mousedown')
    await expect(page.locator('.menu__pop')).toBeHidden()
    // Full-window chart covers the whole screen
    await page.getByRole('button', { name: '차트 크게 보기' }).click()
    const full = (await page.locator('.pro-chart').boundingBox())!
    expect(full.y).toBe(0)
    expect(full.height).toBe(852)
  })
})
