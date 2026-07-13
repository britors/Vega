package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
)

func main() {
	if runPlatformMode(os.Args[1:]) {
		return
	}
	server := newAgentServer()
	if err := server.Serve(context.Background(), os.Stdin, os.Stdout); err != nil && !errors.Is(err, io.EOF) {
		fmt.Fprintln(os.Stderr, "vega-agent:", err)
		os.Exit(1)
	}
}
