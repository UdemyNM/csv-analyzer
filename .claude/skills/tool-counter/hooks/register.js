// 数えた回数。ユーザーが送ったプロンプトのたびに、0 に戻す
let tools = 0
let subagents = 0

export function register(on) {
  // ユーザーが、プロンプトを送ったとき
  on('prompt.submit', async ($, e, next) => {
    tools = 0
    subagents = 0
    return next(e)
  })

  // Claude が、ツールを使うとき（サブエージェントの分も入る）
  on('tool.call', async ($, e, next) => {
    tools += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // サブエージェントが、始まるとき（動き直しは、数えない）
  on('agent.spawn', async ($, e, next) => {
    if (!e.resume) {
      subagents += 1
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // スピナーの横に、回数を足す
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    let suffix = ' · ツール ' + tools + ' 回'
    if (subagents > 0) {
      suffix += ' · サブエージェント ' + subagents
    }
    return next({ ...e, props: { ...e.props, suffix: suffix + '…' } })
  })
}
