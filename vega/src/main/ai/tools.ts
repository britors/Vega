import type { SystemClient } from '../system/systemClient'
import type { SystemCapabilities } from '../system/types'
import type { AITool } from './types'

export const readTools: AITool[] = [
  {
    name: 'search_packages',
    description: 'Busca pacotes disponíveis (oficiais, Flatpak ou comunidade) pelo nome ou palavra-chave.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Termo de busca' } },
      required: ['query']
    },
    mutating: false
  },
  {
    name: 'list_installed_packages',
    description: 'Lista os pacotes atualmente instalados no sistema.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_available_updates',
    description: 'Lista os pacotes com atualização disponível.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'get_hardware_overview',
    description: 'Retorna um resumo de CPU, GPU e memória RAM do sistema.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'get_disk_usage',
    description: 'Retorna uso de disco (usado, total e percentual) do sistema.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'get_firmware_status',
    description: 'Retorna o status de atualizações de firmware do sistema (fwupd).',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_installed_kernels',
    description: 'Lista os kernels atualmente instalados.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_available_kernels',
    description: 'Lista os pacotes de kernel disponíveis para instalação.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_network_interfaces',
    description: 'Lista as interfaces de rede (nome, tipo, IP, estado, MAC etc.).',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'get_firewall_status',
    description: 'Retorna se o firewall está ativo, a zona ativa e os serviços permitidos.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'get_datetime_status',
    description: 'Retorna fuso horário, sincronização NTP, locale e layout de teclado configurados.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_storage_volumes',
    description: 'Lista os volumes de armazenamento (discos/partições), com ponto de montagem, tamanho e uso.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'get_system_metrics',
    description: 'Retorna métricas atuais do sistema: uso de CPU, memória, swap, disco e rede.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_processes',
    description: 'Lista os processos em execução ordenados por uso de CPU (os 30 mais pesados).',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_users',
    description: 'Lista as contas de usuário do sistema e se são administradoras.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_managed_services',
    description: 'Lista os serviços systemd gerenciados pelo Vega (nome, se está habilitado/ativo).',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_snapshots',
    description: 'Lista os pontos de restauração (snapshots) existentes, com id, data e descrição.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'list_log_units',
    description: 'Lista os nomes de unidades systemd disponíveis para consulta de log.',
    inputSchema: { type: 'object', properties: {} },
    mutating: false
  },
  {
    name: 'query_system_logs',
    description:
      'Consulta o log do systemd de uma unidade específica. Retorna no máximo 100 linhas, mais recentes primeiro — dado potencialmente sensível (pode conter IPs, hostnames, nomes de usuário), só deve ser usado quando o usuário pedir explicitamente por log/diagnóstico.',
    inputSchema: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: 'Nome da unidade systemd (ver list_log_units)' },
        priority: { type: 'string', description: 'Prioridade mínima (ex.: "info", "warning", "err")' },
        since: { type: 'string', description: 'Janela de tempo, ex.: "1 hour ago", "today"' },
        search: { type: 'string', description: 'Termo de busca no texto do log (opcional)' },
        maxLines: { type: 'number', description: 'Máximo de linhas a retornar (será limitado a 100)' }
      },
      required: ['unit']
    },
    mutating: false
  }
]

