import { env } from 'cloudflare:workers';
import { isAdmin, json, sameOrigin } from '@/lib/server';
import { parseMT5, validateSpec } from '@/lib/engine';
export async function GET(request: Request) { try {
    if (!env.DB || !env.BUCKET)
        return json({ datasets: [], message: 'Penyimpanan dataset belum tersedia.' });
    const url = new URL(request.url), id = url.searchParams.get('id'), admin = isAdmin(request);
    if (id) {
        const item = await env.DB.prepare('SELECT * FROM datasets WHERE id = ? AND (published = 1 OR ? = 1)').bind(id, admin ? 1 : 0).first<{
            metadata: string;
            object_key: string;
            id: string;
            name: string;
        }>();
        if (!item)
            return json({ error: 'Dataset tidak ditemukan.' }, 404);
        const object = await env.BUCKET.get(item.object_key);
        if (!object)
            return json({ error: 'Berkas dataset tidak ditemukan.' }, 404);
        return json({ id: item.id, name: item.name, ...JSON.parse(item.metadata), candles: await object.json() });
    }
    const items = await env.DB.prepare('SELECT id,name,metadata,published FROM datasets WHERE published = 1 OR ? = 1 ORDER BY created_at DESC').bind(admin ? 1 : 0).all<{
        id: string;
        name: string;
        metadata: string;
        published: number;
    }>();
    return json({ datasets: items.results.map(x => ({ id: x.id, name: x.name, ...JSON.parse(x.metadata), published: !!x.published })) });
}
catch {
    return json({ error: 'Tidak dapat membaca dataset. Periksa binding dan migrasi D1.' }, 503);
} }
export async function POST(request: Request) { if (!isAdmin(request))
    return json({ error: 'Akses admin diperlukan. Masuk dengan akun yang diizinkan ADMIN_EMAIL / ADMIN_USER_ID.' }, 403); if (!sameOrigin(request))
    return json({ error: 'Origin tidak diizinkan.' }, 403); if (!env.DB || !env.BUCKET)
    return json({ error: 'Binding DB/BUCKET belum tersedia.' }, 503); try {
    const body = await request.text();
    if (body.length > 12500000)
        return json({ error: 'Ukuran upload melebihi batas.' }, 413);
    const input = JSON.parse(body);
    if (!input.name?.trim() || input.name.length > 120)
        throw new Error('Nama dataset wajib, maksimal 120 karakter.');
    validateSpec(input.symbol);
    const parsed = parseMT5(input.text, input.options);
    if (parsed.issues.length || !parsed.candles.length)
        return json({ error: 'Perbaiki semua baris bermasalah sebelum menerbitkan.', issues: parsed.issues }, 422);
    const id = crypto.randomUUID(), objectKey = `datasets/${id}.json`, metadata = { symbol: input.symbol, minutes: input.options.minutes, timezone: input.options.timezone, count: parsed.candles.length, first: parsed.candles[0].time, last: parsed.candles.at(-1)!.time, sample: false };
    await env.BUCKET.put(objectKey, JSON.stringify(parsed.candles), { httpMetadata: { contentType: 'application/json' } });
    try {
        await env.DB.prepare('INSERT INTO datasets (id,name,metadata,object_key,published,created_at) VALUES (?,?,?,?,?,?)').bind(id, input.name.trim(), JSON.stringify(metadata), objectKey, input.published ? 1 : 0, Date.now()).run();
    }
    catch (e) {
        await env.BUCKET.delete(objectKey);
        throw e;
    }
    return json({ id, ...metadata }, 201);
}
catch (e) {
    return json({ error: (e as Error).message }, 400);
} }
export async function PATCH(request: Request) { if (!isAdmin(request) || !sameOrigin(request))
    return json({ error: 'Akses admin diperlukan.' }, 403); try {
    const { id, published, name } = await request.json() as {
        id: string;
        published: boolean;
        name: string;
    };
    if (!id || typeof published !== 'boolean' || !name?.trim() || name.length > 120)
        throw new Error('Input tidak valid.');
    await env.DB!.prepare('UPDATE datasets SET published = ?, name = ? WHERE id = ?').bind(published ? 1 : 0, name.trim(), id).run();
    return json({ ok: true });
}
catch (e) {
    return json({ error: (e as Error).message }, 400);
} }
