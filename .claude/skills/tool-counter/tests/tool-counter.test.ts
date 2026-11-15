import { expect, test } from 'claude-code/testing'

const SPINNER = {
  plugin: 'tool-counter',
  component: 'Spinner',
  requestId: 'main',
  viewport: { columns: 100, rows: 30 },
  props: { word: 'Thinking', message: '', suffix: '', mode: 'thinking' },
} as const

// 先に、スタブを全部登録する（$ を呼んだあとでは、登録できない）
function setup(on: any) {
  const seen = { suffix: '' }
  on('prompt.submit', ($: any, e: any) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' }))
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
  on('ui.render', ($: any, e: any) => {
    seen.suffix = e.props.suffix
    return { type: 'Text', props: {}, children: [e.props.suffix] }
  })
  return seen
}

test('ツールを 2 回使うと、「ツール 2 回」と出る', async ($, on) => {
  const seen = setup(on)
  await $.prompt.submit({ text: 'x' })
  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.ui.mount({ ...SPINNER, surface: 'vscode' })
  expect(seen.suffix).toMatch(/ツール 2 回/)
})

test('サブエージェントが始まると、数が出る', async ($, on) => {
  const seen = setup(on)
  await $.prompt.submit({ text: 'x' })
  await $.agent.spawn({ subagentType: 'ui_reviewer', prompt: 'x', description: 'x' })
  await $.ui.mount({ ...SPINNER, surface: 'vscode' })
  expect(seen.suffix).toMatch(/サブエージェント 1/)
})

test('新しいプロンプトを送ると、0 に戻る', async ($, on) => {
  const seen = setup(on)
  await $.prompt.submit({ text: 'x' })
  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  await $.prompt.submit({ text: 'y' })
  await $.ui.mount({ ...SPINNER, surface: 'vscode' })
  expect(seen.suffix).toMatch(/ツール 0 回/)
})
