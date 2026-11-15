// 85% を超えた通知を、もう出したか
let warned = false

export function register(on) {
  // セッションの開始のときに、1 回出す
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await show($)
    return result
  })

  // メインの会話のターンが終わるたびに、出し直す（サブエージェントのターンは数えない）
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      await show($)
    }
    return result
  })
}

async function show($) {
  try {
    const usage = await $.session.usage()
    const context = Math.round(usage.context?.percent ?? 0)
    const limits = usage.rateLimits ?? []
    const worst = Math.max(context, ...limits.map((l) => Math.round(l.percentUsed ?? 0)))

    let line = '使用量　会話 ' + context + '%'
    for (const limit of limits) {
      line += '　' + limit.kind + ' ' + Math.round(limit.percentUsed ?? 0) + '%'
    }
    if (worst >= 85) {
      line += '　区切りどき：commit して、新しい会話へ'
    } else if (worst >= 60) {
      line += '　そろそろ区切りを考える'
    }
    // プロンプトの上に、1 行。VS Code でも出る
    await $.ui.status(line)

    if (worst >= 85 && !warned) {
      warned = true
      await $.ui.toast('使用量が 85% を超えた。commit して、区切る')
    } else if (worst < 85) {
      warned = false
    }
  } catch {
    // 読めなかったときは、前の表示のまま
  }
}
