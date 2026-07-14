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

func FuzzRead(f *testing.F) {
	valid := framed(`{"version":1,"kind":"hello","nonce":"01234567890123456789012345678901"}`).Bytes()
	duplicate := framed(`{"version":1,"kind":"hello","kind":"request"}`).Bytes()
	unknown := framed(`{"version":1,"kind":"hello","unknown":true}`).Bytes()
	truncated := framed(`{"version":1,"kind":"hello"}`).Bytes()
	truncated = truncated[:len(truncated)-1]
	oversized := &bytes.Buffer{}
	_ = binary.Write(oversized, binary.LittleEndian, uint32(MaxFrameSize+1))

	for _, seed := range [][]byte{
		nil,
		{0, 0, 0, 0},
		valid,
		duplicate,
		unknown,
		truncated,
		oversized.Bytes(),
		[]byte(`{"arbitrary":[null,true,1,"text",{}]}`),
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, frame []byte) {
		message, err := Read(bytes.NewReader(frame))
		if err == nil {
			var encoded bytes.Buffer
			if writeErr := Write(&encoded, message); writeErr != nil {
				t.Fatalf("accepted message cannot be encoded: %v", writeErr)
			}
			if _, readErr := Read(&encoded); readErr != nil {
				t.Fatalf("accepted message cannot be decoded again: %v", readErr)
			}
		}
	})
}
