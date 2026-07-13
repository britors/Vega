import type { AIToolOutcome } from './types'

export interface ProposalResolution {
  approved: boolean
  outcome?: AIToolOutcome
}

interface PendingProposal {
  resolve: (resolution: ProposalResolution) => void
}

const pending = new Map<string, PendingProposal>()

export function createProposal(proposalId: string): Promise<ProposalResolution> {
  return new Promise((resolve) => {
    pending.set(proposalId, { resolve })
  })
}

export function resolveProposal(proposalId: string, resolution: ProposalResolution): boolean {
  const proposal = pending.get(proposalId)
  if (!proposal) return false
  pending.delete(proposalId)
  proposal.resolve(resolution)
  return true
}

// Chamado quando a janela fecha/recarrega enquanto uma proposta está
// pendente — sem isso, o loop do agente ficaria esperando para sempre uma
// resolução que nunca vai chegar.
export function rejectAllPending(reason: string): void {
  for (const [id, proposal] of pending) {
    pending.delete(id)
    proposal.resolve({ approved: false, outcome: { success: false, message: reason } })
  }
}