export const mutatingTools: AITool[] = [
  {
    name: 'install_package',
    description:
      'Propõe instalar um pacote. Não executa a ação — apenas gera uma sugestão que precisa de confirmação explícita do usuário.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Origem do pacote: official, flathub ou aur' },
        id: { type: 'string', description: 'Identificador do pacote' }
      },
      required: ['origin', 'id']
    },
    mutating: true
  },
  {
    name: 'remove_package',
    description:
      'Propõe remover um pacote instalado. Não executa a ação — apenas gera uma sugestão que precisa de confirmação explícita do usuário.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Origem do pacote: official, flathub ou aur' },
        id: { type: 'string', description: 'Identificador do pacote' }
      },
      required: ['origin', 'id']
    },
    mutating: true
  },
  {
    name: 'clear_package_cache',
    description:
      'Propõe limpar o cache de pacotes baixados. Não executa a ação — apenas gera uma sugestão que precisa de confirmação explícita do usuário.',
    inputSchema: { type: 'object', properties: {} },
    mutating: true
  },
  {
    name: 'update_all_packages',
    description:
      'Propõe atualizar todos os pacotes do sistema. Chame list_available_updates antes para saber o que será afetado. Não executa sozinha — precisa de confirmação explícita.',
    inputSchema: { type: 'object', properties: {} },
    mutating: true
  },
  {
    name: 'optimize_mirrors',
    description: 'Propõe testar e otimizar a lista de mirrors do gerenciador de pacotes. Precisa de confirmação.',
    inputSchema: { type: 'object', properties: {} },
    mutating: true
  },
  {
    name: 'create_snapshot',
    description:
      'Propõe criar um novo ponto de restauração (snapshot). Ação de baixo risco — útil antes de outras mutações. Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: { description: { type: 'string', description: 'Descrição do snapshot' } },
      required: ['description']
    },
    mutating: true
  },
  {
    name: 'rollback_snapshot',
    description:
      'Propõe reverter o sistema para um snapshot existente. Ação de ALTO RISCO e difícil de desfazer — use list_snapshots antes para confirmar o id correto. Precisa de confirmação explícita.',
    inputSchema: {
      type: 'object',
      properties: { snapshotId: { type: 'number', description: 'Id do snapshot (ver list_snapshots)' } },
      required: ['snapshotId']
    },
    mutating: true
  },
  {
    name: 'delete_snapshot',
    description: 'Propõe apagar um snapshot existente (perde esse ponto de restauração). Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: { snapshotId: { type: 'number', description: 'Id do snapshot (ver list_snapshots)' } },
      required: ['snapshotId']
    },
    mutating: true
  },
  {
    name: 'set_retention_policy',
    description: 'Propõe alterar quantos snapshots manter (política de retenção). Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: { keepCount: { type: 'number', description: 'Quantidade de snapshots a manter' } },
      required: ['keepCount']
    },
    mutating: true
  },
  {
    name: 'set_service_enabled',
    description:
      'Propõe habilitar/desabilitar um serviço no boot. Cuidado com serviços essenciais (ex.: rede, ssh) — desabilitar pode derrubar o acesso à máquina. Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do serviço systemd' },
        enabled: { type: 'boolean', description: 'true para habilitar no boot, false para desabilitar' }
      },
      required: ['name', 'enabled']
    },
    mutating: true
  },
  {
    name: 'set_service_running',
    description:
      'Propõe iniciar ou parar um serviço agora. Cuidado com serviços essenciais — parar pode derrubar o acesso à máquina. Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do serviço systemd' },
        running: { type: 'boolean', description: 'true para iniciar, false para parar' }
      },
      required: ['name', 'running']
    },
    mutating: true
  },
  {
    name: 'restart_service',
    description: 'Propõe reiniciar um serviço systemd. Efeito temporário — a ação mais segura deste grupo. Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nome do serviço systemd' } },
      required: ['name']
    },
    mutating: true
  },
  {
    name: 'mount_volume',
    description: 'Propõe montar um volume de armazenamento pelo caminho do dispositivo. Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Caminho do dispositivo (ver list_storage_volumes)' } },
      required: ['path']
    },
    mutating: true
  },
  {
    name: 'unmount_volume',
    description:
      'Propõe desmontar um volume de armazenamento. Cuidado: desmontar um volume em uso pode causar perda de dados ou travar processos. Precisa de confirmação.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Caminho do dispositivo (ver list_storage_volumes)' } },
      required: ['path']
    },
    mutating: true
  }
]

export const allTools: AITool[] = [...readTools, ...mutatingTools]

const toolOperations: Record<string, string> = {
  search_packages: 'search', list_installed_packages: 'listInstalled', list_available_updates: 'listUpdates',
  get_hardware_overview: 'hardwareInventory', get_disk_usage: 'diskUsage', get_firmware_status: 'hardwareFirmwareStatus',
  list_installed_kernels: 'kernelListInstalled', list_available_kernels: 'kernelAvailablePackages',
  list_network_interfaces: 'listNetworkInterfaces', get_firewall_status: 'firewallStatus',
  get_datetime_status: 'dateTimeStatus', list_storage_volumes: 'listStorageVolumes', get_system_metrics: 'systemMetrics',
  list_processes: 'listProcesses', list_users: 'listUsers', list_managed_services: 'listManagedServices',
  list_snapshots: 'listSnapshots', list_log_units: 'listLogUnits', query_system_logs: 'queryLogs',
  install_package: 'install', remove_package: 'remove', clear_package_cache: 'clearCache',
  update_all_packages: 'updateAll', optimize_mirrors: 'optimizeMirrors', create_snapshot: 'createSnapshot',
  rollback_snapshot: 'rollbackSnapshot', delete_snapshot: 'deleteSnapshot', set_retention_policy: 'setRetentionPolicy',
  set_service_enabled: 'setServiceEnabled', set_service_running: 'setServiceRunning', restart_service: 'restartService',
  mount_volume: 'mountVolume', unmount_volume: 'unmountVolume'
}

export function toolsForCapabilities(capabilities: SystemCapabilities): AITool[] {
  const available = new Set([...capabilities.readOperations, ...capabilities.mutations])
  return allTools.filter((tool) => available.has(toolOperations[tool.name]))
}

