export type UserPayload = {
  id: string
  roleId: string
  tenantId: string
  permissions: Record<string, boolean>
}

export type AppEnv = {
  Bindings: {
    SUPABASE_URL: string
    SUPABASE_SERVICE_KEY: string
    JWT_SECRET: string
    ALLOWED_ORIGIN: string
  }
  Variables: {
    user: UserPayload
  }
}
