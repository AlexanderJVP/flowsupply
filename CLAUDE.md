# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Application Is

**flowSupply** is a SaaS order management system for production companies (e.g., companies building electronic cabinets). It bridges the communication gap between assembly and supply departments, replacing ad-hoc tools like email and Excel. Companies sign up at the hosted URL and get their own isolated workspace.

**Core users:** Assembly workers (create orders), Supply workers (process orders), Managers (monitor), Admins (configure).

**Deployment model:** Cloudflare (Workers + Pages), Supabase PostgreSQL. Multi-tenant row-level isolation — each `Tenant` owns its own users, orders, products, labels, and roles.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query + React Router v7 → deployed on **Cloudflare Pages**
- **Backend:** Hono + TypeScript → deployed as a **Cloudflare Worker**
- **Database:** Supabase (hosted PostgreSQL) — schema in `supabase/schema.sql`
- **Auth:** Custom JWT (via `jose`), stored in localStorage; **not** Supabase Auth

Monorepo with pnpm workspaces (`pnpm-workspace.yaml`): `client/` and `server/`.

## Commands

```bash
# Start everything (client on :5173, server worker on :8787)
pnpm run dev

# Client only
pnpm --filter client run dev

# Server only (Wrangler dev — reads .dev.vars for secrets)
pnpm --filter server run dev

# Deploy
pnpm --filter server run deploy    # Cloudflare Worker
pnpm --filter client run deploy    # Cloudflare Pages

# Install all dependencies
pnpm install
```

### Local dev setup

Copy `server/.dev.vars.example` to `server/.dev.vars` and fill in your Supabase credentials:

```
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_KEY="your-service-role-key"
JWT_SECRET="any-long-random-string"
ALLOWED_ORIGIN="http://localhost:5173"
```

Database schema is managed manually in the Supabase Dashboard — run the SQL in `supabase/schema.sql` to set up a fresh project.

## Architecture

### Server (`server/src/`)

- `index.ts` — Hono app, CORS middleware, route mounting
- `types.ts` — `UserPayload` (`{ id, roleId, tenantId, permissions }`) and `AppEnv` (Cloudflare bindings)
- `lib/supabase.ts` — Supabase client singleton (uses `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`)
- `lib/camelize.ts` — converts snake_case DB columns to camelCase
- `middleware/auth.ts` — `requireAuth` (JWT verification) and `requirePermission(key)` middleware; both attach `c.var.user`
- `routes/` — one file per resource: `auth`, `tenants`, `orders`, `products`, `labels`, `roles`, `users`

### Client (`client/src/`)

- `worker.ts` — Cloudflare Pages proxy: forwards `/api/*` to the backend Worker, serves static assets
- `context/AuthContext.tsx` — provides `user`, `login()`, `logout()`, `isLoading`; fetches `/api/auth/me` on mount
- `api/client.ts` — axios instance with JWT injection and 401 redirect to `/login`
- `components/layout/Layout.tsx` — protected route wrapper; redirects to `/login` if unauthenticated
- `pages/` — one folder/file per feature: `Dashboard`, `orders/`, `products/`, `Admin`
- Data fetching uses TanStack Query with `queryKey: ['orders']`, `['products']`, `['labels']`, `['roles']`

## Data Model

Defined in `supabase/schema.sql`. Key tables:

- `tenants` — top-level isolation boundary
- `users` — belongs to one tenant and one role; email is unique per tenant (`UNIQUE(email, tenant_id)`)
- `roles` — belongs to one tenant; `permissions` is a JSONB column (`canCreateOrder`, `canApproveOrder`, `canManageProducts`, `canManageRoles`, `canExport`)
- `labels` — order status tags, configurable per tenant
- `products` — product catalog per tenant
- `orders` — has `assembly_approved` and `supply_approved` booleans; both must be true for full approval; any edit resets both to false
- `order_items` — line items on an order (links order → product)
- `comments` — per order
- `audit_logs` — immutable; every mutation writes one entry

## Core Domain Rules

- **Tenant isolation:** every Supabase query MUST filter by `tenant_id` equal to the requesting user's tenant — no exceptions
- **Handshake approval:** both `assembly_approved` and `supply_approved` must be `true`; any edit resets both to `false`
- **Audit log:** every mutation (create, update, approve, comment) writes an `audit_logs` entry in the same operation
- **Labels** are the order status mechanism — configurable per tenant, not hardcoded
- **Permissions** are checked via `requirePermission('canXxx')` middleware on protected routes

## Key Decisions

- **Row-level tenancy** (not schema-per-tenant) — simpler, sufficient at this scale
- **tenantId in JWT** — no extra DB lookup per request; tenant context flows from login
- **Custom JWT auth** (not Supabase Auth) — full control, simpler integration with the permission system
- **Email unique per tenant** — same email can exist across different companies
- **Roles and labels are per-tenant** — each company gets their own copy seeded at registration
