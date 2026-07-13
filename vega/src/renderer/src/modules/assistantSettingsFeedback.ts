export type SettingsFeedback = {
  kind: 'success' | 'error' | 'info'
  message: string
}

export function settingsFailure(action: string, error: unknown): SettingsFeedback {
  const raw = error instanceof Error ? error.message : String(error)
  const detail = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
    .slice(0, 400)

  return {
    kind: 'error',
    message: `${action}${detail ? ` ${detail}` : ' Tente novamente.'}`
  }
}
