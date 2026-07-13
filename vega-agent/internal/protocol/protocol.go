package protocol

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const (
	Version      = 1
	MaxFrameSize = 1 << 20
)

var (
	ErrFrameTooLarge = errors.New("protocol: frame exceeds 1 MiB")
	ErrInvalidFrame  = errors.New("protocol: invalid frame")
)

type Message struct {
	Version   int             `json:"version"`
	Kind      string          `json:"kind"`
	RequestID string          `json:"requestId,omitempty"`
	Nonce     string          `json:"nonce,omitempty"`
	Operation string          `json:"operation,omitempty"`
	Params    json.RawMessage `json:"params,omitempty"`
	Result    any             `json:"result,omitempty"`
	Error     *Error          `json:"error,omitempty"`
}

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Capabilities struct {
	Platform            string              `json:"platform"`
	PlatformVersion     string              `json:"platformVersion"`
	BackendVersion      string              `json:"backendVersion"`
	ProtocolVersion     int                 `json:"protocolVersion"`
	Modules             []string            `json:"modules"`
	ReadOperations      []string            `json:"readOperations"`
	Mutations           []string            `json:"mutations"`
	ElevatedMutations   []string            `json:"elevatedMutations"`
	MissingDependencies []MissingDependency `json:"missingDependencies"`
}

type MissingDependency struct {
	ID      string   `json:"id"`
	Modules []string `json:"modules"`
	Detail  string   `json:"detail"`
}

func Read(r io.Reader) (Message, error) {
	var size uint32
	if err := binary.Read(r, binary.LittleEndian, &size); err != nil {
		return Message{}, err
	}
	if size == 0 {
		return Message{}, fmt.Errorf("%w: empty payload", ErrInvalidFrame)
	}
	if size > MaxFrameSize {
		return Message{}, ErrFrameTooLarge
	}
	payload := make([]byte, size)
	if _, err := io.ReadFull(r, payload); err != nil {
		return Message{}, fmt.Errorf("%w: %v", ErrInvalidFrame, err)
	}
	if err := rejectDuplicateKeys(payload); err != nil {
		return Message{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var message Message
	if err := decoder.Decode(&message); err != nil {
		return Message{}, fmt.Errorf("%w: %v", ErrInvalidFrame, err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Message{}, fmt.Errorf("%w: trailing JSON", ErrInvalidFrame)
	}
	return message, nil
}

func Write(w io.Writer, message Message) error {
	payload, err := json.Marshal(message)
	if err != nil {
		return err
	}
	if len(payload) == 0 || len(payload) > MaxFrameSize {
		return ErrFrameTooLarge
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(payload))); err != nil {
		return err
	}
	_, err = w.Write(payload)
	return err
}

func rejectDuplicateKeys(payload []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	var walk func() error
	walk = func() error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delim, isDelim := token.(json.Delim)
		if !isDelim {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]struct{}{}
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return err
				}
				key, ok := keyToken.(string)
				if !ok {
					return fmt.Errorf("object key is not a string")
				}
				if _, exists := seen[key]; exists {
					return fmt.Errorf("%w: duplicate field %q", ErrInvalidFrame, key)
				}
				seen[key] = struct{}{}
				if err := walk(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		case '[':
			for decoder.More() {
				if err := walk(); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		default:
			return fmt.Errorf("unexpected delimiter %q", delim)
		}
	}
	if err := walk(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidFrame, err)
	}
	return nil
}
