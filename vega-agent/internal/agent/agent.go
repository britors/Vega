package agent

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"runtime"
	"strings"

	"github.com/lyraos/vega-agent/internal/backup"
	"github.com/lyraos/vega-agent/internal/bluetooth"
	"github.com/lyraos/vega-agent/internal/displays"
	"github.com/lyraos/vega-agent/internal/eventlogs"
	"github.com/lyraos/vega-agent/internal/localaccounts"
	"github.com/lyraos/vega-agent/internal/networking"
	"github.com/lyraos/vega-agent/internal/processcontrol"
	"github.com/lyraos/vega-agent/internal/protocol"
	"github.com/lyraos/vega-agent/internal/regional"
	"github.com/lyraos/vega-agent/internal/servicecontrol"
	"github.com/lyraos/vega-agent/internal/software"
)

const BackendVersion = "0.1.0"

type Server struct {
	PlatformVersion     string
	Elevator            Elevator
	Collector           Collector
	Processes           ProcessController
	Software            software.Manager
	Services            ServiceManager
	EventLogs           EventLogReader
	Network             NetworkManager
	Wifi                WifiManager
	Accounts            AccountReader
	Regional            RegionalReader
	Backup              BackupManager
	Bluetooth           BluetoothManager
	Displays            DisplayManager
	MissingDependencies []protocol.MissingDependency
}

type Elevator interface {
	Proof(context.Context) (map[string]any, error)
	Kill(context.Context, uint32) error
	Service(context.Context, string, string) error
	StaticIPv4(context.Context, networking.StaticIPv4) error
	SetFirewallRule(context.Context, string, bool) error
	CreateFirewallRule(context.Context, networking.FirewallRuleSpec) (string, error)
	AccountCreate(context.Context, localaccounts.CreateParams) error
	AccountRemove(context.Context, localaccounts.RemoveParams) error
	AccountSetAdmin(context.Context, localaccounts.AdminParams) error
	RegionalApply(context.Context, regional.ApplyParams) error
}

type ProcessController interface{ Kill(uint32) error }
type ServiceManager interface {
	List(context.Context, bool) ([]servicecontrol.Info, error)
}
type EventLogReader interface {
	ListChannels(context.Context) ([]string, error)
	Query(context.Context, eventlogs.Query) ([]eventlogs.Event, error)
}
type NetworkManager interface {
	Interfaces(context.Context) ([]networking.InterfaceInfo, error)
	Firewall(context.Context) ([]networking.FirewallProfile, []networking.FirewallRule, error)
	Proxy(context.Context) (networking.ProxyConfig, error)
	SetUserProxy(context.Context, networking.ProxyConfig) error
}
type WifiManager interface {
	List(context.Context) ([]networking.WifiNetwork, error)
	Connect(context.Context, string, string) error
	Disconnect(context.Context, string) error
}
type AccountReader interface {
	List(context.Context) ([]localaccounts.Info, error)
}
type RegionalReader interface {
	Status(context.Context) (regional.Status, error)
	Timezones(context.Context) ([]string, error)
}
type BackupManager interface {
	List(context.Context) ([]backup.Config, error)
	Create(context.Context, backup.Config) (string, error)
	Delete(context.Context, string) error
	Snapshots(context.Context, string) ([]backup.Snapshot, error)
	Paths(context.Context, string, string) ([]string, error)
	Backup(context.Context, string, backup.Progress) error
	Restore(context.Context, backup.RestoreParams, backup.Progress) error
}
type BluetoothManager interface {
	Status(context.Context) (bluetooth.Status, error)
	List(context.Context, bool) ([]bluetooth.Device, error)
	Pair(context.Context, string) error
	Remove(context.Context, string) error
}
type DisplayManager interface {
	List(context.Context) ([]displays.Output, error)
	Apply(context.Context, displays.Config) (displays.ApplyResult, error)
	Confirm(context.Context, string) error
	Revert(context.Context, string) error
}

