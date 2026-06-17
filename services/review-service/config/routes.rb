# frozen_string_literal: true
Rails.application.routes.draw do
  get '/health', to: 'health#index'
  get '/ready',  to: 'health#ready'

  resources :reviews, only: [:index, :create, :destroy]

  get '/reviews/summary/:product_id', to: 'reviews#summary'
end
