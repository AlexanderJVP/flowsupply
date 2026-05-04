type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

// Recursively converts snake_case keys to camelCase.
// Keys starting with _ (e.g. _count) are left as-is.
export function camelize(obj: Json): Json {
  if (Array.isArray(obj)) return obj.map(camelize)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.startsWith('_') ? k : k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camelize(v as Json),
      ])
    )
  }
  return obj
}
