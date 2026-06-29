FROM ruby:3.3

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup --no-create-home --shell /bin/false appuser

WORKDIR /app

COPY Gemfile ./
RUN bundle config set --local without 'development test' && \
    bundle install --jobs 4 --retry 3

COPY . .
RUN chmod +x bin/rails bin/rake entrypoint.sh
RUN bundle exec bootsnap precompile --gemfile 2>/dev/null || true
RUN mkdir -p tmp/pids tmp/cache tmp/sockets log && chown -R appuser:appgroup /app

USER appuser
EXPOSE 8087

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ruby -e "require 'net/http'; exit Net::HTTP.get_response(URI('http://localhost:8087/health')).code.to_i == 200 ? 0 : 1" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
