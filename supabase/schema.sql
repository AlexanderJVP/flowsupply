-- =============================================================================
-- flowSupply — Supabase SQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE tenants (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT        NOT NULL,
  tenant_id   TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  permissions JSONB       NOT NULL DEFAULT '{
    "canCreateOrder":    false,
    "canApproveOrder":   false,
    "canManageProducts": false,
    "canManageRoles":    false,
    "canExport":         false
  }'::jsonb,
  UNIQUE (name, tenant_id)
);

-- Custom auth — NOT Supabase Auth.
-- Email is unique per tenant, not globally.
CREATE TABLE users (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email      TEXT        NOT NULL,
  password   TEXT        NOT NULL, -- bcrypt hash, never plaintext
  name       TEXT        NOT NULL,
  tenant_id  TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id    TEXT        NOT NULL REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, tenant_id)
);

CREATE TABLE labels (
  id        TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name      TEXT        NOT NULL,
  color     TEXT        NOT NULL DEFAULT '#6b7280',
  tenant_id TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (name, tenant_id)
);

CREATE TABLE products (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title         TEXT        NOT NULL,
  description   TEXT,
  image_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id TEXT        NOT NULL REFERENCES users(id),
  tenant_id     TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE orders (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date              TIMESTAMPTZ NOT NULL,
  notes             TEXT,
  assembly_approved BOOLEAN     NOT NULL DEFAULT false,
  supply_approved   BOOLEAN     NOT NULL DEFAULT false,
  label_id          TEXT        REFERENCES labels(id) ON DELETE SET NULL,
  created_by_id     TEXT        NOT NULL REFERENCES users(id),
  tenant_id         TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id         TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id   TEXT    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes      TEXT
);

CREATE TABLE comments (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id   TEXT        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES users(id),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable audit trail — no updates, no deletes.
CREATE TABLE audit_logs (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id   TEXT        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES users(id),
  -- "created" | "updated" | "assembly_approved" | "supply_approved" | "approval_reset" | "commented"
  action     TEXT        NOT NULL,
  changes    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================================
-- INDEXES
-- =============================================================================

-- Tenant scoping (every list query filters by tenant_id)
CREATE INDEX idx_users_tenant      ON users(tenant_id);
CREATE INDEX idx_roles_tenant      ON roles(tenant_id);
CREATE INDEX idx_labels_tenant     ON labels(tenant_id);
CREATE INDEX idx_products_tenant   ON products(tenant_id);
CREATE INDEX idx_orders_tenant     ON orders(tenant_id);

-- Order list sorted newest-first per tenant
CREATE INDEX idx_orders_tenant_date ON orders(tenant_id, created_at DESC);

-- Relation traversal
CREATE INDEX idx_orders_label      ON orders(label_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_comments_order    ON comments(order_id);
CREATE INDEX idx_audit_logs_order  ON audit_logs(order_id);


-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- The Express backend uses the Supabase service-role key (bypasses RLS).
-- RLS here is a safety net against accidental cross-tenant leaks if the
-- app ever uses the anon key or a scoped key directly.
--
-- tenant_id is taken from the JWT claim injected by the Express layer:
--   await supabase.rpc('...') after setting Authorization header with
--   a signed token that includes { tenant_id: '...' } in the payload.

ALTER TABLE tenants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels     ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Reads tenant_id from the JWT claims that Supabase injects per-request.
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::jsonb->>'tenant_id',
    ''
  )
$$;

CREATE POLICY tenant_isolation ON tenants
  USING (id = current_tenant_id());

CREATE POLICY tenant_isolation ON roles
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON labels
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON order_items
  USING (order_id IN (
    SELECT id FROM orders WHERE tenant_id = current_tenant_id()
  ));

CREATE POLICY tenant_isolation ON comments
  USING (order_id IN (
    SELECT id FROM orders WHERE tenant_id = current_tenant_id()
  ));

CREATE POLICY tenant_isolation ON audit_logs
  USING (order_id IN (
    SELECT id FROM orders WHERE tenant_id = current_tenant_id()
  ));


-- =============================================================================
-- TENANT PROVISIONING
-- =============================================================================
-- Called once server-side during POST /api/tenants/register.
-- Wraps everything in a single transaction: tenant + roles + labels + admin user.
-- Pass the bcrypt hash from the Express layer — never hash inside the DB.

CREATE OR REPLACE FUNCTION provision_tenant(
  p_company_name   TEXT,
  p_admin_name     TEXT,
  p_admin_email    TEXT,
  p_password_hash  TEXT
)
RETURNS TABLE(tenant_id TEXT, user_id TEXT, admin_role_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id    TEXT;
  v_admin_role   TEXT;
  v_user_id      TEXT;
BEGIN
  -- Tenant
  INSERT INTO tenants(name) VALUES (p_company_name)
  RETURNING id INTO v_tenant_id;

  -- Default roles
  INSERT INTO roles(name, tenant_id, permissions) VALUES
    ('Admin', v_tenant_id, '{
      "canCreateOrder":    true,
      "canApproveOrder":   true,
      "canManageProducts": true,
      "canManageRoles":    true,
      "canExport":         true
    }'),
    ('Assembly', v_tenant_id, '{
      "canCreateOrder":    true,
      "canApproveOrder":   true,
      "canManageProducts": false,
      "canManageRoles":    false,
      "canExport":         true
    }'),
    ('Supply', v_tenant_id, '{
      "canCreateOrder":    false,
      "canApproveOrder":   true,
      "canManageProducts": true,
      "canManageRoles":    false,
      "canExport":         true
    }'),
    ('Manager', v_tenant_id, '{
      "canCreateOrder":    false,
      "canApproveOrder":   false,
      "canManageProducts": false,
      "canManageRoles":    false,
      "canExport":         true
    }');

  SELECT id INTO v_admin_role
  FROM roles WHERE roles.name = 'Admin' AND roles.tenant_id = v_tenant_id;

  -- Default labels
  INSERT INTO labels(name, color, tenant_id) VALUES
    ('Pending',     '#F59E0B', v_tenant_id),
    ('In Progress', '#3B82F6', v_tenant_id),
    ('Completed',   '#10B981', v_tenant_id),
    ('Cancelled',   '#EF4444', v_tenant_id);

  -- First admin user
  INSERT INTO users(email, password, name, tenant_id, role_id)
  VALUES (p_admin_email, p_password_hash, p_admin_name, v_tenant_id, v_admin_role)
  RETURNING id INTO v_user_id;

  RETURN QUERY SELECT v_tenant_id, v_user_id, v_admin_role;
END;
$$;


-- =============================================================================
-- ORDER TRANSACTION FUNCTIONS
-- =============================================================================
-- Called via supabase.rpc() from the Express layer.
-- All multi-step order mutations run inside a single PG transaction.

-- Creates order + items + audit log atomically. Returns the new order id.
CREATE OR REPLACE FUNCTION create_order(
  p_tenant_id TEXT,
  p_user_id   TEXT,
  p_date      TIMESTAMPTZ,
  p_notes     TEXT,
  p_label_id  TEXT,
  p_items     JSONB
)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id TEXT;
  v_item     JSONB;
BEGIN
  INSERT INTO orders(date, notes, label_id, created_by_id, tenant_id)
  VALUES (p_date, p_notes, p_label_id, p_user_id, p_tenant_id)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO order_items(order_id, product_id, quantity, notes)
    VALUES (
      v_order_id,
      v_item->>'product_id',
      (v_item->>'quantity')::integer,
      NULLIF(v_item->>'notes', '')
    );
  END LOOP;

  INSERT INTO audit_logs(order_id, user_id, action)
  VALUES (v_order_id, p_user_id, 'created');

  RETURN v_order_id;
END;
$$;

-- Resets approvals, optionally replaces items, writes audit log.
-- p_fields: partial JSON — only keys present are updated (uses ? operator).
-- p_items:  null = keep items as-is; array = delete all and re-insert.
CREATE OR REPLACE FUNCTION update_order(
  p_order_id  TEXT,
  p_tenant_id TEXT,
  p_user_id   TEXT,
  p_fields    JSONB,
  p_items     JSONB,
  p_changes   JSONB
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_item JSONB;
BEGIN
  UPDATE orders SET
    date              = CASE WHEN p_fields ? 'date'     THEN (p_fields->>'date')::timestamptz ELSE date     END,
    notes             = CASE WHEN p_fields ? 'notes'    THEN p_fields->>'notes'               ELSE notes    END,
    label_id          = CASE WHEN p_fields ? 'label_id' THEN p_fields->>'label_id'            ELSE label_id END,
    assembly_approved = false,
    supply_approved   = false,
    updated_at        = now()
  WHERE id = p_order_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF p_items IS NOT NULL THEN
    DELETE FROM order_items WHERE order_id = p_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO order_items(order_id, product_id, quantity, notes)
      VALUES (
        p_order_id,
        v_item->>'product_id',
        (v_item->>'quantity')::integer,
        NULLIF(v_item->>'notes', '')
      );
    END LOOP;
  END IF;

  INSERT INTO audit_logs(order_id, user_id, action, changes)
  VALUES (p_order_id, p_user_id, 'updated', p_changes);
END;
$$;

-- Toggles assembly or supply approval, writes audit log.
CREATE OR REPLACE FUNCTION approve_order(
  p_order_id  TEXT,
  p_tenant_id TEXT,
  p_user_id   TEXT,
  p_side      TEXT  -- 'assembly' | 'supply'
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF p_side NOT IN ('assembly', 'supply') THEN
    RAISE EXCEPTION 'Invalid side: %', p_side;
  END IF;

  IF p_side = 'assembly' THEN
    UPDATE orders SET assembly_approved = true WHERE id = p_order_id AND tenant_id = p_tenant_id;
    v_action := 'assembly_approved';
  ELSE
    UPDATE orders SET supply_approved = true WHERE id = p_order_id AND tenant_id = p_tenant_id;
    v_action := 'supply_approved';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  INSERT INTO audit_logs(order_id, user_id, action)
  VALUES (p_order_id, p_user_id, v_action);
END;
$$;

-- Adds a comment and writes an audit log entry.
CREATE OR REPLACE FUNCTION add_comment(
  p_order_id  TEXT,
  p_tenant_id TEXT,
  p_user_id   TEXT,
  p_content   TEXT
)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  INSERT INTO comments(order_id, user_id, content) VALUES (p_order_id, p_user_id, p_content);
  INSERT INTO audit_logs(order_id, user_id, action) VALUES (p_order_id, p_user_id, 'commented');
END;
$$;
