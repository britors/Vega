import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type DialogVariant = 'info' | 'success' | 'warning' | 'danger'

interface DialogButton {
  label: string
  value: string
  primary?: boolean
}

interface DialogRequest {
  title: string
  message: string
  variant?: DialogVariant
  buttons: DialogButton[]
}

interface DialogContextValue {
  alert: (request: Omit<DialogRequest, 'buttons'>) => Promise<void>
  confirm: (request: Omit<DialogRequest, 'buttons'> & { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function useDialog(): DialogContextValue {
  const value = useContext(DialogContext)
  if (!value) throw new Error('DialogProvider is missing')
  return value
}

export function DialogProvider({ children }: { children: ReactNode }): JSX.Element {
  const [request, setRequest] = useState<DialogRequest | null>(null)
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  const api = useMemo<DialogContextValue>(
    () => ({
      alert: async ({ title, message, variant = 'info' }) => {
        await new Promise<void>((resolve) => {
          setResolver(() => () => resolve())
          setRequest({
            title,
            message,
            variant,
            buttons: [{ label: 'OK', value: 'ok', primary: true }]
          })
        })
      },
      confirm: async ({ title, message, variant = 'warning', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) => {
        return await new Promise<boolean>((resolve) => {
          setResolver(() => resolve)
          setRequest({
            title,
            message,
            variant,
            buttons: [
              { label: cancelLabel, value: 'cancel' },
              { label: confirmLabel, value: 'confirm', primary: true }
            ]
          })
        })
      }
    }),
    []
  )

  function close(value: boolean): void {
    const done = resolver
    setRequest(null)
    setResolver(null)
    done?.(value)
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request && (
        <div className="dialog-backdrop" role="presentation">
          <div className={`dialog dialog--${request.variant ?? 'info'}`} role="dialog" aria-modal="true">
            <h2 className="dialog__title">{request.title}</h2>
            <p className="dialog__message">{request.message}</p>
            <div className="dialog__actions">
              {request.buttons.map((button) => (
                <button
                  key={button.value}
                  className={`dialog__button ${button.primary ? 'dialog__button--primary' : ''}`}
                  onClick={() => close(button.value === 'confirm' || button.value === 'ok')}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
