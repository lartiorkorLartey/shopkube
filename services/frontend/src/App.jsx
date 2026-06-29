import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useEffect } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Products from './pages/Products.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import Cart from './pages/Cart.jsx'
import Orders from './pages/Orders.jsx'
import { useCart } from './CartContext.jsx'

function CartIcon({ count }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      Cart
      {count > 0 && (
        <span style={{
          position: 'absolute',
          top: -8,
          right: -12,
          background: '#EF4444',
          color: 'white',
          borderRadius: '50%',
          width: 18,
          height: 18,
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </span>
  )
}

export default function App() {
  const { count, refresh } = useCart()

  useEffect(() => { refresh() }, [refresh])

  return (
    <BrowserRouter>
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <NavLink to="/" style={{ textDecoration: 'none' }}>
              <span className="logo">ShopKube</span>
            </NavLink>
            <nav>
              <NavLink to="/" end>Dashboard</NavLink>
              <NavLink to="/products">Products</NavLink>
              <NavLink to="/cart"><CartIcon count={count} /></NavLink>
              <NavLink to="/orders">Orders</NavLink>
            </nav>
            <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>
              User: demo-user-001
            </span>
          </div>
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/orders" element={<Orders />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
