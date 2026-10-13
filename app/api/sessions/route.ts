import { env } from 'cloudflare:workers';
import { json, subject, sameOrigin } from '@/lib/server';
export async function GET(request: Request) { const who = subject(request); try {
    if (!env.DB)
        return json({ sessions: [] }, 200, who.headers);
    const rows = await env.DB.prepare('SELECT id,payload,updated_at FROM sessions WHERE subject = ? ORDER BY updated_at DESC LIMIT 20').bind(who.key).all<{
        id: string;
        payload: string;
        updated_at: number;
    }>();
    return json({ sessions: rows.results.map(x => ({ id: x.id, payload: JSON.parse(x.payload), updatedAt: x.updated_at })) }, 200, who.headers);
}
catch {
    return json({ error: 'Penyimpanan sesi belum siap.' }, 503, who.headers);
} }
export async function POST(request: Request) { const who = subject(request); if (!sameOrigin(request))
    return json({ error: 'Origin tidak diizinkan.' }, 403, who.headers); try {
    if (!env.DB)
        return json({ error: 'Penyimpanan sesi belum tersedia.' }, 503, who.headers);
    const body = await request.text();
    if (body.length > 300000)
        return json({ error: 'Sesi maksimal 300 KB.' }, 413, who.headers);
    const { id, payload } = JSON.parse(body);
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || !payload || typeof payload !== 'object')
        throw new Error('Sesi tidak valid.');
    const existing = await env.DB.prepare('SELECT subject FROM sessions WHERE id = ?').bind(id).first<{
        subject: string;
    }>();
    if (existing && existing.subject !== who.key)
        return json({ error: 'Sesi milik pengunjung lain.' }, 403, who.headers);
    if (!existing) {
        const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE subject = ?').bind(who.key).first<{
            n: number;
        }>();
        if ((count?.n ?? 0) >= 20)
            return json({ error: 'Maksimal 20 sesi tersimpan. Hapus sesi lama.' }, 422, who.headers);
    }
    await env.DB.prepare('INSERT INTO sessions (id,subject,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE sessions.subject=excluded.subject').bind(id, who.key, JSON.stringify(payload), Date.now()).run();
    return json({ ok: true }, 200, who.headers);
}
catch (e) {
    return json({ error: (e as Error).message }, 400, who.headers);
} }
export async function DELETE(request: Request) { const who = subject(request); if (!sameOrigin(request))
    return json({ error: 'Origin tidak diizinkan.' }, 403); const id = new URL(request.url).searchParams.get('id'); await env.DB?.prepare('DELETE FROM sessions WHERE id = ? AND subject = ?').bind(id, who.key).run(); return json({ ok: true }, 200, who.headers); }
