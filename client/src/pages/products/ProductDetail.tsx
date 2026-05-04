import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import type { Product } from '@/types'

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const canManage = user?.role.permissions.canManageProducts
  const [confirming, setConfirming] = useState(false)

  const { data: product, isLoading } = useQuery({
    queryKey: ['products', id],
    queryFn: () => api.get<Product>(`/products/${id}`).then((r) => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    },
  })

  if (isLoading) return <p className="text-gray-500">Loading…</p>
  if (!product) return <p className="text-gray-500">Product not found.</p>

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/products" className="text-sm text-gray-500 hover:text-gray-800">← Products</Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.title} className="w-full h-56 object-cover" />
          : <div className="w-full h-56 bg-gray-100 flex items-center justify-center text-gray-300 text-5xl">□</div>
        }
        <div className="p-5 space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">{product.title}</h1>
          <p className="text-sm text-gray-600">{product.description}</p>
          <p className="text-xs text-gray-400">Added {new Date(product.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {canManage && (
        <div className="flex items-center gap-3">
          <Link
            to={`/products/${id}/edit`}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Edit
          </Link>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="text-sm text-red-600 hover:text-red-700 px-4 py-2 rounded-lg border border-red-200 hover:border-red-300 transition-colors"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700">Delete this product?</span>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-sm text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
