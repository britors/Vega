package broker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/lyraos/vega-agent/internal/localaccounts"
	"github.com/lyraos/vega-agent/internal/networking"
	"github.com/lyraos/vega-agent/internal/processcontrol"
	"github.com/lyraos/vega-agent/internal/protocol"
	"github.com/lyraos/vega-agent/internal/regional"
	"github.com/lyraos/vega-agent/internal/servicecontrol"
)

type Executor interface {
	Kill(uint32) error
	Service(context.Context, string, string) error
	StaticIPv4(context.Context, networking.StaticIPv4) error
	SetFirewallRule(context.Context, string, bool) error
	CreateFirewallRule(context.Context, networking.FirewallRuleSpec) (string, error)
	AccountCreate(context.Context, localaccounts.CreateParams) error
	AccountRemove(context.Context, localaccounts.RemoveParams) error
	AccountSetAdmin(context.Context, localaccounts.AdminParams) error
	RegionalApply(context.Context, regional.ApplyParams) error
}

type DispatchResult struct {
	Values  map[string]any
	Failure *protocol.Error
}

func Dispatch(ctx context.Context, request protocol.Message, executor Executor) (DispatchResult, error) {
	result := DispatchResult{Values: map[string]any{"elevated": true}}
	externalFailure := func(err error) (DispatchResult, error) {
		_ = err
		return DispatchResult{Failure: &protocol.Error{Code: "EXTERNAL_FAILURE", Message: "operação privilegiada falhou"}}, nil
	}
	invalid := func(err error) (DispatchResult, error) {
		return DispatchResult{Failure: &protocol.Error{Code: "INVALID_ARGUMENT", Message: err.Error()}}, nil
	}

	switch request.Operation {
	case "broker.proof":
		if !emptyParams(request.Params) {
			return DispatchResult{}, fmt.Errorf("broker proof takes no parameters")
		}
	case "process.kill":
		var params struct {
			PID uint32 `json:"pid"`
		}
		if err := decodeClosed(request.Params, &params); err != nil || params.PID == 0 {
			return DispatchResult{}, fmt.Errorf("invalid process.kill parameters")
		}
		if err := executor.Kill(params.PID); err != nil {
			code := "EXTERNAL_FAILURE"
			if errors.Is(err, processcontrol.ErrProtected) {
				code = "UNAUTHORIZED"
			}
			return DispatchResult{Failure: &protocol.Error{Code: code, Message: err.Error()}}, nil
		}
		result.Values["terminated"] = true
	case "services.start", "services.stop", "services.restart", "services.enable", "services.disable":
		var params struct {
			Name string `json:"name"`
		}
		if err := decodeClosed(request.Params, &params); err != nil {
			return DispatchResult{}, fmt.Errorf("invalid service parameters")
		}
		action := strings.TrimPrefix(request.Operation, "services.")
		if err := servicecontrol.ValidateAction(params.Name, action); err != nil {
			code := "INVALID_ARGUMENT"
			if errors.Is(err, servicecontrol.ErrProtected) {
				code = "UNAUTHORIZED"
			}
			return DispatchResult{Failure: &protocol.Error{Code: code, Message: err.Error()}}, nil
		}
		if err := executor.Service(ctx, params.Name, action); err != nil {
			return externalFailure(err)
		}
		result.Values["changed"] = true
	case "network.staticIPv4":
		var params networking.StaticIPv4
		if err := decodeClosed(request.Params, &params); err != nil {
			return DispatchResult{}, fmt.Errorf("invalid network.staticIPv4 parameters")
		}
		valid, err := networking.ValidateStaticIPv4(params)
		if err != nil {
			return invalid(err)
		}
		if err := executor.StaticIPv4(ctx, valid); err != nil {
			return externalFailure(err)
		}
		result.Values["changed"] = true
	case "network.firewallRuleSet":
		var params struct {
			Name    string `json:"name"`
			Enabled bool   `json:"enabled"`
		}
		if err := decodeClosed(request.Params, &params); err != nil || networking.ValidateManagedRuleName(params.Name) != nil {
			return DispatchResult{}, fmt.Errorf("invalid network.firewallRuleSet parameters")
		}
		if err := executor.SetFirewallRule(ctx, params.Name, params.Enabled); err != nil {
			return externalFailure(err)
		}
		result.Values["changed"] = true
	case "network.firewallRuleCreate":
		var params networking.FirewallRuleSpec
		if err := decodeClosed(request.Params, &params); err != nil {
			return DispatchResult{}, fmt.Errorf("invalid network.firewallRuleCreate parameters")
		}
		valid, err := networking.ValidateFirewallRule(params)
		if err != nil {
			return invalid(err)
		}
		name, err := executor.CreateFirewallRule(ctx, valid)
		if err != nil {
			return externalFailure(err)
		}
		result.Values["name"] = name
	case "accounts.create":
		var params localaccounts.CreateParams
		if err := decodeClosed(request.Params, &params); err != nil {
			return DispatchResult{}, fmt.Errorf("invalid accounts.create parameters")
		}
		valid, err := localaccounts.ValidateCreate(params)
		if err != nil {
			return invalid(err)
		}
		if err := executor.AccountCreate(ctx, valid); err != nil {
			return externalFailure(err)
		}
		result.Values["changed"] = true
	case "accounts.remove":
		var params localaccounts.RemoveParams
		if err := decodeClosed(request.Params, &params); err != nil {
			return DispatchResult{}, fmt.Errorf("invalid accounts.remove parameters")
		}
		username, err := localaccounts.ValidateUsername(params.Username)
		if err != nil {
			return invalid(err)
		}
		params.Username = username
		if err := executor.AccountRemove(ctx, params); err != nil {
			return externalFailure(err)
		}
		result.Values["changed"] = true
	case "accounts.setAdmin":
		var params localaccounts.AdminParams
		if err := decodeClosed(request.Params, &params); err != nil {
			return DispatchResult{}, fmt.Errorf("invalid accounts.setAdmin parameters")
		}
		username, err := localaccounts.ValidateUsername(params.Username)
		if err != nil {
			return invalid(err)
		}
		params.Username = username
		if err := executor.AccountSetAdmin(ctx, params); err != nil {
			return externalFailure(err)
		}
		result.Values["changed"] = true
	case "regional.apply":
		var params regional.ApplyParams
		if err := decodeClosed(request.Params, &params); err != nil {
			return DispatchResult{}, fmt.Errorf("invalid regional.apply parameters")
		}
		valid, err := regional.ValidateApply(params)
		if err != nil {
			return invalid(err)
		}
		if err := executor.RegionalApply(ctx, valid); err != nil {
			return externalFailure(err)
		}
		result.Values["changed"] = true
	default:
		return DispatchResult{}, fmt.Errorf("broker operation not allowed")
	}
	return result, nil
}

func emptyParams(params json.RawMessage) bool {
	value := strings.TrimSpace(string(params))
	return value == "" || value == "{}" || value == "null"
}

func decodeClosed(params []byte, target any) error {
	decoder := json.NewDecoder(strings.NewReader(string(params)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("trailing parameters")
	}
	return nil
}
