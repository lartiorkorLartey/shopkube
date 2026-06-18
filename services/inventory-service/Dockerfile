# Build stage
FROM rust:1.88 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup --no-create-home --shell /bin/false appuser

WORKDIR /app
COPY --from=builder --chown=appuser:appgroup \
    /usr/src/app/target/release/inventory-service .

USER appuser
EXPOSE 8086

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8086/health || exit 1

CMD ["./inventory-service"]
