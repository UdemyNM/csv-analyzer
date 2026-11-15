import { expect, test } from 'claude-code/testing'

// 使用量を差し替えて、出た 1 行と通知を集める
async function run(percent: number, limit: number, $: any, on: any) {
  const lines: string[] = []
  const toasts: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent }, rateLimits: [{ kind: 'five_hour', percentUsed: limit, resetsAt: 0 }], cost: null },
  }))
  on('ui.status', ($: any, e: any) => {
    lines.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'vscode', isInteractive: true, cwd: '/work' })
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 10, isAborted: false, usage: null })
  return { lines, toasts }
}

test('使用量が低いと、区切りの案内は出ない', async ($, on) => {
  const { lines, toasts } = await run(20, 10, $, on)
  expect(lines[lines.length - 1]).toMatch(/会話 20%/)
  expect(lines[lines.length - 1]).not.toMatch(/区切り/)
  expect(toasts).toEqual([])
})

test('枠が 90% を超えると、区切りどきと通知が出る', async ($, on) => {
  const { lines, toasts } = await run(30, 90, $, on)
  expect(lines[lines.length - 1]).toMatch(/five_hour 90%/)
  expect(lines[lines.length - 1]).toMatch(/区切りどき/)
  expect(toasts.length).toBe(1)
})

test('通知は、続けて何度も出ない', async ($, on) => {
  const { toasts } = await run(30, 90, $, on)
  expect(toasts.length).toBe(1)
})
