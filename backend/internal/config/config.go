package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/caarlos0/env/v10"
)

type Config struct {
	DatabaseURL       string        `env:"DATABASE_URL" envDefault:"postgres://postgres:postgres@localhost:5432/taskforge?sslmode=disable"`
	Port              string        `env:"PORT" envDefault:"8080"`
	WorkerConcurrency int           `env:"WORKER_CONCURRENCY" envDefault:"10"`
	PollInterval      time.Duration `env:"POLL_INTERVAL" envDefault:"5s"`
	ReaperInterval    time.Duration `env:"REAPER_INTERVAL" envDefault:"15s"`
	DefaultTimeout    time.Duration `env:"DEFAULT_TIMEOUT" envDefault:"30s"`
	DedupeWindow      time.Duration `env:"DEDUPE_WINDOW" envDefault:"24h"`
}

func Load() (*Config, error) {
	loadEnvLocal()

	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// loadEnvLocal walks up from the working directory looking for a .env.local
// file and sets any variables it defines that are not already present in the
// environment. Real environment variables always win; a missing file is not
// an error.
func loadEnvLocal() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}

	for depth := 0; depth < 10; depth++ {
		path := filepath.Join(dir, ".env.local")
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			applyEnvFile(path)
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}

func applyEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
}
