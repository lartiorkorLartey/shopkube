FROM ruby:3.3-slim AS base

# Install runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libpq-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install gems
COPY Gemfile ./
RUN bundle config set --local deployment 'false' && \
    bundle config set --local without 'development test' && \
    bundle install --jobs 4 --retry 3

# Copy application code
COPY . .

# Precompile bootsnap
RUN bundle exec bootsnap precompile --gemfile app/ lib/ 2>/dev/null || true

# Non-root user
RUN groupadd -g 1001 appgroup && useradd -u 1001 -g appgroup --no-create-home appuser
RUN mkdir -p tmp/pids tmp/cache tmp/sockets log && chown -R appuser:appgroup /app

USER appuser
EXPOSE 8087

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ruby -e "require 'net/http'; exit Net::HTTP.get_response(URI('http://localhost:8087/health')).code.to_i == 200 ? 0 : 1" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
