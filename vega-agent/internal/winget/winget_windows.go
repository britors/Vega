//go:build windows

package winget

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"github.com/lyraos/vega-agent/internal/software"
)

type Client struct{ executable string }

func New() (*Client, error) {
	path, err := exec.LookPath("winget.exe")
	if err != nil {
		return nil, fmt.Errorf("WinGet não está disponível para esta conta. Instale ou repare o App Installer pela Microsoft Store")
	}
	return &Client{executable: path}, nil
}

func (c *Client) command(ctx context.Context, args ...string) ([]byte, int, error) {
	return c.commandWithTimeout(ctx, 3*time.Minute, args...)
}

func (c *Client) commandWithTimeout(ctx context.Context, timeout time.Duration, args ...string) ([]byte, int, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.executable, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	var output bytes.Buffer
	cmd.Stdout, cmd.Stderr = &output, &output
	err := cmd.Run()
	if ctx.Err() != nil {
		return output.Bytes(), -1, fmt.Errorf("WinGet excedeu o tempo limite")
	}
	if err == nil {
		return output.Bytes(), 0, nil
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return output.Bytes(), exit.ExitCode(), wingetError(exit.ExitCode())
	}
	return output.Bytes(), -1, fmt.Errorf("não foi possível iniciar o WinGet: %w", err)
}

func (c *Client) Version(ctx context.Context) (string, error) {
	output, _, err := c.command(ctx, "--version")
	return strings.TrimSpace(string(output)), err
}

func (c *Client) Search(ctx context.Context, query string) ([]software.PackageRef, error) {
	if err := validateText(query, "consulta"); err != nil {
		return nil, err
	}
	output, code, err := c.command(ctx, "search", "--query", query, "--accept-source-agreements", "--disable-interactivity")
	if err != nil && code != -1978335212 {
		return nil, err
	}
	return sortedPackages(parseTable(string(output), false, false)), nil
}

func (c *Client) ListInstalled(ctx context.Context) ([]software.PackageRef, error) {
	output, code, err := c.command(ctx, "list", "--accept-source-agreements", "--disable-interactivity")
	if err != nil && code != -1978335212 {
		return nil, err
	}
	return sortedPackages(parseTable(string(output), true, false)), nil
}

func (c *Client) ListUpdates(ctx context.Context) ([]software.PackageRef, error) {
	output, code, err := c.command(ctx, "upgrade", "--accept-source-agreements", "--disable-interactivity")
	if err != nil && code != -1978335212 && code != -1978335189 {
		return nil, err
	}
	return sortedPackages(parseTable(string(output), true, true)), nil
}

func (c *Client) Details(ctx context.Context, origin, id string) (software.PackageDetails, error) {
	if err := validatePackage(origin, id); err != nil {
		return software.PackageDetails{}, err
	}
	output, _, err := c.command(ctx, "show", "--id", id, "--exact", "--source", origin, "--accept-source-agreements", "--disable-interactivity")
	if err != nil {
		return software.PackageDetails{}, err
	}
	details := parseDetails(string(output), origin, id)
	installed, _ := c.listExact(ctx, origin, id)
	if len(installed) > 0 {
		details.Installed = true
		details.InstalledVersion = strings.TrimPrefix(installed[0].Description, "Versão ")
	}
	return details, nil
}

func (c *Client) listExact(ctx context.Context, origin, id string) ([]software.PackageRef, error) {
	output, code, err := c.command(ctx, "list", "--id", id, "--exact", "--source", origin, "--accept-source-agreements", "--disable-interactivity")
	if err != nil && code != -1978335212 {
		return nil, err
	}
	return parseTable(string(output), true, false), nil
}

func (c *Client) Mutate(ctx context.Context, mutation software.Mutation, progress software.Progress) (software.MutationResult, error) {
	if mutation.Action != "updateAll" {
		if err := validatePackage(mutation.Origin, mutation.ID); err != nil {
			return software.MutationResult{}, err
		}
	}
	if mutation.Scope != "" && mutation.Scope != "user" && mutation.Scope != "machine" {
		return software.MutationResult{}, fmt.Errorf("escopo inválido")
	}
	progress(5, "Validando pacote e origem")
	var args []string
	switch mutation.Action {
	case "install":
		args = []string{"install", "--id", mutation.ID, "--exact", "--source", mutation.Origin}
	case "remove":
		args = []string{"uninstall", "--id", mutation.ID, "--exact", "--source", mutation.Origin}
	case "update":
		args = []string{"upgrade", "--id", mutation.ID, "--exact", "--source", mutation.Origin}
	case "updateAll":
		args = []string{"upgrade", "--all"}
	default:
		return software.MutationResult{}, fmt.Errorf("ação WinGet não permitida")
	}
	if mutation.Scope != "" {
		args = append(args, "--scope", mutation.Scope)
	}
	args = append(args, "--accept-source-agreements", "--disable-interactivity")
	if mutation.AcceptAgreements {
		args = append(args, "--accept-package-agreements")
	}
	progress(35, "Executando WinGet no contexto do usuário")
	_, code, err := c.commandWithTimeout(ctx, 30*time.Minute, args...)
	if code == -1978334967 {
		progress(100, "Concluído; reinicialização necessária")
		return software.MutationResult{RebootRequired: true, Message: "Concluído. Reinicie o Windows para finalizar."}, nil
	}
	if err != nil {
		return software.MutationResult{}, err
	}
	progress(100, "Operação concluída")
	return software.MutationResult{Message: "Operação concluída com sucesso."}, nil
}

func validatePackage(origin, id string) error {
	if origin != "winget" && origin != "msstore" {
		return fmt.Errorf("origem WinGet não permitida")
	}
	return validateText(id, "ID")
}

func validateText(value, label string) error {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 256 {
		return fmt.Errorf("%s inválido", label)
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return fmt.Errorf("%s contém caracteres de controle", label)
		}
	}
	return nil
}
