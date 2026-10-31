// @vitest-environment jsdom
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { SettingsModal } from '../src/client/board/SettingsModal.tsx'
import { TaskFormModal, saveLastModel } from '../src/client/board/TaskFormModal.tsx'
import type { BoardSettings, TaskRecord } from '../src/shared/protocol.ts'
import type { CreateTaskBody, UpdateSettingsBody, UpdateTaskBody } from '../src/shared/api.ts'
import { waitFor } from './wait-for.ts'
import { disposeI18n, initI18n, localeStore } from '../src/client/i18n/runtime.ts'

const boardModel = { provider: 'p', model: 'reasoner', reasoningEffort: 'high' }
const modelKey = (model: { provider: string; model: string }) => JSON.stringify({ provider: model.provider, model: model.model })
const cleanups: Array<() => void> = []
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'zh-CN'; disposeI18n() })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); localStorage.clear() })

async function setup(initial: BoardSettings = {}) {
  let settings = initial
  const saved: UpdateSettingsBody[] = []
  const created: CreateTaskBody[] = []
  const updated: UpdateTaskBody[] = []
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks: [], settings }),
    workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
    stream: () => () => {},
    updateSettings: async (body: UpdateSettingsBody) => { saved.push(body); settings = body as BoardSettings; return settings },
    create: async (body: CreateTaskBody) => { created.push(body); return { id: 'new-task', version: 1 } },
    update: async (_id: string, body: UpdateTaskBody) => { updated.push(body); return { id: 'old-task', version: 2 } },
  } as never)
  controller.installModelCatalog(async () => [
    { provider: 'p', model: 'reasoner', name: 'Reasoner', reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }], defaultEffort: 'low' } },
    { provider: 'p', model: 'chat', name: 'Chat', reasoning: { efforts: [{ id: 'medium', name: 'Medium' }], defaultEffort: 'medium' } },
  ])
  controller.installPresetRoster(async () => ({ presets: [{ id: 'standard', name: 'Standard' }, { id: 'custom', name: 'Custom' }], defaultId: 'standard' }))
  controller.start()
  cleanups.push(() => controller.dispose())
  await waitFor(() => controller.getSnapshot().workspaces.length === 1)
  const host = document.createElement('div')
  document.body.append(host)
  const root: Root = createRoot(host)
  cleanups.push(() => { root.unmount(); host.remove() })
  const field = (label: string): HTMLSelectElement => {
    const found = Array.from(host.querySelectorAll('label')).find(el => el.querySelector('.dsh-atb-field-label')?.textContent === label)?.querySelector('select')
    expect(found).toBeTruthy()
    return found!
  }
  const change = (select: HTMLSelectElement, value: string) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) }
  const button = (text: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(el => el.textContent === text)!
  const title = () => {
    const input = host.querySelector<HTMLInputElement>('input[maxlength="200"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Defaults task')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { controller, root, host, saved, created, updated, field, change, button, title }
}

describe('board model, effort and preset defaults', () => {
  it('switches language immediately, preserves drafts, and restores the local preference', async () => {
    const view = await setup()
    initI18n({ getSnapshot: () => ({ active: 'zh', revision: 1 }), subscribe: () => () => {} })
    view.root.render(React.createElement(SettingsModal, { controller: view.controller }))
    await waitFor(() => view.field('默认模型').options.length === 3)
    expect(view.field('界面语言').value).toBe('follow')
    expect(Array.from(view.field('界面语言').options).map(option => option.value)).toEqual(['follow', 'zh', 'en', 'ru'])
    view.change(view.field('默认模型'), modelKey(boardModel))
    view.change(view.field('界面语言'), 'en')
    await waitFor(() => view.host.querySelector('h3')?.textContent === 'Board settings')
    expect(view.field('Interface language').value).toBe('en')
    expect(view.field('Default model').value).toBe(modelKey(boardModel))
    expect(view.saved).toEqual([])
    expect(document.documentElement.lang).toBe('zh-CN')
    view.root.render(null)
    await waitFor(() => view.host.childElementCount === 0)
    disposeI18n()
    expect(localeStore.getSnapshot().preference).toBe('en')
    view.root.render(React.createElement(SettingsModal, { controller: view.controller }))
    await waitFor(() => view.field('Interface language').value === 'en')
    view.change(view.field('Interface language'), 'ru')
    await waitFor(() => view.field('Язык интерфейса').value === 'ru')
    view.change(view.field('Язык интерфейса'), 'follow')
    await waitFor(() => view.field('界面语言').value === 'follow')
    expect(localeStore.getSnapshot().active).toBe('zh')
  })

  it.each(['unavailable', 'missing-effort'] as const)('shows and submits the saved effort when the catalog is %s', async catalogState => {
    const model = { ...boardModel, reasoningEffort: 'xhigh' }
    const view = await setup({ defaultModel: model, defaultPresetId: 'custom' })
    if (catalogState === 'unavailable') view.controller.installModelCatalog(async () => [])
    view.root.render(React.createElement(TaskFormModal, { controller: view.controller }))
    await waitFor(() => view.field('执行模式（preset）').options.length === 3)
    const effort = view.field('思考强度（Reasoning Effort）')
    expect(effort.value).toBe('xhigh')
    expect(effort.selectedOptions[0]?.textContent).toBe('xhigh')
    view.title()
    await waitFor(() => !view.button('创建任务').disabled)
    view.button('创建任务').click()
    await waitFor(() => view.created.length === 1)
    expect(view.created[0]?.model).toEqual(model)
  })

  it('stages and saves defaults, resets effort on model change, and can clear back to deployment defaults', async () => {
    const view = await setup({ defaultModel: boardModel, defaultPresetId: 'custom' })
    const { root, controller, field, change, button, saved } = view
    root.render(React.createElement(SettingsModal, { controller }))
    await waitFor(() => field('默认模型').options.length === 3)
    expect(field('默认模型').value).toBe(modelKey(boardModel))
    expect(field('默认推理强度').value).toBe('high')
    expect(field('默认 Agent preset').value).toBe('custom')
    expect(button('保存设置').disabled).toBe(true)
    change(field('默认模型'), modelKey({ provider: 'p', model: 'chat' }))
    await waitFor(() => field('默认推理强度').value === '')
    expect(Array.from(field('默认推理强度').options).map(o => o.value)).toEqual(['', 'medium'])
    change(field('默认推理强度'), 'medium')
    change(field('默认 Agent preset'), 'standard')
    await waitFor(() => !button('保存设置').disabled)
    button('保存设置').click()
    await waitFor(() => saved.length === 1)
    expect(saved[0]).toMatchObject({ defaultModel: { provider: 'p', model: 'chat', reasoningEffort: 'medium' }, defaultPresetId: 'standard' })
    root.render(null)
    await waitFor(() => view.host.childElementCount === 0)
    root.render(React.createElement(SettingsModal, { controller }))
    await waitFor(() => field('默认模型').value === modelKey({ provider: 'p', model: 'chat' }))
    change(field('默认模型'), '')
    change(field('默认 Agent preset'), '')
    await waitFor(() => field('默认推理强度').disabled && !button('保存设置').disabled)
    button('保存设置').click()
    await waitFor(() => saved.length === 2)
    expect(saved[1]).not.toHaveProperty('defaultModel')
    expect(saved[1]).not.toHaveProperty('defaultPresetId')
  })

  it('preserves saved selections when the runtime catalog is unavailable', async () => {
    const view = await setup({ defaultModel: { ...boardModel, reasoningEffort: 'xhigh' }, defaultPresetId: 'missing-preset' })
    view.controller.installModelCatalog(async () => [])
    view.controller.installPresetRoster(async () => ({ presets: [] }))
    view.root.render(React.createElement(SettingsModal, { controller: view.controller }))
    await waitFor(() => view.field('默认模型').value === modelKey(boardModel))
    expect(view.field('默认推理强度').value).toBe('xhigh')
    expect(view.field('默认 Agent preset').value).toBe('missing-preset')
    expect(view.button('保存设置').disabled).toBe(true)
  })

  it('new tasks inherit board defaults ahead of remembered model, and can explicitly follow deployment defaults', async () => {
    saveLastModel({ provider: 'p', model: 'chat', reasoningEffort: 'medium' })
    const view = await setup({ defaultModel: boardModel, defaultPresetId: 'custom' })
    const { root, controller, field, change, button, title, created } = view
    root.render(React.createElement(TaskFormModal, { controller }))
    await waitFor(() => field('执行模式（preset）').options.length === 3)
    expect(field('模型（默认 = 会话默认模型）').value).toBe(modelKey(boardModel))
    expect(field('思考强度（Reasoning Effort）').value).toBe('high')
    expect(field('执行模式（preset）').value).toBe('custom')
    title()
    await waitFor(() => !button('创建任务').disabled)
    button('创建任务').click()
    await waitFor(() => created.length === 1)
    expect(created[0]).toMatchObject({ model: boardModel, presetId: 'custom' })
    change(field('模型（默认 = 会话默认模型）'), '')
    change(field('执行模式（preset）'), '')
    await waitFor(() => field('模型（默认 = 会话默认模型）').value === '' && field('执行模式（preset）').value === '' && !button('创建任务').disabled)
    button('创建任务').click()
    await waitFor(() => created.length === 2)
    expect(created[1]).toMatchObject({ model: null, presetId: null })
  })

  it('template choices override defaults and editing an unpinned task never inherits defaults', async () => {
    const view = await setup({ defaultModel: boardModel, defaultPresetId: 'custom' })
    view.controller.newFromTemplate({ model: { provider: 'p', model: 'chat' }, presetId: 'standard' })
    view.root.render(React.createElement(TaskFormModal, { controller: view.controller }))
    await waitFor(() => view.field('执行模式（preset）').options.length === 3)
    expect(view.field('模型（默认 = 会话默认模型）').value).toBe(modelKey({ provider: 'p', model: 'chat' }))
    expect(view.field('思考强度（Reasoning Effort）').value).toBe('')
    expect(view.field('执行模式（preset）').value).toBe('standard')
    view.root.render(null)
    await waitFor(() => view.host.childElementCount === 0)
    const task: TaskRecord = { id: 'old-task', title: 'Old task', description: '', prompt: '', workspaceId: 'ws-a', urgency: 'normal', status: 'todo', blocked: false, execution: { mode: 'claim' }, version: 1, createdAt: 0, updatedAt: 0, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' }, comments: [], executions: [] }
    view.root.render(React.createElement(TaskFormModal, { controller: view.controller, task }))
    await waitFor(() => view.field('执行模式（preset）').options.length === 3)
    expect(view.field('模型（默认 = 会话默认模型）').value).toBe('')
    expect(view.field('执行模式（preset）').value).toBe('')
  })

  it('configures completed tasks display limit in SettingsModal with validation', async () => {
    const view = await setup({ completedDisplayLimit: 80 })
    const { root, controller, host, button, saved } = view
    root.render(React.createElement(SettingsModal, { controller }))
    const inputFor = (labelText: string) => {
      const label = Array.from(host.querySelectorAll('label')).find(el => el.querySelector('span')?.textContent?.includes(labelText))
      return label?.querySelector('input')
    }
    await waitFor(() => inputFor('已完成任务展示上限') !== undefined)
    const limitInput = inputFor('已完成任务展示上限')!
    expect(limitInput.value).toBe('80')
    expect(button('保存设置').disabled).toBe(true)

    const setInputValue = (input: HTMLInputElement, val: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, val)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    // Set to invalid (< 10)
    setInputValue(limitInput, '5')
    await waitFor(() => button('保存设置').disabled === true)

    // Set to invalid (> 500)
    setInputValue(limitInput, '550')
    await waitFor(() => button('保存设置').disabled === true)

    // Set to valid (120)
    setInputValue(limitInput, '120')
    await waitFor(() => button('保存设置').disabled === false)

    button('保存设置').click()
    await waitFor(() => saved.length === 1)
    expect(saved[0]).toMatchObject({ completedDisplayLimit: 120 })
  })
})
