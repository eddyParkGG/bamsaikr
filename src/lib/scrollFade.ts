/**
 * Marks the edges of a scroller that still hide content (data-fade-left / -right, or -top / -bottom),
 * so CSS can fade only those edges. Only attributes change, never sizes, so the observers can't feed back into layout.
 */
function watch(el: HTMLElement, axis: 'x' | 'y') {
  const [start, end] = axis === 'x' ? ['left', 'right'] : ['top', 'bottom']
  const update = () => {
    const pos = axis === 'x' ? Math.abs(el.scrollLeft) : el.scrollTop
    const max = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight
    // 1px slack: zoomed screens report fractional scroll positions
    el.toggleAttribute(`data-fade-${start}`, pos > 1)
    el.toggleAttribute(`data-fade-${end}`, max - pos > 1)
  }
  // The box and its children: either can change how much overflows (window resize, rows or chips added)
  const ro = new ResizeObserver(update)
  const observe = () => {
    ro.disconnect()
    ro.observe(el)
    for (const c of el.children) ro.observe(c)
  }
  const mo = new MutationObserver(() => {
    observe()
    update()
  })
  observe()
  mo.observe(el, { childList: true })
  el.addEventListener('scroll', update, { passive: true })
  update()
  return () => {
    ro.disconnect()
    mo.disconnect()
    el.removeEventListener('scroll', update)
  }
}

/** Ref callbacks (stable, with React 19 cleanup): `<div ref={fadeX}>` for a sideways scroller, `fadeY` for a vertical one */
export const fadeX = (el: HTMLElement | null) => (el ? watch(el, 'x') : undefined)
export const fadeY = (el: HTMLElement | null) => (el ? watch(el, 'y') : undefined)
