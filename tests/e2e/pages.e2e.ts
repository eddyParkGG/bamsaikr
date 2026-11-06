import { expect, test } from './mock'

test.beforeEach(async ({ page, api }) => {
  await page.clock.install({ time: api.data.status.now })
})

test('about: calculation sections', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 1, name: '밤사이는 이렇게 계산해요' })).toBeVisible()
  await expect(page.getByText('해외 가격을 원화로 바꾸는 법')).toBeVisible()
  await expect(page.getByText('밤사이 가격은 이렇게 보여드려요')).toBeVisible()
  expect(await page.locator('.about__block').count()).toBeGreaterThanOrEqual(3)
})

test('developers: "설정 복사" copies the MCP config', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/developers')
  await page.getByRole('button', { name: '설정 복사' }).click()
  await expect(page.getByRole('button', { name: '복사했어요' })).toBeVisible()
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
  expect(copied).toEqual({ mcpServers: { bamsai: { type: 'http', url: `${baseURL}/api/mcp` } } })
})
