import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { inspectFile, parseMT5, validateSpec } from '../lib/engine.ts';

export function compileDataset(entry, text) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(entry.id || '')) throw new Error('ID dataset harus unik dan hanya berisi huruf, angka, - atau _.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(csv|tsv|txt)$/.test(entry.file || '') || entry.file.includes('..')) throw new Error('Nama file sumber dataset tidak valid.');
  if (!entry.name?.trim() || entry.name.length > 150) throw new Error('Nama dataset wajib diisi, maksimal 150 karakter.');
  if (Buffer.byteLength(text, 'utf8') > 12000000) throw new Error('File sumber maksimal 12 MB.');
  validateSpec(entry.symbol);
  const options = { minutes: entry.minutes, timezone: entry.timezone, duplicate: entry.duplicate || 'reject', mapping: { ...inspectFile(text).mapping, ...(entry.mapping || {}) } };
  const parsed = parseMT5(text, options);
  if (parsed.issues.length || !parsed.candles.length) throw new Error(`Dataset ${entry.id}: ${parsed.issues[0]?.message || 'Tidak ada candle valid.'}`);
  const dataset = { id: entry.id, name: entry.name, symbol: entry.symbol, minutes: entry.minutes, timezone: entry.timezone, candles: parsed.candles, sample: entry.sample === true };
  return { dataset, metadata: { ...dataset, candles: undefined, count: parsed.candles.length, first: parsed.candles[0].time, last: parsed.candles.at(-1).time, published: true, file: `datasets/${entry.id}.json` } };
}

export function buildDatasets(root = fileURLToPath(new URL('../', import.meta.url))) {
  const directory = join(root, 'public', 'datasets');
  mkdirSync(directory, { recursive: true });
  const source = JSON.parse(readFileSync(join(directory, 'sources.json'), 'utf8'));
  if (!Array.isArray(source.datasets) || source.datasets.length > 100) throw new Error('Katalog harus memiliki array datasets, maksimal 100 dataset.');
  const ids = new Set();
  const catalog = [];
  for (const entry of source.datasets) {
    if (ids.has(entry.id)) throw new Error('ID dataset duplikat: ' + entry.id);
    // Validate filenames before any filesystem access.
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(csv|tsv|txt)$/.test(entry.file || '') || entry.file.includes('..')) throw new Error('Nama file sumber dataset tidak valid.');
    const sourceFile = resolve(directory, entry.file);
    const { dataset, metadata } = compileDataset(entry, readFileSync(sourceFile, 'utf8'));
    ids.add(entry.id);
    writeFileSync(join(directory, `${entry.id}.json`), JSON.stringify(dataset));
    catalog.push(metadata);
  }
  writeFileSync(join(directory, 'catalog.json'), JSON.stringify({ datasets: catalog }, null, 2));
  return catalog;
}
