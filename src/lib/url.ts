/**
 * Resolve an app path against Vite's configured base.
 *
 * The site is deployed at https://fat-git.github.io/haunted-walk/, so a bare
 * `/tours/new-orleans.json` would 404. Always build in-app URLs with this.
 */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${normalizedBase}${normalizedPath}`
}
