package regional

import (
	"errors"
	"regexp"
	"strings"
)

type Status struct {
	Timezone string `json:"timezone"`
	NTP      bool   `json:"ntp"`
	Locale   string `json:"locale"`
	Keymap   string `json:"keymap"`
}

type ApplyParams struct {
	Timezone string `json:"timezone"`
	NTP      bool   `json:"ntp"`
}

var timezonePattern = regexp.MustCompile(`^[\p{L}\p{N} _+()&.,'-]{1,128}$`)

func ValidateApply(params ApplyParams) (ApplyParams, error) {
	params.Timezone = strings.TrimSpace(params.Timezone)
	if !timezonePattern.MatchString(params.Timezone) {
		return ApplyParams{}, errors.New("ID de fuso horário do Windows inválido")
	}
	return params, nil
}
