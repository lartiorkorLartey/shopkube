#!/usr/bin/env bash
set -e

echo "Running database migrations..."
bundle exec rails db:create 2>/dev/null || true
bundle exec rails db:migrate

echo "Starting Puma server..."
exec bundle exec puma -C config/puma.rb
