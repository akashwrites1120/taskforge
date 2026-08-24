package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestApplyEnvFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env.local")
	content := "# comment line\n" +
		"DATABASE_URL=postgres://from-file\n" +
		"export PORT=9090\n" +
		`QUOTED = "trimmed value"` + "\n" +
		"SINGLE='single'\n" +
		"NOT_A_PAIR\n" +
		"\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("DATABASE_URL", "postgres://already-set")

	applyEnvFile(path)

	if got := os.Getenv("DATABASE_URL"); got != "postgres://already-set" {
		t.Errorf("existing env var was overridden: got %q", got)
	}
	if got := os.Getenv("PORT"); got != "9090" {
		t.Errorf("PORT not loaded from file: got %q", got)
	}
	if got := os.Getenv("QUOTED"); got != "trimmed value" {
		t.Errorf("QUOTED not trimmed: got %q", got)
	}
	if got := os.Getenv("SINGLE"); got != "single" {
		t.Errorf("SINGLE not unquoted: got %q", got)
	}
	for _, k := range []string{"NOT_A_PAIR"} {
		if _, ok := os.LookupEnv(k); ok {
			t.Errorf("%s should not be set", k)
		}
	}
}

func TestLoadReadsEnvLocalFromFilesystem(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "backend", "cmd")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	envFile := filepath.Join(dir, ".env.local")
	if err := os.WriteFile(envFile, []byte("DATABASE_URL=postgres://walked-up\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	oldURL, hadURL := os.LookupEnv("DATABASE_URL")
	if err := os.Unsetenv("DATABASE_URL"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if hadURL {
			os.Setenv("DATABASE_URL", oldURL)
		} else {
			os.Unsetenv("DATABASE_URL")
		}
	}()

	t.Chdir(sub)

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DatabaseURL != "postgres://walked-up" {
		t.Errorf("Load did not pick up .env.local: got %q", cfg.DatabaseURL)
	}
}
