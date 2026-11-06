# 운영 런북

밤사이 장애 대응 메모. 화면은 Vercel(bamsai.kr), API는 Fly.io 머신 1대(`bamsai-api`, nrt). `/api/*`는 Vercel이 `bamsai-api.fly.dev`로 넘겨요.

## 먼저 볼 것

```sh
curl -s https://bamsai.kr/api/health | jq        # 소스별 마지막 성공 시각
fly status -a bamsai-api                          # 머신 상태·헬스체크 결과
fly logs -a bamsai-api                            # 실시간 로그
```

`/api/health` 응답:

```json
{
  "status": "ok",            // ok | degraded
  "coreFresh": true,         // false면 HTTP 503
  "now": 1793954603485,
  "uptimeSec": 5231,
  "staleAfterSec": 300,
  "sources": {
    "hyperliquid": { "core": true,  "enabled": true, "fresh": true, "lastOkAt": 1793954601000, "ageSec": 2 },
    "upbit":       { "core": true,  "enabled": true, "fresh": true, "lastOkAt": 1793954602000, "ageSec": 1 },
    "toss":        { "core": false, "enabled": true, "fresh": true, "lastOkAt": 1793954600000, "ageSec": 3 }
  }
}
```

- 기준은 **마지막으로 성공한 응답 시각**이에요. 캐시에서 나간 값은 세지 않고, 장이 닫혀 가격이 안 바뀌어도 Toss 호출이 성공하면 신선해요.
- 하이퍼리퀴드·업비트(핵심) 중 하나라도 5분 넘게 응답이 없으면 503. Toss만 끊기면 200 + `degraded`.
- 호출할 때마다 세 소스를 평소 캐시를 거쳐 한 번씩 확인해요(최대 3초). IP당 요청 제한과 `api_call` 로그·GA 이벤트에서는 빠져 있어요.
- Fly가 30초마다 이 주소를 확인해요(부팅 뒤 30초 유예, 타임아웃 5초). 실패하면 `fly status`에 체크 실패로 보여요.

## 증상별 대응

| 증상 | 확인 방법 | 조치 |
| --- | --- | --- |
| 화면 로딩이 멈춤·하얀 화면 (특히 구형 iPhone Safari) | `curl -sI -H 'accept-encoding: zstd' https://bamsai.kr/api/v1/status`의 `content-encoding`이 `gzip`이 아니면 CDN이 zstd 본문을 캐시한 것. 브라우저 콘솔에 JSON 파싱 오류 | 서버가 JSON을 직접 gzip으로 압축하는 `compress` 미들웨어(server/app.ts)가 빠지거나 바뀌지 않았는지 확인. 고친 뒤 Vercel 캐시 비우기(Vercel 대시보드 → Deployments → Redeploy, 또는 Purge Cache) |
| 국내 시세가 비어 있음 / API가 502 (`source: "toss"`) | 응답 본문의 `code`: `rate-limit-exceeded`·429면 호출 한도, `token-revoked`·`token-expired`·401이면 토큰 문제. `fly logs`에서 1분마다 찍히는 `{"evt":"toss_minute","groups":{...}}`로 그룹별 `calls`·`limited` 확인. `/api/health`의 `toss.fresh` | 429: `limited`가 계속 쌓이는 그룹의 한도(server/sources/toss.ts `GROUPS`)를 낮추거나 캐시 TTL을 늘려요. 토큰: Toss는 키 하나에 살아 있는 토큰이 하나뿐이라, 다른 곳(로컬 서버, 두 번째 머신)이 토큰을 받으면 운영 토큰이 즉시 무효가 돼요. 서버가 한 번 자동 재발급하지만, 로컬에서 운영 키로 `npm run dev:api`를 띄운 사람이 있으면 먼저 끄게 해요. 머신은 항상 1대 |
| 하이퍼리퀴드 가격이 이상함 (갑자기 크게 튐) | trade.xyz 오라클은 국내 체결가를 따라가요. 08:00 넥스트레이드 개장 직후처럼 국내 체결이 적을 때 한 건에 급변할 수 있어요. 2026-07-28 SK하이닉스 프리마켓 1주 하한가 → perp −17.9% 사례. 하이퍼리퀴드 앱의 같은 종목 가격, 국내 호가와 비교 | 우리 쪽 버그가 아니면 데이터를 고치지 않아요. 몇 분 안에 오라클이 정상 가격으로 돌아오는지 지켜보고, 필요하면 공지. 봇 사용자에게는 08:00 직후 순간 가격 하나로 주문하지 말라고 안내(Developers 페이지에 이미 있음) |
| 환율 없음 (원화 환산·가격 차이가 비어 있음) | `/api/health`의 `upbit.fresh`가 false. `curl -s 'https://api.upbit.com/v1/orderbook?markets=KRW-USDC'`가 서버 밖에서는 되는지 확인. `fly logs`에서 업비트 429·타임아웃 | 업비트 장애면 기다려요(브라우저는 업비트 웹소켓이 붙으면 자체적으로 환산). 429가 반복되면 히스토리 로드가 몰린 것이라 잠시 뒤 풀려요. 5분 넘게 이어지면 헬스체크가 503 |
| 서버 다운 (모든 `/api`가 실패) | `fly status -a bamsai-api`(머신 state, 체크 결과), `fly logs -a bamsai-api`(크래시·OOM), `curl -s https://bamsai-api.fly.dev/api/health` | 메모리 부족이나 멈춤이면 `fly machine restart <machine-id> -a bamsai-api`(id는 `fly status`에서). 배포 직후라면 이전 이미지로 되돌리기: `fly releases -a bamsai-api` → `fly deploy -a bamsai-api --image <이전 이미지>`. **머신을 늘리지 마세요**(`fly scale count`는 1 유지): 두 대가 뜨면 Toss 토큰을 서로 무효로 만들어요 |
| API 남용 (특정 IP가 과하게 호출) | 429 응답(`요청이 너무 많아요…`, `Retry-After: 60`)이 늘어남. `fly logs`의 `{"evt":"api_call",...}`에서 path·ua 확인 | 방문자 IP당 1분 300회, Vercel 엣지 같은 상위 IP당 1분 6,000회에서 자동으로 429(server/lib/rateLimit.ts). 정상 사용자가 막히면 `PER_CLIENT`를 올리고, 악성이면 Fly·Vercel 방화벽에서 차단 |

## 하지 말 것

- 운영 Toss 키(`.env.local`)로 로컬 API 서버 띄우기 → 운영 토큰 무효화
- Fly 머신 2대 이상 (`fly scale count 2`, 다른 리전 추가)
- `compress` 미들웨어 제거 (CDN zstd 캐시 문제 재발)
