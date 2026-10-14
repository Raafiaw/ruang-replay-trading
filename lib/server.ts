import { env } from 'cloudflare:workers';
export function isAdmin(request: Request) { const id = request.headers.get('oai-authenticated-user-id'), email = request.headers.get('oai-authenticated-user-email'); return Boolean(id && ((env.ADMIN_USER_ID && id === env.ADMIN_USER_ID) || (env.ADMIN_EMAIL && email?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) || (import.meta.env.DEV && id === 'local_seedy'))); }
export function sameOrigin(request: Request) { return request.headers.get('origin') === new URL(request.url).origin; }
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } }); }
export function subject(request: Request): {
    key: string;
    headers: Record<string, string>;
} { const id = request.headers.get('oai-authenticated-user-id'); if (id)
    return { key: 'user:' + id, headers: {} }; const match = request.headers.get('cookie')?.match(/(?:^|;\s*)rr_visitor=([a-f0-9-]{36})(?:;|$)/); const visitor = match?.[1] ?? crypto.randomUUID(); const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''; return { key: 'anon:' + visitor, headers: match ? {} : { 'Set-Cookie': `rr_visitor=${visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}` } }; }

