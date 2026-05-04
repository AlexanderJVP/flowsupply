import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import type { Label, Order } from '@/types'

function downloadCsv(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function OrderList() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending'>('all')
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (labelFilter) params.set('labelId', labelFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await api.get(`/orders/export?${params}`, { responseType: 'blob' })
      const cd = res.headers['content-disposition'] ?? ''
      const filename = cd.match(/filename="(.+)"/)?.[1] ?? 'orders.csv'
      downloadCsv(res.data as Blob, filename)
    } finally {
      setExporting(false)
    }
  }

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<Order[]>('/orders').then((r) => r.data),
  })

  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<Label[]>('/labels').then((r) => r.data),
  })

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (search) {
        const q = search.toLowerCase()
        const matchesId = order.id.slice(-6).toLowerCase().includes(q)
        const matchesCreator = order.createdBy.name.toLowerCase().includes(q)
        if (!matchesId && !matchesCreator) return false
      }
      if (labelFilter && order.label?.id !== labelFilter) return false
      if (statusFilter === 'approved' && !(order.assemblyApproved && order.supplyApproved)) return false
      if (statusFilter === 'pending' && order.assemblyApproved && order.supplyApproved) return false
      return true
    })
  }, [orders, search, labelFilter, statusFilter])

  if (isLoading) return <p className="text-gray-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
        <div className="flex gap-2">
          {user?.role.permissions.canExport && (
            <button onClick={handleExport} disabled={exporting}
              className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
          {user?.role.permissions.canCreateOrder && (
            <Link to="/orders/new" className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              New order
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID or name…"
          className="flex-1 min-w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={labelFilter}
          onChange={(e) => setLabelFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All labels</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All statuses</option>
          <option value="approved">Fully approved</option>
          <option value="pending">Pending approval</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {filtered.map((order) => (
          <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-gray-900">#{order.id.slice(-6).toUpperCase()}</p>
              <p className="text-xs text-gray-500">{new Date(order.date).toLocaleDateString()} · {order.createdBy.name}</p>
            </div>
            <div className="flex items-center gap-2">
              {order.label && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: order.label.color + '22', color: order.label.color }}>
                  {order.label.name}
                </span>
              )}
              {order.assemblyApproved && order.supplyApproved
                ? <span className="text-xs text-green-600 font-medium">Approved</span>
                : <span className="text-xs text-amber-500">Pending</span>
              }
              <span className="text-xs text-gray-400">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">No orders match your filters.</p>
        )}
      </div>
    </div>
  )
}
