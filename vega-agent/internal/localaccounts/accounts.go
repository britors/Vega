package localaccounts

import (
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

type Info struct {
	Username    string `json:"username"`
	SID         string `json:"sid"`
	IsAdmin     bool   `json:"isAdmin"`
	AccountType string `json:"accountType"`
	ReadOnly    bool   `json:"readOnly"`
	Protected   bool   `json:"protected"`
}

type CreateParams struct {
	Username string `json:"username"`
	Password string `json:"password"`
	IsAdmin  bool   `json:"isAdmin"`
}

type RemoveParams struct {
	Username      string `json:"username"`
	RemoveProfile bool   `json:"removeProfile"`
}

type AdminParams struct {
	Username string `json:"username"`
	IsAdmin  bool   `json:"isAdmin"`
}

var usernamePattern = regexp.MustCompile(`^[\p{L}\p{N}._ -]{1,64}$`)

func ValidateUsername(username string) (string, error) {
	username = strings.TrimSpace(username)
	if !usernamePattern.MatchString(username) || strings.HasSuffix(username, ".") || strings.Contains(username, "  ") {
		return "", errors.New("nome de usuário local inválido")
	}
	return username, nil
}

func ValidateCreate(params CreateParams) (CreateParams, error) {
	username, err := ValidateUsername(params.Username)
	if err != nil {
		return CreateParams{}, err
	}
	if !utf8.ValidString(params.Password) || len(params.Password) < 8 || len(params.Password) > 256 || strings.ContainsAny(params.Password, "\r\n\x00") {
		return CreateParams{}, errors.New("a senha deve ter entre 8 e 256 caracteres e não conter controles")
	}
	params.Username = username
	return params, nil
}
