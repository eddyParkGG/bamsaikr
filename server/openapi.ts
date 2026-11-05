// 에이전트가 읽고 바로 호출할 수 있게 최소한의 OpenAPI 3.1 문서
const asset = { name: 'asset', in: 'query', required: true, schema: { type: 'string', enum: ['SMSN', 'SKHX', 'HYUNDAI', 'KR200'] }, description: 'SMSN=삼성전자, SKHX=SK하이닉스, HYUNDAI=현대차, KR200=코스피200' }
const assetOpt = { ...asset, required: false, description: '생략하면 전체 종목' }
const bps = (name: string, d: string) => ({ name, in: 'query', required: false, schema: { type: 'number' }, description: d })
const auth = [{ bearer: [] }]
const ok = { '200': { description: 'OK' } }

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: '밤사이 API',
    version: '1.0.0',
    description:
      '하이퍼리퀴드 한국 주식 perp 와 KRX 시세를 비교해 괴리(차익)와 다음 개장 시가를 알려주는 API. 가격은 모두 원화 기준(perp 는 업비트 원/USDC 로 환산). 주문은 기본 dryRun 이며, 실주문은 Bearer 토큰이 필요.',
  },
  servers: [{ url: '/api' }],
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  paths: {
    '/v1/status': { get: { operationId: 'getStatus', summary: '지금 국내 장 상태(정규장/NXT/휴장), 다음 개장 시각', responses: ok } },
    '/v1/assets': { get: { operationId: 'listAssets', summary: '지원 종목 목록', responses: ok } },
    '/v1/arb': {
      get: {
        operationId: 'getArbitrage',
        summary: '두 시장 괴리율과 비용 뺀 순차익',
        description: 'premiumPct>0 이면 perp 가 비쌈. net.netPct 는 수수료·세금·환전·펀딩 차감 후 기대 순수익률(%). mode=gap 이면 국내 휴장 중이라 직전 종가와 비교한 값.',
        parameters: [assetOpt, bps('stockFeeBps', '증권사 수수료 편도 bp (기본 1.5)'), bps('stockTaxBps', '매도 세금 bp (기본 20)'), bps('perpFeeBps', 'HL taker bp (기본 0.9)'), bps('fxFeeBps', '업비트 수수료 bp (기본 5)'), bps('leverage', 'perp 증거금 배수 (기본 2)'), bps('holdHours', '보유 예상 시간 (기본 6)')],
        responses: ok,
      },
    },
    '/v1/predict': {
      get: {
        operationId: 'predictOpen',
        summary: '다음 KRX 개장 시가 예측 (상승 확률, 예상 시가, 80% 구간)',
        description: 'probUp: 시가가 기준 종가보다 높을 확률. band80: 80% 확률 구간. backtest: 과거 walk-forward 적중률/오차.',
        parameters: [assetOpt],
        responses: ok,
      },
    },
    '/v1/convergence': {
      get: {
        operationId: 'getConvergence',
        summary: '과거 개장일마다 perp 가 말한 갭 vs 실제 시가 갭, 어느 쪽이 맞췄는지',
        description: 'absorptionPct: 실제 갭/perp 갭(100=perp 대로 열림). meetPoint: 0=perp 가 주식 쪽으로, 1=주식이 perp 쪽으로 가서 만남.',
        parameters: [asset, { name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: ok,
      },
    },
    '/v1/series': {
      get: {
        operationId: 'getSeries',
        summary: '차트용 시계열 (perp·KRX 캔들, 환율, 괴리율, 펀딩)',
        parameters: [asset, { name: 'interval', in: 'query', schema: { type: 'string', enum: ['1m', '5m', '15m', '1h', '1d'] } }],
        responses: ok,
      },
    },
    '/v1/orderbook': { get: { operationId: 'getOrderbook', summary: 'perp 호가 + KRX/NXT 호가(KIS 연결 시)', parameters: [asset], responses: ok } },
    '/v1/news': { get: { operationId: 'getNews', summary: '날짜별 대표 이슈 (하루 1건)', parameters: [asset], responses: ok } },
    '/v1/flows': { get: { operationId: 'getFlows', summary: '투자자별 순매수, 프로그램 매매 (KIS)', parameters: [asset], responses: ok } },
    '/v1/orders/krx': {
      post: {
        operationId: 'orderKrx',
        summary: '국내 주식 주문 (KIS). dryRun 기본 true',
        parameters: [asset],
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['side', 'qty'], properties: { side: { enum: ['buy', 'sell'] }, qty: { type: 'integer' }, price: { type: 'number', description: '없으면 시장가' }, exchange: { enum: ['KRX', 'NXT', 'SOR'] }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: ok,
      },
    },
    '/v1/orders/perp': {
      post: {
        operationId: 'orderPerp',
        summary: '하이퍼리퀴드 perp 주문 (서버 에이전트 지갑). dryRun 기본 true, 기본 테스트넷',
        parameters: [asset],
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['side', 'size'], properties: { side: { enum: ['buy', 'sell'] }, size: { type: 'number', description: '계약 수(1=1주)' }, price: { type: 'number', description: '없으면 IOC 시장가' }, leverage: { type: 'integer' }, reduceOnly: { type: 'boolean' }, network: { enum: ['testnet', 'mainnet'], default: 'testnet' }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: ok,
      },
    },
    '/v1/orders/pair': {
      post: {
        operationId: 'orderPair',
        summary: '차익 페어 주문 (perp 한쪽 + 주식 반대쪽, 같은 수량)',
        parameters: [asset],
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['notionalKrw', 'direction'], properties: { notionalKrw: { type: 'number' }, direction: { enum: ['perp_short_stock_long', 'perp_long_stock_short'] }, network: { enum: ['testnet', 'mainnet'] }, dryRun: { type: 'boolean', default: true } } } } } },
        responses: ok,
      },
    },
    '/v1/account/krx': { get: { operationId: 'krxAccount', summary: 'KIS 잔고', security: auth, responses: ok } },
    '/v1/account/perp': { get: { operationId: 'perpAccount', summary: 'HL 포지션·미체결 (xyz dex)', parameters: [{ name: 'user', in: 'query', schema: { type: 'string' } }, { name: 'network', in: 'query', schema: { enum: ['testnet', 'mainnet'] } }], responses: ok } },
  },
}
