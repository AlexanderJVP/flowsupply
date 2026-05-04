import { Hono } from 'hono'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import { camelize } from '../lib/camelize'
import { requireAuth, requirePermission } from '../middleware/auth'
import type { AppEnv } from '../types'

export const labelsRouter = new Hono<AppEnv>()
labelsRouter.use(requireAuth)

labelsRouter.get('/', async (c) => {
  const { data, error } = await getSupabase(c.env)
    .from('labels')
    .select('*')
    .eq('tenant_id', c.get('user').tenantId)
    .order('name')
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})

const labelSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

labelsRouter.post('/', requirePermission('canManageRoles'), async (c) => {
  const body = await c.req.json()
  const parsed = labelSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { data, error } = await getSupabase(c.env)
    .from('labels')
    .insert({ ...parsed.data, tenant_id: c.get('user').tenantId })
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data), 201)
})

labelsRouter.patch('/:id', requirePermission('canManageRoles'), async (c) => {
  const body = await c.req.json()
  const parsed = labelSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const { data, error } = await getSupabase(c.env)
    .from('labels')
    .update(parsed.data)
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})

labelsRouter.delete('/:id', requirePermission('canManageRoles'), async (c) => {
  const { error } = await getSupabase(c.env)
    .from('labels')
    .delete()
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
  if (error) return c.json({ error: error.message }, 500)
  return new Response(null, { status: 204 })
})
