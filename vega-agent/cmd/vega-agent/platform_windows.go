//go:build windows

package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/lyraos/vega-agent/internal/agent"
	"github.com/lyraos/vega-agent/internal/broker"
	"github.com/lyraos/vega-agent/internal/eventlogs"
	"github.com/lyraos/vega-agent/internal/localaccounts"
	"github.com/lyraos/vega-agent/internal/networking"
	"github.com/lyraos/vega-agent/internal/processcontrol"
	"github.com/lyraos/vega-agent/internal/protocol"
	"github.com/lyraos/vega-agent/internal/regional"
	"github.com/lyraos/vega-agent/internal/servicecontrol"
	"github.com/lyraos/vega-agent/internal/winget"
)

func runPlatformMode(args []string) bool {
	if len(args) == 0 || args[0] != "--broker" {
		return false
	}
	flags := flag.NewFlagSet("broker", flag.ContinueOnError)
	pipe := flags.String("pipe", "", "named pipe")
	serverPID := flags.Uint("server-pid", 0, "expected server process")
	sessionID := flags.Uint("session-id", 0, "expected Windows session")
	if err := flags.Parse(args[1:]); err != nil || *pipe == "" || *serverPID == 0 {
		fmt.Fprintln(os.Stderr, "vega-agent: argumentos do broker inválidos")
		return true
	}
	if err := broker.RunClient(context.Background(), *pipe, uint32(*serverPID), uint32(*sessionID)); err != nil {
		fmt.Fprintln(os.Stderr, "vega-agent: broker falhou")
	}
	return true
}

func newAgentServer() agent.Server {
	executable, _ := os.Executable()
	server := agent.Server{
		PlatformVersion: runtime.GOOS + "/" + runtime.GOARCH,
		Elevator:        broker.Elevator{Executable: executable},
		Collector:       agent.WindowsCollector{},
		Processes:       processcontrol.Controller{},
		Services:        servicecontrol.Manager{},
		EventLogs:       eventlogs.Reader{},
		Network:         networking.Reader{},
		Wifi:            networking.Wifi{},
		Accounts:        localaccounts.Manager{},
		Regional:        regional.Manager{},
	}
	software, err := winget.New()
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		_, err = software.Version(ctx)
		cancel()
	}
	if err == nil {
		server.Software = software
	} else {
		server.MissingDependencies = []protocol.MissingDependency{{ID: "winget", Modules: []string{"software"}, Detail: err.Error()}}
	}
	return server
}
