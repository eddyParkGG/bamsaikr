// Auto-size: any element with [data-fit] shrinks its font (down to 70%) instead of wrapping or overflowing.
// One global observer keeps it in sync as numbers stream in or the layout resizes.
const MIN_SCALE = 0.7

function fit(el: HTMLElement) {
  const base = Number(el.dataset.fitBase) || parseFloat(getComputedStyle(el).fontSize)
  el.dataset.fitBase = String(base)
  el.style.fontSize = ''
  if (el.scrollWidth <= el.clientWidth + 0.5) return
  let size = base * Math.max(MIN_SCALE, el.clientWidth / el.scrollWidth)
  el.style.fontSize = `${size}px`
  // One refinement pass for rounding/letter-spacing
  while (el.scrollWidth > el.clientWidth + 0.5 && size > base * MIN_SCALE) {
    size -= 0.5
    el.style.fontSize = `${size}px`
  }
}

let raf = 0
const dirty = new Set<HTMLElement>()
function schedule(el: HTMLElement) {
  dirty.add(el)
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    for (const e of dirty) if (e.isConnected) fit(e)
    dirty.clear()
  })
}

export function initFit() {
  const resize = new ResizeObserver((entries) => entries.forEach((e) => schedule(e.target as HTMLElement)))
  const watched = new WeakSet<Element>()
  const scan = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>('[data-fit]').forEach((el) => {
      if (!watched.has(el)) {
        watched.add(el)
        resize.observe(el)
      }
      schedule(el)
    })
  }
  new MutationObserver((muts) => {
    for (const m of muts) {
      const target = (m.target.nodeType === 1 ? m.target : m.target.parentElement) as HTMLElement | null
      const host = target?.closest<HTMLElement>('[data-fit]')
      if (host) schedule(host)
      m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n as Element))
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true })
  scan(document)
}
