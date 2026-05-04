import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRouter } from './routes/auth'
import { tenantsRouter } from './routes/tenants'
import { ordersRouter } from './routes/orders'
import { productsRouter } from './routes/products'
import { labelsRouter } from './routes/labels'
import { rolesRouter } from './routes/roles'
import { usersRouter } from './routes/users'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.use('*', (c, next) =>
  cors({ origin: c.env.ALLOWED_ORIGIN || '*', credentials: true })(c, next),
)

app.route('/api/auth', authRouter)
app.route('/api/tenants', tenantsRouter)
app.route('/api/orders', ordersRouter)
app.route('/api/products', productsRouter)
app.route('/api/labels', labelsRouter)
app.route('/api/roles', rolesRouter)
app.route('/api/users', usersRouter)

app.get('/api/health', (c) => c.json({ ok: true }))

export default app