func (s Server) Serve(ctx context.Context, input io.Reader, output io.Writer) error {
	request, err := protocol.Read(input)
	if err != nil {
		return err
	}
	if request.Kind != "hello" || request.Version != protocol.Version {
		return protocol.Write(output, failure(request.RequestID, "PROTOCOL_MISMATCH", "versão de protocolo incompatível"))
	}
	nonceBytes := make([]byte, 32)
	if _, err := rand.Read(nonceBytes); err != nil {
		return err
	}
	nonce := base64.RawURLEncoding.EncodeToString(nonceBytes)
	seenRequests := make(map[string]struct{})
	modules := []string{"about", "assistant"}
	readOperations := []string{"ping", "capabilities"}
	mutations := []string{}
	elevatedMutations := []string{}
	missingDependencies := s.MissingDependencies
	if missingDependencies == nil {
		missingDependencies = []protocol.MissingDependency{}
	}
	if s.Collector != nil {
		modules = append(modules, "dashboard", "hardware", "monitor", "storage")
		readOperations = append(readOperations, "diskUsage", "hardwareInventory", "hardwareFirmwareStatus", "systemMetrics", "listProcesses", "listStorageVolumes")
	}
	if s.Elevator != nil {
		mutations = append(mutations, "elevatedProof")
		elevatedMutations = append(elevatedMutations, "elevatedProof")
	}
	if s.Processes != nil {
		mutations = append(mutations, "killProcess")
		if s.Elevator != nil {
			elevatedMutations = append(elevatedMutations, "killProcess")
		}
	}
	if s.Software != nil || hasMissingDependency(missingDependencies, "winget") {
		modules = append(modules, "software")
		readOperations = append(readOperations, "packageManagerName", "search", "listInstalled", "listUpdates", "getPackageDetails")
		if s.Software != nil {
			mutations = append(mutations, "install", "remove", "updateAll")
		}
	}
	if s.Services != nil {
		modules = append(modules, "services")
		readOperations = append(readOperations, "listManagedServices", "listAllManagedServices")
		if s.Elevator != nil {
			mutations = append(mutations, "setServiceEnabled", "setServiceRunning", "restartService")
			elevatedMutations = append(elevatedMutations, "setServiceEnabled", "setServiceRunning", "restartService")
		}
	}
	if s.EventLogs != nil {
		modules = append(modules, "logs")
		readOperations = append(readOperations, "listLogUnits", "queryLogs")
	}
	if s.Network != nil {
		modules = append(modules, "network")
		readOperations = append(readOperations, "listNetworkInterfaces", "getProxy", "firewallStatus", "firewallListServices")
		mutations = append(mutations, "setProxy")
		if s.Elevator != nil {
			mutations = append(mutations, "setStaticIPv4", "firewallSetServiceEnabled", "firewallCreateRule")
			elevatedMutations = append(elevatedMutations, "setStaticIPv4", "firewallSetServiceEnabled", "firewallCreateRule")
		}
	}
	if s.Wifi != nil {
		readOperations = append(readOperations, "listWifi")
		mutations = append(mutations, "connectWifi", "disconnectNetwork")
	}
	if s.Accounts != nil {
		modules = append(modules, "users")
		readOperations = append(readOperations, "listUsers")
		if s.Elevator != nil {
			mutations = append(mutations, "createUser", "removeUser", "setAdmin")
			elevatedMutations = append(elevatedMutations, "createUser", "removeUser", "setAdmin")
		}
	}
	if s.Regional != nil {
		modules = append(modules, "datetime")
		readOperations = append(readOperations, "dateTimeStatus", "listTimezones", "listLocales", "listKeymaps")
		if s.Elevator != nil {
			mutations = append(mutations, "applyDateTimeLocale")
			elevatedMutations = append(elevatedMutations, "applyDateTimeLocale")
		}
	}
	if s.Backup != nil {
		modules = append(modules, "backup")
		readOperations = append(readOperations, "listBackupConfigs", "listBackupSnapshots", "listBackupSnapshotPaths")
		mutations = append(mutations, "createBackupConfig", "runBackupNow", "restoreBackupSnapshot", "restoreBackupItems", "deleteBackupConfig")
	}
	if s.Bluetooth != nil || s.Displays != nil {
		modules = append(modules, "desktop")
		mutations = append(mutations, "applyWallpaper")
	}
	if s.Bluetooth != nil {
		readOperations = append(readOperations, "bluetoothStatus", "listBluetoothDevices")
		mutations = append(mutations, "setBluetoothScanning", "pairBluetoothDevice", "removeBluetoothDevice")
	}
	if s.Displays != nil {
		readOperations = append(readOperations, "listDisplays")
		mutations = append(mutations, "applyDisplayConfig", "confirmDisplayConfig", "revertDisplayConfig")
	}
	if err := protocol.Write(output, protocol.Message{
		Version: protocol.Version, Kind: "hello", Nonce: nonce,
		Result: protocol.Capabilities{
			Platform: "windows", PlatformVersion: s.PlatformVersion, BackendVersion: BackendVersion,
			ProtocolVersion: protocol.Version, Modules: modules,
			ReadOperations: readOperations, Mutations: mutations, ElevatedMutations: elevatedMutations,
			MissingDependencies: missingDependencies,
		},
	}); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		request, err = protocol.Read(input)
		if err != nil {
			return err
		}
		if request.Version != protocol.Version || request.Nonce != nonce {
			if err := protocol.Write(output, failure(request.RequestID, "PROTOCOL_MISMATCH", "nonce ou versão inválida")); err != nil {
				return err
			}
			continue
		}
		if request.RequestID == "" {
			if err := protocol.Write(output, failure("", "INVALID_ARGUMENT", "requestId obrigatório")); err != nil {
				return err
			}
			continue
		}
		if _, replay := seenRequests[request.RequestID]; replay {
			if err := protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "requestId reutilizado")); err != nil {
				return err
			}
			continue
		}
		seenRequests[request.RequestID] = struct{}{}
		switch request.Operation {
		case "system.ping":
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "system.ping não aceita parâmetros"))
				break
			}
			result := map[string]any{"version": BackendVersion, "connected": true, "platform": runtime.GOOS}
			if s.Collector != nil {
				if info, collectErr := s.Collector.SystemInfo(ctx); collectErr == nil {
					for key, value := range info {
						result[key] = value
					}
				}
			}
			err = protocol.Write(output, protocol.Message{
				Version: protocol.Version, Kind: "result", RequestID: request.RequestID,
				Result: result,
			})
		case "system.diskUsage":
			err = s.collect(output, request, func() (any, error) { return s.Collector.DiskUsage(ctx) })
		case "hardware.inventory":
			err = s.collect(output, request, func() (any, error) { return s.Collector.HardwareInventory(ctx) })
		case "hardware.firmwareStatus":
			err = s.collect(output, request, func() (any, error) { return s.Collector.FirmwareStatus(ctx) })
		case "monitor.metrics":
			err = s.collect(output, request, func() (any, error) { return s.Collector.SystemMetrics(ctx) })
		case "monitor.processes":
			err = s.collect(output, request, func() (any, error) { return s.Collector.ListProcesses(ctx) })
		case "storage.volumes":
			err = s.collect(output, request, func() (any, error) { return s.Collector.ListStorageVolumes(ctx) })
		case "process.kill":
			if s.Processes == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "encerramento de processos indisponível"))
				break
			}
			var params struct {
				PID uint32 `json:"pid"`
			}
			if decodeErr := decodeParams(request.Params, &params); decodeErr != nil || params.PID == 0 {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "PID inválido"))
				break
			}
			killErr := s.Processes.Kill(params.PID)
			if errors.Is(killErr, processcontrol.ErrProtected) {
				err = protocol.Write(output, failure(request.RequestID, "UNAUTHORIZED", "processo crítico protegido pelo Vega"))
				break
			}
			if errors.Is(killErr, processcontrol.ErrAccessDenied) && s.Elevator != nil {
				killErr = s.Elevator.Kill(ctx, params.PID)
			}
			if killErr != nil {
				code := "EXTERNAL_FAILURE"
				if errors.Is(killErr, processcontrol.ErrProtected) {
					code = "UNAUTHORIZED"
				}
				if strings.Contains(killErr.Error(), "UAC_CANCELED") {
					code = "CANCELED"
				}
				err = protocol.Write(output, failure(request.RequestID, code, killErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"terminated": true}})
		case "software.version":
			err = s.softwareRead(output, request, func() (any, error) { return s.Software.Version(ctx) })
		case "software.search":
			var params struct {
				Query string `json:"query"`
			}
			if decodeErr := decodeParams(request.Params, &params); decodeErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "consulta inválida"))
				break
			}
			err = s.softwareReadWithParams(output, request, func() (any, error) { return s.Software.Search(ctx, params.Query) })
		case "software.installed":
			err = s.softwareRead(output, request, func() (any, error) { return s.Software.ListInstalled(ctx) })
		case "software.updates":
			err = s.softwareRead(output, request, func() (any, error) { return s.Software.ListUpdates(ctx) })
		case "software.details":
			var params struct {
				Origin string `json:"origin"`
				ID     string `json:"id"`
			}
			if decodeErr := decodeParams(request.Params, &params); decodeErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "pacote inválido"))
				break
			}
			err = s.softwareReadWithParams(output, request, func() (any, error) { return s.Software.Details(ctx, params.Origin, params.ID) })
		case "software.install", "software.remove", "software.updateAll":
			var params struct {
				Origin           string `json:"origin"`
				ID               string `json:"id"`
				Scope            string `json:"scope"`
				AcceptAgreements bool   `json:"acceptAgreements"`
			}
			if !emptyParams(request.Params) {
				if decodeErr := decodeParams(request.Params, &params); decodeErr != nil {
					err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros de software inválidos"))
					break
				}
			}
			action := map[string]string{"software.install": "install", "software.remove": "remove", "software.updateAll": "updateAll"}[request.Operation]
			err = s.softwareMutate(ctx, output, request, software.Mutation{Action: action, Origin: params.Origin, ID: params.ID, Scope: params.Scope, AcceptAgreements: params.AcceptAgreements})
		case "services.list", "services.listAll":
			if s.Services == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "Service Control Manager indisponível"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "listagem de serviços não aceita parâmetros"))
				break
			}
			rows, listErr := s.Services.List(ctx, request.Operation == "services.listAll")
			if listErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", listErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: rows})
		case "services.start", "services.stop", "services.restart", "services.enable", "services.disable":
			if s.Elevator == nil || s.Services == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "controle de serviços indisponível"))
				break
			}
			var params struct {
				Name string `json:"name"`
			}
			if decodeErr := decodeParams(request.Params, &params); decodeErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros de serviço inválidos"))
				break
			}
			action := strings.TrimPrefix(request.Operation, "services.")
			if policyErr := servicecontrol.ValidateAction(params.Name, action); policyErr != nil {
				code := "INVALID_ARGUMENT"
				if errors.Is(policyErr, servicecontrol.ErrProtected) {
					code = "UNAUTHORIZED"
				}
				err = protocol.Write(output, failure(request.RequestID, code, policyErr.Error()))
				break
			}
			serviceErr := s.Elevator.Service(ctx, params.Name, action)
			if serviceErr != nil {
				code := "EXTERNAL_FAILURE"
				if strings.Contains(serviceErr.Error(), "UAC_CANCELED") {
					code = "CANCELED"
				}
				err = protocol.Write(output, failure(request.RequestID, code, serviceErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "eventlog.channels":
			if s.EventLogs == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "Windows Event Log indisponível"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "listagem de canais não aceita parâmetros"))
				break
			}
			channels, readErr := s.EventLogs.ListChannels(ctx)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: channels})
		case "eventlog.query":
			if s.EventLogs == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "Windows Event Log indisponível"))
				break
			}
			var params eventlogs.Query
			if decodeErr := decodeParams(request.Params, &params); decodeErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "filtros do Event Log inválidos"))
				break
			}
			params, validateErr := eventlogs.Validate(params)
			if validateErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
				break
			}
			events, readErr := s.EventLogs.Query(ctx, params)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: events})
		case "network.interfaces":
			err = s.networkRead(output, request, func() (any, error) { return s.Network.Interfaces(ctx) })
		case "network.wifi":
			if s.Wifi == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "Wi-Fi indisponível"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "listagem Wi-Fi não aceita parâmetros"))
				break
			}
			rows, readErr := s.Wifi.List(ctx)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: rows})
		case "network.proxy":
			err = s.networkRead(output, request, func() (any, error) { return s.Network.Proxy(ctx) })
		case "network.firewall":
			if s.Network == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "firewall indisponível"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "leitura do firewall não aceita parâmetros"))
				break
			}
			profiles, rules, readErr := s.Network.Firewall(ctx)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"profiles": profiles, "rules": rules}})
		case "network.wifiConnect":
			var params struct {
				SSID     string `json:"ssid"`
				Password string `json:"password"`
			}
			if s.Wifi == nil || decodeParams(request.Params, &params) != nil || networking.ValidateSSID(params.SSID, params.Password) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros Wi-Fi inválidos"))
				break
			}
			networking.AuditMutation("wifi.connect", "before", nil)
			if connectErr := s.Wifi.Connect(ctx, params.SSID, params.Password); connectErr != nil {
				networking.AuditMutation("wifi.connect", "after", connectErr)
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", connectErr.Error()))
				break
			}
			networking.AuditMutation("wifi.connect", "after", nil)
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "network.wifiDisconnect":
			var params struct {
				Device string `json:"device"`
			}
			if s.Wifi == nil || decodeParams(request.Params, &params) != nil || len(params.Device) < 2 || len(params.Device) > 64 {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "adaptador Wi-Fi inválido"))
				break
			}
			networking.AuditMutation("wifi.disconnect", "before", nil)
			if disconnectErr := s.Wifi.Disconnect(ctx, params.Device); disconnectErr != nil {
				networking.AuditMutation("wifi.disconnect", "after", disconnectErr)
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", disconnectErr.Error()))
				break
			}
			networking.AuditMutation("wifi.disconnect", "after", nil)
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "network.proxySet":
			var params networking.ProxyConfig
			if s.Network == nil || decodeParams(request.Params, &params) != nil || networking.ValidateProxy(params) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "configuração de proxy inválida"))
				break
			}
			networking.AuditMutation("proxy.set", "before", nil)
			if proxyErr := s.Network.SetUserProxy(ctx, params); proxyErr != nil {
				networking.AuditMutation("proxy.set", "after", proxyErr)
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", proxyErr.Error()))
				break
			}
			networking.AuditMutation("proxy.set", "after", nil)
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "network.staticIPv4", "network.firewallRuleSet", "network.firewallRuleCreate":
			err = s.networkElevated(ctx, output, request)
		case "accounts.list":
			if s.Accounts == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "contas locais indisponíveis"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "accounts.list não aceita parâmetros"))
				break
			}
			rows, readErr := s.Accounts.List(ctx)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: rows})
		case "accounts.create", "accounts.remove", "accounts.setAdmin":
			err = s.accountsElevated(ctx, output, request)
		case "regional.status":
			if s.Regional == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "configurações regionais indisponíveis"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "regional.status não aceita parâmetros"))
				break
			}
			value, readErr := s.Regional.Status(ctx)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: value})
		case "regional.timezones":
			if s.Regional == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "fusos horários indisponíveis"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "regional.timezones não aceita parâmetros"))
				break
			}
			value, readErr := s.Regional.Timezones(ctx)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: value})
		case "regional.apply":
			if s.Regional == nil || s.Elevator == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "alteração regional indisponível"))
				break
			}
			var params regional.ApplyParams
			if decodeParams(request.Params, &params) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "configuração regional inválida"))
				break
			}
			valid, validateErr := regional.ValidateApply(params)
			if validateErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
				break
			}
			applyErr := s.Elevator.RegionalApply(ctx, valid)
			if applyErr != nil {
				code := "EXTERNAL_FAILURE"
				if strings.Contains(applyErr.Error(), "UAC_CANCELED") {
					code = "CANCELED"
				}
				err = protocol.Write(output, failure(request.RequestID, code, applyErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "backup.configs":
			if s.Backup == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "backup indisponível"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "backup.configs não aceita parâmetros"))
				break
			}
			rows, readErr := s.Backup.List(ctx)
			if readErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: rows})
		case "backup.create":
			if s.Backup == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "backup indisponível"))
				break
			}
			var params backup.Config
			if decodeParams(request.Params, &params) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "configuração de backup inválida"))
				break
			}
			valid, validateErr := backup.ValidateConfig(params)
			if validateErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
				break
			}
			id, createErr := s.Backup.Create(ctx, valid)
			if createErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", createErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: id})
		case "backup.snapshots":
			err = s.backupRead(ctx, output, request, false)
		case "backup.paths":
			err = s.backupRead(ctx, output, request, true)
		case "backup.run":
			err = s.backupMutation(ctx, output, request, false)
		case "backup.restore":
			err = s.backupMutation(ctx, output, request, true)
		case "backup.delete":
			if s.Backup == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "backup indisponível"))
				break
			}
			var params struct {
				ID string `json:"id"`
			}
			if decodeParams(request.Params, &params) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "ID de backup inválido"))
				break
			}
			id, validateErr := backup.ValidateID(params.ID)
			if validateErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
				break
			}
			if deleteErr := s.Backup.Delete(ctx, id); deleteErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", deleteErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "bluetooth.status":
			if s.Bluetooth == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "Bluetooth indisponível"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "bluetooth.status não aceita parâmetros"))
				break
			}
			status, statusErr := s.Bluetooth.Status(ctx)
			if statusErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", statusErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: status})
		case "bluetooth.devices":
			if s.Bluetooth == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "Bluetooth indisponível"))
				break
			}
			var params struct {
				Scan bool `json:"scan"`
			}
			if decodeParams(request.Params, &params) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros Bluetooth inválidos"))
				break
			}
			devices, listErr := s.Bluetooth.List(ctx, params.Scan)
			if listErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", listErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: devices})
		case "bluetooth.pair", "bluetooth.remove":
			if s.Bluetooth == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "Bluetooth indisponível"))
				break
			}
			var params struct {
				Address string `json:"address"`
			}
			if decodeParams(request.Params, &params) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "endereço Bluetooth inválido"))
				break
			}
			address, validateErr := bluetooth.ValidateAddress(params.Address)
			if validateErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
				break
			}
			var bluetoothErr error
			if request.Operation == "bluetooth.pair" {
				bluetoothErr = s.Bluetooth.Pair(ctx, address)
			} else {
				bluetoothErr = s.Bluetooth.Remove(ctx, address)
			}
			if bluetoothErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", bluetoothErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "display.list":
			if s.Displays == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "monitores indisponíveis"))
				break
			}
			if !emptyParams(request.Params) {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "display.list não aceita parâmetros"))
				break
			}
			outputs, displayErr := s.Displays.List(ctx)
			if displayErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", displayErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: outputs})
		case "display.apply":
			if s.Displays == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "monitores indisponíveis"))
				break
			}
			var params displays.Config
			if decodeParams(request.Params, &params) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "configuração de monitor inválida"))
				break
			}
			valid, validateErr := displays.ValidateConfig(params)
			if validateErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
				break
			}
			result, applyErr := s.Displays.Apply(ctx, valid)
			if applyErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", applyErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: result})
		case "display.confirm", "display.revert":
			if s.Displays == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "monitores indisponíveis"))
				break
			}
			var params struct {
				Token string `json:"token"`
			}
			if decodeParams(request.Params, &params) != nil || displays.ValidateToken(params.Token) != nil {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "token de monitor inválido"))
				break
			}
			var displayErr error
			if request.Operation == "display.confirm" {
				displayErr = s.Displays.Confirm(ctx, params.Token)
			} else {
				displayErr = s.Displays.Revert(ctx, params.Token)
			}
			if displayErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", displayErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
		case "broker.proof":
			if s.Elevator == nil {
				err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "elevação indisponível"))
				break
			}
			result, proofErr := s.Elevator.Proof(ctx)
			if proofErr != nil {
				err = protocol.Write(output, failure(request.RequestID, "CANCELED", proofErr.Error()))
				break
			}
			err = protocol.Write(output, protocol.Message{
				Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: result,
			})
		default:
			err = protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "operação desconhecida"))
		}
		if err != nil {
			return err
		}
	}
}

