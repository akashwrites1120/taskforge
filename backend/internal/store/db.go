package store

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	Pool *pgxpool.Pool
}

// NewStore initializes a pgx connection pool.
func NewStore(ctx context.Context, databaseURL string) (*Store, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database url: %w", err)
	}

	// Set pool limits
	config.MaxConns = 25
	config.MinConns = 2
	config.MaxConnIdleTime = 15 * time.Minute
	config.MaxConnLifetime = 1 * time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to postgres: %w", err)
	}

	// Ping the DB to ensure connectivity
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	slog.Info("Successfully connected to PostgreSQL")
	return &Store{Pool: pool}, nil
}

// Close closes the pgx connection pool.
func (s *Store) Close() {
	if s.Pool != nil {
		s.Pool.Close()
		slog.Info("PostgreSQL connection pool closed")
	}
}
