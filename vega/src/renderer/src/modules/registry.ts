import Software from './Software'
import Snapshots from './Snapshots'
import Backup from './Backup'
import Hardware from './Hardware'
import Kernel from './Kernel'
import Network from './Network'
import Users from './Users'
import Services from './Services'
import Logs from './Logs'
import About from './About'
import type { ComponentType } from 'react'

export interface VegaModule {
  id: string
  label: string
  section: 'principal' | 'sistema' | 'outros'
  star?: boolean
  Component: ComponentType
}

// MVP ISO surface: expose only modules backed by working daemon methods.
export const modules: VegaModule[] = [
  { id: 'software', label: 'Software', section: 'principal', star: true, Component: Software },
  { id: 'snapshots', label: 'Pontos de Restauração', section: 'principal', Component: Snapshots },
  { id: 'backup', label: 'Backup', section: 'principal', Component: Backup },
  { id: 'hardware', label: 'Hardware', section: 'sistema', Component: Hardware },
  { id: 'kernel', label: 'Kernel', section: 'sistema', Component: Kernel },
  { id: 'network', label: 'Rede e Firewall', section: 'sistema', Component: Network },
  { id: 'users', label: 'Usuários', section: 'sistema', Component: Users },
  { id: 'services', label: 'Serviços', section: 'sistema', Component: Services },
  { id: 'logs', label: 'Log do Sistema', section: 'sistema', Component: Logs },
  { id: 'about', label: 'Sobre', section: 'outros', Component: About }
]
