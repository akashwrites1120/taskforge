package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	"taskforge/backend/internal/api"
	"taskforge/backend/internal/config"
	"taskforge/backend/internal/queue"
	"taskforge/backend/internal/reaper"
	"taskforge/backend/internal/store"
	"taskforge/backend/internal/worker"
)

func main() {
	// Configure slog JSON logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: taskforge [command]\n\n")
		fmt.Fprintf(os.Stderr, "Commands:\n")
		fmt.Fprintf(os.Stderr, "  start   Run Server, Worker Pool, and Reaper all-in-one (default)\n")
		fmt.Fprintf(os.Stderr, "  server  Run HTTP REST API Server only\n")
		fmt.Fprintf(os.Stderr, "  worker  Run Worker Pool only\n")
		fmt.Fprintf(os.Stderr, "  reaper  Run Reaper recovery daemon only\n\n")
		flag.PrintDefaults()
	}

	flag.Parse()
	cmd := "start"
	if len(flag.Args()) > 0 {
		cmd = flag.Arg(0)
	}

	cfg, err := config.Load()
	if err != nil {
		slog.Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Initialize store
	s, err := store.NewStore(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("Failed to initialize store", "error", err)
		os.Exit(1)
	}
	defer s.Close()

	q := queue.NewQueue(s, cfg.DedupeWindow)

	switch cmd {
	case "server":
		runServerOnly(ctx, cfg, s, q)
	case "worker":
		runWorkerOnly(ctx, cfg, s, q)
	case "reaper":
		runReaperOnly(ctx, cfg, s)
	case "start":
		runAllInOne(ctx, cfg, s, q)
	default:
		slog.Error("Unknown command", "command", cmd)
		flag.Usage()
		os.Exit(1)
	}
}

func runServerOnly(ctx context.Context, cfg *config.Config, s *store.Store, q *queue.Queue) {
	srv := api.NewServer(cfg.Port, s, q)

	go func() {
		if err := srv.Start(); err != nil {
			slog.Error("Server start failure", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("Shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Stop(shutdownCtx); err != nil {
		slog.Error("Graceful server shutdown failed", "error", err)
	}
	slog.Info("Server exited cleanly")
}

func runWorkerOnly(ctx context.Context, cfg *config.Config, s *store.Store, q *queue.Queue) {
	hostname, _ := os.Hostname()
	workerID := fmt.Sprintf("worker-%s-%d", hostname, os.Getpid())

	wp := worker.NewWorkerPool(s, q, workerID, cfg.PollInterval)
	registerDemoHandlers(wp)

	go wp.Start(ctx)

	<-ctx.Done()
	slog.Info("Shutdown signal received, draining worker pool...")
	wp.Stop()
	slog.Info("Worker pool exited cleanly")
}

func runReaperOnly(ctx context.Context, cfg *config.Config, s *store.Store) {
	rp := reaper.NewReaper(s, cfg.ReaperInterval)

	go rp.Start(ctx)

	<-ctx.Done()
	slog.Info("Shutdown signal received, stopping reaper...")
	rp.Stop()
	slog.Info("Reaper exited cleanly")
}

func runAllInOne(ctx context.Context, cfg *config.Config, s *store.Store, q *queue.Queue) {
	slog.Info("Starting TaskForge in all-in-one dev mode")

	// Server
	srv := api.NewServer(cfg.Port, s, q)
	go func() {
		if err := srv.Start(); err != nil {
			slog.Error("Server start failure", "error", err)
			os.Exit(1)
		}
	}()

	// Worker
	hostname, _ := os.Hostname()
	workerID := fmt.Sprintf("worker-all-%s-%d", hostname, os.Getpid())
	wp := worker.NewWorkerPool(s, q, workerID, cfg.PollInterval)
	registerDemoHandlers(wp)
	go wp.Start(ctx)

	// Reaper
	rp := reaper.NewReaper(s, cfg.ReaperInterval)
	go rp.Start(ctx)

	<-ctx.Done()
	slog.Info("Shutdown signal received, initiating graceful shutdown...")

	// 1. Stop Server first to reject new jobs
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Stop(shutdownCtx); err != nil {
		slog.Error("Server shutdown failed", "error", err)
	}

	// 2. Stop Worker Pool to let active jobs complete
	wp.Stop()

	// 3. Stop Reaper
	rp.Stop()

	slog.Info("All components stopped. Exiting cleanly.")
}

func registerDemoHandlers(wp *worker.WorkerPool) {
	// 1. send_email: simulates emails, handles transient errors
	wp.Register("send_email", 3, func(ctx context.Context, payload json.RawMessage) error {
		slog.Info("Executing send_email job", "payload", string(payload))
		time.Sleep(800 * time.Millisecond)

		// 15% chance of transient failure
		r := rand.Float64()
		if r < 0.15 {
			return errors.New("smtp connection timed out")
		}
		// 5% chance of non-retryable validation error
		if r < 0.20 {
			return worker.MarkNonRetryable(errors.New("recipient address is blocklisted"))
		}

		slog.Info("Successfully completed send_email job")
		return nil
	})

	// 2. process_payment: simulates payments
	wp.Register("process_payment", 2, func(ctx context.Context, payload json.RawMessage) error {
		slog.Info("Executing process_payment job", "payload", string(payload))
		time.Sleep(500 * time.Millisecond)

		slog.Info("Successfully completed process_payment job")
		return nil
	})

	// 3. export_data: long running job demonstrating context cancellation & heartbeats
	wp.Register("export_data", 1, func(ctx context.Context, payload json.RawMessage) error {
		slog.Info("Starting long-running export_data job", "payload", string(payload))

		for i := 1; i <= 5; i++ {
			select {
			case <-ctx.Done():
				slog.Warn("export_data job cancelled")
				return ctx.Err()
			default:
				time.Sleep(1 * time.Second)
				slog.Info("export_data job executing step", "step", i)

				// Call Heartbeat to extend visibility timeout
				if err := worker.Heartbeat(ctx); err != nil {
					slog.Error("Heartbeat failed inside export_data", "error", err)
					return err // stop executing if lock was lost
				}
			}
		}

		slog.Info("Successfully completed export_data job")
		return nil
	})
}
