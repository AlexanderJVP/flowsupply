import { Hono } from 'hono'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import { camelize } from '../lib/camelize'
import { requireAuth, requirePermission } from '../middleware/auth'
import type { AppEnv } from '../types'

export const rolesRouter = new Hono<AppEnv>()
rolesRouter.use(requireAuth)

rolesRouter.get('/', async (c) => {
  const tenantId = c.get('user').tenantId
  const supabase = getSupabase(c.env)

  const [{ data: roles, error: rolesErr }, { data: users, error: usersErr }] = await Promise.all([
    supabase.from('roles').select('*').eq('tenant_id', tenantId),
    supabase.from('users').select('role_id').eq('tenant_id', tenantId),
  ])
  if (rolesErr || usersErr) return c.json({ error: 'Failed to fetch roles' }, 500)

  const counts: Record<string, number> = {}
  for (const u of users ?? []) counts[u.role_id] = (counts[u.role_id] ?? 0) + 1

  return c.json(camelize((roles ?? []).map((r) => ({ ...r, _count: { users: counts[r.id] ?? 0 } }))))
})

const permissionsSchema = z.object({
  canCreateOrder: z.boolean(),
  canApproveOrder: z.boolean(),
  canManageProducts: z.boolean(),
  canManageRoles: z.boolean(),
  canExport: z.boolean(),
})

const roleSchema = z.object({
  name: z.string().min(1),
  permissions: permissionsSchema,
})

rolesRouter.post('/', requirePermission('canManageRoles'), async (c) => {
  const body = await c.req.json()
  const parsed = roleSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { data, error } = await getSupabase(c.env)
    .from('roles')
    .insert({ ...parsed.data, tenant_id: c.get('user').tenantId })
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data), 201)
})

rolesRouter.patch('/:id', requirePermission('canManageRoles'), async (c) => {
  const body = await c.req.json()
  const parsed = roleSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { data, error } = await getSupabase(c.env)
    .from('roles')
    .update(parsed.data)
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})