func (s Server) accountsElevated(ctx context.Context, output io.Writer, request protocol.Message) error {
	if s.Accounts == nil || s.Elevator == nil {
		return protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "gerenciamento de contas indisponível"))
	}
	var err error
	switch request.Operation {
	case "accounts.create":
		var params localaccounts.CreateParams
		if decodeParams(request.Params, &params) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros de conta inválidos"))
		}
		valid, validateErr := localaccounts.ValidateCreate(params)
		if validateErr != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
		}
		err = s.Elevator.AccountCreate(ctx, valid)
	case "accounts.remove":
		var params localaccounts.RemoveParams
		if decodeParams(request.Params, &params) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros de conta inválidos"))
		}
		username, validateErr := localaccounts.ValidateUsername(params.Username)
		if validateErr != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
		}
		params.Username = username
		err = s.Elevator.AccountRemove(ctx, params)
	case "accounts.setAdmin":
		var params localaccounts.AdminParams
		if decodeParams(request.Params, &params) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros de conta inválidos"))
		}
		username, validateErr := localaccounts.ValidateUsername(params.Username)
		if validateErr != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
		}
		params.Username = username
		err = s.Elevator.AccountSetAdmin(ctx, params)
	}
	if err != nil {
		code := "EXTERNAL_FAILURE"
		if strings.Contains(err.Error(), "UAC_CANCELED") {
			code = "CANCELED"
		}
		return protocol.Write(output, failure(request.RequestID, code, err.Error()))
	}
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"changed": true}})
}

