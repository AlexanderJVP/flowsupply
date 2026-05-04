import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import type { Order } from '@/types'

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [comment, setComment] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.get<Order>(`/orders/${id}`).then((r) => r.data),
  })

  const approveMutation = useMutation({
    mutationFn: (side: 'assembly' | 'supply') => api.post(`/orders/${id}/approve`, { side }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders', id] }),
  })

  const commentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/orders/${id}/comments`, { content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders', id] }); setComment('') },
  })

  if (isLoading) return <p className="text-gray-500">Loading…</p>
  if (!order) return <p className="text-red-500">Order not found.</p>

  const canApprove = user?.role.permissions.canApproveOrder
  const canEdit = user?.role.permissions.canCreateOrder

  // Detect which side the user approves for based on role name convention.
  // "assembly" role name → assembly side; "supply" → supply side; otherwise show both.
  const roleName = (user?.role as { name?: string })?.name?.toLowerCase() ?? ''
  const isAssemblySide = roleName.includes('assembly')
  const isSupplySide = roleName.includes('supply')
  const showAssemblyBtn = canApprove && (isAssemblySide || (!isAssemblySide && !isSupplySide))
  const showSupplyBtn = canApprove && (isSupplySide || (!isAssemblySide && !isSupplySide))

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Order #{order.id.slice(-6).toUpperCase()}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(order.date).toLocaleDateString()} · {order.createdBy.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {order.label && (
            <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: order.label.color + '22', color: order.label.color }}>
              {order.label.name}
            </span>
          )}
          {canEdit && (
            <Link to={`/orders/${id}/edit`} className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Edit
            </Link>
          )}
        </div>
      </div>

      {/* Approval status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Approval status</h2>
        <div className="flex gap-4">
          <ApprovalChip label="Assembly" approved={order.assemblyApproved} />
          <ApprovalChip label="Supply" approved={order.supplyApproved} />
        </div>
        {(showAssemblyBtn || showSupplyBtn) && (
          <div className="flex gap-2 mt-4">
            {showAssemblyBtn && (
              <button
                onClick={() => approveMutation.mutate('assembly')}
                disabled={order.assemblyApproved || approveMutation.isPending}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Approve as Assembly
              </button>
            )}
            {showSupplyBtn && (
              <button
                onClick={() => approveMutation.mutate('supply')}
                disabled={order.supplyApproved || approveMutation.isPending}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Approve as Supply
              </button>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Items ({order.items.length})</h2>
        <div className="divide-y divide-gray-100">
          {order.items.map((item) => (
            <div key={item.id} className="py-2 flex justify-between">
              <span className="text-sm text-gray-800">{item.product.title}</span>
              <span className="text-sm text-gray-500">×{item.quantity}</span>
            </div>
          ))}
        </div>
        {order.notes && <p className="mt-3 text-sm text-gray-500 italic">{order.notes}</p>}
      </div>

      {/* Comments */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Comments</h2>
        <div className="space-y-3 mb-4">
          {order.comments.map((c) => (
            <div key={c.id}>
              <p className="text-xs text-gray-400">{c.user.name} · {new Date(c.createdAt).toLocaleString()}</p>
              <p className="text-sm text-gray-800 mt-0.5">{c.content}</p>
            </div>
          ))}
          {order.comments.length === 0 && <p className="text-sm text-gray-400">No comments yet.</p>}
        </div>
        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => comment.trim() && commentMutation.mutate(comment.trim())}
            disabled={!comment.trim() || commentMutation.isPending}
            className="text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
      </div>

      {/* Audit log */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Activity log</h2>
        <div className="space-y-2">
          {order.auditLogs.map((log) => (
            <div key={log.id} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">{log.user.name}</span>
              <span>{log.action.replace(/_/g, ' ')}</span>
              <span className="ml-auto">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ApprovalChip({ label, approved }: { label: string; approved: boolean }) {
  return (
    <span className={`text-xs px-3 py-1 rounded-full font-medium ${approved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {label}: {approved ? 'Approved' : 'Pending'}
    </span>
  )
}
