import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO_USER, useCart } from '../CartContext.jsx'

const CATEGORY_COLORS = {
  'Electronics':    '#3B82F6',
  'Clothing':       '#EC4899',
  'Books':          '#8B5CF6',
  'Home & Garden':  '#10B981',
}

const CATEGORY_ICONS = {
  'Electronics':    '⚡',
  'Clothing':       '👕',
  'Books':          '📚',
  'Home & Garden':  '🏡',
}

function ProductCard({ product, onAddToCart }) {
  const color    = CATEGORY_COLORS[product.category] ?? '#6B7280'
  const icon     = CATEGORY_ICONS[product.category] ?? '📦'
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [added, setAdded]   = useState(false)

  async function handleAddToCart(e) {
    e.stopPropagation()
    if (product.stock === 0) return
    setAdding(true)
    try {
      await onAddToCart(product)
      setAdded(true)
      setTimeout(() => setAdded(false), 1500)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="product-card" onClick={() => navigate(`/products/${product.id}`)} style={{ cursor: 'pointer' }}>
      <div className="product-image" style={{ background: color }}>
        {icon}
      </div>
      <div className="product-body">
        <span className="product-category">{product.category}</span>
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description}</p>
        <div className="product-footer">
          <span className="product-price">${product.price.toFixed(2)}</span>
          <span className={`stock-badge ${product.stock > 0 ? 'in-stock' : 'out-of-stock'}`}>
            {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="btn-primary"
            disabled={product.stock === 0 || adding}
            onClick={handleAddToCart}
            style={{ flex: 1 }}
          >
            {added ? 'Added!' : adding ? 'Adding…' : 'Add to Cart'}
          </button>
          <button
            className="btn-secondary"
            onClick={e => { e.stopPropagation(); navigate(`/products/${product.id}`) }}
          >
            Details
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState('All')
  const { refresh } = useCart()

  useEffect(() => {
    fetch('/api/products')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleAddToCart(product) {
    const r = await fetch(`/api/cart/${DEMO_USER}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
      }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    await refresh()
  }

  const categories = ['All', ...new Set(products.map(p => p.category).sort())]

  const filtered = products.filter(p => {
    const matchCat    = category === 'All' || p.category === category
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div>
      <div className="page-header">
        <h1>
          Products{' '}
          {!loading && <span className="count">({products.length})</span>}
        </h1>
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="Search by name or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="category-tabs">
          {categories.map(c => (
            <button
              key={c}
              className={`category-tab ${category === c ? 'active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading">Loading products…</div>}

      {error && (
        <div className="error-box">
          Failed to load products: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">
          <span style={{ fontSize: 40 }}>📦</span>
          {products.length === 0 ? (
            <>
              <h3>No products yet</h3>
              <p>Run the seed script to populate the catalog:</p>
              <p><code>docker compose exec product-service python seed.py</code></p>
            </>
          ) : (
            <h3>No products match your search</h3>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="product-grid">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} />
          ))}
        </div>
      )}
    </div>
  )
}
