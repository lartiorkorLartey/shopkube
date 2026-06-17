# frozen_string_literal: true
class Review < ApplicationRecord
  validates :user_id,    presence: true
  validates :product_id, presence: true
  validates :body,       presence: true
  validates :rating,     presence: true,
                         numericality: { only_integer: true, in: 1..5 }
end
