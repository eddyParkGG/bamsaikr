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