func (s Server) backupRead(ctx context.Context, output io.Writer, request protocol.Message, paths bool) error {
	if s.Backup == nil {
		return protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "backup indisponível"))
	}
	var params struct {
		ConfigID   string `json:"configId"`
		SnapshotID string `json:"snapshotId,omitempty"`
	}
	if decodeParams(request.Params, &params) != nil {
		return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros de backup inválidos"))
	}
	id, err := backup.ValidateID(params.ConfigID)
	if err != nil {
		return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", err.Error()))
	}
	if paths {
		valid, validateErr := backup.ValidateRestore(backup.RestoreParams{SnapshotID: params.SnapshotID, TargetPath: `C:\VegaRestore`, Mode: "separate-folder"})
		if validateErr != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
		}
		rows, readErr := s.Backup.Paths(ctx, id, valid.SnapshotID)
		if readErr != nil {
			return protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
		}
		return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: rows})
	}
	rows, readErr := s.Backup.Snapshots(ctx, id)
	if readErr != nil {
		return protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", readErr.Error()))
	}
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: rows})
}

func (s Server) backupMutation(ctx context.Context, output io.Writer, request protocol.Message, restore bool) error {
	if s.Backup == nil {
		return protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "backup indisponível"))
	}
	report := func(percent int, message string) {
		_ = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "progress", RequestID: request.RequestID, Result: map[string]any{"percent": percent, "message": message}})
	}
	var operationErr error
	if restore {
		var params backup.RestoreParams
		if decodeParams(request.Params, &params) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "parâmetros de restauração inválidos"))
		}
		valid, err := backup.ValidateRestore(params)
		if err != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", err.Error()))
		}
		operationErr = s.Backup.Restore(ctx, valid, report)
	} else {
		var params struct {
			ID string `json:"id"`
		}
		if decodeParams(request.Params, &params) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "ID de backup inválido"))
		}
		id, err := backup.ValidateID(params.ID)
		if err != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", err.Error()))
		}
		operationErr = s.Backup.Backup(ctx, id, report)
	}
	if operationErr != nil {
		return protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", operationErr.Error()))
	}
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: map[string]any{"message": "Operação de backup concluída."}})
}

