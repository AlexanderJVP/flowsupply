import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import { camelize } from '../lib/camelize'
import { requireAuth, requirePermission } from '../middleware/auth'
import type { AppEnv } from '../types'

export const usersRouter = new Hono<AppEnv>()
usersRouter.use(requireAuth)
usersRouter.use(requirePermission('canManageRoles'))

const USER_SELECT = 'id, name, email, created_at, role:roles(id, name)'

usersRouter.get('/', async (c) => {
  const { data, error } = await getSupabase(c.env)
    .from('users')
    .select(USER_SELECT)
    .eq('tenant_id', c.get('user').tenantId)
    .order('created_at')
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  roleId: z.string(),
})

usersRouter.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { name, email, password, roleId } = parsed.data
  const tenantId = c.get('user').tenantId
  const supabase = getSupabase(c.env)

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .eq('tenant_id', tenantId)
    .single()
  if (existing) return c.json({ error: 'Email already in use' }, 409)

  const hashed = await bcrypt.hash(password, 10)
  const { data, error } = await supabase
    .from('users')
    .insert({ name, email, password: hashed, role_id: roleId, tenant_id: tenantId })
    .select(USER_SELECT)
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data), 201)
})

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  roleId: z.string().optional(),
})

usersRouter.patch('/:id', async (c) => {
  const body = await c.req.json()
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const update: Record<string, unknown> = {}
  if (parsed.data.name) update.name = parsed.data.name
  if (parsed.data.roleId) update.role_id = parsed.data.roleId
  const { data, error } = await getSupabase(c.env)
    .from('users')
    .update(update)
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
    .select(USER_SELECT)
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})
