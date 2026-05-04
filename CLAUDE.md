# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Application Is

**flowSupply** is a SaaS order management system for production companies (e.g., companies building electronic cabinets). It bridges the communication gap between assembly and supply departments, replacing ad-hoc tools like email and Excel. Companies sign up at the hosted URL and get their own isolated workspace — no self-hosting required.

**Core users:** Assembly workers (create orders), Supply workers (process orders), Managers (monitor), Admins (configure).

**Deployment model:** Single hosted instance, multi-tenant row-level isolation. Each `Tenant` owns its own users, orders, products, labels, and roles.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query + React Router v7
- **Backend:** Node.js + Express + TypeScript + Prisma ORM
- **Database:** PostgreSQL (local via Docker)
- **Auth:** JWT stored in localStorage

Monorepo with pnpm workspaces (`pnpm-workspace.yaml`): `client/` and `server/`.

## Commands

```bash
# Start everything (runs client on :5173, server on :3000)
pnpm run dev

# Client only
pnpm --filter client run dev

# Server only
pnpm --filter server run dev

# Database
docker compose up -d                     # start PostgreSQL
pnpm --filter server run db:migrate      # run migrations (prisma migrate dev)
pnpm --filter server run db:seed         # seed roles, labels, admin user
pnpm --filter server run db:studio       # open Prisma Studio
pnpm --filter server run db:generate     # regenerate Prisma client after schema changes

# Install all dependencies
pnpm install
```

Default seeded admin: `admin@flowsupply.local` / `admin123`

Server `.env` (copy from `server/.env.example`):
```
DATABASE_URL="postgresql://flowsupply:flowsupply@localhost:5432/flowsupply"
JWT_SECRET="change-this-to-a-long-random-secret"
PORT=3000
```

## Architecture

### Server (`server/src/`)

- `index.ts` — Express app setup, CORS, route mounting
- `lib/prisma.ts` — Prisma client singleton
- `middleware/auth.ts` — `requireAuth` (JWT verification) and `requirePermission(key)` middleware; both attach `req.user` with `{ id, roleId, permissions }`
- `routes/` — one file per resource: `auth`, `orders`, `products`, `labels`, `roles`

### Client (`client/src/`)

- `context/AuthContext.tsx` — provides `user`, `login()`, `logout()`, `isLoading`; fetches `/api/auth/me` on mount to rehydrate session
- `api/client.ts` — axios instance with JWT injection and 401 redirect
- `components/layout/Layout.tsx` — protected layout wrapper; redirects to `/login` if unauthenticated
- `pages/` — one folder/file per feature: `Dashboard`, `orders/`, `products/`, `Admin`
- Data fetching uses TanStack Query with `queryKey: ['orders']`, `['products']`, `['labels']`, `['roles']`

### Data Model

Key relations in `server/prisma/schema.prisma`:
- `Tenant` — top-level isolation boundary; every other model belongs to a tenant via `tenantId`
- `User` → belongs to one `Tenant` and one `Role`; email is unique **per tenant** (`@@unique([email, tenantId])`)
- `Role` → belongs to one `Tenant`; name is unique per tenant (`@@unique([name, tenantId])`)
- `Label` → belongs to one `Tenant`; name is unique per tenant (`@@unique([name, tenantId])`)
- `Order` → has many `OrderItem` (each links to a `Product`), `Comment`, `AuditLog`
- `Order` has `assemblyApproved` and `supplyApproved` booleans — both must be true for full approval
- Modifying an order resets both approval flags and writes an `"updated"` audit log entry
- `Role.permissions` is a JSON column with keys: `canCreateOrder`, `canApproveOrder`, `canManageProducts`, `canManageRoles`, `canExport`

## Core Domain Rules

- **Tenant isolation:** every Prisma query in every route MUST include `tenantId: req.user!.tenantId` in its `where` clause — no exceptions
- **Handshake approval:** both `assemblyApproved` and `supplyApproved` must be `true`; any edit resets both to `false`
- **Audit log:** every mutation (create, update, approve, comment) writes an `AuditLog` entry in the same transaction
- **Labels** are the order status mechanism — configurable per tenant, not hardcoded
- **Permissions** are checked via `requirePermission('canXxx')` middleware on protected routes

## SaaS Migration Plan

The app is being converted from single-tenant to multi-tenant SaaS. Work is split into 6 phases. Complete phases in order — each phase must not break the running app before the next begins.

### Phase 1 — Prisma Schema (foundation, do first)

