// 직접 확인한 주요 이슈 (출처 링크 포함). KIS 뉴스 API 에 없는 크립토/해외 쪽 이벤트 위주
// 하루에 종목당 1개만 노출
import type { AssetId } from '../../shared/assets.js'

export interface CuratedEvent {
  date: string // KST YYYY-MM-DD
  time?: string // KST HH:MM
  assets: AssetId[]
  title: string
  summary: string
  url: string
}

// 2026-11-05 웹 검색으로 출처 확인. 시각 없는 항목은 장 시작(09:00)에 표시
export const CURATED_EVENTS: CuratedEvent[] = [
  { date: '2026-02-19', assets: ["SMSN"], title: "설 연휴 끝나자 코스피 3% 급등", summary: "설 연휴(2/16~18) 뒤 첫 거래일 코스피 3.09% 오른 5,677.25. 삼성전자 첫 19만원대 마감.", url: 'https://www.ytn.co.kr/_ln/0102_202602191615210267' },
  { date: '2026-02-20', assets: ["SMSN", "SKHX", "HYUNDAI"], title: "trade.xyz, 삼성·하이닉스·현대차 perp 상장", summary: "하이퍼리퀴드 HIP-3 빌더 trade.xyz가 3종목 무기한선물을 최대 10배로 상장. 유동성 공급은 프레스토랩스.", url: 'https://www.digitalasset.works/news/articleView.html?idxno=31616' },
  { date: '2026-03-03', assets: ["SMSN", "SKHX"], title: "'검은 화요일' 코스피 7% 폭락", summary: "미·이스라엘의 이란 공습 뒤 첫 거래일 코스피 -7.24%. 삼성전자 -9.88%, SK하이닉스 -11.50%. 주말·대체휴일 동안 perp만 거래돼 갭이 크게 벌어짐.", url: 'https://www.etoday.co.kr/news/view/2561455' },
  { date: '2026-03-03', assets: ["HYUNDAI"], title: "현대차 11% 급락, 중동전쟁 직격탄", summary: "이란 전쟁 충격으로 현대차 -11.72%, 기아 -11.29%.", url: 'https://m.news.nate.com/view/20260303n30610' },
  { date: '2026-03-09', assets: ["SMSN", "SKHX"], title: "유가 100달러 돌파, 코스피 6% 폭락", summary: "호르무즈 봉쇄로 유가 100달러 돌파, 매도 사이드카. 코스피 -5.96%.", url: 'https://biz.heraldcorp.com/article/10690256' },
  { date: '2026-04-07', assets: ["SMSN"], title: "삼성전자 1분기 영업익 57.2조, 역대 최대", summary: "잠정 매출 133조, 영업이익 57.2조. 시장 예상(40~50조) 크게 상회.", url: 'https://www.edaily.co.kr/News/Read?newsId=02361606645413824&mediaCodeNo=257' },
  { date: '2026-04-08', assets: ["SMSN", "SKHX"], title: "미·이란 휴전에 코스피 6.87% 폭등", summary: "2주 휴전 합의로 매수 사이드카. 코스피 5,872.34, SK하이닉스 100만원 회복.", url: 'https://www.newsis.com/view/NISX20260408_0003582532' },
  { date: '2026-04-23', assets: ["SKHX"], title: "SK하이닉스 1분기 영업익 37.6조", summary: "매출 52.6조, 영업이익률 72%. 코스피 장중 첫 6,500 돌파.", url: 'https://zdnet.co.kr/view/?no=20260423074330' },
  { date: '2026-06-14', assets: ["SMSN", "SKHX"], title: "주말 perp, 월요일 갭상승 미리 반영", summary: "주말 trade.xyz 가격이 금요일 종가 대비 삼성전자 +6%, SK하이닉스 +7.4%.", url: 'https://www.kucoin.com/news/flash/trade-xyz-predicts-6-7-4-opening-gains-for-sk-hynix-and-samsung-electronics-on-monday' },
  { date: '2026-07-07', assets: ["SMSN"], title: "삼성전자 2분기 영업익 89.4조", summary: "잠정 매출 171조, 영업이익 89.4조. 3분기 연속 최대.", url: 'https://www.ytn.co.kr/_ln/0102_202607071439476043' },
  { date: '2026-07-10', time: '22:30', assets: ["SKHX"], title: "SK하이닉스 나스닥 ADR 상장, 첫날 13%↑", summary: "공모가 149달러, 약 265억 달러 조달. 첫날 168.01달러 마감(SKHY).", url: 'https://www.cnbc.com/2026/07/10/sk-hynix-skhy-stock-nasdaq.html' },
  { date: '2026-07-28', time: '08:01', assets: ["SKHX"], title: "하이닉스 1주 하한가 체결, perp 19% 급락", summary: "NXT 프리마켓에서 1주가 하한가(-29.99%)에 체결되고 오라클에 반영. 마크가격 1,127.9→917.25달러, 960개 계정 롱 약 5,740만 달러 청산. 7/29 trade.xyz 전액 보상 발표.", url: 'https://en.sedaily.com/finance/2026/07/30/sk-hynix-single-share-limit-trade-triggers-83-billion-won' },
  { date: '2026-07-29', assets: ["SKHX"], title: "SK하이닉스 2분기 영업익 60.5조", summary: "매출 79.3조, 영업이익률 76%. 상반기 누적 매출 첫 100조 돌파.", url: 'https://www.ytn.co.kr/_ln/0102_202607291149150497' },
  { date: '2026-08-06', time: '10:18', assets: ["SMSN", "SKHX"], title: "AI 수익성 우려, 하이닉스 10% 폭락", summary: "AMD·샌디스크 실적 전망 부진에 매도 사이드카. SK하이닉스 -10.37%, 삼성전자 -6.3%.", url: 'https://imnews.imbc.com/news/2026/econo/article/6842925_36932.html' },
  { date: '2026-09-28', assets: ["SMSN", "SKHX"], title: "추석 연휴 뒤 코스피 2.7% 급락", summary: "휴장(9/24~25) 동안 미 장기금리 급등·AI 투자 지연 우려. 삼성전자 -5.43%, SK하이닉스 -5.05%.", url: 'https://www.goodkyung.com/news/articleView.html?idxno=291791' },
  { date: '2026-10-08', assets: ["SMSN"], title: "삼성전자 영업익 107조, 주가는 하락", summary: "3분기 잠정 영업이익 107.4조로 국내 첫 분기 100조. 이후 실망 매물에 10/20까지 약 19% 하락.", url: 'https://www.ytn.co.kr/_ln/0102_202610080945200200' },
  { date: '2026-10-15', assets: ["SMSN", "SKHX"], title: "코스피 7.57% 폭락", summary: "미 9월 CPI 3.7%, 외국인 8일 연속 순매도, AI 수익성 우려 겹침.", url: 'https://www.newspim.com/news/view/20261015001141' },
  { date: '2026-10-16', assets: ["SMSN", "SKHX", "HYUNDAI"], title: "금융당국 \"한국주식 perp 초고위험\" 경고", summary: "금융위·금감원 '무기한 선물 이용자 유의사항' 발표. 국내 투자자 보호 대상 아님, 해외 플랫폼 불법 영업 엄정 대응.", url: 'https://www.fnnews.com/news/202610161505097259' },
  { date: '2026-10-18', assets: ["SMSN", "SKHX"], title: "주말 perp 삼전 3.7%·하닉 4.9% 하락", summary: "주말 trade.xyz 가격이 금요일 종가보다 삼성전자 -3.7%, SK하이닉스 -4.9%.", url: 'https://www.tokenpost.com/news/investing/34404' },
  { date: '2026-10-27', assets: ["SMSN"], title: "앤트로픽 상장 신청에 코스피 반등", summary: "AI 투자 기대 회복, 코스피 장 초반 +3.86%. 삼성전자 +4.69%(장중).", url: 'https://www.seoul.co.kr/news/economy/securities/2026/10/27/20261027500027' },
  { date: '2026-10-28', assets: ["SKHX"], title: "SK하이닉스 3분기 영업익 83조", summary: "매출 104.6조로 분기 첫 100조. 현금배당 14조·자사주 20조 결의.", url: 'https://www.hankyung.com/article/202610289272g' },
  { date: '2026-10-29', assets: ["HYUNDAI"], title: "현대차 3분기 영업익 2.68조, 목표 하향", summary: "파업으로 판매 11% 감소. 연간 판매 목표 400만대로 하향.", url: 'https://www.hankyung.com/article/202610293284Y' },
  { date: '2026-10-30', assets: ["SKHX"], title: "빅테크 실적 쇼크, 코스피 3.48% 급락", summary: "알파벳·아마존·인텔 실적 실망에 매도 사이드카. SK하이닉스 7%대 하락.", url: 'https://www.ddaily.co.kr/page/view/2026103015521622280' },
  { date: '2026-11-05', time: '10:16', assets: ["SMSN", "SKHX"], title: "미 중간선거 쇼크, 매도 사이드카", summary: "민주당 상·하원 장악에 AI 데이터센터 규제 우려. 삼성전자 -7.00%, SK하이닉스 -9.24%(장중).", url: 'https://www.newspim.com/news/view/20261105000477' },
  { date: '2026-11-05', assets: ["HYUNDAI"], title: "현대차 6% 급등, 관세 완화 기대", summary: "의회의 관세 견제 기대에 현대차·기아 5~6% 상승.", url: 'https://www.etoday.co.kr/news/view/2644407' },
]
