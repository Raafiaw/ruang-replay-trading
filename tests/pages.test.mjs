import test from 'node:test';
import assert from 'node:assert/strict';
import { createPagesAPI, safeDataFile } from '../lib/pages-api.ts';
import { parseSessionBackup } from '../lib/pages-backup.ts';
import { compileDataset } from '../scripts/pages-datasets.mjs';
import { DEFAULT_CONFIG, sampleDataset, EURUSD } from '../lib/engine.ts';

const sample = sampleDataset();
const metadata = { ...sample, candles: undefined, published: true, count: sample.candles.length, first: sample.candles[0].time, last: sample.candles.at(-1).time, file: 'datasets/sample-eurusd.json' };
const saved = new Map(), local = new Map([[sample.id, sample]]);
const session = () => ({ id: 'session-1', name: 'Test', datasetId: sample.id, index: 100, timeframe: 5, config: { ...DEFAULT_CONFIG }, branches: [{ id: 'main', name: 'Sesi utama', events: [], furthest: 100 }], active: 'main', drawings: [], journal: '', source: '//@version=5\nindicator("Test")\nplot(close)' });
const api = createPagesAPI({
  async catalog() { return [metadata]; },
  async datasetFile() { return sample; },
  async localDataset(id) { return local.get(id); },
  async sessions() { return [...saved.values()]; },
  async save(row) { saved.set(row.id, row); },
  async remove(id) { saved.delete(id); },
});

test('Pages identity is anonymous and public catalog remains readable without a server', async () => {
  assert.deepEqual(await (await api('/api/identity')).json(), { admin: false, email: null, signedIn: false, hosting: 'github-pages' });
  assert.equal((await (await api('/api/datasets')).json()).datasets[0].id, sample.id);
  assert.equal((await (await api('/api/datasets?id=sample-eurusd')).json()).candles.length, 720);
  assert.equal((await api('/api/datasets?id=unknown')).status, 404);
});

test('Pages publication writes never create a fake backend or alter the public dataset', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await api('/api/datasets', { method })).status, 403);
  assert.equal((await api('/api/nonexistent')).status, 404);
});

test('public datasets still load when private browsing blocks local storage', async () => {
  const unavailable = async () => { throw new Error('Storage blocked'); };
  const withoutStorage = createPagesAPI({ catalog: async () => [metadata], datasetFile: async () => sample, localDataset: unavailable, sessions: unavailable, save: unavailable, remove: unavailable });
  const reply = await withoutStorage('/api/datasets?id=sample-eurusd');
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).candles.length, 720);
  assert.equal((await withoutStorage('/api/sessions')).status, 503);
});

test('session save, list, and delete use only the local store', async () => {
  const value = session();
  assert.equal((await api('/api/sessions', { method: 'POST', body: JSON.stringify({ id: value.id, payload: value }) })).status, 200);
  assert.equal((await (await api('/api/sessions')).json()).sessions[0].payload.index, 100);
  assert.equal((await api('/api/sessions?id=session-1', { method: 'DELETE' })).status, 200);
  assert.equal((await (await api('/api/sessions')).json()).sessions.length, 0);
});

test('sessions with mismatched IDs, missing datasets, and excessive size are rejected', async () => {
  assert.equal((await api('/api/sessions', { method: 'POST', body: JSON.stringify({ id: 'wrong', payload: session() }) })).status, 400);
  const value = { ...session(), datasetId: 'missing' };
  assert.equal((await api('/api/sessions', { method: 'POST', body: JSON.stringify({ id: value.id, payload: value }) })).status, 409);
  assert.equal((await api('/api/sessions', { method: 'POST', body: 'x'.repeat(500001) })).status, 413);
});

test('static dataset filenames cannot escape the published directory or request external URLs', () => {
  assert.equal(safeDataFile('datasets/eurusd-m5.json'), true);
  for (const path of ['https://evil.example/data.json', 'datasets/../secret.json', '/datasets/file.json', 'datasets/file.csv', 'datasets/a/b.json']) assert.equal(safeDataFile(path), false);
});

test('MT5 public CSV compilation preserves broker timezone, spread, and metadata', () => {
  const source = 'DATE,TIME,OPEN,HIGH,LOW,CLOSE,TICKVOL,SPREAD\n2026.09.07,03:00:00,1.1,1.2,1.0,1.15,80,10';
  const { dataset, metadata } = compileDataset({ id: 'eurusd', name: 'EURUSD', file: 'eurusd.csv', minutes: 5, timezone: 'UTC+03:00', symbol: EURUSD }, source);
  assert.equal(dataset.candles[0].time, Date.UTC(2026, 8, 7) / 1000);
  assert.equal(dataset.candles[0].spread, 10);
  assert.equal(metadata.file, 'datasets/eurusd.json');
  assert.equal(metadata.count, 1);
});

test('invalid public source data and traversal filenames fail before deployment', () => {
  const entry = { id: 'eurusd', name: 'EURUSD', file: 'eurusd.csv', minutes: 5, timezone: 'UTC', symbol: EURUSD };
  assert.throws(() => compileDataset({ ...entry, file: '../secret.csv' }, 'x'), /Nama file/);
  assert.throws(() => compileDataset(entry, 'DATE,TIME,OPEN,HIGH,LOW,CLOSE\n2026.09.07,00:00:00,1.1,1.0,1.2,1.15'), /Dataset eurusd/);
});

test('session backup round-trip preserves dataset, replay position, branch, and drawings', () => {
  const value = session();
  const result = parseSessionBackup(JSON.stringify({ version: 1, session: value, data: sample }));
  assert.deepEqual(result.session, value);
  assert.deepEqual(result.data, sample);
});

test('session backups reject malformed bars, future indexes, unknown branches, and oversized histories', () => {
  const backup = () => ({ version: 1, session: session(), data: structuredClone(sample) });
  const a = backup(); a.data.candles[0].high = 0;
  const b = backup(); b.session.index = sample.candles.length;
  const c = backup(); c.session.active = 'missing';
  const d = backup(); d.session.branches[0].events = Array.from({ length: 10001 }, () => ({ kind: 'deposit', amount: 1, index: 0 }));
  for (const value of [a, b, c, d]) assert.throws(() => parseSessionBackup(JSON.stringify(value)), /Cadangan sesi/);
});
