// AuthRepository 契約テスト（Local / Supabase 実装の双方が通ること）
// createEnv: () => Promise<{ auth, users }>   users は USERS と同じ形（id, email, password）
// 前提（docs/03 3章に型の詳細がないため本テストで固定した契約）:
//   - signIn は成功時、ログインしたユーザー {id, email, ...} で resolve する。password は含まない
//   - getCurrentUser は未ログインなら null（同期でも非同期でも可。テストは await する）
//   - onAuthChange(cb) は解除関数を返す。cb はログイン/ログアウトのたびに user か null で呼ばれる
import { describe, it, expect, vi } from 'vitest'
import { signInAs } from './fixtures.js'

const tick = () => new Promise((r) => setTimeout(r, 0))

export function describeAuthRepositoryContract(label, createEnv) {
  describe(`AuthRepository 契約: ${label}`, () => {
    describe('signIn / getCurrentUser', () => {
      it('未ログインでは getCurrentUser が null', async () => {
        const { auth } = await createEnv()
        expect(await auth.getCurrentUser()).toBeNull()
      })

      it('正しいメール・パスワードでログインでき、そのユーザーが現在のユーザーになる', async () => {
        const env = await createEnv()
        const alice = env.users[0]
        const user = await env.auth.signIn(alice.email, alice.password)
        expect(user.id).toBe(alice.id)
        expect(user.email).toBe(alice.email)
        const current = await env.auth.getCurrentUser()
        expect(current.id).toBe(alice.id)
      })

      it('ユーザー情報にパスワードを含めない', async () => {
        const env = await createEnv()
        const user = await signInAs(env, 'alice')
        expect(user.password).toBeUndefined()
        expect((await env.auth.getCurrentUser()).password).toBeUndefined()
      })

      it('パスワードが違うと拒否され、現在のユーザーは変わらない', async () => {
        const env = await createEnv()
        const alice = env.users[0]
        await expect(env.auth.signIn(alice.email, 'wrong-pass')).rejects.toThrow()
        expect(await env.auth.getCurrentUser()).toBeNull()
      })

      it('未登録のメールは拒否される（サインアップはアプリに無い）', async () => {
        const env = await createEnv()
        await expect(env.auth.signIn('nobody@example.com', 'whatever')).rejects.toThrow()
        expect(await env.auth.getCurrentUser()).toBeNull()
      })

      it('別ユーザーでログインし直すと現在のユーザーが入れ替わる', async () => {
        const env = await createEnv()
        await signInAs(env, 'alice')
        await signInAs(env, 'bob')
        expect((await env.auth.getCurrentUser()).id).toBe('u-bob')
      })

      it('ログイン失敗しても、ログイン済みのユーザーは維持される', async () => {
        const env = await createEnv()
        await signInAs(env, 'alice')
        await expect(env.auth.signIn(env.users[1].email, 'wrong-pass')).rejects.toThrow()
        expect((await env.auth.getCurrentUser()).id).toBe('u-alice')
      })

      it('空のメール・パスワードは拒否される', async () => {
        const env = await createEnv()
        await expect(env.auth.signIn('', '')).rejects.toThrow()
        expect(await env.auth.getCurrentUser()).toBeNull()
      })
    })

    describe('signOut', () => {
      it('ログアウトすると getCurrentUser が null に戻る', async () => {
        const env = await createEnv()
        await signInAs(env, 'alice')
        await env.auth.signOut()
        expect(await env.auth.getCurrentUser()).toBeNull()
      })

      it('未ログインでの signOut はエラーにならない', async () => {
        const { auth } = await createEnv()
        await expect(auth.signOut()).resolves.not.toThrow()
      })
    })

    describe('onAuthChange', () => {
      it('ログインで user、ログアウトで null を通知する', async () => {
        const env = await createEnv()
        const cb = vi.fn()
        env.auth.onAuthChange(cb)
        await tick()
        await signInAs(env, 'alice')
        await tick()
        expect(cb.mock.lastCall[0].id).toBe('u-alice')
        await env.auth.signOut()
        await tick()
        expect(cb.mock.lastCall[0]).toBeNull()
      })

      it('ユーザーを切り替えたとき新しいユーザーを通知する', async () => {
        const env = await createEnv()
        await signInAs(env, 'alice')
        const cb = vi.fn()
        env.auth.onAuthChange(cb)
        await tick()
        await signInAs(env, 'bob')
        await tick()
        expect(cb.mock.lastCall[0].id).toBe('u-bob')
      })

      it('解除関数を呼ぶと、以後は通知されない', async () => {
        const env = await createEnv()
        const cb = vi.fn()
        const unsubscribe = env.auth.onAuthChange(cb)
        expect(typeof unsubscribe).toBe('function')
        await tick()
        unsubscribe()
        const before = cb.mock.calls.length
        await signInAs(env, 'alice')
        await tick()
        expect(cb.mock.calls.length).toBe(before)
      })

      it('複数の購読者すべてに通知する', async () => {
        const env = await createEnv()
        const a = vi.fn()
        const b = vi.fn()
        env.auth.onAuthChange(a)
        env.auth.onAuthChange(b)
        await tick()
        await signInAs(env, 'carol')
        await tick()
        expect(a.mock.lastCall[0].id).toBe('u-carol')
        expect(b.mock.lastCall[0].id).toBe('u-carol')
      })

      it('ログイン失敗では通知しない', async () => {
        const env = await createEnv()
        const cb = vi.fn()
        env.auth.onAuthChange(cb)
        await tick()
        const before = cb.mock.calls.length
        await expect(env.auth.signIn(env.users[0].email, 'wrong-pass')).rejects.toThrow()
        await tick()
        expect(cb.mock.calls.length).toBe(before)
      })
    })
  })
}
