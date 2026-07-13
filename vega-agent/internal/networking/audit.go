package networking

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// AuditMutation records only operation state. Network identifiers, IPs, SSIDs,
// proxy values and passwords are deliberately excluded.
func AuditMutation(action, phase string, operationErr error) {
	if runtime.GOOS != "windows" {
		return
	}
	directory, err := os.UserCacheDir()
	if err != nil {
		return
	}
	directory = filepath.Join(directory, "Vega")
	if os.MkdirAll(directory, 0o700) != nil {
		return
	}
	entry := struct {
		Timestamp string `json:"timestamp"`
		Action    string `json:"action"`
		Phase     string `json:"phase"`
		Outcome   string `json:"outcome"`
	}{Timestamp: time.Now().UTC().Format(time.RFC3339), Action: action, Phase: phase, Outcome: "pending"}
	if operationErr == nil && phase == "after" {
		entry.Outcome = "success"
	}
	if operationErr != nil {
		entry.Outcome = "error"
	}
	payload, err := json.Marshal(entry)
	if err != nil {
		return
	}
	file, err := os.OpenFile(filepath.Join(directory, "network-audit.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.Write(append(payload, '\n'))
}
