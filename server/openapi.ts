// Minimal OpenAPI 3.1 document so agents can read it and call right away
const asset = { name: 'asset', in: 'query', required: true, schema: { type: 'string', enum: ['SMSN', 'SKHX', 'HYUNDAI', 'SKHY', 'KR200', 'EWY', 'KORU'] }, description: 'SMSN/SKHX/HYUNDAI: KRX stocks (premium + prediction). SKHY: SK hynix ADR, compared with 0.1 share (premium only). KR200/EWY/KORU: Hyperliquid price only' }
const assetOpt = { ...asset, required: false, description: 'All assets if omitted' }
const bps = (name: string, d: string) => ({ name, in: 'query', required: false, schema: { type: 'number' }, description: d })
const auth = [{ bearer: [] }]
const ok = { '200': { description: 'OK' } }

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: '밤사이 API',
    version: '1.0.0',
    description:
      'Compares Hyperliquid Korean stock perps with KRX quotes to report the premium (arbitrage) and the next opening price. All prices are in KRW (perps converted via Upbit KRW/USDC). Orders default to dryRun. This public server (bamsai.kr) never places live orders; live orders work only on a self-hosted copy with the owner’s own keys (domestic: Toss Securities Open API only) and a Bearer token. Reads need no key; each IP can make 300 requests a minute (REST and MCP together), then 429.',
  },
  servers: [{ url: '/api' }],
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  paths: {
    '/v1/status': { get: { operationId: 'getStatus', summary: 'Current domestic market status (regular/NXT/closed) and next open time', responses: ok } },
    '/v1/assets': { get: { operationId: 'listAssets', summary: 'List of supported assets', responses: ok } },
    '/v1/arb': {
      get: {
        operationId: 'getArbitrage',
        summary: 'Premium between the two markets and net arbitrage after costs',
        description: 'premiumPct>0 means the perp is more expensive. The premium reverts to a usual level, not 0: normalPremiumPct is the median regular-session premium over the last 5 trading days and deviationPct = premiumPct − normalPremiumPct. net.netPct is the expected net return (%) on that deviation after fees, taxes, FX and funding. mode=gap means the domestic market is closed and the value is relative to the last close. premiumPct/deviationPct/grossPct use the Hyperliquid mid and the KRX last price; netPct also subtracts execution costs: costs.slippage (both order books walked for notionalKrw, short perp at the bids + buy stock at the asks; fills.* holds the volume-weighted fill prices and per-leg slippage) and costs.latency (1-minute volatility of the perp in KRW over the last 60 minutes, vol1mPct, × √(lagSec/60)). depthLimited=true when the visible book on either side holds less than notionalKrw; netKrw is then computed on maxNotionalKrw. netKrwPer10m = netPct × 10M KRW. Opportunities are not hidden during oracle anomalies: the real order book is used as-is.',
        parameters: [assetOpt, bps('stockFeeBps', 'Broker fee, one way, bp (default 1.5)'), bps('stockTaxBps', 'Sell-side tax bp (default 20)'), bps('perpFeeBps', 'HL taker bp (default 0.9)'), bps('fxFeeBps', 'Upbit fee bp (default 5)'), bps('leverage', 'Perp margin multiple (default 2)'), bps('holdHours', 'Expected holding hours (default 1)'), bps('notionalKrw', 'Trade size per leg in KRW, walked through both order books (default 10000000)'), bps('lagSec', 'Seconds between the two orders, for the latency cost (default 3)')],
        responses: ok,
      },
    },
    '/v1/perps': { get: { operationId: 'listPerps', summary: 'Hyperliquid state for every listed Korean product (mid, 24h-ago price, hourly funding, open interest, 24h volume, max leverage)', responses: { '200': { description: 'OK' } } } },
    '/v1/predict': {
      get: {
        operationId: 'predictOpen',
        summary: 'Where the next domestic re-open stands: Hyperliquid price in KRW vs the domestic close, US-session stage, how often past opens followed at this stage, 80% band',
        description: 'Domestic stocks only (SMSN, SKHX, HYUNDAI); other assets return 400. status=in-session while KRX/NXT trade: then refClose is the live price and preOpen is Hyperliquid at today\'s 08:00 open (after the US close). night: stage of the US session before the next open (before / during / after), Hyperliquid price in KRW at the US close (usCloseKrw, usClosePct, after the close only) and how often past opens followed Hyperliquid at this stage (night.follow.ratePct). probUp / expectedOpen: model output kept for API users; the site does not show them. band80: 80% probability band. thin: true when Hyperliquid trades under $1M overnight (forecast less reliable). Forecast of the domestic re-open (KRX + NXT, 08:00–08:10 average) relative to the 20:00 close. backtest.followRatePct: share of re-opens since 2026-04-13 that moved the way Hyperliquid moved while the domestic market was closed (moves within ±0.05% excluded); coverage80Pct/maePct: accuracy of the expected open (walk-forward).',
        parameters: [assetOpt],
        responses: ok,
      },
    },
    '/v1/convergence': {
      get: {
        operationId: 'getConvergence',
        summary: 'Per past re-open day (08:00): Hyperliquid move while closed vs actual re-open move, and which side converged',
        description: 'follow: yes/no/flat (flat = either move within ±0.05%). absorptionPct: actual move / Hyperliquid move (100 = followed exactly). meetPoint over 08:00–09:00: 0 = Hyperliquid moved to the stock, 1 = stock moved to Hyperliquid. nightUsd / nightKrw: Hyperliquid volume 20:00→08:00 (KRW at that night\'s USDC rate). backtest.liquidRatePct: follow rate on nights with at least $1M traded.',
        parameters: [asset, { name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: ok,
      },
    },
    '/v1/series': {
      get: {
        operationId: 'getSeries',
        summary: 'Chart series (perp and KRX candles, FX rate, premium, funding, Hyperliquid listedAt). Daily perp bars run 20:00→20:00 KST like the domestic day',
        parameters: [asset, { name: 'interval', in: 'query', schema: { type: 'string', enum: ['1m', '5m', '15m', '1h', '1d'] } }],
        responses: ok,
      },
    },
    '/v1/orderbook': { get: { operationId: 'getOrderbook', summary: 'Perp orderbook + domestic (KRX/NXT) orderbook from Toss Securities', parameters: [asset], responses: ok } },
    '/v1/news': { get: { operationId: 'getNews', summary: 'Top issue per day (1 per day)', parameters: [asset], responses: ok } },
    '/v1/flows': { get: { operationId: 'getFlows', summary: "Net buying by investor type (individual / foreign / institution) in shares, with that day's close. available=false for assets without a domestic listing", parameters: [asset], responses: ok } },
    '/v1/orders/krx': {
      post: {
        operationId: 'orderKrx',
        summary: 'Domestic stock order via Toss Securities Open API. dryRun defaults to true; live only on a self-hosted server with TOSS_LIVE_ORDERS=1',
        parameters: [asset],
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['side', 'qty'], properties: { side: { enum: ['buy', 'sell'] }, qty: { type: 'integer' }, price: { type: 'number', description: 'Market order if omitted' }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: ok,
      },
    },
    '/v1/orders/perp': {
      post: {
        operationId: 'orderPerp',
        summary: "Hyperliquid perp order signed by the server owner's agent wallet. dryRun defaults to true, testnet by default; live only on a self-hosted server",
        parameters: [asset],
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['side', 'size'], properties: { side: { enum: ['buy', 'sell'] }, size: { type: 'number', description: 'Contracts (1 = 1 share)' }, price: { type: 'number', description: 'IOC market order if omitted' }, leverage: { type: 'integer' }, reduceOnly: { type: 'boolean' }, network: { enum: ['testnet', 'mainnet'], default: 'testnet' }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: ok,
      },
    },
    '/v1/orders/pair': {
      post: {
        operationId: 'orderPair',
        summary: 'Arbitrage pair order (perp on one side + stock on the opposite side, same size)',
        parameters: [asset],
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['notionalKrw', 'direction'], properties: { notionalKrw: { type: 'number' }, direction: { enum: ['perp_short_stock_long', 'perp_long_stock_short'] }, network: { enum: ['testnet', 'mainnet'] }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: ok,
      },
    },
    '/v1/account/krx': { get: { operationId: 'krxAccount', summary: "Domestic brokerage balance of the server owner's own account. Only on a self-hosted server with live orders enabled; 403 on bamsai.kr", security: auth, responses: ok } },
    '/v1/account/perp': { get: { operationId: 'perpAccount', summary: 'Hyperliquid positions and open orders for a wallet (xyz dex). network defaults to testnet; pass network=mainnet for real positions', parameters: [{ name: 'user', in: 'query', schema: { type: 'string' } }, { name: 'network', in: 'query', schema: { enum: ['testnet', 'mainnet'] } }], responses: ok } },
  },
}
