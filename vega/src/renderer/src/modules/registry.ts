import Dashboard from './Dashboard'
import Software from './Software'
import Snapshots from './Snapshots'
import Backup from './Backup'
import Hardware from './Hardware'
import Kernel from './Kernel'
import Network from './Network'
import DateTimeLocale from './DateTimeLocale'
import Storage from './Storage'
import SystemMonitor from './SystemMonitor'
import Users from './Users'
import Services from './Services'
import Logs from './Logs'
import About from './About'
import Assistant from './Assistant'
import type { ComponentType } from 'react'
import type { SystemModule } from '../../../main/system/types'

export interface VegaModule {
  id: SystemModule
  label: string
  section: 'principal' | 'sistema' | 'outros'
  star?: boolean
  Component: ComponentType
}

// MVP ISO surface: expose only modules backed by working daemon methods.
export const modules: VegaModule[] = [
  { id: 'dashboard', label: 'Painel', section: 'principal', Component: Dashboard },
  { id: 'assistant', label: 'Assistente', section: 'principal', Component: Assistant },
  { id: 'software', label: 'Software', section: 'principal', star: true, Component: Software },
  { id: 'snapshots', label: 'Pontos de Restauração', section: 'principal', Component: Snapshots },
  { id: 'backup', label: 'Backup', section: 'principal', Component: Backup },
  { id: 'hardware', label: 'Hardware', section: 'sistema', Component: Hardware },
  { id: 'kernel', label: 'Kernel', section: 'sistema', Component: Kernel },
  { id: 'network', label: 'Rede e Firewall', section: 'sistema', Component: Network },
  { id: 'datetime', label: 'Data, Hora e Idioma', section: 'sistema', Component: DateTimeLocale },
  { id: 'storage', label: 'Armazenamento', section: 'sistema', Component: Storage },
  { id: 'monitor', label: 'Monitor de Sistema', section: 'sistema', Component: SystemMonitor },
  { id: 'users', label: 'Usuários', section: 'sistema', Component: Users },
  { id: 'services', label: 'Serviços', section: 'sistema', Component: Services },
  { id: 'logs', label: 'Log do Sistema', section: 'sistema', Component: Logs },
  { id: 'about', label: 'Sobre', section: 'outros', Component: About }
]
