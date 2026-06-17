# frozen_string_literal: true
class ReviewsController < ApplicationController
  def index
    product_id = params[:product_id]
    if product_id.blank?
      return render json: { error: 'product_id query parameter is required', code: 400 }, status: :bad_request
    end
    reviews = Review.where(product_id: product_id).order(created_at: :desc)
    render json: reviews
  end

  def create
    review = Review.new(review_params)
    if review.save
      render json: review, status: :created
    else
      render json: { error: review.errors.full_messages.join(', '), code: 422 }, status: :unprocessable_entity
    end
  end

  def destroy
    review = Review.find(params[:id])
    review.destroy
    head :no_content
  end

  def summary
    product_id = params[:product_id]
    reviews = Review.where(product_id: product_id)
    total = reviews.count
    average = total > 0 ? reviews.average(:rating).to_f.round(2) : 0.0
    render json: { product_id: product_id, average_rating: average, total_reviews: total }
  end

  private

  def review_params
    params.require(:review).permit(:user_id, :product_id, :rating, :body)
  end
end
