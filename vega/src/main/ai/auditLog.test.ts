import { describe, expect, it } from 'vitest'
import { redactAuditEntry } from './auditRedaction'

describe('redactAuditEntry', () => {
  it('remove senhas, nonces, tokens e chaves inclusive em objetos aninhados', () => {
    const fixtures = ['Senha-Ultra-Secreta-123', 'nonce-arbitrario', 'token-arbitrario', 'chave-arbitraria']
    const redacted = redactAuditEntry({
      kind: 'mutation',
      toolName: 'test',
      input: {
        password: fixtures[0],
        nested: { nonce: fixtures[1], token: fixtures[2], apiKey: fixtures[3] }
      },
      detail: 'operação concluída'
    })
    const encoded = JSON.stringify(redacted)
    for (const fixture of fixtures) expect(encoded).not.toContain(fixture)
    expect(encoded).toContain('[segredo redigido]')
  })
})
