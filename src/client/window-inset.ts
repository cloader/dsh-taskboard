/** Keep injected content below Windows Desktop's native caption controls. */
export function installWindowInset(view: HTMLElement): () => void {
  const update = (): void => {
    const platform = document.body.getAttribute('data-dsh-desktop-platform')
      ?? new URLSearchParams(window.location.search).get('dsh-desktop-platform')
    if (platform !== 'win32') {
      delete view.dataset.dshAtbWindows
      view.style.removeProperty('--dsh-atb-viewport-top')
      return
    }
    view.dataset.dshAtbWindows = ''
    view.style.setProperty('--dsh-atb-viewport-top', `${view.getBoundingClientRect().top}px`)
  }
  let frame: number | undefined
  const schedule = (): void => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => { frame = undefined; update() })
  }
  const mutations = new MutationObserver(schedule)
  mutations.observe(document.body, {
    attributes: true, childList: true, subtree: true,
    attributeFilter: ['class', 'data-dsh-desktop-platform', 'data-dsh-desktop-mode', 'data-details-collapsed'],
  })
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
  resize?.observe(view)
  if (view.parentElement !== null) resize?.observe(view.parentElement)
  window.addEventListener('resize', schedule)
  schedule()
  return () => {
    mutations.disconnect()
    resize?.disconnect()
    window.removeEventListener('resize', schedule)
    if (frame !== undefined) cancelAnimationFrame(frame)
    delete view.dataset.dshAtbWindows
    view.style.removeProperty('--dsh-atb-viewport-top')
  }
}
