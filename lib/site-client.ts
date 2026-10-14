import { createPagesAPI, safeDataFile } from './pages-api';
import type { CatalogEntry } from './pages-api';
import { localDataset, listLocalSessions, saveLocalSession, deleteLocalSession } from './pages-store';
export const IS_PAGES = import.meta.env?.VITE_HOSTING_TARGET === 'github-pages';
export const GITHUB_DATA_URL = 'https://github.com/Raafiaw/ruang-replay-trading/tree/main/public/datasets';
export const homeURL = IS_PAGES ? import.meta.env.BASE_URL : '/';

async function staticJSON<T>(path: string): Promise<T> {
  if (!safeDataFile(path)) throw new Error('Lokasi dataset tidak valid.');
  const response = await fetch(import.meta.env.BASE_URL + path);
  if (!response.ok) throw new Error('File dataset tidak dapat dimuat.');
  return response.json() as Promise<T>;
}

const pagesAPI = createPagesAPI({
  async catalog() { return (await staticJSON<{ datasets: CatalogEntry[] }>('datasets/catalog.json')).datasets; },
  datasetFile: staticJSON,
  localDataset,
  sessions: listLocalSessions,
  save: saveLocalSession,
  remove: deleteLocalSession,
});

export const siteFetch = (input: string, init?: RequestInit) => IS_PAGES ? pagesAPI(input, init) : fetch(input, init);
