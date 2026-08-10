package config

import (
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
	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
