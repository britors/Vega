//go:build windows

package backup

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const operationTimeout = 12 * time.Hour

type Manager struct {
	Root       string
	Executable string
}

type resticSnapshot struct {
	ID      string `json:"id"`
	ShortID string `json:"short_id"`
	Time    string `json:"time"`
	Summary struct {
		FilesProcessed int64 `json:"total_files_processed"`
		BytesProcessed int64 `json:"total_bytes_processed"`
	} `json:"summary"`
}

type resticNode struct {
	StructType string `json:"struct_type"`
	Path       string `json:"path"`
}

func NewManager(executable string) Manager {
	root := filepath.Join(os.Getenv("LOCALAPPDATA"), "Vega", "backup")
	return Manager{Root: root, Executable: executable}
}

func Available() bool {
	_, err := exec.LookPath("restic.exe")
	return err == nil
}

func (m Manager) List(context.Context) ([]Config, error) {
	entries, err := os.ReadDir(m.configDir())
	if errors.Is(err, fs.ErrNotExist) {
		return []Config{}, nil
	}
	if err != nil {
		return nil, err
	}
	rows := make([]Config, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		var config Config
		if err := readJSON(filepath.Join(m.configDir(), entry.Name()), &config); err != nil {
			return nil, err
		}
		expectedID := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		valid, err := m.normalizeStoredConfig(config, expectedID)
		if err != nil {
			return nil, err
		}
		rows = append(rows, valid)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	return rows, nil
}

func (m Manager) Create(ctx context.Context, config Config) (string, error) {
	valid, err := ValidateConfig(config)
	if err != nil {
		return "", err
	}
	if !Available() {
		return "", errors.New("restic.exe não encontrado; instale o Restic antes de criar o backup")
	}
	if err := m.validateSources(&valid); err != nil {
		return "", err
	}
	if err := os.MkdirAll(m.configDir(), 0o700); err != nil {
		return "", err
	}
	if _, err := os.Stat(m.configPath(valid.ID)); err == nil {
		return "", fmt.Errorf("configuração %q já existe", valid.ID)
	}
	randomSecret := make([]byte, 32)
	if _, err := rand.Read(randomSecret); err != nil {
		return "", err
	}
	secret := []byte(base64.RawURLEncoding.EncodeToString(randomSecret))
	clear(randomSecret)
	protected, err := protect(secret)
	clear(secret)
	if err != nil {
		return "", fmt.Errorf("proteger senha com DPAPI: %w", err)
	}
	if err := os.WriteFile(m.secretPath(valid.ID), protected, 0o600); err != nil {
		return "", err
	}
	if err := writeJSONAtomic(m.configPath(valid.ID), valid); err != nil {
		_ = os.Remove(m.secretPath(valid.ID))
		return "", err
	}
	if err := m.ensureRepository(ctx, valid, nil); err != nil {
		_ = os.Remove(m.configPath(valid.ID))
		_ = os.Remove(m.secretPath(valid.ID))
		return "", err
	}
	if err := m.schedule(valid); err != nil {
		_ = os.Remove(m.configPath(valid.ID))
		_ = os.Remove(m.secretPath(valid.ID))
		return "", err
	}
	return valid.ID, nil
}

func (m Manager) Delete(ctx context.Context, id string) error {
	id, err := ValidateID(id)
	if err != nil {
		return err
	}
	config, err := m.readConfig(id)
	if err != nil {
		return err
	}
	if config.Frequency != "manual" {
		if err := m.removeTask(ctx, id); err != nil {
			return err
		}
	}
	for _, path := range []string{m.configPath(id), m.secretPath(id)} {
		if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	return nil
}

func (m Manager) Snapshots(ctx context.Context, id string) ([]Snapshot, error) {
	config, err := m.readConfig(id)
	if err != nil {
		return nil, err
	}
	if !m.destinationAvailable(config) {
		return nil, errors.New("destino do backup indisponível")
	}
	output, err := m.resticOutput(ctx, config, "snapshots", "--json")
	if err != nil {
		return nil, err
	}
	var values []resticSnapshot
	if err := json.Unmarshal(output, &values); err != nil {
		return nil, fmt.Errorf("resposta inválida do restic snapshots: %w", err)
	}
	rows := make([]Snapshot, 0, len(values))
	for _, value := range values {
		timestamp, _ := time.Parse(time.RFC3339, value.Time)
		id := value.ShortID
		if id == "" {
			id = value.ID
		}
		rows = append(rows, Snapshot{ID: id, Timestamp: timestamp.Unix(), FileCount: value.Summary.FilesProcessed, SizeBytes: value.Summary.BytesProcessed})
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Timestamp > rows[j].Timestamp })
	return rows, nil
}

func (m Manager) Paths(ctx context.Context, configID, snapshotID string) ([]string, error) {
	config, err := m.readConfig(configID)
	if err != nil {
		return nil, err
	}
	if _, err := ValidateRestore(RestoreParams{SnapshotID: snapshotID, TargetPath: `C:\VegaRestore`, Mode: "separate-folder"}); err != nil {
		return nil, err
	}
	output, err := m.resticOutput(ctx, config, "ls", snapshotID, "--json")
	if err != nil {
		return nil, err
	}
	rows := []string{}
	scanner := bufio.NewScanner(bytes.NewReader(output))
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var node resticNode
		if json.Unmarshal(scanner.Bytes(), &node) == nil && node.StructType == "node" && node.Path != "" {
			rows = append(rows, node.Path)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return rows, nil
}

func (m Manager) Backup(ctx context.Context, id string, report Progress) error {
	config, err := m.readConfig(id)
	if err != nil {
		return err
	}
	if !m.destinationAvailable(config) {
		return errors.New("destino removível, volume ou compartilhamento de backup indisponível")
	}
	if err := m.ensureRepository(ctx, config, report); err != nil {
		return err
	}
	args := append([]string{"backup", "--json"}, config.Paths...)
	return m.runRestic(ctx, config, args, report, "Iniciando backup...", "Backup concluído")
}

func (m Manager) Restore(ctx context.Context, params RestoreParams, report Progress) error {
	valid, err := ValidateRestore(params)
	if err != nil {
		return err
	}
	config, err := m.findConfigBySnapshot(ctx, valid.SnapshotID)
	if err != nil {
		return err
	}
	target, err := expandPath(valid.TargetPath)
	if err != nil {
		return err
	}
	if err := validateRestoreTarget(target); err != nil {
		return err
	}
	restoreTarget := target
	if valid.Mode == "separate-folder" {
		restoreTarget = filepath.Join(target, "restored-"+valid.SnapshotID)
	} else if err := os.RemoveAll(target); err != nil {
		return err
	}
	if err := os.MkdirAll(restoreTarget, 0o700); err != nil {
		return err
	}
	args := []string{"restore", valid.SnapshotID, "--target", restoreTarget, "--json"}
	for _, path := range valid.Paths {
		args = append(args, "--include", path)
	}
	return m.runRestic(ctx, config, args, report, "Iniciando restauração...", "Restauração concluída")
}

func (m Manager) RunScheduled(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, operationTimeout)
	defer cancel()
	return m.Backup(ctx, id, nil)
}

func (m Manager) CleanupTasks(ctx context.Context) error {
	output, err := exec.CommandContext(ctx, "schtasks.exe", "/Query", "/FO", "CSV", "/NH").Output()
	if err != nil {
		return err
	}
	records, err := csv.NewReader(bytes.NewReader(output)).ReadAll()
	if err != nil {
		return err
	}
	for _, record := range records {
		if len(record) == 0 || !strings.HasPrefix(strings.TrimSpace(record[0]), `\Vega Backup `) {
			continue
		}
		id := strings.TrimPrefix(strings.TrimSpace(record[0]), `\Vega Backup `)
		if _, err := ValidateID(id); err != nil {
			continue
		}
		if err := m.removeTask(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

func (m Manager) ensureRepository(ctx context.Context, config Config, report Progress) error {
	destination, err := m.destination(config)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(destination, 0o700); err != nil {
		return fmt.Errorf("destino de backup indisponível: %w", err)
	}
	if _, err := m.resticOutput(ctx, config, "snapshots", "--json"); err == nil {
		return nil
	}
	if report != nil {
		report(5, "Inicializando repositório Restic...")
	}
	_, err = m.resticOutput(ctx, config, "init")
	return err
}

func (m Manager) runRestic(ctx context.Context, config Config, args []string, report Progress, start, done string) error {
	if report != nil {
		report(0, start)
	}
	command, secret, err := m.resticCommand(ctx, config, args...)
	if err != nil {
		return err
	}
	defer clear(secret)
	stdout, err := command.StdoutPipe()
	if err != nil {
		return err
	}
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		return err
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	percent := 10
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		var status struct {
			MessageType string  `json:"message_type"`
			PercentDone float64 `json:"percent_done"`
			FilesDone   int64   `json:"files_done"`
			TotalFiles  int64   `json:"total_files"`
		}
		message := line
		if json.Unmarshal(scanner.Bytes(), &status) == nil {
			if status.PercentDone > 0 {
				percent = int(status.PercentDone * 100)
			}
			if status.TotalFiles > 0 {
				message = fmt.Sprintf("%d de %d arquivos", status.FilesDone, status.TotalFiles)
			}
		}
		if report != nil && message != "" {
			report(min(percent, 99), message)
		}
	}
	if err := scanner.Err(); err != nil {
		_ = command.Process.Kill()
		return err
	}
	if err := command.Wait(); err != nil {
		return fmt.Errorf("restic: %w — %s", err, trimError(stderr.String()))
	}
	if report != nil {
		report(100, done)
	}
	return nil
}

func (m Manager) resticOutput(ctx context.Context, config Config, args ...string) ([]byte, error) {
	command, secret, err := m.resticCommand(ctx, config, args...)
	if err != nil {
		return nil, err
	}
	defer clear(secret)
	output, err := command.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("restic: %w — %s", err, trimError(string(output)))
	}
	return output, nil
}

func (m Manager) resticCommand(ctx context.Context, config Config, args ...string) (*exec.Cmd, []byte, error) {
	if !Available() {
		return nil, nil, errors.New("restic.exe não encontrado")
	}
	destination, err := m.destination(config)
	if err != nil {
		return nil, nil, err
	}
	protected, err := os.ReadFile(m.secretPath(config.ID))
	if err != nil {
		return nil, nil, err
	}
	secret, err := unprotect(protected)
	if err != nil {
		return nil, nil, fmt.Errorf("desproteger senha DPAPI: %w", err)
	}
	command := exec.CommandContext(ctx, "restic.exe", append([]string{"-r", destination}, args...)...)
	environment := make([]string, 0, len(os.Environ())+1)
	for _, value := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(value), "RESTIC_PASSWORD=") && !strings.HasPrefix(strings.ToUpper(value), "RESTIC_PASSWORD_FILE=") && !strings.HasPrefix(strings.ToUpper(value), "RESTIC_PASSWORD_COMMAND=") {
			environment = append(environment, value)
		}
	}
	command.Env = append(environment, "RESTIC_PASSWORD="+string(secret))
	return command, secret, nil
}

