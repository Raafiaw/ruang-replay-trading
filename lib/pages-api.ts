import type { Dataset } from './engine';
import type { SavedLocal, SessionRef } from './pages-store';
export type CatalogEntry = Omit<Dataset, 'candles'> & { count: number; published: boolean; first: number; last: number; file: string };
export interface PagesServices {
  catalog(): Promise<CatalogEntry[]>;
  datasetFile(path: string): Promise<Dataset>;
  localDataset(id: string): Promise<Dataset | undefined>;
  sessions(): Promise<SavedLocal[]>;
  save(row: SavedLocal): Promise<void>;
  remove(id: string): Promise<void>;
}
const response = (value: unknown, status = 200) => Response.json(value, { status });

export function safeDataFile(path: string) {
  return /^datasets\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(path) && !path.includes('..');
}

export function createPagesAPI(services: PagesServices) {
  return async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'https://pages.invalid');
    const method = (init.method || 'GET').toUpperCase();
    try {
      if (url.pathname === '/api/identity' && method === 'GET') return response({ admin: false, email: null, signedIn: false, hosting: 'github-pages' });
      if (url.pathname === '/api/datasets') {
        if (method !== 'GET') return response({ error: 'Dataset publik ditambahkan melalui repository GitHub.' }, 403);
        const id = url.searchParams.get('id');
        if (id) {
          let local: Dataset | undefined;
          try { local = await services.localDataset(id); } catch { /* Public data stays usable when browser storage is blocked. */ }
          if (local) return response(local);
          const entry = (await services.catalog()).find(x => x.id === id);
          if (!entry || !safeDataFile(entry.file)) return response({ error: 'Dataset tidak ditemukan.' }, 404);
          const dataset = await services.datasetFile(entry.file);
          if (dataset.id !== id) return response({ error: 'Identitas dataset tidak sesuai katalog.' }, 422);
          return response(dataset);
        }
        return response({ datasets: await services.catalog(), admin: false, email: null });
      }
      if (url.pathname === '/api/sessions') {
        if (method === 'GET') return response({ sessions: await services.sessions() });
        if (method === 'POST') {
          if (typeof init.body !== 'string' || init.body.length > 500000) return response({ error: 'Sesi terlalu besar atau tidak valid.' }, 413);
          const body = JSON.parse(init.body) as { id: string; payload: SessionRef };
          if (!body.id || typeof body.id !== 'string' || body.id.length > 100 || !body.payload || body.payload.id !== body.id || typeof body.payload.datasetId !== 'string') return response({ error: 'Sesi tidak valid.' }, 400);
          if (!await services.localDataset(body.payload.datasetId)) return response({ error: 'Dataset sesi belum tersimpan di browser. Coba simpan kembali.' }, 409);
          await services.save({ id: body.id, payload: body.payload, updatedAt: Date.now() });
          return response({ ok: true, id: body.id });
        }
        if (method === 'DELETE') {
          const id = url.searchParams.get('id');
          if (!id) return response({ error: 'ID sesi diperlukan.' }, 400);
          await services.remove(id);
          return response({ ok: true });
        }
        return response({ error: 'Metode tidak didukung.' }, 405);
      }
      return response({ error: 'Layanan server tidak digunakan pada GitHub Pages.' }, 404);
    } catch (error) {
      return response({ error: (error as Error).message || 'Penyimpanan browser tidak tersedia.' }, 503);
    }
  };
}
