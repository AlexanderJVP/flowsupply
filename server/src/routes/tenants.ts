import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import type { AppEnv } from '../types'

export const tenantsRouter = new Hono<AppEnv>()

const registerSchema = z.object({
  companyName: z.string().min(1),
  adminName: z.string().min(1),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
})

tenantsRouter.post('/register', async (c) => {
  const body = await c.req.json()
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { companyName, adminName, adminEmail, adminPassword } = parsed.data
  const passwordHash = await bcrypt.hash(adminPassword, 10)
  const supabase = getSupabase(c.env)

  const { data, error } = await supabase.rpc('provision_tenant', {
    p_company_name: companyName,
    p_admin_name: adminName,
    p_admin_email: adminEmail,
    p_password_hash: passwordHash,
  })

  if (error) {
    if (error.code === '23505') {
      return c.json({ error: 'An account with that email already exists for this company.' }, 409)
    }
    return c.json({ error: 'Registration failed. Please try again.' }, 500)
  }

  const { tenant_id, user_id, admin_role_id } =
    (data as { tenant_id: string; user_id: string; admin_role_id: string }[])[0]

  const { data: role } = await supabase
    .from('roles')
    .select('id, name, permissions')
    .eq('id', admin_role_id)
    .single()

  const secret = new TextEncoder().encode(c.env.JWT_SECRET)
  const token = await new SignJWT({
    id: user_id,
    roleId: admin_role_id,
    tenantId: tenant_id,
    permissions: role?.permissions ?? {},
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(secret)

  return c.json(
    {
      token,
      user: {
        id: user_id,
        name: adminName,
        email: adminEmail,
        tenantId: tenant_id,
        role: { id: role?.id, name: role?.name, permissions: role?.permissions ?? {} },
      },
    },
    201,
  )
})