func (m Manager) findConfigBySnapshot(ctx context.Context, snapshotID string) (Config, error) {
	configs, err := m.List(ctx)
	if err != nil {
		return Config{}, err
	}
	var found *Config
	for _, config := range configs {
		rows, err := m.Snapshots(ctx, config.ID)
		if err != nil {
			continue
		}
		for _, row := range rows {
			if row.ID == snapshotID || strings.HasPrefix(row.ID, snapshotID) || strings.HasPrefix(snapshotID, row.ID) {
				if found != nil {
					return Config{}, errors.New("snapshot ambíguo entre configurações de backup")
				}
				copy := config
				found = &copy
			}
		}
	}
	if found == nil {
		return Config{}, errors.New("snapshot não encontrado")
	}
	return *found, nil
}

func (m Manager) validateSources(config *Config) error {
	destination, err := m.destination(*config)
	if err != nil {
		return err
	}
	for index, path := range config.Paths {
		expanded, err := expandPath(path)
		if err != nil {
			return err
		}
		if !filepath.IsAbs(expanded) {
			return fmt.Errorf("origem deve ser absoluta: %s", path)
		}
		if _, err := os.Stat(expanded); err != nil {
			return fmt.Errorf("origem indisponível %s: %w", path, err)
		}
		if samePath(destination, expanded) || pathWithin(destination, expanded) || pathWithin(expanded, destination) {
			return errors.New("origem e repositório de backup não podem se sobrepor")
		}
		config.Paths[index] = expanded
	}
	return nil
}

