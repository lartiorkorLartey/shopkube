import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO_USER, useCart } from '../CartContext.jsx'

export default function Cart() {
  const navigate = useNavigate()
  const { refresh } = useCart()

  const [cart,      setCart]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [placing,   setPlacing]   = useState(false)
  const [order,     setOrder]     = useState(null)
  const [error,     setError]     = useState(null)

  const loadCart = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/cart/${DEMO_USER}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setCart(await r.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCart() }, [loadCart])

  async function updateQty(productId, qty) {
    if (qty < 1) return removeItem(productId)
    await fetch(`/api/cart/${DEMO_USER}/items/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty }),
    })
    await loadCart()
    await refresh()
  }

  async function removeItem(productId) {
    await fetch(`/api/cart/${DEMO_USER}/items/${productId}`, { method: 'DELETE' })
    await loadCart()
    await refresh()
  }

  async function clearCart() {
    await fetch(`/api/cart/${DEMO_USER}`, { method: 'DELETE' })
    await loadCart()
    await refresh()
  }

  async function placeOrder() {
    const items = cart?.items ?? []
    if (!items.length) return
    setPlacing(true)
    setError(null)
    try {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: DEMO_USER,
          items: items.map(i => ({
            productId:   i.productId,
            productName: i.name,
            unitPrice:   i.price,
            quantity:    i.quantity,
          })),
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const placed = await r.json()
      setOrder(placed)
      await clearCart()
    } catch (e) {
      setError(`Failed to place order: ${e.message}`)
    } finally {
      setPlacing(false)
    }
  }

  if (loading) return <div className="loading">Loading cart…</div>

  if (order) {
    return (
      <div className="empty-state" style={{ paddingTop: 60 }}>
        <span style={{ fontSize: 56 }}>✅</span>
        <h2 style={{ marginTop: 16, color: 'var(--success)' }}>Order Placed!</h2>
        <p style={{ marginTop: 8, fontSize: 14 }}>
          Order ID: <code>{order.id}</code>
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
          Status: <strong>{order.status}</strong>
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={() => navigate('/orders')}>View Orders</button>
          <button className="btn-secondary" onClick={() => navigate('/products')}>Continue Shopping</button>
        </div>
      </div>
    )
  }

  const items  = cart?.items ?? []
  const total  = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <div>
      <div className="page-header">
        <h1>Shopping Cart</h1>
        {items.length > 0 && (
          <button className="btn-secondary" onClick={clearCart}>Clear Cart</button>
        )}
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {items.length === 0 ? (
        <div className="empty-state">
          <span style={{ fontSize: 48 }}>🛒</span>
          <h3>Your cart is empty</h3>
          <p style={{ marginTop: 8 }}>Add some products to get started.</p>
          <button className="btn-primary" onClick={() => navigate('/products')} style={{ marginTop: 20 }}>
            Browse Products
          </button>
        </div>
      ) : (
        <>
          <div className="cart-list">
            {items.map(item => (
              <div key={item.productId} className="cart-item">
                <div className="cart-item-info">
                  <span className="cart-item-name">{item.name}</span>
                  <span className="cart-item-price">${item.price.toFixed(2)} each</span>
                </div>
                <div className="cart-item-controls">
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <button className="qty-btn" onClick={() => updateQty(item.productId, item.quantity - 1)}>−</button>
                    <span style={{ padding: '6px 14px', fontSize: 15, fontWeight: 600 }}>{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.productId, item.quantity + 1)}>+</button>
                  </div>
                  <span className="cart-item-subtotal">${(item.price * item.quantity).toFixed(2)}</span>
                  <button className="btn-danger" onClick={() => removeItem(item.productId)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <div className="cart-total">
              <span>Total</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>${total.toFixed(2)}</span>
            </div>
            <button
              className="btn-primary"
              disabled={placing}
              onClick={placeOrder}
              style={{ fontSize: 16, padding: '14px 40px' }}
            >
              {placing ? 'Placing Order…' : 'Place Order'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
