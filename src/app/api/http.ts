export function invalidRequest(detail: string): Response {
  return Response.json({ error: 'invalid_request', detail }, { status: 400 })
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
