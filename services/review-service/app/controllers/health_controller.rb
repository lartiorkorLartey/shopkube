# frozen_string_literal: true
class HealthController < ApplicationController
  def index
    render json: { status: 'ok', service: 'review-service' }
  end

  def ready
    ActiveRecord::Base.connection.execute('SELECT 1')
    render json: { status: 'ok' }
  rescue StandardError => e
    render json: { status: 'unavailable', error: e.message }, status: :service_unavailable
  end
end