func (s Server) networkRead(output io.Writer, request protocol.Message, operation func() (any, error)) error {
	if s.Network == nil {
		return protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "rede indisponível"))
	}
	if !emptyParams(request.Params) {
		return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "operação de rede não aceita parâmetros"))
	}
	result, err := operation()
	if err != nil {
		return protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", err.Error()))
	}
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: result})
}

func (s Server) networkElevated(ctx context.Context, output io.Writer, request protocol.Message) error {
	if s.Network == nil || s.Elevator == nil {
		return protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "mutação de rede elevada indisponível"))
	}
	var err error
	result := map[string]any{"changed": true}
	action := strings.TrimPrefix(request.Operation, "network.")
	switch request.Operation {
	case "network.staticIPv4":
		var params networking.StaticIPv4
		if decodeParams(request.Params, &params) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "configuração IPv4 inválida"))
		}
		valid, validateErr := networking.ValidateStaticIPv4(params)
		if validateErr != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
		}
		networking.AuditMutation(action, "before", nil)
		err = s.Elevator.StaticIPv4(ctx, valid)
	case "network.firewallRuleSet":
		var params struct {
			Name    string `json:"name"`
			Enabled bool   `json:"enabled"`
		}
		if decodeParams(request.Params, &params) != nil || networking.ValidateManagedRuleName(params.Name) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "regra de firewall inválida"))
		}
		networking.AuditMutation(action, "before", nil)
		err = s.Elevator.SetFirewallRule(ctx, params.Name, params.Enabled)
	case "network.firewallRuleCreate":
		var params networking.FirewallRuleSpec
		if decodeParams(request.Params, &params) != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "regra de firewall inválida"))
		}
		valid, validateErr := networking.ValidateFirewallRule(params)
		if validateErr != nil {
			return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", validateErr.Error()))
		}
		networking.AuditMutation(action, "before", nil)
		result["name"], err = s.Elevator.CreateFirewallRule(ctx, valid)
	}
	if err != nil {
		networking.AuditMutation(action, "after", err)
		code := "EXTERNAL_FAILURE"
		if strings.Contains(err.Error(), "UAC_CANCELED") {
			code = "CANCELED"
		}
		return protocol.Write(output, failure(request.RequestID, code, err.Error()))
	}
	networking.AuditMutation(action, "after", nil)
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: result})
}

