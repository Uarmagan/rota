const MAX_RETAINED_CLIENT_KEY_LENGTH = 200

export function normalizeClientKey(clientKey: string): string {
  const normalized = clientKey.trim().slice(0, MAX_RETAINED_CLIENT_KEY_LENGTH)
  return normalized || 'anonymous'
}

export function clientKeyForRequest(
  request: Request,
  trustForwardedAddress: boolean,
): string {
  if (!trustForwardedAddress) return 'anonymous'

  // Only deployments whose authoritative proxy overwrites this header may enable
  // trust. The first value is the original client in that documented topology.
  const forwarded = request.headers.get('x-forwarded-for')
  const firstAddress = forwarded?.split(',', 1)[0]?.trim()
  if (!firstAddress) return 'anonymous'
  return normalizeClientKey(`forwarded:${firstAddress}`)
}
