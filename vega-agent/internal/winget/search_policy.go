package winget

import (
	"fmt"

	"github.com/lyraos/vega-agent/internal/software"
)

type sourceSearch func(origin string) ([]software.PackageRef, error)

func searchMicrosoftStoreFirst(search sourceSearch) ([]software.PackageRef, error) {
	storePackages, storeErr := search("msstore")
	if storeErr == nil && len(storePackages) > 0 {
		return sortedPackages(storePackages), nil
	}

	communityPackages, communityErr := search("winget")
	if communityErr != nil {
		if storeErr != nil {
			return nil, fmt.Errorf("Microsoft Store indisponível (%v); fallback WinGet também falhou: %w", storeErr, communityErr)
		}
		return nil, communityErr
	}
	return sortedPackages(communityPackages), nil
}
