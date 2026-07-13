package agent

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"io"
	"runtime"

	"github.com/lyraos/vega-agent/internal/protocol"
)

const BackendVersion = "0.1.0"

type Server struct {
	PlatformVersion string
	Elevator        Elevator
}

type Elevator interface {
	Proof(context.Context) (map[string]any, error)
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
	mutations := []string{}
	elevatedMutations := []string{}
	if s.Elevator != nil {
		mutations = append(mutations, "elevatedProof")
		elevatedMutations = append(elevatedMutations, "elevatedProof")
	}
	if err := protocol.Write(output, protocol.Message{
		Version: protocol.Version, Kind: "hello", Nonce: nonce,
		Result: protocol.Capabilities{
			Platform: "windows", PlatformVersion: s.PlatformVersion, BackendVersion: BackendVersion,
			ProtocolVersion: protocol.Version, Modules: []string{"about"},
			ReadOperations: []string{"ping", "capabilities"}, Mutations: mutations, ElevatedMutations: elevatedMutations,
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
			if len(request.Params) > 0 && string(request.Params) != "{}" {
				err = protocol.Write(output, failure(request.RequestID, "INVALID_ARGUMENT", "system.ping não aceita parâmetros"))
				break
			}
			err = protocol.Write(output, protocol.Message{
				Version: protocol.Version, Kind: "result", RequestID: request.RequestID,
				Result: map[string]any{"version": BackendVersion, "connected": true, "platform": runtime.GOOS},
			})
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

func failure(requestID, code, message string) protocol.Message {
	return protocol.Message{Version: protocol.Version, Kind: "error", RequestID: requestID, Error: &protocol.Error{Code: code, Message: message}}
}
