# frozen_string_literal: true
class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound do |e|
    render json: { error: e.message, code: 404 }, status: :not_found
  end

  rescue_from ActiveRecord::RecordInvalid do |e|
    render json: { error: e.message, code: 422 }, status: :unprocessable_entity
  end
end
