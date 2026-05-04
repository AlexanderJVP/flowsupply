import { createClient } from '@supabase/supabase-js'

type SupabaseEnv = { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }

// Lazy singleton — reused across requests within the same Worker isolate.
let _client: ReturnType<typeof createClient> | null = null

export function getSupabase(env: SupabaseEnv) {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  }
  return _client
}
