//go:build windows

package agent

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const powershellPreamble = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
`

type WindowsCollector struct{}

func runPowerShellJSON(ctx context.Context, script string, target any) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	encoded := base64.StdEncoding.EncodeToString([]byte(stringsToUTF16LE(powershellPreamble + script)))
	command := exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	output, err := command.Output()
	if err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("PowerShell timeout: %w", ctx.Err())
		}
		return fmt.Errorf("PowerShell: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	if err := json.Unmarshal(bytes.TrimSpace(output), target); err != nil {
		return fmt.Errorf("invalid PowerShell JSON: %w", err)
	}
	return nil
}

func stringsToUTF16LE(value string) []byte {
	runes := []rune(value)
	result := make([]byte, 0, len(runes)*2)
	for _, r := range runes {
		if r <= 0xffff {
			result = append(result, byte(r), byte(r>>8))
			continue
		}
		r -= 0x10000
		high, low := uint16(0xd800+(r>>10)), uint16(0xdc00+(r&0x3ff))
		result = append(result, byte(high), byte(high>>8), byte(low), byte(low>>8))
	}
	return result
}

func (WindowsCollector) SystemInfo(ctx context.Context) (map[string]any, error) {
	var result map[string]any
	err := runPowerShellJSON(ctx, `$os = Get-CimInstance Win32_OperatingSystem
