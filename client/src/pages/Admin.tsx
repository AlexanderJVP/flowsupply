import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import type { Label, Role } from '@/types'

interface UserListItem {
  id: string
  name: string
  email: string
  createdAt: string
  role: { id: string; name: string }
}

const ALL_PERMISSIONS = ['canCreateOrder', 'canApproveOrder', 'canManageProducts', 'canManageRoles', 'canExport'] as const
type PermKey = typeof ALL_PERMISSIONS[number]

const emptyPerms = (): Record<PermKey, boolean> =>
  Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, false])) as Record<PermKey, boolean>

export default function Admin() {
  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
      <LabelsSection />
      <RolesSection />
      <UsersSection />
    </div>
  )
}

function LabelsSection() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6b7280')

  const { data: labels = [] } = useQuery({ queryKey: ['labels'], queryFn: () => api.get<Label[]>('/labels').then((r) => r.data) })

  const createMutation = useMutation({
    mutationFn: () => api.post('/labels', { name, color }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['labels'] }); setName('') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/labels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels'] }),
  })

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-base font-medium text-gray-800">Labels</h2>

      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label name…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="h-9 w-12 border border-gray-300 rounded-lg cursor-pointer" />
        <button onClick={() => name.trim() && createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          Add
        </button>
      </div>

      <div className="space-y-2">
        {labels.map((label) => (
          <div key={label.id} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-gray-800">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: label.color }} />
              {label.name}
            </span>
            <button onClick={() => deleteMutation.mutate(label.id)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function RolesSection() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formPerms, setFormPerms] = useState<Record<PermKey, boolean>>(emptyPerms())

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<(Role & { _count: { users: number } })[]>('/roles').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/roles', { name: formName, permissions: formPerms }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setShowCreate(false); setFormName(''); setFormPerms(emptyPerms()) },
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/roles/${id}`, { name: formName, permissions: formPerms }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setEditingId(null) },
  })

  function startEdit(role: Role & { _count: { users: number } }) {
    setEditingId(role.id)
    setFormName(role.name)
    setFormPerms({ ...emptyPerms(), ...role.permissions as Record<PermKey, boolean> })
  }

  function togglePerm(key: PermKey) {
    setFormPerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const permLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-800">Roles</h2>
        <button onClick={() => { setShowCreate(true); setFormName(''); setFormPerms(emptyPerms()) }}
          className="text-sm text-blue-600 hover:underline">+ New role</button>
      </div>

      {(showCreate || editingId) && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Role name…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex flex-wrap gap-2">
            {ALL_PERMISSIONS.map((key) => (
              <button key={key} onClick={() => togglePerm(key)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${formPerms[key] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                {permLabel(key)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => editingId ? updateMutation.mutate(editingId) : createMutation.mutate()}
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
              className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {editingId ? 'Save' : 'Create'}
            </button>
            <button onClick={() => { setShowCreate(false); setEditingId(null) }}
              className="text-sm text-gray-500 hover:text-gray-800 px-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {roles.map((role) => (
          <div key={role.id} className="py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800">{role.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{role._count.users} user{role._count.users !== 1 ? 's' : ''}</span>
                <button onClick={() => startEdit(role)} className="text-xs text-blue-600 hover:underline">Edit</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(role.permissions).filter(([, v]) => v).map(([key]) => (
                <span key={key} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                  {permLabel(key)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function UsersSection() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')
  const [error, setError] = useState('')

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserListItem[]>('/users').then((r) => r.data),
  })

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>('/roles').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', { name, email, password, roleId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false); setName(''); setEmail(''); setPassword(''); setRoleId(''); setError('')
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error ?? 'Failed to create user.')
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, newRoleId }: { id: string; newRoleId: string }) => api.patch(`/users/${id}`, { roleId: newRoleId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-800">Users</h2>
        <button onClick={() => { setShowCreate(true); setError('') }}
          className="text-sm text-blue-600 hover:underline">+ New user</button>
      </div>

      {showCreate && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name…"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email…" type="email"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6)…" type="password"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select role…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || !email.trim() || !password || !roleId || createMutation.isPending}
              className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="text-sm text-gray-500 hover:text-gray-800 px-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {users.map((u) => (
          <div key={u.id} className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{u.name} {u.id === me?.id && <span className="text-xs text-gray-400">(you)</span>}</p>
              <p className="text-xs text-gray-500">{u.email}</p>
            </div>
            <select
              value={u.role.id}
              onChange={(e) => updateRoleMutation.mutate({ id: u.id, newRoleId: e.target.value })}
              disabled={u.id === me?.id}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </section>
  )
}
