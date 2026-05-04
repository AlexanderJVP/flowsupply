import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/orders', label: 'Orders' },
  { to: '/products', label: 'Products' },
  { to: '/admin', label: 'Admin', permission: 'canManageRoles' as const },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-200">
        <span className="text-lg font-semibold text-gray-900">flowSupply</span>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, label, permission }) => {
          if (permission && !user?.role.permissions[permission]) return null
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-1">{user?.name}</div>
        <div className="text-xs text-gray-400 mb-2">{user?.role.name}</div>
        <button
          onClick={logout}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
