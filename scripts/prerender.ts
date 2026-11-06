// After `vite build`: write one static HTML file per page (dist/about.html, dist/s/SKHX.html, ...) with that page's
// title, description, canonical URL, link-preview tags and a short crawler summary, plus a sitemap with today's date.
// The app still boots as the same SPA; Vercel serves these files first (cleanUrls) and falls back to index.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { INDEXED_PATHS, pageMeta, SITE, type PageMeta } from '../shared/pageMeta'

const DIST = new URL('../dist/', import.meta.url)
const template = readFileSync(new URL('index.html', DIST), 'utf8')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function replaceOnce(html: string, re: RegExp, to: string) {
  if (!re.test(html)) throw new Error(`prerender: pattern not found ${re}`)
  return html.replace(re, to)
}

const NAV = [
  ['/', '홈'],
  ['/s/SMSN', '삼성전자'],
  ['/s/SKHX', 'SK하이닉스'],
  ['/s/HYUNDAI', '현대차'],
  ['/about', '소개(계산 방법)'],
  ['/developers', 'API · MCP'],
  ['/llms.txt', 'llms.txt'],
]

function render(m: PageMeta) {
  const url = SITE + m.path
  let html = template
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
  html = replaceOnce(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(m.description)}" />`)
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(m.title)}" />`)
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(m.description)}" />`)
  html = replaceOnce(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(m.title)}" />`)
  html = replaceOnce(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(m.description)}" />`)
  const summary = [
    `<main class="sr-only">`,
    `<h1>${esc(m.h1)}</h1>`,
    ...m.body.map((p) => `<p>${esc(p)}</p>`),
    `<nav><ul>${NAV.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul></nav>`,
    `</main>`,
  ].join('\n        ')
  html = replaceOnce(html, /<main class="sr-only">[\s\S]*?<\/main>/, summary)
  // The FAQ and app description stay on the home page only; other pages say what they are and where they sit
  if (m.path !== '/') {
    const crumbs = [{ name: '밤사이', url: `${SITE}/` }, { name: m.h1, url }]
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: m.title, url, description: m.description, inLanguage: 'ko-KR', isPartOf: { '@type': 'WebSite', name: '밤사이', url: `${SITE}/` } },
        { '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) },
      ],
    }
    html = replaceOnce(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
  }
  return html
}

for (const path of INDEXED_PATHS) {
  const file = path === '/' ? 'index.html' : `${path.slice(1)}.html`
  const out = new URL(file, DIST)
  mkdirSync(dirname(out.pathname), { recursive: true })
  writeFileSync(out, render(pageMeta(path)))
}

const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...INDEXED_PATHS.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod><changefreq>${p === '/about' || p === '/developers' ? 'weekly' : 'hourly'}</changefreq></url>`),
  '</urlset>',
  '',
].join('\n')
writeFileSync(new URL('sitemap.xml', DIST), sitemap)
console.log(`prerender: ${INDEXED_PATHS.length} pages + sitemap (${today})`)
