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

	"github.com/lyraos/vega-agent/internal/processcontrol"
	"github.com/lyraos/vega-agent/internal/protocol"
)

const BackendVersion = "0.1.0"

type Server struct {
	PlatformVersion string
	Elevator        Elevator
	Collector       Collector
	Processes       ProcessController
}

type Elevator interface {
	Proof(context.Context) (map[string]any, error)
	Kill(context.Context, uint32) error
}

type ProcessController interface{ Kill(uint32) error }

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
	modules := []string{"about"}
	readOperations := []string{"ping", "capabilities"}
	mutations := []string{}
	elevatedMutations := []string{}
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
	if err := protocol.Write(output, protocol.Message{
		Version: protocol.Version, Kind: "hello", Nonce: nonce,
		Result: protocol.Capabilities{
			Platform: "windows", PlatformVersion: s.PlatformVersion, BackendVersion: BackendVersion,
			ProtocolVersion: protocol.Version, Modules: modules,
			ReadOperations: readOperations, Mutations: mutations, ElevatedMutations: elevatedMutations,
			MissingDependencies: []protocol.MissingDependency{},
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

func emptyParams(params []byte) bool { return len(params) == 0 || string(params) == "{}" }

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
