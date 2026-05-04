import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import { camelize } from '../lib/camelize'
import type { AppEnv } from '../types'

export const authRouter = new Hono<AppEnv>()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().optional(),
})

authRouter.post('/login', async (c) => {
  const body = await c.req.json()
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { email, password, tenantId } = parsed.data
  const supabase = getSupabase(c.env)

  let query = supabase.from('users').select('*, role:roles(*)').eq('email', email)
  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data: users, error } = await query

  if (error || !users || users.length === 0) return c.json({ error: 'Invalid credentials' }, 401)
  if (users.length > 1) {
    return c.json({ error: 'Multiple accounts found for this email. Please provide your company ID.' }, 409)
  }

  const user = users[0]
  if (!(await bcrypt.compare(password, user.password))) return c.json({ error: 'Invalid credentials' }, 401)

  const secret = new TextEncoder().encode(c.env.JWT_SECRET)
  const token = await new SignJWT({
    id: user.id,
    roleId: user.role_id,
    tenantId: user.tenant_id,
    permissions: user.role.permissions,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(secret)

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      tenantId: user.tenant_id,
      role: { id: user.role.id, name: user.role.name, permissions: user.role.permissions },
    },
  })
})

authRouter.get('/me', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    const { id, tenantId } = payload as { id: string; tenantId: string }
    const { data: user, error } = await getSupabase(c.env)
      .from('users')
      .select('id, name, email, created_at, role:roles(*)')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    if (error || !user) return c.json({ error: 'User not found' }, 401)
    return c.json(camelize(user))
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})