[ordered]@{ name=$os.Caption; osVersion=$os.Version; build=$os.BuildNumber; architecture=$os.OSArchitecture } | ConvertTo-Json -Compress`, &result)
	return result, err
}

func (WindowsCollector) DiskUsage(ctx context.Context) (DiskUsage, error) {
	var result DiskUsage
	err := runPowerShellJSON(ctx, `$drive=$null; try{$drive=Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='"+$env:SystemDrive+"'")}catch{}
$size=if($drive){[uint64]$drive.Size}else{0}; $free=if($drive){[uint64]$drive.FreeSpace}else{0}; $used=$size-$free
[ordered]@{ used=('{0:N1} GiB' -f ($used/1GB)); total=('{0:N1} GiB' -f ($size/1GB)); percent=if($size){[math]::Round(100*$used/$size,1)}else{0} } | ConvertTo-Json -Compress`, &result)
	return result, err
}

func (WindowsCollector) HardwareInventory(ctx context.Context) (HardwareInventory, error) {
	var result HardwareInventory
	err := runPowerShellJSON(ctx, `$computer=$null; $cpu='indisponível'; $gpu='indisponível'
try { $computer = Get-CimInstance Win32_ComputerSystem } catch {}
try { $value = @(Get-CimInstance Win32_Processor | ForEach-Object Name) -join ', '; if($value){$cpu=$value} } catch {}
try { $value = @(Get-CimInstance Win32_VideoController | ForEach-Object Name) -join ', '; if($value){$gpu=$value} } catch {}
$ram = if($computer -and $computer.TotalPhysicalMemory){'{0:N1} GiB' -f ($computer.TotalPhysicalMemory/1GB)}else{'indisponível'}
[ordered]@{ cpu=$cpu; gpu=$gpu; ramText=$ram; manufacturer=if($computer){$computer.Manufacturer}else{''}; model=if($computer){$computer.Model}else{''} } | ConvertTo-Json -Compress`, &result)
	return result, err
}

func (WindowsCollector) FirmwareStatus(ctx context.Context) (string, error) {
	var wrapper struct {
		Value string `json:"value"`
	}
	err := runPowerShellJSON(ctx, `$value='indisponível'
try { $bios=Get-CimInstance Win32_BIOS; $parts=@($bios.Manufacturer,$bios.SMBIOSBIOSVersion); if($bios.ReleaseDate){$parts += $bios.ReleaseDate.ToString('yyyy-MM-dd')}; $text=($parts|Where-Object{$_}) -join ' · '; if($text){$value=$text} } catch {}
[ordered]@{ value=$value } | ConvertTo-Json -Compress`, &wrapper)
	return wrapper.Value, err
}

func (WindowsCollector) SystemMetrics(ctx context.Context) (SystemMetrics, error) {
	var result SystemMetrics
	err := runPowerShellJSON(ctx, `$os=$null; $cpu=$null; $page=@(); $disk=$null; $net=@()
try{$os=Get-CimInstance Win32_OperatingSystem}catch{}
try{$cpu=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"}catch{}
try{$page=@(Get-CimInstance Win32_PageFileUsage)}catch{}
try{$disk=@(Get-CimInstance Win32_PerfRawData_PerfDisk_PhysicalDisk|Where-Object Name -eq '_Total')[0]}catch{}
try{$net=@(Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface)}catch{}
$memTotal=if($os){[uint64]$os.TotalVisibleMemorySize*1KB}else{0}; $memUsed=if($os){$memTotal-([uint64]$os.FreePhysicalMemory*1KB)}else{0}
[ordered]@{ cpuPercent=if($cpu){[double]$cpu.PercentProcessorTime}else{0}; memUsed=$memUsed; memTotal=$memTotal; swapUsed=[uint64](($page|Measure-Object CurrentUsage -Sum).Sum)*1MB; swapTotal=[uint64](($page|Measure-Object AllocatedBaseSize -Sum).Sum)*1MB; diskReadBytes=if($disk){[uint64]$disk.DiskReadBytesPersec}else{0}; diskWriteBytes=if($disk){[uint64]$disk.DiskWriteBytesPersec}else{0}; netRxBytes=[uint64](($net|Measure-Object BytesReceivedPersec -Sum).Sum); netTxBytes=[uint64](($net|Measure-Object BytesSentPersec -Sum).Sum) } | ConvertTo-Json -Compress`, &result)
	return result, err
}

func (WindowsCollector) ListProcesses(ctx context.Context) ([]ProcessInfo, error) {
	var result []ProcessInfo
	err := runPowerShellJSON(ctx, `$cores = [math]::Max(1, [Environment]::ProcessorCount)
$critical = @('system','registry','smss','csrss','wininit','services','lsass','winlogon','fontdrvhost','dwm','svchost')
$owners=@{}; try { Get-Process -IncludeUserName -ErrorAction SilentlyContinue | ForEach-Object { $owners[[string]$_.Id]=[string]$_.UserName } } catch {}
$perfRows=@(); try { $perfRows=@(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process) } catch {}
$rows = foreach($perf in $perfRows | Where-Object { $_.IDProcess -gt 0 -and $_.Name -ne '_Total' }) {
  $owner = $owners[[string]$perf.IDProcess]
  $name = [string]$perf.Name
  [ordered]@{ pid=[uint32]$perf.IDProcess; name=$name; user=$owner; cpuPercent=[math]::Round([double]$perf.PercentProcessorTime/$cores,1); memory=[uint64]$perf.WorkingSetPrivate; state='running'; protected=($perf.IDProcess -le 4 -or $critical -contains $name.ToLowerInvariant()) }
}
ConvertTo-Json -InputObject @($rows) -Compress`, &result)
	if result == nil {
		result = []ProcessInfo{}
	}
	return result, err
}

func (WindowsCollector) ListStorageVolumes(ctx context.Context) ([]StorageVolumeInfo, error) {
	var result []StorageVolumeInfo
	err := runPowerShellJSON(ctx, `$volumes=@(); try{$volumes=@(Get-Volume)}catch{}
$rows = foreach($volume in $volumes) {
  $partition=$null; $disk=$null
  try { if($volume.DriveLetter){ $partition=Get-Partition -DriveLetter $volume.DriveLetter; $disk=$partition | Get-Disk } } catch {}
  $size=[uint64]$volume.Size; $free=[uint64]$volume.SizeRemaining; $used=$size-$free
  $path=if($volume.DriveLetter){[string]$volume.DriveLetter+':'}else{[string]$volume.Path}
  [ordered]@{ name=if($volume.FileSystemLabel){$volume.FileSystemLabel}else{$path}; path=$path; type=if($disk){[string]$disk.BusType}else{'volume'}; fsType=[string]$volume.FileSystem; size=('{0:N1} GiB' -f ($size/1GB)); used=('{0:N1} GiB' -f ($used/1GB)); avail=('{0:N1} GiB' -f ($free/1GB)); usePercent=if($size){[math]::Round(100*$used/$size,1)}else{0}; mountpoint=$path; model=if($disk){[string]$disk.FriendlyName}else{''}; removable=($disk -and @('USB','SD','MMC') -contains [string]$disk.BusType); canMount=$false; canUnmount=$false; health=[string]$volume.HealthStatus; system=($path -eq $env:SystemDrive) }
}
if($rows.Count -eq 0){
  $logical=@(); try{$logical=@(Get-CimInstance Win32_LogicalDisk)}catch{}
  $rows=foreach($volume in $logical){$size=[uint64]$volume.Size;$free=[uint64]$volume.FreeSpace;$used=$size-$free;[ordered]@{name=if($volume.VolumeName){$volume.VolumeName}else{$volume.DeviceID};path=[string]$volume.DeviceID;type='volume';fsType=[string]$volume.FileSystem;size=('{0:N1} GiB'-f($size/1GB));used=('{0:N1} GiB'-f($used/1GB));avail=('{0:N1} GiB'-f($free/1GB));usePercent=if($size){[math]::Round(100*$used/$size,1)}else{0};mountpoint=[string]$volume.DeviceID;model='';removable=($volume.DriveType-eq 2);canMount=$false;canUnmount=$false;health='Unknown';system=($volume.DeviceID-eq $env:SystemDrive)}}
}
ConvertTo-Json -InputObject @($rows) -Compress`, &result)
	if result == nil {
		result = []StorageVolumeInfo{}
	}
	return result, err
}
