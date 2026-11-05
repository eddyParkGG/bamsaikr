// Minimal OpenAPI 3.1 document so agents can read it and call right away
const asset = { name: 'asset', in: 'query', required: true, schema: { type: 'string', enum: ['SMSN', 'SKHX', 'HYUNDAI'] }, description: 'SMSN=Samsung Electronics, SKHX=SK hynix, HYUNDAI=Hyundai Motor' }
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
      'Compares Hyperliquid Korean stock perps with KRX quotes to report the premium (arbitrage) and the next opening price. All prices are in KRW (perps converted via Upbit KRW/USDC). Orders default to dryRun; live orders require a Bearer token.',
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
        description: 'premiumPct>0 means the perp is more expensive. net.netPct is the expected net return (%) after fees, taxes, FX and funding. mode=gap means the domestic market is closed and the value is relative to the last close.',
        parameters: [assetOpt, bps('stockFeeBps', 'Broker fee, one way, bp (default 1.5)'), bps('stockTaxBps', 'Sell-side tax bp (default 20)'), bps('perpFeeBps', 'HL taker bp (default 0.9)'), bps('fxFeeBps', 'Upbit fee bp (default 5)'), bps('leverage', 'Perp margin multiple (default 2)'), bps('holdHours', 'Expected holding hours (default 1)')],
        responses: ok,
      },
    },
    '/v1/predict': {
      get: {
        operationId: 'predictOpen',
        summary: 'Forecast of the next KRX opening price (probability up, expected open, 80% band)',
        description: 'probUp: probability the open is above the reference close. band80: 80% probability band. backtest: historical walk-forward hit rate/error.',
        parameters: [assetOpt],
        responses: ok,
      },
    },
    '/v1/convergence': {
      get: {
        operationId: 'getConvergence',
        summary: 'Per past open day: gap implied by perp vs actual opening gap, and which side converged',
        description: 'absorptionPct: actual gap / perp gap (100 = opened exactly as perp implied). meetPoint: 0 = perp moved to the stock, 1 = stock moved to the perp.',
        parameters: [asset, { name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: ok,
      },
    },
    '/v1/series': {
      get: {
        operationId: 'getSeries',
        summary: 'Chart series (perp and KRX candles, FX rate, premium, funding)',
        parameters: [asset, { name: 'interval', in: 'query', schema: { type: 'string', enum: ['1m', '5m', '15m', '1h', '1d'] } }],
        responses: ok,
      },
    },
    '/v1/orderbook': { get: { operationId: 'getOrderbook', summary: 'Perp orderbook + KRX/NXT orderbook (when KIS is connected)', parameters: [asset], responses: ok } },
    '/v1/news': { get: { operationId: 'getNews', summary: 'Top issue per day (1 per day)', parameters: [asset], responses: ok } },
    '/v1/flows': { get: { operationId: 'getFlows', summary: 'Net buying by investor type, program trading (KIS)', parameters: [asset], responses: ok } },
    '/v1/orders/krx': {
      post: {
        operationId: 'orderKrx',
        summary: 'Domestic stock order (KIS). dryRun defaults to true',
        parameters: [asset],
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['side', 'qty'], properties: { side: { enum: ['buy', 'sell'] }, qty: { type: 'integer' }, price: { type: 'number', description: 'Market order if omitted' }, exchange: { enum: ['KRX', 'NXT', 'SOR'] }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: ok,
      },
    },
    '/v1/orders/perp': {
      post: {
        operationId: 'orderPerp',
        summary: 'Hyperliquid perp order (server agent wallet). dryRun defaults to true, testnet by default',
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
    '/v1/account/krx': { get: { operationId: 'krxAccount', summary: 'KIS balance', security: auth, responses: ok } },
    '/v1/account/perp': { get: { operationId: 'perpAccount', summary: 'HL positions and open orders (xyz dex)', parameters: [{ name: 'user', in: 'query', schema: { type: 'string' } }, { name: 'network', in: 'query', schema: { enum: ['testnet', 'mainnet'] } }], responses: ok } },
  },
}
