import { expect, kst, test } from './mock'

const IN_SESSION = ['국내 지금', '미국장 닫힌 뒤 · 국내 개장 직전 글로벌 가격']

test('home: three stock cards and the spread list', async ({ page, api }) => {
  await page.clock.install({ time: api.data.status.now })
  await page.goto('/')

  const cards = page.getByRole('link', { name: /차트·자세히/ })
  await expect(cards).toHaveCount(3)
  for (const label of IN_SESSION) await expect(page.getByText(label, { exact: true })).toHaveCount(3)

  const rows = page.locator('.easy-list').getByRole('link')
  await expect(rows).toHaveCount(3)
  for (const row of await rows.all()) await expect(row).toContainText(/\+[\d,]+원|아직 시세차익 기회가 없어요/)
})

test('home: cards switch to the closed labels at 20:00 KST', async ({ page, api }) => {
  await page.clock.install({ time: kst('2026-11-06T19:59:00') })
  await page.goto('/')
  for (const label of IN_SESSION) await expect(page.getByText(label, { exact: true })).toHaveCount(3)

  // What the server answers once Nextrade closes: session closed, forecasts ready
  api.data.status = { ...api.data.status, session: 'closed' }
  api.data.predict = { items: api.data.predict.items.map((p: object) => ({ ...p, status: 'pre-open', preOpen: null })) }
  const before = api.requests.filter((r) => r.url === '/api/v1/predict').length

  // 20:00 boundary + the 2 s the page waits before refetching
  await page.clock.fastForward('01:30')
  await expect.poll(() => api.requests.filter((r) => r.url === '/api/v1/predict').length).toBeGreaterThan(before)
  await expect(page.getByText('국내 종가', { exact: true })).toHaveCount(3)
  await expect(page.getByText(/^지금 글로벌 가격/)).toHaveCount(3)
  await expect(page.getByText(IN_SESSION[0], { exact: true })).toHaveCount(0)
})

test('server restarting: the page keeps loading and fills in once the API is back, no error text', async ({ page, api }) => {
  await page.clock.install({ time: api.data.status.now })
  // Like a deploy: the first answers are 503 HTML pages from the proxy
  api.down.predict = 3
  api.down.arb = 3
  await page.goto('/')
  await expect(page.getByText(/요청 실패|Unexpected token|불러오지 못/)).toHaveCount(0)
  // Retries back off 1s, 2s, 4s. Each retry timer is set only after the previous (real) response arrives, which can be
  // after a single long runFor has returned, so step the clock until the page has filled in
  const cards = page.getByRole('link', { name: /차트·자세히/ })
  await expect
    .poll(async () => {
      await page.clock.runFor(1000)
      return cards.count()
    })
    .toBe(3)
  await expect(page.getByText(/요청 실패|Unexpected token|불러오지 못/)).toHaveCount(0)
})

test.describe('iPhone width', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true })

  test('home: header search and bottom strip stay inside the screen', async ({ page, api }) => {
    await page.clock.install({ time: api.data.status.now })
    await page.goto('/')
    await expect(page.getByRole('link', { name: /차트·자세히/ })).toHaveCount(3)

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393)
    // Search collapses to an icon button that fits the header
    const search = page.getByRole('button', { name: '종목 검색' })
    await expect(search).toBeVisible()
    await expect(page.getByText('를 눌러 검색하세요')).toBeHidden()
    const s = (await search.boundingBox())!
    expect(s.x + s.width).toBeLessThanOrEqual(393)
    expect(s.width).toBeLessThanOrEqual(40)
    // Bottom strip: the whole box is on screen; what does not fit scrolls sideways inside it
    const ticker = page.locator('.ticker')
    const t = (await ticker.boundingBox())!
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x + t.width).toBeLessThanOrEqual(393)
    expect(t.y + t.height).toBeLessThanOrEqual(852)
    expect(await ticker.evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto')
  })
})
