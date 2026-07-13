import { describe, expect, it } from 'vitest'
import { safeUpdaterError, updaterEnabled } from './updaterPolicy'

describe('política do auto-update', () => {
  it('habilita somente Windows empacotado ou override explícito', () => {
    expect(updaterEnabled('win32', true)).toBe(true)
    expect(updaterEnabled('win32', false)).toBe(false)
    expect(updaterEnabled('win32', false, '1')).toBe(true)
    expect(updaterEnabled('linux', true)).toBe(false)
  })

  it('não expõe URLs nem paths locais nos erros enviados ao renderer', () => {
    const result = safeUpdaterError(new Error('falhou C:\\Users\\ana\\update.exe em https://token@example.test/file'))
    expect(result).not.toContain('ana')
    expect(result).not.toContain('token')
  })
})
