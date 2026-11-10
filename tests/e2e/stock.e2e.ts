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

test('table tabs: the bottom fade shows only while more rows are below', async ({ page }) => {
  await page.goto('/s/SKHX')
  await page.getByRole('tab', { name: '지난 개장 기록' }).click()
  const wrap = page.locator('.panel--fill .table-wrap')
  await expect(wrap.locator('tbody tr').first()).toBeVisible()
  await expect(wrap).toHaveAttribute('data-fade-bottom')
  await wrap.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(wrap).not.toHaveAttribute('data-fade-bottom')
})

test.describe('iPhone width', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true })

  test('stock: compact head, 정보 tab, indicator menu opens whole, full-window chart fills the screen', async ({ page }) => {
    await page.goto('/s/SKHX')
    await chartReady(page, '1d')
    // Head: the domestic and Hyperliquid prices side by side; the stats strip and the issue line are not above the chart
    const quote = page.locator('.quote2')
    await expect(quote.getByText('국내 시장')).toBeVisible()
    await expect(quote.getByText('하이퍼리퀴드 환산')).toBeVisible()
    await expect(page.locator('.stock-head dl.stats')).toBeHidden()
    await expect(page.locator('.issue-inline')).toHaveCount(0)
    // They are in the 정보 tab instead, as a list
    await page.getByRole('tab', { name: '정보' }).click()
    await expect(page.locator('dl.stats--list')).toContainText('하이퍼리퀴드 범위')
    await expect(page.locator('.info-tab .issue')).toBeVisible()
    await page.getByRole('tab', { name: '차트·호가' }).click()
    await chartReady(page, '1d')
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
    // One close button, at least 44px, inside the screen's top-right corner; it brings the page back
    const exit = page.getByRole('button', { name: '차트 작게 보기' })
    await expect(exit).toHaveCount(1)
    const eb = (await exit.boundingBox())!
    expect(eb.width).toBeGreaterThanOrEqual(44)
    expect(eb.height).toBeGreaterThanOrEqual(44)
    expect(eb.x + eb.width).toBeLessThanOrEqual(393)
    expect(eb.y).toBeGreaterThanOrEqual(0)
    expect(eb.y).toBeLessThan(60)
    await exit.click()
    await expect(page.locator('.pro-chart--full')).toHaveCount(0)
  })

  test('search: no keyboard hints on a phone, the list heading stays one line, rows are tall enough to tap', async ({ page }) => {
    await page.goto('/s/SKHX')
    await page.getByRole('button', { name: '종목 검색' }).click()
    const dialog = page.getByRole('dialog', { name: '종목 검색' })
    await expect(dialog.getByRole('option').first()).toBeVisible()
    await expect(dialog.locator('.search__foot')).toBeHidden()
    await expect(dialog.locator('.search__enter').first()).toBeHidden()
    const head = (await dialog.locator('.search__head').boundingBox())!
    expect(head.height).toBeLessThanOrEqual(42)
    for (const row of await dialog.getByRole('option').all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(393)
    expect(box.y + box.height).toBeLessThanOrEqual(852)
  })

  test('stock: chart, order book and order form take turns above the bottom switch, the page never scrolls', async ({ page }) => {
    await page.goto('/s/SKHX')
    await chartReady(page, '1d')
    const pageScroll = () => page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)
    const sw = (await page.locator('.pane-switch').boundingBox())!
    const bar = (await page.locator('.ticker').boundingBox())!
    expect(sw.y + sw.height).toBeLessThanOrEqual(bar.y)
    // Each pane fills the space from the head down to just above the switch
    const fills = async (sel: string) => {
      const b = (await page.locator(sel).boundingBox())!
      expect(sw.y - (b.y + b.height)).toBeGreaterThanOrEqual(0)
      expect(sw.y - (b.y + b.height)).toBeLessThanOrEqual(9)
      expect(await pageScroll()).toBe(0)
    }
    await expect(page.locator('.pro-trade--book')).toBeHidden()
    await fills('.pro-chart')

    const tab = (name: string) => page.locator('.pane-switch').getByRole('tab', { name, exact: true })
    await tab('호가').click()
    await expect(tab('호가')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.pro-chart')).toBeHidden()
    await fills('.pro-trade--book')
    // The order book list scrolls inside the pane, centred on the spread
    const ob = page.locator('.ob2-scroll')
    const sc = await ob.evaluate((e) => ({ over: e.scrollHeight - e.clientHeight, top: e.scrollTop }))
    expect(sc.over).toBeGreaterThan(0)
    expect(sc.top).toBeGreaterThan(0)

    await tab('주문').click()
    await expect(page.locator('.pro-trade--book')).toBeHidden()
    await fills('.pro-trade--order')
    await expect(page.getByRole('button', { name: /매수하기/ })).toBeInViewport()

    // Remembered for the session
    await page.reload()
    await expect(tab('주문')).toHaveAttribute('aria-selected', 'true')
    await tab('차트').click()

    // Other tabs scroll the page normally, without the switch
    await page.getByRole('tab', { name: '개장 전' }).click()
    await expect(page.locator('.pane-switch')).toHaveCount(0)
    await expect.poll(pageScroll).toBeGreaterThan(0)
    await page.evaluate(() => window.scrollTo(0, 300))
    // Back on 차트 · 호가: back to the top, no page scroll
    await page.getByRole('tab', { name: '차트·호가' }).click()
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    await expect.poll(pageScroll).toBe(0)
  })
})

