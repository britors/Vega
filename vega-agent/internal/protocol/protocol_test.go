package protocol

import (
	"bytes"
	"encoding/binary"
	"errors"
	"strings"
	"testing"
)

func framed(payload string) *bytes.Buffer {
	buffer := &bytes.Buffer{}
	_ = binary.Write(buffer, binary.LittleEndian, uint32(len(payload)))
	buffer.WriteString(payload)
	return buffer
}

func TestRoundTrip(t *testing.T) {
	want := Message{Version: Version, Kind: "request", RequestID: "request-1", Operation: "system.ping"}
	buffer := &bytes.Buffer{}
	if err := Write(buffer, want); err != nil {
		t.Fatal(err)
	}
	got, err := Read(buffer)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != want.Version || got.Kind != want.Kind || got.Operation != want.Operation {
		t.Fatalf("got %#v", got)
	}
}

func TestRejectsOversizedFrameBeforeAllocation(t *testing.T) {
	buffer := &bytes.Buffer{}
	_ = binary.Write(buffer, binary.LittleEndian, uint32(MaxFrameSize+1))
	_, err := Read(buffer)
	if !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("got %v", err)
	}
}

func TestRejectsUnknownAndDuplicateFields(t *testing.T) {
	for _, payload := range []string{
		`{"version":1,"kind":"hello","unexpected":true}`,
		`{"version":1,"version":1,"kind":"hello"}`,
	} {
		if _, err := Read(framed(payload)); err == nil {
			t.Fatalf("accepted %s", payload)
		}
	}
}

func TestRejectsTruncatedFrame(t *testing.T) {
	buffer := framed(`{"version":1,"kind":"hello"}`)
	data := buffer.Bytes()
	_, err := Read(bytes.NewReader(data[:len(data)-2]))
	if !errors.Is(err, ErrInvalidFrame) {
		t.Fatalf("got %v", err)
	}
}

func TestWriteRejectsLargePayload(t *testing.T) {
	message := Message{Version: Version, Kind: "result", Result: strings.Repeat("x", MaxFrameSize)}
	if err := Write(&bytes.Buffer{}, message); !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("got %v", err)
	}
}
