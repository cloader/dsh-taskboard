// @vitest-environment jsdom
// Regression: a preview that resolves after a newer file was picked must not
// replace the newer file's plan — otherwise Run commits a ledger whose
// classification the reviewer never saw (replace mode swaps the whole ledger).
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { ImportModal } from '../src/client/board/ImportModal.tsx'
import type { ImportPreviewResponse } from '../src/shared/api.ts'
import { disposeI18n } from '../src/client/i18n/runtime.ts'
import { waitFor } from './wait-for.ts'

const cleanups: Array<() => void> = []
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'zh-CN'; disposeI18n() })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); localStorage.clear() })

const planRows = (prefix: string, n: number): ImportPreviewResponse['plan']['create'] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, title: `${prefix} ${i}`, status: 'todo' }))

const ledgerA = { schemaVersion: 1, tasks: [{ id: 'a-1', title: 'FILE-A' }] }
const ledgerB = { schemaVersion: 1, tasks: [{ id: 'b-1', title: 'FILE-B' }] }

describe('import preview belongs to the current file', () => {
  it('a late preview from the previous file cannot overwrite the new plan', async () => {
    const pending: Array<{ file: unknown; resolve: (plan: ImportPreviewResponse['plan']) => void }> = []
    const commits: Array<{ mode: string; ledger: unknown }> = []

    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      importPreview: async (file: unknown) => new Promise<{ plan: ImportPreviewResponse['plan'] }>(resolve => {
        pending.push({ file, resolve: plan => resolve({ plan }) })
      }),
      importCommit: async (mode: 'merge' | 'replace', ledger: unknown) => {
        commits.push({ mode, ledger })
        return { mode, created: 2, overwritten: 1 }
      },
    }

    const controller = new BoardController(client as never)
    controller.start()
    cleanups.push(() => controller.dispose())
    await waitFor(() => controller.getSnapshot().workspaces.length === 1)
    controller.openImport()

    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)
    cleanups.push(() => { root.unmount(); host.remove() })
    root.render(React.createElement(ImportModal, { controller }))
    await waitFor(() => host.querySelector('input[type="file"]') !== null)

    // jsdom lacks DataTransfer/FileList and File.text(); patch the instance.
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    const pick = async (name: string, payload: unknown): Promise<void> => {
      const text = JSON.stringify(payload)
      const chosen = new File([text], name, { type: 'application/json' })
      Object.defineProperty(chosen, 'text', { value: async () => text })
      Object.defineProperty(input, 'files', { value: [chosen], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    await pick('a.json', ledgerA)
    await pick('b.json', ledgerB)
    await waitFor(() => pending.length === 2)

    // B's preview wins the race, then A's older preview lands afterwards.
    pending[1]!.resolve({ create: planRows('b', 2), overwrite: [{ id: 'b-o', title: 'B over', status: 'todo' }], invalid: [] })
    await new Promise(resolve => setTimeout(resolve, 0))
    pending[0]!.resolve({ create: planRows('a', 7), overwrite: [], invalid: [] })
    await new Promise(resolve => setTimeout(resolve, 0))

    const stats = Array.from(host.querySelectorAll('.dsh-atb-imp-stat b')).map(el => el.textContent)
    expect(stats).toEqual(['2', '1', '0'])
    expect(host.querySelector('.dsh-atb-imp-filename')!.textContent).toBe('b.json')

    // Run commits the file whose preview is on screen.
    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn'))
      .find(button => button.textContent === '执行导入')!
    expect(run.disabled).toBe(false)
    run.click()
    await waitFor(() => commits.length === 1)
    expect(commits[0]!.ledger).toEqual(ledgerB)
  })
})
