import { Hono } from 'hono'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import { camelize } from '../lib/camelize'
import { requireAuth, requirePermission } from '../middleware/auth'
import type { AppEnv } from '../types'

export const ordersRouter = new Hono<AppEnv>()
ordersRouter.use(requireAuth)

const LIST_SELECT = `
  *,
  created_by:users!created_by_id(id, name),
  label:labels(id, name, color),
  items:order_items(id, product_id, quantity, notes)
`

const DETAIL_SELECT = `
  *,
  created_by:users!created_by_id(id, name),
  label:labels(id, name, color),
  items:order_items(
    id, product_id, quantity, notes,
    product:products(id, title, description, image_url, created_at, created_by:users!created_by_id(id, name))
  ),
  comments(id, content, created_at, user:users!user_id(id, name)),
  audit_logs(id, action, changes, created_at, user:users!user_id(id, name))
`

function sortNested(order: Record<string, unknown>) {
  const byDate = (a: { created_at: string }, b: { created_at: string }) =>
    a.created_at.localeCompare(b.created_at)
  if (Array.isArray(order.comments)) order.comments.sort(byDate)
  if (Array.isArray(order.audit_logs)) order.audit_logs.sort(byDate)
  return order
}

// CSV export
ordersRouter.get('/export', requirePermission('canExport'), async (c) => {
  const labelId = c.req.query('labelId')
  const status = c.req.query('status')
  const tenantId = c.get('user').tenantId
  const supabase = getSupabase(c.env)

  let query = supabase
    .from('orders')
    .select(`
      *,
      created_by:users!created_by_id(name),
      label:labels(name),
      items:order_items(quantity, product:products(title))
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (labelId) query = query.eq('label_id', labelId)
  if (status === 'approved') query = query.eq('assembly_approved', true).eq('supply_approved', true)
  if (status === 'pending') query = query.or('assembly_approved.eq.false,supply_approved.eq.false')

  const { data: orders, error } = await query
  if (error) return c.json({ error: error.message }, 500)

  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const header = ['Order ID', 'Date', 'Created By', 'Label', 'Assembly Approved', 'Supply Approved', 'Notes', 'Items'].join(',')
  const rows = (orders ?? []).map((o: Record<string, unknown>) => {
    const createdBy = o.created_by as { name: string }
    const label = o.label as { name: string } | null
    const items = o.items as { quantity: number; product: { title: string } }[]
    return [
      escape((o.id as string).slice(-6).toUpperCase()),
      escape(new Date(o.date as string).toLocaleDateString('en-CA')),
      escape(createdBy.name),
      escape(label?.name ?? ''),
      o.assembly_approved ? 'Yes' : 'No',
      o.supply_approved ? 'Yes' : 'No',
      escape((o.notes as string) ?? ''),
      escape(items.map((i) => `${i.product.title} x${i.quantity}`).join(' | ')),
    ].join(',')
  })

  const csv = [header, ...rows].join('\r\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="orders-${Date.now()}.csv"`,
    },
  })
})

// List orders
ordersRouter.get('/', async (c) => {
  const { data, error } = await getSupabase(c.env)
    .from('orders')
    .select(LIST_SELECT)
    .eq('tenant_id', c.get('user').tenantId)
    .order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(camelize(data))
})

// Get single order with full relations
ordersRouter.get('/:id', async (c) => {
  const { data, error } = await getSupabase(c.env)
    .from('orders')
    .select(DETAIL_SELECT)
    .eq('id', c.req.param('id'))
    .eq('tenant_id', c.get('user').tenantId)
    .single()
  if (error || !data) return c.json({ error: 'Not found' }, 404)
  return c.json(camelize(sortNested(data as Record<string, unknown>)))
})

const createOrderSchema = z.object({
  date: z.string().datetime(),
  notes: z.string().optional(),
  labelId: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    notes: z.string().optional(),
  })).min(1),
})

