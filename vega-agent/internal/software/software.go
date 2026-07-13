package software

import "context"

type PackageRef struct {
	Origin      string `json:"origin"`
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Installed   bool   `json:"installed"`
	Icon        string `json:"icon"`
}

type PackageDetails struct {
	Origin           string   `json:"origin"`
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Description      string   `json:"description"`
	Installed        bool     `json:"installed"`
	InstalledVersion string   `json:"installedVersion"`
	AvailableVersion string   `json:"availableVersion"`
	DownloadSize     string   `json:"downloadSize"`
	InstalledSize    string   `json:"installedSize"`
	Dependencies     []string `json:"dependencies"`
	Licenses         []string `json:"licenses"`
	URL              string   `json:"url"`
	Maintainer       string   `json:"maintainer"`
	Scopes           []string `json:"scopes,omitempty"`
	Agreements       []string `json:"agreements,omitempty"`
	Interactive      bool     `json:"interactive,omitempty"`
}

type Mutation struct {
	Action           string
	Origin           string
	ID               string
	Scope            string
	AcceptAgreements bool
}

type MutationResult struct {
	RebootRequired bool   `json:"rebootRequired"`
	Message        string `json:"message"`
}
type Progress func(percent int, message string)

type Manager interface {
	Version(context.Context) (string, error)
	Search(context.Context, string) ([]PackageRef, error)
	ListInstalled(context.Context) ([]PackageRef, error)
	ListUpdates(context.Context) ([]PackageRef, error)
	Details(context.Context, string, string) (PackageDetails, error)
	Mutate(context.Context, Mutation, Progress) (MutationResult, error)
}
