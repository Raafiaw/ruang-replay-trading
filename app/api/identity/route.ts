import { isAdmin, json } from '@/lib/server';
export async function GET(request: Request) { return json({ admin: isAdmin(request), email: request.headers.get('oai-authenticated-user-email'), signedIn: !!request.headers.get('oai-authenticated-user-id') }); }
