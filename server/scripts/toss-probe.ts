// Run: npx tsx --env-file=.env.local server/scripts/toss-probe.ts  (issues a new token, invalidating tokens held by other processes)
import { tossCandlesBefore } from '../sources/toss.js'
const at = (s: string) => Date.parse(s + '+09:00')
for (const t of ['2026-11-04T15:31:00', '2026-11-05T09:01:00', '2026-02-20T09:01:00', '2026-02-19T15:31:00']) {
  const rows = await tossCandlesBefore('005930', '1m', at(t), 4)
  console.log(t, rows.map((k) => [new Date(k.t + 9 * 3600e3).toISOString().slice(11, 16), k.o, k.c, k.v]))
}
