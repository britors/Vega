package displays

import (
	"errors"
	"regexp"
)

type Mode struct {
	ID          string  `json:"id"`
	Width       int     `json:"width"`
	Height      int     `json:"height"`
	RefreshRate float64 `json:"refreshRate"`
	Current     bool    `json:"current"`
	Preferred   bool    `json:"preferred"`
}

type Output struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	Connected   bool   `json:"connected"`
	Primary     bool   `json:"primary"`
	Enabled     bool   `json:"enabled"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	X           int    `json:"x"`
	Y           int    `json:"y"`
	CurrentMode string `json:"currentMode"`
	Scale       int    `json:"scale"`
	HDR         string `json:"hdr"`
	Modes       []Mode `json:"modes"`
}

type Config struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Mode    string `json:"mode"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Primary bool   `json:"primary"`
}

type ApplyResult struct {
	Token          string `json:"token"`
	RollbackAfterS int    `json:"rollbackAfterSeconds"`
}

var namePattern = regexp.MustCompile(`^\\\\\.\\DISPLAY[0-9]{1,3}$`)
var modePattern = regexp.MustCompile(`^[0-9]{2,5}x[0-9]{2,5}@[0-9]{1,3}(?:\.[0-9]{1,3})?$`)

func ValidateConfig(config Config) (Config, error) {
	if !namePattern.MatchString(config.Name) {
		return Config{}, errors.New("monitor inválido")
	}
	if !config.Enabled {
		return Config{}, errors.New("desativar monitor ainda é somente leitura no Windows")
	}
	if !modePattern.MatchString(config.Mode) {
		return Config{}, errors.New("modo de vídeo inválido")
	}
	if config.X < -100000 || config.X > 100000 || config.Y < -100000 || config.Y > 100000 {
		return Config{}, errors.New("posição do monitor inválida")
	}
	return config, nil
}

func ValidateToken(token string) error {
	if len(token) != 43 {
		return errors.New("token de confirmação de monitor inválido")
	}
	for _, value := range token {
		if !(value >= 'A' && value <= 'Z') && !(value >= 'a' && value <= 'z') && !(value >= '0' && value <= '9') && value != '-' && value != '_' {
			return errors.New("token de confirmação de monitor inválido")
		}
	}
	return nil
}
