//go:build !windows

package main

import (
	"runtime"

	"github.com/lyraos/vega-agent/internal/agent"
)

func runPlatformMode(_ []string) bool { return false }

func newAgentServer() agent.Server {
	return agent.Server{PlatformVersion: runtime.GOOS + "/" + runtime.GOARCH}
}
