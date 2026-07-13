import { describe, expect, it } from 'vitest'
import { settingsFailure } from './assistantSettingsFeedback'

describe('feedback das configurações da IA', () => {
  it('remove o prefixo técnico do IPC e mantém a causa útil', () => {
    expect(settingsFailure(
      'Não foi possível salvar.',
      new Error("Error invoking remote method 'ai:saveApiKey': Error: Armazenamento seguro indisponível.")
    )).toEqual({
      kind: 'error',
      message: 'Não foi possível salvar. Armazenamento seguro indisponível.'
    })
  })

  it('limita mensagens externas excessivamente longas', () => {
    const feedback = settingsFailure('Falha.', new Error('x'.repeat(600)))
    expect(feedback.message.length).toBeLessThanOrEqual(407)
  })
})
