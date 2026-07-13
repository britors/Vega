import type { SystemCapabilities, SystemModule } from '../../../main/system/types'

/** Platform hard-stop for concepts that must never leak into another OS UI. */
export function isModuleVisible(moduleId: SystemModule, capabilities: SystemCapabilities): boolean {
  if (!capabilities.modules.includes(moduleId)) return false
  if (capabilities.platform === 'windows' && (moduleId === 'snapshots' || moduleId === 'kernel')) return false
  return true
}
