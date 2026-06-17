# Build stage
FROM rust:1.78-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Cache dependency compilation: copy manifest first and build with a stub main
COPY Cargo.toml ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release 2>/dev/null || true
RUN rm src/main.rs

# Build the real application
COPY src ./src
RUN touch src/main.rs && cargo build --release

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
