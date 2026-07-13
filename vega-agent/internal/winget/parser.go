package winget

import (
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/lyraos/vega-agent/internal/software"
)

var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)
var fieldSplitter = regexp.MustCompile(`\s{2,}`)

func cleanOutput(value string) string {
	value = ansiPattern.ReplaceAllString(value, "")
	value = strings.ReplaceAll(value, "\r", "")
	return strings.Map(func(r rune) rune {
		if r == '\b' {
			return -1
		}
		return r
	}, value)
}

func parseTable(output string, installed, updates bool) []software.PackageRef {
	lines := strings.Split(cleanOutput(output), "\n")
	separator := -1
	for index, line := range lines {
		if strings.Count(line, "-") >= 6 && index > 0 && len(fieldSplitter.Split(strings.TrimSpace(lines[index-1]), -1)) >= 3 {
			separator = index
			break
		}
	}
	if separator < 0 {
		return []software.PackageRef{}
	}
	rows := make([]software.PackageRef, 0)
	for _, line := range lines[separator+1:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		values := fieldSplitter.Split(strings.TrimSpace(line), -1)
		if len(values) < 3 || values[1] == "" {
			continue
		}
		source := values[len(values)-1]
		if source != "winget" && source != "msstore" {
			continue
		}
		description := "Versão " + values[2]
		if updates && len(values) >= 5 {
			description = values[2] + " → " + values[len(values)-2]
		}
		rows = append(rows, software.PackageRef{Origin: source, ID: values[1], Name: values[0], Description: description, Installed: installed, Icon: ""})
	}
	return rows
}

var detailLabels = map[string]string{
	"version": "version", "versao": "version", "publisher": "publisher", "editor": "publisher",
	"fornecedor": "publisher", "description": "description", "descricao": "description",
	"homepage": "url", "pagina inicial": "url", "license": "license", "licenca": "license",
	"license url": "license", "url da licenca": "license", "installer type": "installer",
	"tipo de instalador": "installer", "scope": "scope", "escopo": "scope",
	"download size": "downloadSize", "tamanho do download": "downloadSize",
	"dependencies": "dependencies", "dependencias": "dependencies", "agreements": "agreements", "contratos": "agreements",
	"terms of transaction": "agreements", "termos da transacao": "agreements",
	"store license terms": "agreements", "termos de licenca da loja": "agreements",
	"seizure warning": "agreements", "aviso de convulsao": "agreements",
}

func parseDetails(output, origin, id string) software.PackageDetails {
	details := software.PackageDetails{Origin: origin, ID: id, Dependencies: []string{}, Licenses: []string{}, Scopes: []string{}, Agreements: []string{}}
	active := ""
	for _, raw := range strings.Split(cleanOutput(output), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if name := foundName(line, id); name != "" {
			details.Name = name
			continue
		}
		label, value, ok := strings.Cut(line, ":")
		if ok {
			active = detailLabels[normalizeLabel(label)]
			if active != "" {
				applyDetail(&details, active, strings.TrimSpace(value))
				continue
			}
		}
		if active == "description" {
			if details.Description != "" {
				details.Description += " "
			}
			details.Description += line
		}
		if active == "dependencies" {
			details.Dependencies = appendUnique(details.Dependencies, strings.TrimPrefix(line, "- "))
		}
		if active == "agreements" {
			details.Agreements = appendUnique(details.Agreements, line)
		}
	}
	if details.Name == "" {
		details.Name = id
	}
	details.Interactive = strings.Contains(strings.ToLower(output), "interactive") || strings.Contains(normalizeLabel(output), "interativo")
	return details
}

func normalizeLabel(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.Map(func(r rune) rune {
		switch r {
		case 'á', 'à', 'ã', 'â', 'ä':
			return 'a'
		case 'é', 'è', 'ê', 'ë':
			return 'e'
		case 'í', 'ì', 'î', 'ï':
			return 'i'
		case 'ó', 'ò', 'õ', 'ô', 'ö':
			return 'o'
		case 'ú', 'ù', 'û', 'ü':
			return 'u'
		case 'ç':
			return 'c'
		}
		if unicode.IsSpace(r) {
			return ' '
		}
		return r
	}, value)
}

func foundName(line, id string) string {
	for _, prefix := range []string{"Found ", "Encontrado ", "Localizado "} {
		if strings.HasPrefix(line, prefix) && strings.HasSuffix(line, " ["+id+"]") {
			return strings.TrimSuffix(strings.TrimPrefix(line, prefix), " ["+id+"]")
		}
	}
	return ""
}

func applyDetail(details *software.PackageDetails, field, value string) {
	if value == "" {
		return
	}
	switch field {
	case "version":
		details.AvailableVersion = value
	case "publisher":
		details.Maintainer = value
	case "description":
		details.Description = value
	case "url":
		details.URL = value
	case "license":
		details.Licenses = appendUnique(details.Licenses, value)
	case "scope":
		normalized := normalizeLabel(value)
		if strings.Contains(normalized, "machine") || strings.Contains(normalized, "maquina") || strings.Contains(normalized, "computador") {
			normalized = "machine"
		}
		if strings.Contains(normalized, "user") || strings.Contains(normalized, "usuario") {
			normalized = "user"
		}
		details.Scopes = appendUnique(details.Scopes, normalized)
	case "downloadSize":
		details.DownloadSize = value
	case "dependencies":
		details.Dependencies = appendUnique(details.Dependencies, value)
	case "agreements":
		details.Agreements = appendUnique(details.Agreements, value)
	}
}

func appendUnique(values []string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return values
	}
	for _, current := range values {
		if current == value {
			return values
		}
	}
	return append(values, value)
}

func sortedPackages(values []software.PackageRef) []software.PackageRef {
	sort.SliceStable(values, func(i, j int) bool { return strings.ToLower(values[i].Name) < strings.ToLower(values[j].Name) })
	return values
}
