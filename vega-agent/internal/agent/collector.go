package agent

import "context"

type DiskUsage struct {
	Used    string  `json:"used"`
	Total   string  `json:"total"`
	Percent float64 `json:"percent"`
}

type HardwareInventory struct {
	CPU          string `json:"cpu"`
	GPU          string `json:"gpu"`
	RAMText      string `json:"ramText"`
	Manufacturer string `json:"manufacturer,omitempty"`
	Model        string `json:"model,omitempty"`
}

type SystemMetrics struct {
	CPUPercent     float64 `json:"cpuPercent"`
	MemUsed        uint64  `json:"memUsed"`
	MemTotal       uint64  `json:"memTotal"`
	SwapUsed       uint64  `json:"swapUsed"`
	SwapTotal      uint64  `json:"swapTotal"`
	DiskReadBytes  uint64  `json:"diskReadBytes"`
	DiskWriteBytes uint64  `json:"diskWriteBytes"`
	NetRxBytes     uint64  `json:"netRxBytes"`
	NetTxBytes     uint64  `json:"netTxBytes"`
}

type ProcessInfo struct {
	PID        uint32  `json:"pid"`
	Name       string  `json:"name"`
	User       string  `json:"user"`
	CPUPercent float64 `json:"cpuPercent"`
	Memory     uint64  `json:"memory"`
	State      string  `json:"state"`
	Protected  bool    `json:"protected,omitempty"`
}

type StorageVolumeInfo struct {
	Name       string  `json:"name"`
	Path       string  `json:"path"`
	Type       string  `json:"type"`
	FSType     string  `json:"fsType"`
	Size       string  `json:"size"`
	Used       string  `json:"used"`
	Avail      string  `json:"avail"`
	UsePercent float64 `json:"usePercent"`
	Mountpoint string  `json:"mountpoint"`
	Model      string  `json:"model"`
	Removable  bool    `json:"removable"`
	CanMount   bool    `json:"canMount"`
	CanUnmount bool    `json:"canUnmount"`
	Health     string  `json:"health,omitempty"`
	System     bool    `json:"system,omitempty"`
}

type Collector interface {
	SystemInfo(context.Context) (map[string]any, error)
	DiskUsage(context.Context) (DiskUsage, error)
	HardwareInventory(context.Context) (HardwareInventory, error)
	FirmwareStatus(context.Context) (string, error)
	SystemMetrics(context.Context) (SystemMetrics, error)
	ListProcesses(context.Context) ([]ProcessInfo, error)
	ListStorageVolumes(context.Context) ([]StorageVolumeInfo, error)
}
