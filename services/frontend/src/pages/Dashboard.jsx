import { useState, useEffect, useCallback } from 'react'

const SERVICE_META = {
  user:      { label: 'User Service',         port: '8081' },
  product:   { label: 'Product Service',      port: '8082' },
  order:     { label: 'Order Service',        port: '8083' },
  cart:      { label: 'Cart Service',         port: '8084' },
  review:    { label: 'Review Service',       port: '8087' },
  analytics: { label: 'Analytics Service',    port: '8088' },
}

function ServiceCard({ name, status, port }) {
  const isOk = status === 'ok'
  return (
    <div className={`service-card ${isOk ? 'service-ok' : 'service-down'}`}>
      <div className="service-dot" />
      <div className="service-info">
        <span className="service-name">{name}</span>
        <span className="service-port">:{port}</span>
      </div>
      <span className={`service-badge ${isOk ? 'badge-ok' : 'badge-down'}`}>
        {isOk ? 'Healthy' : 'Unavailable'}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [gatewayOk, setGatewayOk] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)

  const check = useCallback(async () => {
    try {
      const [readyRes, healthRes] = await Promise.all([
        fetch('/ready'),
        fetch('/health'),
      ])
      setData(await readyRes.json())
      const health = await healthRes.json()
      setGatewayOk(health.status === 'ok')
      setLastChecked(new Date())
    } catch {
      setGatewayOk(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [check])

  const services = data?.services ?? {}
  const allStatuses = [gatewayOk ? 'ok' : 'down', ...Object.values(services)]
  const healthyCount = allStatuses.filter(s => s === 'ok').length
  const totalCount = allStatuses.length
  const allHealthy = healthyCount === totalCount

  return (
    <div>
      <div className="page-header">
        <h1>Service Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastChecked && (
            <span className="last-checked">
              Updated {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <button className="refresh-btn" onClick={check}>Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Checking services…</div>
      ) : (
        <>
          <div className="summary-bar">
            <span className={`summary-status ${allHealthy ? 'healthy' : 'degraded'}`}>
              {allHealthy
                ? `✓ All ${totalCount} services operational`
                : `⚠ ${healthyCount} / ${totalCount} services healthy`}
            </span>
          </div>

          <div className="service-grid">
            <ServiceCard
              name="API Gateway"
              status={gatewayOk ? 'ok' : 'down'}
              port="8080"
            />
            {Object.entries(services).map(([key, status]) => (
              <ServiceCard
                key={key}
                name={SERVICE_META[key]?.label ?? key}
                status={status}
                port={SERVICE_META[key]?.port ?? '—'}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
