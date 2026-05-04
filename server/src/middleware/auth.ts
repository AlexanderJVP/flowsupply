import { createMiddleware } from 'hono/factory'
import { jwtVerify } from 'jose'
import type { AppEnv, UserPayload } from '../types'

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    c.set('user', payload as UserPayload)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

export function requirePermission(permission: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get('user')?.permissions[permission]) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
}
