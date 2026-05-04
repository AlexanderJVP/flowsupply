import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Product, Label, Order } from '@/types'

interface Item { productId: string; quantity: number; notes: string }

export default function EditOrder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [labelId, setLabelId] = useState('')
  const [items, setItems] = useState<Item[]>([{ productId: '', quantity: 1, notes: '' }])
  const [error, setError] = useState('')
  const [initialized, setInitialized] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.get<Order>(`/orders/${id}`).then((r) => r.data),
  })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products').then((r) => r.data) })
  const { data: labels = [] } = useQuery({ queryKey: ['labels'], queryFn: () => api.get<Label[]>('/labels').then((r) => r.data) })

  useEffect(() => {
    if (order && !initialized) {
      setDate(order.date.slice(0, 10))
      setNotes(order.notes ?? '')
      setLabelId(order.label?.id ?? '')
      setItems(order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes ?? '' })))
      setInitialized(true)
    }
  }, [order, initialized])

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/orders/${id}`, {
      date: new Date(date).toISOString(),
      notes: notes || undefined,
      labelId: labelId || undefined,
      items: items.filter((i) => i.productId).map(({ productId, quantity, notes: n }) => ({ productId, quantity, notes: n || undefined })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); navigate(`/orders/${id}`) },
    onError: () => setError('Failed to save changes.'),
  })

  function updateItem(index: number, field: keyof Item, value: string | number) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function addItem() { setItems((prev) => [...prev, { productId: '', quantity: 1, notes: '' }]) }
  function removeItem(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)) }

  if (isLoading) return <p className="text-gray-500">Loading…</p>
  if (!order) return <p className="text-red-500">Order not found.</p>

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Edit order #{order.id.slice(-6).toUpperCase()}</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <select value={labelId} onChange={(e) => setLabelId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">No label</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-medium text-gray-700">Items</h2>

        {items.map((item, index) => (
          <div key={index} className="flex gap-2 items-start">
            <select value={item.productId} onChange={(e) => updateItem(index, 'productId', e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
              className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {items.length > 1 && (
              <button onClick={() => removeItem(index)} className="text-gray-400 hover:text-red-500 text-sm px-2 py-2">✕</button>
            )}
          </div>
        ))}

        <button onClick={addItem} className="text-sm text-blue-600 hover:underline">+ Add item</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => updateMutation.mutate()}
          disabled={!date || items.every((i) => !i.productId) || updateMutation.isPending}
          className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={() => navigate(`/orders/${id}`)} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Cancel</button>
      </div>
    </div>
  )
}
