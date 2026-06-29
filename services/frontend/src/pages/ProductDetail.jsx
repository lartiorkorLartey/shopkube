import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DEMO_USER, useCart } from '../CartContext.jsx'

const CATEGORY_COLORS = {
  'Electronics':    '#3B82F6',
  'Clothing':       '#EC4899',
  'Books':          '#8B5CF6',
  'Home & Garden':  '#10B981',
}
const CATEGORY_ICONS = {
  'Electronics': '⚡', 'Clothing': '👕', 'Books': '📚', 'Home & Garden': '🏡',
}

function Stars({ rating, interactive = false, onRate }) {
  const [hover, setHover] = useState(0)
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => interactive && onRate(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{
            fontSize: interactive ? 28 : 16,
            cursor: interactive ? 'pointer' : 'default',
            color: n <= (hover || rating) ? '#F59E0B' : '#D1D5DB',
            transition: 'color 0.1s',
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

function ReviewForm({ productId, onAdded }) {
  const [rating, setRating] = useState(0)
  const [body, setBody]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (rating === 0) { setError('Please select a star rating'); return }
    if (!body.trim()) { setError('Please write a review'); return }
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review: { user_id: DEMO_USER, product_id: productId, rating, body } }),
      })
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(`HTTP ${r.status}: ${txt}`)
      }
      setRating(0)
      setBody('')
      onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="review-form" onSubmit={submit}>
      <h3>Write a Review</h3>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 6 }}>
          Your rating
        </label>
        <Stars rating={rating} interactive onRate={setRating} />
      </div>
      <textarea
        className="review-textarea"
        placeholder="Share your thoughts about this product…"
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={4}
      />
      {error && <div className="error-box" style={{ marginTop: 8 }}>{error}</div>}
      <button className="btn-primary" type="submit" disabled={saving} style={{ marginTop: 12 }}>
        {saving ? 'Posting…' : 'Post Review'}
      </button>
    </form>
  )
}

export default function ProductDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { refresh } = useCart()

  const [product,  setProduct]  = useState(null)
  const [reviews,  setReviews]  = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [qty,      setQty]      = useState(1)
  const [adding,   setAdding]   = useState(false)
  const [added,    setAdded]    = useState(false)
  const [cartErr,  setCartErr]  = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      fetch(`/api/reviews?product_id=${id}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/reviews/summary/${id}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([p, rv, sm]) => { setProduct(p); setReviews(rv); setSummary(sm) })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false))
  }, [id])

  function reloadReviews() {
    Promise.all([
      fetch(`/api/reviews?product_id=${id}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/reviews/summary/${id}`).then(r => r.ok ? r.json() : null),
    ]).then(([rv, sm]) => { setReviews(rv); setSummary(sm) })
  }

  async function handleAddToCart() {
    setAdding(true)
    setCartErr(null)
    try {
      const r = await fetch(`/api/cart/${DEMO_USER}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, name: product.name, price: product.price, quantity: qty }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await refresh()
      setAdded(true)
      setTimeout(() => setAdded(false), 2000)
    } catch (err) {
      setCartErr(err.message)
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <div className="loading">Loading product…</div>
  if (!product) return (
    <div className="empty-state">
      <h3>Product not found</h3>
      <button className="btn-primary" onClick={() => navigate('/products')} style={{ marginTop: 16 }}>
        Back to Products
      </button>
    </div>
  )

  const color = CATEGORY_COLORS[product.category] ?? '#6B7280'
  const icon  = CATEGORY_ICONS[product.category] ?? '📦'

  return (
    <div>
      <button className="btn-secondary" onClick={() => navigate('/products')} style={{ marginBottom: 20 }}>
        ← Back to Products
      </button>

      <div className="detail-layout">
        <div className="detail-image" style={{ background: color }}>
          <span style={{ fontSize: 80 }}>{icon}</span>
        </div>

        <div className="detail-info">
          <span className="product-category">{product.category}</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 4px' }}>{product.name}</h1>

          {summary && summary.total_reviews > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Stars rating={Math.round(summary.average_rating)} />
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                {summary.average_rating.toFixed(1)} ({summary.total_reviews} review{summary.total_reviews !== 1 ? 's' : ''})
              </span>
            </div>
          )}

          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>{product.description}</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <span className="product-price" style={{ fontSize: 28 }}>${product.price.toFixed(2)}</span>
            <span className={`stock-badge ${product.stock > 0 ? 'in-stock' : 'out-of-stock'}`}>
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </span>
          </div>

          {product.sku && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>SKU: {product.sku}</p>
          )}

          {product.stock > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 500 }}>Qty:</label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                <span style={{ padding: '6px 16px', fontSize: 15, fontWeight: 600 }}>{qty}</span>
                <button className="qty-btn" onClick={() => setQty(q => Math.min(product.stock, q + 1))}>+</button>
              </div>
            </div>
          )}

          <button
            className="btn-primary"
            disabled={product.stock === 0 || adding}
            onClick={handleAddToCart}
            style={{ fontSize: 16, padding: '12px 32px' }}
          >
            {added ? '✓ Added to Cart!' : adding ? 'Adding…' : 'Add to Cart'}
          </button>

          {cartErr && <div className="error-box" style={{ marginTop: 10 }}>{cartErr}</div>}
        </div>
      </div>

      <div className="reviews-section">
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
          Reviews
          {summary && summary.total_reviews > 0 && (
            <span className="count" style={{ fontWeight: 400, marginLeft: 8 }}>
              ({summary.total_reviews})
            </span>
          )}
        </h2>

        <ReviewForm productId={id} onAdded={reloadReviews} />

        {reviews.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 0' }}>
            <p>No reviews yet — be the first!</p>
          </div>
        ) : (
          <div className="review-list">
            {reviews.map(rv => (
              <div key={rv.id} className="review-card">
                <div className="review-header">
                  <div>
                    <Stars rating={rv.rating} />
                    <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{rv.user_id}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(rv.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', marginTop: 8 }}>{rv.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
