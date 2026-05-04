import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Sidebar from './Sidebar'

export default function Layout() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading…</div>
  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
