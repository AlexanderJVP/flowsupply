export interface Role {
  id: string
  name: string
  permissions: {
    canCreateOrder: boolean
    canApproveOrder: boolean
    canManageProducts: boolean
    canManageRoles: boolean
    canExport: boolean
  }
}

export interface User {
  id: string
  name: string
  email: string
  tenantId: string
  role: Role
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface Product {
  id: string
  title: string
  description: string
  imageUrl?: string
  createdAt: string
  createdBy: { id: string; name: string }
}

export interface OrderItem {
  id: string
  productId: string
  product: Product
  quantity: number
  notes?: string
}

export interface Comment {
  id: string
  content: string
  createdAt: string
  user: { id: string; name: string }
}

export interface AuditLog {
  id: string
  action: string
  changes?: unknown
  createdAt: string
  user: { id: string; name: string }
}

export interface Order {
  id: string
  date: string
  notes?: string
  assemblyApproved: boolean
  supplyApproved: boolean
  label?: Label
  createdBy: { id: string; name: string }
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  comments: Comment[]
  auditLogs: AuditLog[]
}
