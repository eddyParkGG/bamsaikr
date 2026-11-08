// Auto-size: any element with [data-fit] shrinks its font (down to 70%, or [data-fit-min]) instead of wrapping or overflowing.
// One global observer keeps it in sync as numbers stream in or the layout resizes.
const MIN_SCALE = 0.7

function fit(el: HTMLElement) {
  // Runs on every live tick: touch the DOM only when something changes (no attribute rewrite, no reset when unshrunk)
  if (!el.dataset.fitBase) el.dataset.fitBase = String(parseFloat(getComputedStyle(el).fontSize))
  const base = Number(el.dataset.fitBase)
  if (el.style.fontSize) el.style.fontSize = ''
  if (el.scrollWidth <= el.clientWidth + 0.5) return
  const min = Number(el.dataset.fitMin) || MIN_SCALE
  let size = base * Math.max(min, el.clientWidth / el.scrollWidth)
  el.style.fontSize = `${size}px`
  // One refinement pass for rounding/letter-spacing
  while (el.scrollWidth > el.clientWidth + 0.5 && size > base * min) {
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
    // The added node itself may be the one to fit, not only its descendants
    const self = root instanceof HTMLElement && root.matches('[data-fit]') ? [root] : []
    ;[...self, ...root.querySelectorAll<HTMLElement>('[data-fit]')].forEach((el) => {
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
