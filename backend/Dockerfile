# Backend Dockerfile
# Build stage
FROM golang:1.25-alpine AS builder

# Install git (needed for go modules) and ca-certificates
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy dependency files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
# We keep CGO enabled because pgx driver uses cgo, but we rely on alpine's glibc in final stage
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/taskforge ./cmd/taskforge

# Final stage
FROM alpine:3.20

# Add non-root user
RUN addgroup -S taskforge && adduser -S -G taskforge taskforge

# Copy binary from builder
COPY --from=builder /app/bin/taskforge /usr/local/bin/taskforge

# Copy config files if any (none currently)
# Expose port (default 8080, but configurable via env)
EXPOSE 8080

# Use non-root user
USER taskforge

# Entry point
ENTRYPOINT ["taskforge"]
# Default command can be overridden via docker-compose or run args
CMD ["start"]