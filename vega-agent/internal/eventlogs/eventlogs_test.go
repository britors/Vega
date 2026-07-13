package eventlogs

import (
	"testing"
	"time"
)

func TestQueryValidationBlocksInjectionAndCapsVolume(t *testing.T) {
	valid, err := Validate(Query{Channel: "Microsoft-Windows-Windows Defender/Operational", Priority: "warning", Since: "-1hour", Limit: 900})
	if err != nil || valid.Limit != MaxEvents {
		t.Fatalf("valid query: %#v, %v", valid, err)
	}
	for _, channel := range []string{`System'; whoami`, `System\nApplication`, `<Query>*</Query>`} {
		if _, err := Validate(Query{Channel: channel}); err == nil {
			t.Fatalf("unsafe channel accepted: %q", channel)
		}
	}
	if got := StartTime("-1hour", time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)); got != "2026-01-01T11:00:00Z" {
		t.Fatal(got)
	}
}

func TestEventWithoutLocalizedMessageHasFallback(t *testing.T) {
	event := NormalizeEvent(Event{EventID: 7})
	if event.Message != "[mensagem localizada indisponível]" || event.Level != "Nível desconhecido" {
		t.Fatalf("%#v", event)
	}
}
