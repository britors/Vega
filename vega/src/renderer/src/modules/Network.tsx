import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface FirewallServiceInfo {
  name: string
  label: string
  enabled: boolean
  profile?: string
  readOnly?: boolean
}

interface NetworkInterfaceInfo {
  name: string
  type: string
  state: string
  ipv4: string
  ipv6: string
  gateway: string
  dns: string
  mac: string
  speed: string
  signal: number
  device: string
  remoteSession?: boolean
}

interface WifiNetworkInfo {
  ssid: string
  security: string
  signal: number
  active: boolean
  device: string
}

interface ProxyConfig {
  http: string
  https: string
  socks: string
  no: string
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 'var(--lyra-radius-sm)',
  border: '1px solid var(--lyra-border)',
  background: 'var(--lyra-surface-raised)',
  color: 'var(--lyra-text)'
}

export default function Network(): JSX.Element {
  const dialogs = useDialogs()
  const [enabled, setEnabled] = useState(false)
  const [isWindows, setIsWindows] = useState(false)
  const [remoteSession, setRemoteSession] = useState(false)
  const [activeZone, setActiveZone] = useState('')
  const [services, setServices] = useState<FirewallServiceInfo[]>([])
  const [interfaces, setInterfaces] = useState<NetworkInterfaceInfo[]>([])
  const [wifi, setWifi] = useState<WifiNetworkInfo[]>([])
  const [proxy, setProxy] = useState<ProxyConfig>({ http: '', https: '', socks: '', no: '' })
  const [vpnPath, setVpnPath] = useState('')
  const [staticForm, setStaticForm] = useState({ connection: '', address: '', gateway: '', dns: '' })
  const [firewallForm, setFirewallForm] = useState({ label: '', direction: 'inbound', profile: 'private', protocol: 'tcp', kind: 'port', value: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [capabilities, status, nextServices, nextInterfaces, nextWifi, nextProxy] = await Promise.all([
        window.vega.getCapabilities(),
        window.vega.firewallStatus(),
        window.vega.firewallListServices(),
        window.vega.listNetworkInterfaces(),
        window.vega.listWifi(),
        window.vega.getProxy()
      ])
      setIsWindows(capabilities.platform === 'windows')
      setEnabled(status.enabled)
      setActiveZone(status.activeZone)
      setServices(nextServices)
      setInterfaces(nextInterfaces)
      setRemoteSession(nextInterfaces.some((item) => item.remoteSession))
      setWifi(nextWifi)
      setProxy(nextProxy)
    } catch (err) {
      setError((err as Error).message)
      setServices([])
      setInterfaces([])
      setWifi([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function toggleService(service: FirewallServiceInfo): Promise<void> {
    const ok = await dialogs.confirm({
      title: service.enabled ? 'Desativar serviço' : 'Ativar serviço',
      message: `${service.enabled ? 'Desativar' : 'Ativar'} ${service.label} (${service.name}) no firewall?${remoteSession ? ' Você está em uma sessão remota; esta alteração pode interromper o acesso.' : ''}`,
      variant: 'warning',
      confirmLabel: service.enabled ? 'Desativar' : 'Ativar'
    })
    if (!ok) return
    await runBusy(() => window.vega.firewallSetServiceEnabled(service.name, !service.enabled))
  }

  async function connectWifi(network: WifiNetworkInfo): Promise<void> {
    const password = network.security ? window.prompt(`Senha para ${network.ssid}`) || '' : ''
    await runBusy(() => window.vega.connectWifi(network.ssid, password))
  }

  async function disconnect(device: string): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Desconectar interface',
      message: `Desconectar ${device}?`,
      variant: 'warning',
      confirmLabel: 'Desconectar'
    })
    if (ok) await runBusy(() => window.vega.disconnectNetwork(device))
  }

  async function applyStatic(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Aplicar IPv4 estático',
      message: `Aplicar ${staticForm.address} em ${staticForm.connection}?${remoteSession ? ' Você está em uma sessão remota; uma configuração incorreta pode interromper imediatamente o acesso.' : ' A configuração anterior será restaurada se a aplicação falhar.'}`,
      variant: 'warning',
      confirmLabel: 'Aplicar'
    })
    if (ok) await runBusy(() => window.vega.setStaticIPv4(staticForm.connection, staticForm.address, staticForm.gateway, staticForm.dns))
  }

  async function applyProxy(): Promise<void> {
    await runBusy(() => window.vega.setProxy(proxy))
  }

  async function importVPN(): Promise<void> {
    if (!vpnPath.trim()) return
    await runBusy(() => window.vega.importVPN(vpnPath.trim()))
    setVpnPath('')
  }

  async function createFirewallRule(): Promise<void> {
    const value = firewallForm.value.trim()
    const spec = {
      label: firewallForm.label.trim(),
      direction: firewallForm.direction as 'inbound' | 'outbound',
      profile: firewallForm.profile as 'domain' | 'private' | 'public' | 'any',
      protocol: firewallForm.protocol as 'tcp' | 'udp',
      ...(firewallForm.kind === 'port'
        ? { port: Number(value) }
        : firewallForm.kind === 'program'
          ? { program: value }
          : { service: value })
    }
    const ok = await dialogs.confirm({
      title: 'Criar regra de firewall',
      message: `Permitir ${firewallForm.label || value} no perfil ${firewallForm.profile}? A regra será identificada e gerenciada exclusivamente pelo Vega.`,
      variant: 'warning',
      confirmLabel: 'Criar regra'
    })
    if (!ok) return
    await runBusy(() => window.vega.firewallCreateRule(spec))
    setFirewallForm((current) => ({ ...current, label: '', value: '' }))
  }

  async function runBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Rede e Firewall</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          {isWindows ? 'Adaptadores do Windows, Wi-Fi, proxy e Defender Firewall' : 'NetworkManager, informações detalhadas, proxy e firewalld'}
        </p>
      </div>

      {error && <div className="card" style={{ color: 'var(--lyra-danger)' }}>Falha: {error}</div>}
      {remoteSession && <div className="card" style={{ color: 'var(--lyra-warning)' }}>Sessão remota detectada. Alterações de IPv4 ou firewall podem interromper esta conexão.</div>}
      {loading && <EmptyState title="Carregando rede..." />}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Interfaces</h2>
        {interfaces.length === 0 ? (
          <EmptyState title="Nenhuma interface listada" message={isWindows ? 'O Windows não retornou adaptadores acessíveis.' : 'NetworkManager não retornou conexões ativas.'} />
        ) : (
          interfaces.map((iface) => (
            <div key={iface.device} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--lyra-border)', paddingBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{iface.name}</div>
                <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{iface.device} · {iface.type} · {iface.state}</div>
              </div>
              <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.84rem' }}>
                IPv4 {iface.ipv4 || '-'} · GW {iface.gateway || '-'} · DNS {iface.dns || '-'} · MAC {iface.mac || '-'} · {iface.speed || 'velocidade indisponível'}
              </div>
              <span />
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Wi-Fi</h2>
        {wifi.length === 0 ? (
          <EmptyState title="Nenhuma rede Wi-Fi listada" message={isWindows ? 'Sem rádio Wi-Fi ou serviço WLAN disponível.' : 'Sem rádio Wi-Fi ou nmcli indisponível.'} />
        ) : (
          wifi.slice(0, 12).map((network) => (
            <div key={`${network.device}-${network.ssid}`} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <strong>{network.ssid}</strong>
                <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{network.device} · sinal {network.signal}% · {network.security || 'aberta'}</div>
              </div>
              <button onClick={() => network.active ? disconnect(network.device) : connectWifi(network)} disabled={busy} style={{ padding: '6px 12px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: network.active ? 'transparent' : 'var(--lyra-gradient)', color: network.active ? 'var(--lyra-danger)' : '#fff' }}>
                {network.active ? 'Desconectar' : 'Conectar'}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>IPv4 estático</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <input placeholder="Conexão" value={staticForm.connection} onChange={(e) => setStaticForm({ ...staticForm, connection: e.target.value })} style={inputStyle} />
          <input placeholder="Endereço/prefixo" value={staticForm.address} onChange={(e) => setStaticForm({ ...staticForm, address: e.target.value })} style={inputStyle} />
          <input placeholder="Gateway" value={staticForm.gateway} onChange={(e) => setStaticForm({ ...staticForm, gateway: e.target.value })} style={inputStyle} />
          <input placeholder="DNS" value={staticForm.dns} onChange={(e) => setStaticForm({ ...staticForm, dns: e.target.value })} style={inputStyle} />
        </div>
        <button onClick={applyStatic} disabled={busy || !staticForm.connection || !staticForm.address} style={{ justifySelf: 'end', padding: '7px 14px', border: 'none', borderRadius: 'var(--lyra-radius-sm)', background: 'var(--lyra-gradient)', color: '#fff' }}>Aplicar IPv4</button>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{isWindows ? 'Proxy do usuário' : 'Proxy do sistema'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <input placeholder="HTTP" value={proxy.http} onChange={(e) => setProxy({ ...proxy, http: e.target.value })} style={inputStyle} />
          <input placeholder="HTTPS" value={proxy.https} onChange={(e) => setProxy({ ...proxy, https: e.target.value })} style={inputStyle} />
          <input placeholder="SOCKS" value={proxy.socks} onChange={(e) => setProxy({ ...proxy, socks: e.target.value })} style={inputStyle} />
          <input placeholder="Sem proxy para" value={proxy.no} onChange={(e) => setProxy({ ...proxy, no: e.target.value })} style={inputStyle} />
        </div>
        <button onClick={applyProxy} disabled={busy} style={{ justifySelf: 'end', padding: '7px 14px', border: 'none', borderRadius: 'var(--lyra-radius-sm)', background: 'var(--lyra-gradient)', color: '#fff' }}>Salvar proxy</button>
      </div>

      {!isWindows && <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>VPN</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="/caminho/perfil.ovpn" value={vpnPath} onChange={(e) => setVpnPath(e.target.value)} style={inputStyle} />
          <button onClick={importVPN} disabled={busy || !vpnPath.trim()} style={{ padding: '7px 14px', border: 'none', borderRadius: 'var(--lyra-radius-sm)', background: 'var(--lyra-gradient)', color: '#fff' }}>Importar</button>
        </div>
      </div>}

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Firewall</div>
          <div style={{ fontWeight: 600 }}>{enabled ? 'Ativado' : 'Desativado'}</div>
        </div>
        <div>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{isWindows ? 'Perfis ativos' : 'Zona ativa'}</div>
          <div style={{ fontWeight: 600 }}>{activeZone || 'nenhuma'}</div>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{isWindows ? 'Regras gerenciadas pelo Vega' : 'Serviços do firewall'}</h2>
        {services.map((service) => (
          <div key={service.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{service.label}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>{service.name}{service.profile ? ` · ${service.profile}` : ''}{service.readOnly ? ' · somente leitura (GPO)' : ''}</div>
            </div>
            <button onClick={() => toggleService(service)} disabled={busy || service.readOnly} style={{ padding: '6px 14px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: service.enabled ? 'transparent' : 'var(--lyra-gradient)', color: service.enabled ? 'var(--lyra-danger)' : '#fff' }}>
              {busy ? 'Processando...' : service.enabled ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        ))}
      </div>

      {isWindows && (
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Nova regra do Defender Firewall</h2>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Somente regras de permissão criadas pelo Vega podem ser alteradas aqui; regras de GPO permanecem somente leitura.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr)', gap: 8 }}>
            <input placeholder="Nome da regra" value={firewallForm.label} onChange={(e) => setFirewallForm({ ...firewallForm, label: e.target.value })} style={inputStyle} />
            <select value={firewallForm.direction} onChange={(e) => setFirewallForm({ ...firewallForm, direction: e.target.value })} style={inputStyle}><option value="inbound">Entrada</option><option value="outbound">Saída</option></select>
            <select value={firewallForm.profile} onChange={(e) => setFirewallForm({ ...firewallForm, profile: e.target.value })} style={inputStyle}><option value="private">Privado</option><option value="public">Público</option><option value="domain">Domínio</option><option value="any">Todos</option></select>
            <select value={firewallForm.protocol} onChange={(e) => setFirewallForm({ ...firewallForm, protocol: e.target.value })} style={inputStyle}><option value="tcp">TCP</option><option value="udp">UDP</option></select>
            <select value={firewallForm.kind} onChange={(e) => setFirewallForm({ ...firewallForm, kind: e.target.value, value: '' })} style={inputStyle}><option value="port">Porta</option><option value="program">Programa</option><option value="service">Serviço</option></select>
          </div>
          <input placeholder={firewallForm.kind === 'port' ? 'Porta (1-65535)' : firewallForm.kind === 'program' ? 'C:\\caminho\\aplicativo.exe' : 'Nome interno do serviço'} value={firewallForm.value} onChange={(e) => setFirewallForm({ ...firewallForm, value: e.target.value })} style={inputStyle} />
          <button onClick={createFirewallRule} disabled={busy || !firewallForm.label.trim() || !firewallForm.value.trim()} style={{ justifySelf: 'end', padding: '7px 14px', border: 'none', borderRadius: 'var(--lyra-radius-sm)', background: 'var(--lyra-gradient)', color: '#fff' }}>Criar regra</button>
        </div>
      )}
    </div>
  )
}