export async function executeReadTool(
  name: string,
  input: Record<string, unknown>,
  vegaClient: SystemClient
): Promise<string> {
  switch (name) {
    case 'search_packages': {
      const query = typeof input.query === 'string' ? input.query : ''
      const results = await vegaClient.search(query)
      return JSON.stringify(results.slice(0, 20))
    }
    case 'list_installed_packages': {
      const results = await vegaClient.listInstalled()
      return JSON.stringify(results.slice(0, 50))
    }
    case 'list_available_updates': {
      const results = await vegaClient.listUpdates()
      return JSON.stringify(results)
    }
    case 'get_hardware_overview': {
      const info = await vegaClient.hardwareInventory()
      return JSON.stringify(info)
    }
    case 'get_disk_usage': {
      const usage = await vegaClient.diskUsage()
      return JSON.stringify(usage)
    }
    case 'get_firmware_status': {
      const status = await vegaClient.hardwareFirmwareStatus()
      return status
    }
    case 'list_installed_kernels': {
      const kernels = await vegaClient.kernelListInstalled()
      return JSON.stringify(kernels)
    }
    case 'list_available_kernels': {
      const kernels = await vegaClient.kernelAvailablePackages()
      return JSON.stringify(kernels)
    }
    case 'list_network_interfaces': {
      const interfaces = await vegaClient.listNetworkInterfaces()
      return JSON.stringify(interfaces)
    }
    case 'get_firewall_status': {
      const [status, services] = await Promise.all([
        vegaClient.firewallStatus(),
        vegaClient.firewallListServices()
      ])
      return JSON.stringify({ ...status, services })
    }
    case 'get_datetime_status': {
      const status = await vegaClient.dateTimeStatus()
      return JSON.stringify(status)
    }
    case 'list_storage_volumes': {
      const volumes = await vegaClient.listStorageVolumes()
      return JSON.stringify(volumes)
    }
    case 'get_system_metrics': {
      const metrics = await vegaClient.systemMetrics()
      return JSON.stringify(metrics)
    }
    case 'list_processes': {
      const processes = await vegaClient.listProcesses()
      const top = [...processes].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 30)
      return JSON.stringify(top)
    }
    case 'list_users': {
      const users = await vegaClient.listUsers()
      return JSON.stringify(users)
    }
    case 'list_managed_services': {
      const services = await vegaClient.listManagedServices()
      return JSON.stringify(services)
    }
    case 'list_snapshots': {
      const snapshots = await vegaClient.listSnapshots()
      return JSON.stringify(snapshots)
    }
    case 'list_log_units': {
      const units = await vegaClient.listLogUnits()
      return JSON.stringify(units)
    }
    case 'query_system_logs': {
      const unit = typeof input.unit === 'string' ? input.unit : ''
      const priority = typeof input.priority === 'string' ? input.priority : ''
      const since = typeof input.since === 'string' ? input.since : ''
      const search = typeof input.search === 'string' ? input.search : ''
      const requested = typeof input.maxLines === 'number' ? input.maxLines : 50
      // Dado potencialmente sensível (issue #34) — nunca deixamos o modelo
      // puxar mais que 100 linhas de uma vez, mesmo que peça.
      const maxLines = Math.max(1, Math.min(100, Math.round(requested)))
      const lines = await vegaClient.queryLogs(unit, priority, since, search, maxLines)
      return JSON.stringify(lines)
    }
    default:
      throw new Error(`Tool de leitura desconhecida: ${name}`)
  }
}

export async function describeMutation(
  name: string,
  input: Record<string, unknown>,
  vegaClient: SystemClient
): Promise<string> {
  switch (name) {
    case 'install_package':
      return `Instalar o pacote "${String(input.id)}" (origem: ${String(input.origin)}).`
    case 'remove_package':
      return `Remover o pacote "${String(input.id)}" (origem: ${String(input.origin)}).`
    case 'clear_package_cache':
      return 'Limpar o cache de pacotes baixados.'
    case 'update_all_packages': {
      try {
        const updates = await vegaClient.listUpdates()
        if (updates.length === 0) return 'Atualizar todos os pacotes (nenhuma atualização pendente no momento).'
        const names = updates.slice(0, 15).map((pkg) => pkg.name || pkg.id)
        const suffix = updates.length > 15 ? ` e mais ${updates.length - 15}` : ''
        return `Atualizar ${updates.length} pacote(s): ${names.join(', ')}${suffix}.`
      } catch {
        return 'Atualizar todos os pacotes do sistema.'
      }
    }
    case 'optimize_mirrors':
      return 'Testar e otimizar a lista de mirrors do gerenciador de pacotes.'
    case 'create_snapshot':
      return `Criar um snapshot com a descrição: "${String(input.description)}".`
    case 'rollback_snapshot':
      return `ALTO RISCO: reverter o sistema para o snapshot #${String(input.snapshotId)}. Esta ação é difícil de desfazer.`
    case 'delete_snapshot':
      return `Apagar o snapshot #${String(input.snapshotId)}.`
    case 'set_retention_policy':
      return `Manter apenas os ${String(input.keepCount)} snapshots mais recentes.`
    case 'set_service_enabled':
      return `${input.enabled ? 'Habilitar' : 'Desabilitar'} o serviço "${String(input.name)}" no boot.`
    case 'set_service_running':
      return `${input.running ? 'Iniciar' : 'Parar'} o serviço "${String(input.name)}" agora.`
    case 'restart_service':
      return `Reiniciar o serviço "${String(input.name)}".`
    case 'mount_volume':
      return `Montar o volume "${String(input.path)}".`
    case 'unmount_volume':
      return `Desmontar o volume "${String(input.path)}" (verifique se não está em uso).`
    default:
      return `Executar ação "${name}".`
  }
}
