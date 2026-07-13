package eventlogs

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

const MaxEvents = 500

var channelPattern = regexp.MustCompile(`^[\p{L}\p{N} ._/@()-]{1,256}$`)

type Query struct {
	Channel  string `json:"channel"`
	Priority string `json:"priority"`
	Since    string `json:"since"`
	Search   string `json:"search"`
	Limit    int    `json:"limit"`
}

type Event struct {
	Timestamp string `json:"timestamp"`
	Provider  string `json:"provider"`
	EventID   int    `json:"eventId"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

func NormalizeEvent(event Event) Event {
	if strings.TrimSpace(event.Message) == "" {
		event.Message = "[mensagem localizada indisponível]"
	}
	if strings.TrimSpace(event.Level) == "" {
		event.Level = "Nível desconhecido"
	}
	return event
}

func Validate(query Query) (Query, error) {
	query.Channel = strings.TrimSpace(query.Channel)
	if query.Channel == "" {
		query.Channel = "System"
	}
	if !channelPattern.MatchString(query.Channel) {
		return Query{}, errors.New("canal do Event Log inválido")
	}
	switch query.Priority {
	case "", "err", "warning", "info", "debug":
	default:
		return Query{}, errors.New("nível do Event Log inválido")
	}
	switch query.Since {
	case "", "-15min", "-1hour", "-24hour", "-7day":
	default:
		return Query{}, errors.New("período do Event Log inválido")
	}
	if len([]rune(query.Search)) > 200 {
		return Query{}, errors.New("texto de busca excede 200 caracteres")
	}
	if query.Limit <= 0 {
		query.Limit = 100
	}
	if query.Limit > MaxEvents {
		query.Limit = MaxEvents
	}
	return query, nil
}

func StartTime(since string, now time.Time) string {
	var duration time.Duration
	switch since {
	case "-15min":
		duration = 15 * time.Minute
	case "-1hour":
		duration = time.Hour
	case "-24hour":
		duration = 24 * time.Hour
	case "-7day":
		duration = 7 * 24 * time.Hour
	default:
		return ""
	}
	return now.Add(-duration).UTC().Format(time.RFC3339)
}
