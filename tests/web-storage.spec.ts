// @vitest-environment jsdom
import { expect, it } from 'vitest'

// Vitest aliases window to globalThis; use the actual DOM to detect shadowing.
const domWindow = (globalThis as typeof globalThis & {
  jsdom: { window: Pick<Window, 'localStorage' | 'sessionStorage'> }
}).jsdom.window

it.each(['localStorage', 'sessionStorage'] as const)('%s shares the current DOM store', name => {
  const storage = globalThis[name]
  expect(storage).toBe(domWindow[name])
  try {
    storage.setItem('issue-71', 'from-global')
    expect(domWindow[name].getItem('issue-71')).toBe('from-global')
    domWindow[name].setItem('issue-71', 'from-window')
    expect(storage.getItem('issue-71')).toBe('from-window')
  } finally {
    storage.removeItem('issue-71')
  }
})
