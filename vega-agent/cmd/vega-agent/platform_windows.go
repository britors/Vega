//go:build windows

package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"runtime"

	"github.com/lyraos/vega-agent/internal/agent"
	"github.com/lyraos/vega-agent/internal/broker"
	"github.com/lyraos/vega-agent/internal/processcontrol"
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
	return agent.Server{
		PlatformVersion: runtime.GOOS + "/" + runtime.GOARCH,
		Elevator:        broker.Elevator{Executable: executable},
		Collector:       agent.WindowsCollector{},
		Processes:       processcontrol.Controller{},
	}
}