File: `server/prisma/schema.prisma`

1. Add `Tenant` model:
   ```prisma
   model Tenant {
     id        String   @id @default(cuid())
     name      String
     createdAt DateTime @default(now())
     users     User[]
     roles     Role[]
     labels    Label[]
     products  Product[]
     orders    Order[]
   }
   ```
2. Add `tenantId String` + `tenant Tenant @relation(...)` to: `User`, `Role`, `Label`, `Product`, `Order`
3. Change unique constraints:
   - `User.email`: remove `@unique`, add `@@unique([email, tenantId])`
   - `Role.name`: remove `@unique`, add `@@unique([name, tenantId])`
   - `Label.name`: remove `@unique`, add `@@unique([name, tenantId])`
4. `Comment` and `AuditLog` are scoped through their parent `Order` — no direct `tenantId` needed
5. `OrderItem` is scoped through `Order` — no direct `tenantId` needed
6. Run `pnpm --filter server run db:migrate` after schema changes

### Phase 2 — Auth layer

Files: `server/src/middleware/auth.ts`, `server/src/routes/auth.ts`

1. Update `AuthRequest` interface: add `tenantId: string` to `req.user`
2. Update `/auth/login`: include `tenantId: user.tenantId` in JWT payload
3. Update `/auth/me`: include `tenantId` in response
4. `requireAuth` already extracts the JWT payload into `req.user` — it will carry `tenantId` automatically once login includes it

### Phase 3 — Route scoping

Files: all files in `server/src/routes/`

Add `tenantId: req.user!.tenantId` to **every** Prisma query's `where`, `create data`, and `include` blocks:

- `orders.ts` — `findMany`, `findUnique`, `create`, `update`, CSV export `findMany`
- `products.ts` — `findMany`, `findUnique`, `create`, `update`, `delete`
- `labels.ts` — `findMany`, `create`, `update`, `delete`
- `roles.ts` — `findMany`, `create`, `update`
- `users.ts` — `findMany`, `create` (scoped email uniqueness check via `findFirst({ where: { email, tenantId } })`), `update`

**Critical:** `users.ts` currently checks `findUnique({ where: { email } })` for conflict detection. Replace with `findFirst({ where: { email, tenantId } })` because email is no longer globally unique.

### Phase 4 — Tenant registration endpoint

File: `server/src/routes/tenants.ts` (new file)

`POST /api/tenants/register` — public endpoint (no `requireAuth`):
1. Validate body: `{ companyName, adminName, adminEmail, adminPassword }`
2. In a transaction:
   a. Create `Tenant` with `name = companyName`
   b. Create default roles (Admin, Assembly, Supply, Manager) scoped to the new tenant
   c. Create default labels (Pending, In Progress, Completed, Cancelled) scoped to the new tenant
   d. Hash password, create first admin `User` with Admin role, scoped to tenant
3. Generate JWT (same as login), return `{ token, user }`

Mount in `server/src/index.ts` as `/api/tenants`.

### Phase 5 — Client updates

Files: `client/src/context/AuthContext.tsx`, `client/src/pages/Signup.tsx` (new), `client/src/App.tsx`

1. `AuthContext`: the `user` object already comes from `/auth/me` — add `tenantId` to the `User` type in `client/src/types/index.ts`; no other client changes needed since `tenantId` is embedded in the JWT and applied server-side
2. New `Signup.tsx` page: form with company name, your name, email, password → calls `POST /api/tenants/register` → on success stores token and redirects to `/`
3. Add `/signup` route in `App.tsx`, add "Sign up" link on the `Login.tsx` page

### Phase 6 — Seed & dev setup

File: `server/prisma/seed.ts`

Update seed to:
1. Create (or upsert) a dev `Tenant` named `"Dev Tenant"`
2. Scope all seeded roles, labels, users, and products to that tenant's `id`
3. Use `@@unique` compound keys for upserts: e.g. `where: { name_tenantId: { name: 'Admin', tenantId } }`

### Decisions already made

- **Row-level tenancy** (not schema-per-tenant) — simpler migrations, sufficient isolation at this scale
- **tenantId in JWT** — no extra DB lookup per request; tenant context flows from login
- **Email unique per tenant** — same email can exist across tenants (e.g. a contractor at two companies)
- **Roles and labels are per-tenant** — each company gets their own copy seeded at registration; no shared global roles
- **No Stripe yet** — billing integration is a follow-on task after multi-tenancy works end-to-end
