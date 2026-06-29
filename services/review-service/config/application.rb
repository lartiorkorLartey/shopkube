# frozen_string_literal: true
require_relative 'boot'

require 'rails'
require 'active_model/railtie'
require 'active_record/railtie'
require 'action_controller/railtie'
require 'action_dispatch/railtie'

Bundler.require(*Rails.groups)

module ReviewService
  class Application < Rails::Application
    config.load_defaults 7.1

    # API-only mode
    config.api_only = true

    # JSON logging
    config.log_formatter = proc do |severity, time, progname, msg|
      { timestamp: time.iso8601, level: severity, service: 'review-service', message: msg }.to_json + "\n"
    end

    # CORS
    config.middleware.insert_before 0, Rack::Cors do
      allow do
        origins '*'
        resource '*', headers: :any, methods: [:get, :post, :put, :patch, :delete, :options, :head]
      end
    end
  end
end
