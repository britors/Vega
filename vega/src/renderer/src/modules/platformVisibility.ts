import type { SystemCapabilities, SystemModule } from '../../../main/system/types'

export function isModuleVisible(moduleId: SystemModule, capabilities: SystemCapabilities): boolean {
  return capabilities.modules.includes(moduleId)
}
