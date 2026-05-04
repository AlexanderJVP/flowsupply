import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import type { Product } from '@/types'

export default function ProductCatalog() {
  const { user } = useAuth()
  const canManage = user?.role.permissions.canManageProducts
  const [search, setSearch] = useState('')

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<Product[]>('/products').then((r) => r.data),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
  }, [products, search])

  if (isLoading) return <p className="text-gray-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Products</h1>
        {canManage && (
          <Link to="/products/new" className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            New product
          </Link>
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products…"
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {filtered.map((product) => (
          <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {product.imageUrl
              ? <img src={product.imageUrl} alt={product.title} className="w-full h-36 object-cover" />
              : <div className="w-full h-36 bg-gray-100 flex items-center justify-center text-gray-300 text-3xl">□</div>
            }
            <div className="p-3">
              <p className="text-sm font-medium text-gray-900">{product.title}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
              <p className="text-xs text-gray-400 mt-2">{new Date(product.createdAt).toLocaleDateString()}</p>
              {canManage && (
                <div className="flex gap-3 mt-3">
                  <Link to={`/products/${product.id}`} className="text-xs text-blue-600 hover:underline">View</Link>
                  <Link to={`/products/${product.id}/edit`} className="text-xs text-gray-500 hover:underline">Edit</Link>
                </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-sm text-gray-400 text-center py-8">{search ? 'No products match your search.' : 'No products yet.'}</p>
        )}
      </div>
    </div>
  )
}
