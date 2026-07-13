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

	"github.com/lyraos/vega-agent/internal/eventlogs"
	"github.com/lyraos/vega-agent/internal/processcontrol"
	"github.com/lyraos/vega-agent/internal/protocol"
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
	MissingDependencies []protocol.MissingDependency
}

type Elevator interface {
	Proof(context.Context) (map[string]any, error)
	Kill(context.Context, uint32) error
	Service(context.Context, string, string) error
}

type ProcessController interface{ Kill(uint32) error }
type ServiceManager interface {
	List(context.Context, bool) ([]servicecontrol.Info, error)
}
type EventLogReader interface {
	ListChannels(context.Context) ([]string, error)
	Query(context.Context, eventlogs.Query) ([]eventlogs.Event, error)
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
