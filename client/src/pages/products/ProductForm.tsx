import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Product } from '@/types'

export default function ProductForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')

  const { data: product, isLoading } = useQuery({
    queryKey: ['products', id],
    queryFn: () => api.get<Product>(`/products/${id}`).then((r) => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (product) {
      setTitle(product.title)
      setDescription(product.description)
      setImageUrl(product.imageUrl ?? '')
    }
  }, [product])

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { title, description, imageUrl: imageUrl || undefined }
      return isEdit
        ? api.patch(`/products/${id}`, body)
        : api.post('/products', body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); navigate('/products') },
    onError: () => setError('Failed to save product.'),
  })

  if (isEdit && isLoading) return <p className="text-gray-500">Loading…</p>

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">{isEdit ? 'Edit product' : 'New product'}</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product title…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Product description…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {imageUrl && (
            <img src={imageUrl} alt="Preview" className="mt-2 h-24 w-24 object-cover rounded-lg border border-gray-200" />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!title.trim() || !description.trim() || saveMutation.isPending}
          className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
        <button onClick={() => navigate('/products')} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Cancel</button>
      </div>
    </div>
  )
}
