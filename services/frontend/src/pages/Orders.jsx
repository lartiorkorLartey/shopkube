import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO_USER } from '../CartContext.jsx'

const STATUS_COLORS = {
  PENDING:    { bg: '#FEF3C7', color: '#92400E' },
  CONFIRMED:  { bg: '#DBEAFE', color: '#1E40AF' },
  PROCESSING: { bg: '#EDE9FE', color: '#5B21B6' },
  SHIPPED:    { bg: '#D1FAE5', color: '#065F46' },
  DELIVERED:  { bg: '#D1FAE5', color: '#065F46' },
  CANCELLED:  { bg: '#FEE2E2', color: '#991B1B' },
}

export default function Orders() {
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetch(`/api/orders/user/${DEMO_USER}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => setOrders(Array.isArray(data) ? data.reverse() : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Loading orders…</div>

  return (
    <div>
      <div className="page-header">
        <h1>
          Orders{' '}
          {!loading && <span className="count">({orders.length})</span>}
        </h1>
        <button className="btn-secondary" onClick={() => navigate('/products')}>
          Continue Shopping
        </button>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {orders.length === 0 ? (
        <div className="empty-state">
          <span style={{ fontSize: 48 }}>📋</span>
          <h3>No orders yet</h3>
          <p style={{ marginTop: 8 }}>Place your first order from the cart.</p>
          <button className="btn-primary" onClick={() => navigate('/products')} style={{ marginTop: 20 }}>
            Browse Products
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => {
            const style = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', color: '#374151' }
            const total = order.totalAmount ?? (order.items ?? []).reduce((sum, i) => sum + (i.subtotal ?? 0), 0)
            return (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>Order</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{order.id}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      className="service-badge"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {order.status}
                    </span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                    </div>
                  </div>
                </div>

                <div className="order-items">
                  {(order.items ?? []).map((item, idx) => (
                    <div key={idx} className="order-item-row">
                      <span>{item.productName}</span>
                      <span style={{ color: 'var(--text-muted)' }}>× {item.quantity}</span>
                      <span style={{ fontWeight: 600 }}>${(item.subtotal ?? item.unitPrice * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="order-footer">
                  <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    {(order.items ?? []).length} item{(order.items ?? []).length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                    Total: ${(order.totalAmount ?? total).toFixed(2)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
