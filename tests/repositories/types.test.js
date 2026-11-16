// 対象: src/repositories/types.js（JSDoc契約 + 共通エラークラス）
// 仕様: docs/03 3章（PermissionError）, 4章・7章（NotFoundError）
import { describe, it, expect } from 'vitest'
import { PermissionError, NotFoundError } from '../../src/repositories/types.js'

describe.each([
  ['PermissionError', PermissionError],
  ['NotFoundError', NotFoundError],
])('%s', (className, ErrorClass) => {
  it('Error を継承し、name がクラス名になる', () => {
    const err = new ErrorClass('理由')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ErrorClass)
    expect(err.name).toBe(className)
  })

  it('渡した message を保持する', () => {
    expect(new ErrorClass('理由').message).toBe('理由')
  })

  it('message を省略しても生成できる', () => {
    expect(() => new ErrorClass()).not.toThrow()
  })

  it('throw して instanceof で判別できる', () => {
    let caught
    try {
      throw new ErrorClass('x')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ErrorClass)
  })
})

describe('エラーの区別', () => {
  it('PermissionError と NotFoundError は互いに別のクラス', () => {
    expect(new PermissionError('a')).not.toBeInstanceOf(NotFoundError)
    expect(new NotFoundError('a')).not.toBeInstanceOf(PermissionError)
  })
})