// Create order
ordersRouter.post('/', requirePermission('canCreateOrder'), async (c) => {
  const body = await c.req.json()
  const parsed = createOrderSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { date, notes, labelId, items } = parsed.data
  const user = c.get('user')
  const supabase = getSupabase(c.env)

  const { data: orderId, error } = await supabase.rpc('create_order', {
    p_tenant_id: user.tenantId,
    p_user_id:   user.id,
    p_date:      new Date(date).toISOString(),
    p_notes:     notes ?? null,
    p_label_id:  labelId ?? null,
    p_items:     items.map((i) => ({ product_id: i.productId, quantity: i.quantity, notes: i.notes ?? null })),
  })

  if (error) return c.json({ error: error.message }, 500)

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select(DETAIL_SELECT)
    .eq('id', orderId)
    .single()
  if (fetchErr || !order) return c.json({ error: 'Order created but could not be fetched' }, 500)

  return c.json(camelize(sortNested(order as Record<string, unknown>)), 201)
})

const updateOrderSchema = z.object({
  date: z.string().datetime().optional(),
  notes: z.string().optional().nullable(),
  labelId: z.string().optional().nullable(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    notes: z.string().optional(),
  })).optional(),
})

// Update order (resets both approvals)
ordersRouter.patch('/:id', async (c) => {
  const body = await c.req.json()
  const parsed = updateOrderSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { items, ...rest } = parsed.data
  const user = c.get('user')
  const supabase = getSupabase(c.env)

  const fields: Record<string, unknown> = {}
  if (rest.date !== undefined) fields.date = new Date(rest.date).toISOString()
  if ('notes' in rest) fields.notes = rest.notes ?? null
  if ('labelId' in rest) fields.label_id = rest.labelId ?? null

  const { error } = await supabase.rpc('update_order', {
    p_order_id:  c.req.param('id'),
    p_tenant_id: user.tenantId,
    p_user_id:   user.id,
    p_fields:    fields,
    p_items:     items !== undefined
      ? items.map((i) => ({ product_id: i.productId, quantity: i.quantity, notes: i.notes ?? null }))
      : null,
    p_changes:   parsed.data,
  })

  if (error) {
    if (error.message.includes('not found')) return c.json({ error: 'Not found' }, 404)
    return c.json({ error: error.message }, 500)
  }

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select(DETAIL_SELECT)
    .eq('id', c.req.param('id'))
    .single()
  if (fetchErr || !order) return c.json({ error: 'Could not fetch updated order' }, 500)

  return c.json(camelize(sortNested(order as Record<string, unknown>)))
})

// Approve order (handshake — assembly or supply side)
ordersRouter.post('/:id/approve', requirePermission('canApproveOrder'), async (c) => {
  const body = await c.req.json()
  const { side } = z.object({ side: z.enum(['assembly', 'supply']) }).parse(body)
  const user = c.get('user')
  const supabase = getSupabase(c.env)

  const { error } = await supabase.rpc('approve_order', {
    p_order_id:  c.req.param('id'),
    p_tenant_id: user.tenantId,
    p_user_id:   user.id,
    p_side:      side,
  })

  if (error) {
    if (error.message.includes('not found')) return c.json({ error: 'Not found' }, 404)
    return c.json({ error: error.message }, 500)
  }

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select(DETAIL_SELECT)
    .eq('id', c.req.param('id'))
    .single()
  if (fetchErr || !order) return c.json({ error: 'Could not fetch order' }, 500)

  return c.json(camelize(sortNested(order as Record<string, unknown>)))
})

// Add comment
ordersRouter.post('/:id/comments', async (c) => {
  const body = await c.req.json()
  const { content } = z.object({ content: z.string().min(1) }).parse(body)
  const user = c.get('user')
  const supabase = getSupabase(c.env)

  const { error } = await supabase.rpc('add_comment', {
    p_order_id:  c.req.param('id'),
    p_tenant_id: user.tenantId,
    p_user_id:   user.id,
    p_content:   content,
  })

  if (error) {
    if (error.message.includes('not found')) return c.json({ error: 'Not found' }, 404)
    return c.json({ error: error.message }, 500)
  }

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select(DETAIL_SELECT)
    .eq('id', c.req.param('id'))
    .single()
  if (fetchErr || !order) return c.json({ error: 'Could not fetch order' }, 500)

  return c.json(camelize(sortNested(order as Record<string, unknown>)), 201)
})
