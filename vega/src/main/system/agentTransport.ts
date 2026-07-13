import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { SystemClientError, type SystemCapabilities } from './types'

const PROTOCOL_VERSION = 1
const MAX_FRAME_SIZE = 1 << 20
const REQUEST_TIMEOUT_MS = 30_000

interface AgentMessage {
  version: number
  kind: 'hello' | 'result' | 'error' | 'progress'
  requestId?: string
  nonce?: string
  result?: unknown
  error?: { code: string; message: string }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  onProgress?: (progress: { percent: number; message: string }) => void
}

export class AgentTransport {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = Buffer.alloc(0)
  private pending = new Map<string, PendingRequest>()
  private helloResolve: ((message: AgentMessage) => void) | null = null
  private helloReject: ((error: Error) => void) | null = null
  private nonce = ''
  private capabilities: SystemCapabilities | null = null

  async connect(): Promise<SystemCapabilities> {
    if (this.capabilities) return this.capabilities
    const executable = process.env.VEGA_AGENT_PATH || join(process.resourcesPath, 'bin', 'vega-agent.exe')
    this.child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.child.stdout.on('data', (chunk: Buffer) => this.receive(chunk))
    this.child.stderr.on('data', () => undefined)
    this.child.once('error', (error) => this.failAll(new SystemClientError('UNAVAILABLE', 'Falha ao iniciar o agente Windows.', error)))
    this.child.once('exit', (code) => {
      if (this.child) this.failAll(new SystemClientError('EXTERNAL_FAILURE', `O agente Windows encerrou (${code ?? 'sem código'}).`))
      this.child = null
    })

    const hello = new Promise<AgentMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SystemClientError('UNAVAILABLE', 'Timeout no handshake do agente Windows.')), REQUEST_TIMEOUT_MS)
      this.helloResolve = (message) => { clearTimeout(timer); resolve(message) }
      this.helloReject = (error) => { clearTimeout(timer); reject(error) }
    })
    this.write({ version: PROTOCOL_VERSION, kind: 'hello', requestId: randomUUID() })
    const response = await hello
    if (response.version !== PROTOCOL_VERSION || !response.nonce || !isCapabilities(response.result)) {
      this.disconnect()
      throw new SystemClientError('EXTERNAL_FAILURE', 'Handshake incompatível com o agente Windows.')
    }
    this.nonce = response.nonce
    this.capabilities = response.result
    return response.result
  }

  async request<T>(
    operation: string,
    params: Record<string, unknown> = {},
    onProgress?: (progress: { percent: number; message: string }) => void,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<T> {
    if (!this.child || !this.nonce) throw new SystemClientError('UNAVAILABLE', 'Agente Windows desconectado.')
    const requestId = randomUUID()
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new SystemClientError('EXTERNAL_FAILURE', `Timeout na operação ${operation}.`))
      }, timeoutMs)
      this.pending.set(requestId, { resolve, reject, timer, onProgress })
    })
    this.write({ version: PROTOCOL_VERSION, kind: 'request', requestId, nonce: this.nonce, operation, params })
    return result as Promise<T>
  }

  disconnect(): void {
    const child = this.child
    this.child = null
    this.nonce = ''
    this.capabilities = null
    this.failAll(new SystemClientError('CANCELED', 'Conexão com o agente encerrada.'))
    child?.kill()
  }

  private write(message: Record<string, unknown>): void {
    if (!this.child) throw new SystemClientError('UNAVAILABLE', 'Agente Windows não iniciado.')
    const payload = Buffer.from(JSON.stringify(message), 'utf8')
    if (payload.length === 0 || payload.length > MAX_FRAME_SIZE) throw new SystemClientError('EXTERNAL_FAILURE', 'Payload do agente excede o limite.')
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(payload.length)
    this.child.stdin.write(Buffer.concat([header, payload]))
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32LE(0)
      if (size === 0 || size > MAX_FRAME_SIZE) {
        this.disconnect()
        return
      }
      if (this.buffer.length < size + 4) return
      const payload = this.buffer.subarray(4, size + 4)
      this.buffer = this.buffer.subarray(size + 4)
      try { this.dispatch(JSON.parse(payload.toString('utf8')) as AgentMessage) }
      catch { this.disconnect(); return }
    }
  }

  private dispatch(message: AgentMessage): void {
    if (message.kind === 'hello' && this.helloResolve) {
      const resolve = this.helloResolve
      this.helloResolve = null
      this.helloReject = null
      resolve(message)
      return
    }
    if (!message.requestId) return
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    if (message.kind === 'progress') {
      const progress = message.result as Partial<{ percent: number; message: string }>
      if (typeof progress?.percent === 'number' && typeof progress.message === 'string') {
        pending.onProgress?.({ percent: progress.percent, message: progress.message })
      }
      return
    }
    this.pending.delete(message.requestId)
    clearTimeout(pending.timer)
    if (message.kind === 'error') {
      const code = message.error?.code === 'UNSUPPORTED'
        ? 'UNSUPPORTED'
        : message.error?.code === 'UNAUTHORIZED'
          ? 'UNAUTHORIZED'
          : message.error?.code === 'CANCELED'
            ? 'CANCELED'
            : 'EXTERNAL_FAILURE'
      pending.reject(new SystemClientError(code, message.error?.message || 'Falha no agente Windows.'))
    } else if (message.kind === 'result') pending.resolve(message.result)
  }

  private failAll(error: Error): void {
    this.helloReject?.(error)
    this.helloResolve = null
    this.helloReject = null
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
  }
}

function isCapabilities(value: unknown): value is SystemCapabilities {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SystemCapabilities>
  return candidate.platform === 'windows' && candidate.protocolVersion === PROTOCOL_VERSION &&
    Array.isArray(candidate.modules) && Array.isArray(candidate.readOperations) && Array.isArray(candidate.mutations)
}
