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
	"github.com/lyraos/vega-agent/internal/backup"
	"github.com/lyraos/vega-agent/internal/bluetooth"
	"github.com/lyraos/vega-agent/internal/broker"
	"github.com/lyraos/vega-agent/internal/displays"
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
	if len(args) == 2 && args[0] == "--run-backup" {
		if err := backup.NewManager(currentExecutable()).RunScheduled(context.Background(), args[1]); err != nil {
			fmt.Fprintln(os.Stderr, "vega-agent: backup agendado falhou:", err)
			os.Exit(1)
		}
		return true
	}
	if len(args) == 1 && args[0] == "--cleanup-backup-tasks" {
		if err := backup.NewManager(currentExecutable()).CleanupTasks(context.Background()); err != nil {
			fmt.Fprintln(os.Stderr, "vega-agent: limpeza de tarefas falhou:", err)
			os.Exit(1)
		}
		return true
	}
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
	executable := currentExecutable()
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
		Backup:          backup.NewManager(executable),
		Bluetooth:       bluetooth.Manager{},
		Displays:        displays.NewManager(),
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
		server.MissingDependencies = append(server.MissingDependencies, protocol.MissingDependency{ID: "winget", Modules: []string{"software"}, Detail: err.Error()})
	}
	if !backup.Available() {
		server.MissingDependencies = append(server.MissingDependencies, protocol.MissingDependency{ID: "restic", Modules: []string{"backup"}, Detail: "restic.exe não encontrado no PATH"})
	}
	return server
}

func currentExecutable() string {
	executable, _ := os.Executable()
	return executable
}
