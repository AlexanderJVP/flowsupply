import { Hono } from 'hono'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import { camelize } from '../lib/camelize'
import { requireAuth, requirePermission } from '../middleware/auth'
import type { AppEnv } from '../types'

export const productsRouter = new Hono<AppEnv>()
productsRouter.use(requireAuth)

const PRODUCT_SELECT = '*, created_by:users!created_by_id(id, name)'

productsRouter.get('/', async (c) => {
  const { data, error } = await getSupabase(c.env)
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('tenant_id', c.get('user').tenantId)
    .order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})

productsRouter.get('/:id', async (c) => {
  const { data, error } = await getSupabase(c.env)
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
    .single()
  if (error || !data) return c.json({ error: 'Not found' }, 404)
  return c.json(camelize(data))
})

const productSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  imageUrl: z.string().url().optional(),
})

productsRouter.post('/', requirePermission('canManageProducts'), async (c) => {
  const body = await c.req.json()
  const parsed = productSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const user = c.get('user')
  const { data, error } = await getSupabase(c.env)
    .from('products')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      image_url: parsed.data.imageUrl,
      created_by_id: user.id,
      tenant_id: user.tenantId,
    })
    .select(PRODUCT_SELECT)
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data), 201)
})

productsRouter.patch('/:id', requirePermission('canManageProducts'), async (c) => {
  const body = await c.req.json()
  const parsed = productSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const update: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) update.title = parsed.data.title
  if (parsed.data.description !== undefined) update.description = parsed.data.description
  if (parsed.data.imageUrl !== undefined) update.image_url = parsed.data.imageUrl
  const { data, error } = await getSupabase(c.env)
    .from('products')
    .update(update)
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
    .select(PRODUCT_SELECT)
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})

productsRouter.delete('/:id', requirePermission('canManageProducts'), async (c) => {
  const { error } = await getSupabase(c.env)
    .from('products')
    .delete()
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
  if (error) return c.json({ error: error.message }, 500)
  return new Response(null, { status: 204 })
})
