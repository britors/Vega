package processcontrol

import "testing"

func TestCriticalProcessNamesAreCaseInsensitive(t *testing.T) {
	for _, name := range []string{"System", "LSASS.EXE", "svchost.exe", "winlogon"} {
		if !IsProtectedName(name) {
			t.Fatalf("%q should be protected", name)
		}
	}
	if IsProtectedName("notepad.exe") {
		t.Fatal("ordinary process should not be protected")
	}
}