func (s Server) collect(output io.Writer, request protocol.Message, operation func() (any, error)) error {
	if s.Collector == nil {
		return protocol.Write(output, failure(request.RequestID, "UNSUPPORTED", "coleta indisponível"))
	}
	if !emptyParams(request.Params) {
		return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "operação não aceita parâmetros"))
	}
	result, err := operation()
	if err != nil {
		return protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", err.Error()))
	}
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: result})
}

func (s Server) softwareRead(output io.Writer, request protocol.Message, operation func() (any, error)) error {
	if !emptyParams(request.Params) {
		return protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "operação não aceita parâmetros"))
	}
	return s.softwareReadWithParams(output, request, operation)
}

func (s Server) softwareReadWithParams(output io.Writer, request protocol.Message, operation func() (any, error)) error {
	if s.Software == nil {
		return protocol.Write(output, failure(request.RequestID, "UNAVAILABLE", "WinGet indisponível"))
	}
	result, err := operation()
	if err != nil {
		return protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", err.Error()))
	}
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: result})
}

func (s Server) softwareMutate(ctx context.Context, output io.Writer, request protocol.Message, mutation software.Mutation) error {
	if s.Software == nil {
		return protocol.Write(output, failure(request.RequestID, "UNAVAILABLE", "WinGet indisponível"))
	}
	progress := func(percent int, message string) {
		_ = protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "progress", RequestID: request.RequestID, Result: map[string]any{"percent": percent, "message": message}})
	}
	result, err := s.Software.Mutate(ctx, mutation, progress)
	if err != nil {
		return protocol.Write(output, failure(request.RequestID, "EXTERNAL_FAILURE", err.Error()))
	}
	return protocol.Write(output, protocol.Message{Version: protocol.Version, Kind: "result", RequestID: request.RequestID, Result: result})
}

func emptyParams(params []byte) bool { return len(params) == 0 || string(params) == "{}" }

func hasMissingDependency(dependencies []protocol.MissingDependency, id string) bool {
	for _, dependency := range dependencies {
		if dependency.ID == id {
			return true
		}
	}
	return false
}

func decodeParams(params []byte, target any) error {
	decoder := json.NewDecoder(strings.NewReader(string(params)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("parâmetros adicionais")
	}
	return nil
}

func failure(requestID, code, message string) protocol.Message {
	return protocol.Message{Version: protocol.Version, Kind: "error", RequestID: requestID, Error: &protocol.Error{Code: code, Message: message}}
}
