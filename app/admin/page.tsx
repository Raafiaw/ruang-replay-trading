import { requireChatGPTUser } from '../chatgpt-auth';
import { env } from 'cloudflare:workers';
import Terminal from '../terminal';
export const dynamic = 'force-dynamic';
export default async function AdminPage() { const user = await requireChatGPTUser('/admin'); const allowed = (env.ADMIN_USER_ID && user.userId === env.ADMIN_USER_ID) || (env.ADMIN_EMAIL && user.email?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) || (import.meta.env.DEV && user.userId === 'local_seedy'); if (!allowed)
    return <main className="access-page"><span className="brand-mark">R</span><h1>Halaman admin terkunci.</h1><p>Akun {user.email} belum diizinkan mengelola dataset. Pemilik perlu mengatur ADMIN_EMAIL atau ADMIN_USER_ID di lingkungan backend.</p><a href="/" className="button">Kembali ke ruang latihan</a></main>; return <Terminal initialPage="data"/>; }