func (m Manager) destination(config Config) (string, error) {
	value := config.Destination
	if config.DestinationUUID != "" {
		if filepath.IsAbs(config.Destination) {
			return "", errors.New("com drive/volume informado, o destino deve ser uma pasta relativa dentro dele")
		}
		volume := strings.TrimSpace(config.DestinationUUID)
		if len(volume) == 2 && volume[1] == ':' {
			volume += `\`
		}
		if !filepath.IsAbs(volume) {
			return "", errors.New("volume removível deve ser drive letter ou volume GUID absoluto")
		}
		value = filepath.Join(volume, config.Destination)
	}
	expanded, err := expandPath(value)
	if err != nil {
		return "", err
	}
	if !filepath.IsAbs(expanded) {
		return "", errors.New("destino do backup deve ser um caminho absoluto, UNC ou volume GUID")
	}
	return expanded, nil
}

func (m Manager) destinationAvailable(config Config) bool {
	destination, err := m.destination(config)
	if err != nil {
		return false
	}
	root := filepath.VolumeName(destination)
	if strings.HasPrefix(destination, `\\`) && !strings.HasPrefix(destination, `\\?\`) {
		parts := strings.Split(strings.TrimPrefix(destination, `\\`), `\`)
		if len(parts) >= 2 {
			root = `\\` + parts[0] + `\` + parts[1]
		}
	}
	if root == "" {
		root = filepath.Dir(destination)
	}
	_, err = os.Stat(root + string(os.PathSeparator))
	return err == nil
}

func (m Manager) schedule(config Config) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if config.Frequency == "manual" {
		return nil
	}
	if m.Executable == "" {
		return errors.New("executável do agente indisponível para agendamento")
	}
	args := []string{"/Create", "/F", "/TN", taskName(config.ID), "/TR", fmt.Sprintf(`"%s" --run-backup %s`, m.Executable, config.ID)}
	switch config.Frequency {
	case "daily":
		args = append(args, "/SC", "DAILY", "/ST", "19:00")
	case "weekly":
		args = append(args, "/SC", "WEEKLY", "/D", "SUN", "/ST", "19:00")
	case "on-connect":
		args = append(args, "/SC", "MINUTE", "/MO", "15")
	}
	if output, err := exec.CommandContext(ctx, "schtasks.exe", args...).CombinedOutput(); err != nil {
		return fmt.Errorf("Task Scheduler: %w — %s", err, trimError(string(output)))
	}
	return nil
}

func (m Manager) removeTask(ctx context.Context, id string) error {
	output, err := exec.CommandContext(ctx, "schtasks.exe", "/Delete", "/F", "/TN", taskName(id)).CombinedOutput()
	if err != nil {
		lower := strings.ToLower(string(output))
		if strings.Contains(lower, "cannot find") || strings.Contains(lower, "não é possível encontrar") || strings.Contains(lower, "não pode encontrar") || strings.Contains(lower, "não foi possível localizar") {
			return nil
		}
		return fmt.Errorf("remover tarefa agendada: %w — %s", err, trimError(string(output)))
	}
	return nil
}

func (m Manager) readConfig(id string) (Config, error) {
	id, err := ValidateID(id)
	if err != nil {
		return Config{}, err
	}
	var config Config
	if err = readJSON(m.configPath(id), &config); err != nil {
		return Config{}, err
	}
	return m.normalizeStoredConfig(config, id)
}

func (m Manager) normalizeStoredConfig(config Config, expectedID string) (Config, error) {
	valid, err := ValidateConfig(config)
	if err != nil {
		return Config{}, fmt.Errorf("configuração de backup corrompida: %w", err)
	}
	if !strings.EqualFold(valid.ID, expectedID) {
		return Config{}, errors.New("ID interno não corresponde ao arquivo da configuração de backup")
	}
	for index, value := range valid.Paths {
		expanded, err := expandPath(value)
		if err != nil || !filepath.IsAbs(expanded) {
			return Config{}, errors.New("origem inválida na configuração de backup")
		}
		valid.Paths[index] = expanded
	}
	if _, err := m.destination(valid); err != nil {
		return Config{}, fmt.Errorf("destino inválido na configuração de backup: %w", err)
	}
	return valid, nil
}

func (m Manager) configDir() string           { return filepath.Join(m.Root, "configs") }
func (m Manager) configPath(id string) string { return filepath.Join(m.configDir(), id+".json") }
func (m Manager) secretPath(id string) string { return filepath.Join(m.configDir(), id+".dpapi") }
func taskName(id string) string               { return `\Vega Backup ` + id }

func expandPath(value string) (string, error) {
	value = strings.TrimSpace(os.ExpandEnv(value))
	if value == "~" || strings.HasPrefix(value, `~\`) || strings.HasPrefix(value, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		value = filepath.Join(home, strings.TrimLeft(value[1:], `\/`))
	}
	return filepath.Clean(value), nil
}

func validateRestoreTarget(target string) error {
	absolute, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	absolute, err = resolveExistingPath(absolute)
	if err != nil {
		return err
	}
	critical := []string{os.Getenv("SystemRoot"), os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramData")}
	volume := filepath.VolumeName(absolute)
	if volume != "" {
		critical = append(critical, volume+`\`)
	}
	for _, value := range critical {
		if value != "" && (samePath(absolute, value) || pathWithin(absolute, value)) {
			return fmt.Errorf("restauração bloqueada em caminho crítico: %s", value)
		}
	}
	if home, err := os.UserHomeDir(); err == nil && samePath(absolute, home) {
		return errors.New("restauração bloqueada diretamente na raiz do perfil do usuário")
	}
	return nil
}

func samePath(left, right string) bool {
	return strings.EqualFold(canonicalPath(left), canonicalPath(right))
}
func pathWithin(path, parent string) bool {
	relative, err := filepath.Rel(canonicalPath(parent), canonicalPath(path))
	return err == nil && relative != "." && relative != ".." && !strings.HasPrefix(relative, `..\`)
}

func canonicalPath(value string) string {
	value = filepath.Clean(value)
	if strings.HasPrefix(strings.ToLower(value), `\\?\unc\`) {
		return `\\` + value[len(`\\?\UNC\`):]
	}
	if strings.HasPrefix(value, `\\?\`) {
		return value[len(`\\?\`):]
	}
	return value
}

func resolveExistingPath(value string) (string, error) {
	current := value
	missing := []string{}
	for {
		if _, err := os.Lstat(current); err == nil {
			resolved, err := filepath.EvalSymlinks(current)
			if err != nil {
				return "", fmt.Errorf("resolver destino de restauração: %w", err)
			}
			for index := len(missing) - 1; index >= 0; index-- {
				resolved = filepath.Join(resolved, missing[index])
			}
			return resolved, nil
		} else if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(current)
		if parent == current {
			return value, nil
		}
		missing = append(missing, filepath.Base(current))
		current = parent
	}
}

func readJSON(path string, target any) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("dados extras na configuração de backup")
	}
	return nil
}

func writeJSONAtomic(path string, value any) error {
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, content, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func protect(value []byte) ([]byte, error) {
	input := blob(value)
	var output windows.DataBlob
	if err := windows.CryptProtectData(&input, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	return append([]byte(nil), unsafe.Slice(output.Data, output.Size)...), nil
}

func unprotect(value []byte) ([]byte, error) {
	input := blob(value)
	var output windows.DataBlob
	if err := windows.CryptUnprotectData(&input, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	return append([]byte(nil), unsafe.Slice(output.Data, output.Size)...), nil
}

func blob(value []byte) windows.DataBlob {
	result := windows.DataBlob{Size: uint32(len(value))}
	if len(value) > 0 {
		result.Data = &value[0]
	}
	return result
}

func clear(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
func trimError(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 1000 {
		value = value[len(value)-1000:]
	}
	return value
}
