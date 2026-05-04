import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { Order } from '@/types'

export default function Dashboard() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<Order[]>('/orders').then((r) => r.data),
  })

  const total = orders.length
  const fullyApproved = orders.filter((o) => o.assemblyApproved && o.supplyApproved).length
  const pending = orders.filter((o) => !o.assemblyApproved || !o.supplyApproved).length

  if (isLoading) return <p className="text-gray-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total orders" value={total} />
        <StatCard label="Approved" value={fullyApproved} />
        <StatCard label="Pending approval" value={pending} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-gray-800">Recent orders</h2>
          <Link to="/orders/new" className="text-sm text-blue-600 hover:underline">New order</Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {orders.slice(0, 8).map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div>
                <span className="text-sm font-medium text-gray-900">Order #{order.id.slice(-6).toUpperCase()}</span>
                <span className="ml-3 text-sm text-gray-500">by {order.createdBy.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {order.label && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: order.label.color + '22', color: order.label.color }}>
                    {order.label.name}
                  </span>
                )}
                <ApprovalBadge order={order} />
              </div>
            </Link>
          ))}
          {orders.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No orders yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function ApprovalBadge({ order }: { order: Order }) {
  const both = order.assemblyApproved && order.supplyApproved
  const none = !order.assemblyApproved && !order.supplyApproved
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${both ? 'bg-green-100 text-green-700' : none ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
      {both ? 'Approved' : none ? 'Pending' : 'Partial'}
    </span>
  )
}
