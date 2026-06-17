# frozen_string_literal: true
class CreateReviews < ActiveRecord::Migration[7.1]
  def change
    create_table :reviews do |t|
      t.string :user_id,    null: false
      t.string :product_id, null: false
      t.integer :rating,    null: false
      t.text :body,         null: false

      t.timestamps
    end

    add_index :reviews, :product_id
    add_index :reviews, :user_id
  end
end
