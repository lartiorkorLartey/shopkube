# frozen_string_literal: true
Review.destroy_all

product_ids = %w[prod-electronics-001 prod-clothing-001 prod-books-001]

reviews_data = [
  # Electronics product
  { user_id: 'user-001', product_id: 'prod-electronics-001', rating: 5, body: 'Absolutely amazing laptop! Performance is stellar, battery life is incredible, and build quality is top notch. Best purchase I have made this year.' },
  { user_id: 'user-002', product_id: 'prod-electronics-001', rating: 4, body: 'Great device overall. The screen is beautiful and it is very fast. Dropped one star because the webcam could be better, but for the price this is excellent.' },
  { user_id: 'user-003', product_id: 'prod-electronics-001', rating: 5, body: 'Perfect for software development. Runs Docker, multiple IDEs, and a browser with tons of tabs without breaking a sweat. Highly recommend to any developer.' },
  { user_id: 'user-004', product_id: 'prod-electronics-001', rating: 3, body: 'Decent laptop but gets warm under load. Fan noise is noticeable during compilation. Good for everyday tasks though. The keyboard is comfortable to type on.' },
  { user_id: 'user-005', product_id: 'prod-electronics-001', rating: 4, body: 'Solid build, great performance. Arrived well packaged and was easy to set up. The SSD makes everything lightning fast.' },
  # Clothing product
  { user_id: 'user-006', product_id: 'prod-clothing-001', rating: 5, body: 'Super soft and comfortable! The fabric is high quality and the fit is perfect. I ordered two more in different colors. Wash instructions are easy to follow and it does not shrink.' },
  { user_id: 'user-007', product_id: 'prod-clothing-001', rating: 4, body: 'Nice t-shirt. The material feels premium and it has held up well after multiple washes. The color stayed vibrant. Would buy again.' },
  { user_id: 'user-008', product_id: 'prod-clothing-001', rating: 2, body: 'Sizing runs small. I normally wear a medium but had to exchange for a large. Once I got the right size, the quality was decent but not worth the hassle.' },
  { user_id: 'user-009', product_id: 'prod-clothing-001', rating: 5, body: 'Best basic t-shirt I have ever bought. Feels luxurious for the price. Slightly longer cut which I prefer. Will be buying more.' },
  { user_id: 'user-010', product_id: 'prod-clothing-001', rating: 3, body: 'Average quality. Nothing special but not bad either. The stitching is even and the fabric is soft enough. Decent value for the price.' },
  # Books product
  { user_id: 'user-011', product_id: 'prod-books-001', rating: 5, body: 'This book completely changed how I think about Kubernetes. Clear explanations, great examples, and the author obviously has deep expertise. A must-have for anyone working with K8s.' },
  { user_id: 'user-012', product_id: 'prod-books-001', rating: 5, body: 'Excellent reference! I keep coming back to it. The chapter on persistent volumes alone is worth the price of the book. Very well organized and thorough.' },
  { user_id: 'user-013', product_id: 'prod-books-001', rating: 4, body: 'Very comprehensive coverage of Kubernetes concepts. Some sections are dense but the worked examples make up for it. Great for intermediate users.' },
  { user_id: 'user-014', product_id: 'prod-books-001', rating: 3, body: 'Good content but could use an update. Some of the API examples are slightly outdated. Still useful for understanding the core concepts.' },
  { user_id: 'user-015', product_id: 'prod-books-001', rating: 5, body: 'Hands-down the best Kubernetes book available. I went from zero to deploying production workloads in a month using this as my guide. Absolutely recommend.' },
]

reviews_data.each do |attrs|
  Review.create!(attrs)
end

puts "Created #{Review.count} reviews for #{product_ids.length} products"