test.describe('smallest phone width', () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true })

  test('stock: every tab stays inside 320px, tabs fit one line, panel titles do not wrap, tables fade the hidden side', async ({ page }) => {
    await page.goto('/s/SKHX')
    await chartReady(page, '1d')
    const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    // Session badge: text in the vertical middle (same space above and below)
    const skew = await page.locator('.stock-head__name > .badge').evaluate((e) => {
      const b = e.getBoundingClientRect()
      const r = document.createRange()
      r.selectNodeContents(e)
      const t = r.getBoundingClientRect()
      return Math.abs(t.top - b.top - (b.bottom - t.bottom))
    })
    expect(skew).toBeLessThanOrEqual(1)
    // All five section tabs fit without swiping
    const tabs = page.locator('.ptabs')
    await expect(tabs.getByRole('tab')).toHaveCount(5)
    expect(await tabs.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)

    // Chart, order book and order form
    for (const pane of ['차트', '호가', '주문']) {
      await page.locator('.pane-switch').getByRole('tab', { name: pane, exact: true }).click()
      expect(await overflowX()).toBeLessThanOrEqual(0)
    }
    // The order button stays reachable inside the short pane
    await expect(page.getByRole('button', { name: '매수하기' })).toBeInViewport()

    for (const name of ['개장 전', '지난 기록', '수급', '정보']) {
      await tabs.getByRole('tab', { name, exact: true }).click()
      await expect(page.locator('.panel').first()).toBeVisible()
      expect(await overflowX()).toBeLessThanOrEqual(0)
    }

    // 지난 기록: the title stays one line (the sentence is behind '?'), the count sits beside it
    await tabs.getByRole('tab', { name: '지난 기록', exact: true }).click()
    const title = page.locator('.panel--fill .panel__title')
    await expect(title).toContainText('지난 개장 기록')
    expect((await title.boundingBox())!.height).toBeLessThanOrEqual(28)
    await expect(page.locator('.panel__count')).toBeVisible()
    // The table fits the screen (no page scroll), scrolls sideways inside and fades only the hidden edge
    const wrap = page.locator('.panel--fill .table-wrap')
    await expect(wrap.locator('tbody tr').first()).toBeVisible()
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)).toBe(0)
    const fade = () => wrap.evaluate((el) => ({ over: el.scrollWidth > el.clientWidth, left: el.hasAttribute('data-fade-left'), right: el.hasAttribute('data-fade-right') }))
    await expect.poll(fade).toEqual({ over: true, left: false, right: true })
    // The pinned date column sits flush on the scroller's left edge, before and after scrolling (no gap beside it)
    const flush = async () => {
      const d = (await wrap.locator('tbody td').first().boundingBox())!
      const b = (await wrap.evaluate((el) => el.getBoundingClientRect().left + el.clientLeft))
      return Math.abs(d.x - b)
    }
    expect(await flush()).toBeLessThanOrEqual(0.5)
    // Push well past the right end with the wheel: it stops at the end, the page stays put, no overscroll
    const wb = (await wrap.boundingBox())!
    await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2)
    for (let i = 0; i < 8; i++) await page.mouse.wheel(600, 0)
    const end = () => wrap.evaluate((el) => ({ at: Math.round(el.scrollLeft), max: el.scrollWidth - el.clientWidth }))
    await expect.poll(async () => { const e = await end(); return e.at === e.max }).toBe(true)
    await page.mouse.wheel(600, 0)
    const e = await end()
    expect(e.at).toBeLessThanOrEqual(e.max)
    expect(await page.evaluate(() => scrollX)).toBe(0)
    expect(await wrap.evaluate((el) => getComputedStyle(el).overscrollBehaviorX + ' ' + getComputedStyle(el).overscrollBehaviorY)).toBe('none none')
    await expect.poll(fade).toEqual({ over: true, left: true, right: false })
    expect(await flush()).toBeLessThanOrEqual(0.5)
    // A column filter opens whole on screen, above the faded table
    await wrap.evaluate((el) => (el.scrollLeft = 0))
    await page.getByRole('button', { name: /닫혀 있던 시간/ }).click()
    const pop = (await page.getByRole('dialog', { name: '닫혀 있던 시간' }).boundingBox())!
    expect(pop.x).toBeGreaterThanOrEqual(0)
    expect(pop.x + pop.width).toBeLessThanOrEqual(320)
  })
})
