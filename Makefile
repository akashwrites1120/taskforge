# TaskForge Makefile
# Provides common development and build commands

.PHONY: help dev test build migrate-up migrate-down docker-up docker-down lint

# Default target
help:
	@echo "TaskForge - Job Queue with Dead-Letter Recovery"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Development:"
	@echo "  make dev           Start backend + frontend dev servers (requires docker-compose)"
	@echo "  make run-server    Run backend API server"
	@echo "  make run-worker    Run backend worker pool"
	@echo "  make run-reaper    Run backend reaper"
	@echo "  make run-frontend  Run frontend dev server"
	@echo ""
	@echo "Database:"
	@echo "  make migrate-up    Apply all database migrations"
	@echo "  make migrate-down  Rollback last migration"
	@echo "  make migrate-new   Create new migration files (usage: make migrate-new name=add_column)"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests (backend + frontend)"
	@echo "  make test-backend  Run backend unit + integration tests"
	@echo "  make test-frontend Run frontend component tests"
	@echo "  make test-chaos    Run chaos integration tests"
	@echo ""
	@echo "Building:"
	@echo "  make build         Build backend binary + frontend assets"
	@echo "  make build-backend Build backend binary"
	@echo "  make build-frontend Build frontend assets"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up     Start Postgres + backend + frontend via docker-compose"
	@echo "  make docker-down   Stop docker-compose services"
	@echo "  make docker-logs   View docker-compose logs"
	@echo ""
	@echo "Linting:"
	@echo "  make lint          Run linters (backend + frontend)"
	@echo "  make lint-backend  Run Go linter (go vet, staticcheck)"
	@echo "  make lint-frontend Run frontend linter (oxlint)"
	@echo ""
	@echo "CI:"
	@echo "  make ci            Run full CI pipeline locally"

# Development
dev:
	docker-compose up -d postgres
	@sleep 3
	$(MAKE) migrate-up
	@echo "Starting backend and frontend..."
	@(cd backend && go run ./cmd/taskforge server &) && (cd frontend && npm run dev)

run-server:
	cd backend && go run ./cmd/taskforge server

run-worker:
	cd backend && go run ./cmd/taskforge worker

run-reaper:
	cd backend && go run ./cmd/taskforge reaper

run-frontend:
	cd frontend && npm run dev

# Database migrations
MIGRATE_CMD = migrate -path ./migrations -database "$$DATABASE_URL"
DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/taskforge?sslmode=disable

migrate-up:
	@export DATABASE_URL="$(DATABASE_URL)" && $(MIGRATE_CMD) up

migrate-down:
	@export DATABASE_URL="$(DATABASE_URL)" && $(MIGRATE_CMD) down 1

migrate-new:
	@if [ -z "$(name)" ]; then echo "Usage: make migrate-new name=<migration_name>"; exit 1; fi
	migrate create -ext sql -dir ./migrations -seq $(name)

# Testing
test: test-backend test-frontend

test-backend:
	cd backend && go test -v -race ./...

test-frontend:
	cd frontend && npm run test

test-chaos:
	cd backend && go test -v -race -run Chaos ./...

test-integration:
	cd backend && go test -v -race -run Integration ./...

# Building
build: build-backend build-frontend

build-backend:
	cd backend && CGO_ENABLED=0 go build -o bin/taskforge ./cmd/taskforge

build-frontend:
	cd frontend && npm run build

# Docker
docker-up:
	docker-compose up -d --build

docker-down:
	docker-compose down -v

docker-logs:
	docker-compose logs -f

# Linting
lint: lint-backend lint-frontend

lint-backend:
	cd backend && go vet ./... && staticcheck ./...

lint-frontend:
	cd frontend && npm run lint

# CI Pipeline
ci: lint test build
	@echo "CI pipeline completed successfully!"

# Cleanup
clean:
	rm -rf backend/bin
	rm -rf frontend/dist
	rm -rf frontend/node_modules/.cache

.PHONY: help dev test build migrate-up migrate-down docker-up docker-down lint clean