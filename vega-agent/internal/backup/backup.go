package backup

import (
	"errors"
	"path/filepath"
	"regexp"
	"strings"
)

type Config struct {
	ID              string   `json:"id"`
	Paths           []string `json:"paths"`
	Destination     string   `json:"destination"`
	DestinationUUID string   `json:"destinationUUID"`
	Frequency       string   `json:"frequency"`
}

type Snapshot struct {
	ID        string `json:"id"`
	Timestamp int64  `json:"timestamp"`
	FileCount int64  `json:"fileCount"`
	SizeBytes int64  `json:"sizeBytes"`
}

type RestoreParams struct {
	SnapshotID string   `json:"snapshotId"`
	TargetPath string   `json:"targetPath"`
	Mode       string   `json:"mode"`
	Paths      []string `json:"paths"`
}

type Progress func(percent int, message string)

var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
var snapshotPattern = regexp.MustCompile(`^(?:[A-Fa-f0-9]{6,64}|latest)$`)

func ValidateID(id string) (string, error) {
	id = strings.TrimSpace(id)
	if !idPattern.MatchString(id) {
		return "", errors.New("ID de backup inválido")
	}
	return id, nil
}

func ValidateConfig(config Config) (Config, error) {
	id, err := ValidateID(config.ID)
	if err != nil {
		return Config{}, err
	}
	config.ID = id
	switch config.Frequency {
	case "manual", "daily", "weekly", "on-connect":
	default:
		return Config{}, errors.New("frequência de backup inválida")
	}
	config.Destination = strings.TrimSpace(config.Destination)
	config.DestinationUUID = strings.TrimSpace(config.DestinationUUID)
	if config.Destination == "" {
		return Config{}, errors.New("destino de backup obrigatório")
	}
	cleanPaths := make([]string, 0, len(config.Paths))
	seen := map[string]bool{}
	for _, value := range config.Paths {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		clean := filepath.Clean(value)
		if !seen[strings.ToLower(clean)] {
			seen[strings.ToLower(clean)] = true
			cleanPaths = append(cleanPaths, clean)
		}
	}
	if len(cleanPaths) == 0 {
		return Config{}, errors.New("ao menos um caminho de origem é obrigatório")
	}
	config.Paths = cleanPaths
	return config, nil
}

func ValidateRestore(params RestoreParams) (RestoreParams, error) {
	params.SnapshotID = strings.TrimSpace(params.SnapshotID)
	params.TargetPath = strings.TrimSpace(params.TargetPath)
	if !snapshotPattern.MatchString(params.SnapshotID) {
		return RestoreParams{}, errors.New("snapshot de backup inválido")
	}
	if params.TargetPath == "" || strings.ContainsAny(params.TargetPath, "\r\n\x00") {
		return RestoreParams{}, errors.New("destino de restauração inválido")
	}
	if params.Mode != "replace" && params.Mode != "separate-folder" {
		return RestoreParams{}, errors.New("modo de restauração inválido")
	}
	if len(params.Paths) > 10_000 {
		return RestoreParams{}, errors.New("itens demais na restauração")
	}
	for index, value := range params.Paths {
		value = strings.TrimSpace(value)
		if value == "" || strings.ContainsAny(value, "\r\n\x00") {
			return RestoreParams{}, errors.New("item de restauração inválido")
		}
		params.Paths[index] = value
	}
	return params, nil
}
