import { afterAll } from 'vitest'

// Node's native Web Storage globals can shadow jsdom's Storage in Vitest 3.
// Use the current DOM's stores without reading Node's lazy storage getters.
const dom = (globalThis as typeof globalThis & {
  jsdom?: { window: Pick<Window, 'localStorage' | 'sessionStorage'> }
}).jsdom

if (dom !== undefined) {
  const names = ['localStorage', 'sessionStorage'] as const
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name))

  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: dom.window[name],
    })
  }

  // Vitest reuses workers: restore native descriptors before DOM teardown so
  // this file's stores cannot leak into a later Node-environment test file.
  afterAll(() => {
    names.forEach((name, index) => {
      const original = originals[index]
      if (original !== undefined) Object.defineProperty(globalThis, name, original)
      else Reflect.deleteProperty(globalThis, name)
    })
  })
}
