package queue

import (
	"math"
	"math/rand"
	"time"
)

type BackoffPolicy struct {
	BaseDelay time.Duration
	MaxDelay  time.Duration
}

var DefaultBackoffPolicy = BackoffPolicy{
	BaseDelay: 2 * time.Second,
	MaxDelay:  15 * time.Minute,
}

// CalculateBackoff calculates backoff duration with AWS-style Full Jitter.
func (p BackoffPolicy) CalculateBackoff(attempt int) time.Duration {
	if attempt < 0 {
		attempt = 0
	}

	// base * 2^attempt
	pow := math.Pow(2, float64(attempt))
	delaySec := p.BaseDelay.Seconds() * pow
	maxSec := p.MaxDelay.Seconds()

	if delaySec > maxSec || math.IsInf(delaySec, 1) {
		delaySec = maxSec
	}

	// Full Jitter: random duration between [0, delay]
	jitterSec := rand.Float64() * delaySec

	return time.Duration(jitterSec * float64(time.Second))
}
