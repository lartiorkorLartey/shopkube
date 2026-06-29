import { createContext, useContext, useState, useCallback } from 'react'

export const DEMO_USER = 'demo-user-001'

const CartContext = createContext({ count: 0, refresh: () => {} })

export function CartProvider({ children }) {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/cart/${DEMO_USER}`)
      if (!r.ok) return
      const data = await r.json()
      const items = Array.isArray(data.items) ? data.items : []
      setCount(items.reduce((sum, i) => sum + (i.quantity ?? 1), 0))
    } catch {
      // ignore
    }
  }, [])

  return (
    <CartContext.Provider value={{ count, refresh }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  return useContext(CartContext)
}
