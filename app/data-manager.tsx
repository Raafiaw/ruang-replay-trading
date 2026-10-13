'use client';
import { useEffect, useState, useMemo } from 'react';
import { Upload, Database, CheckCircle2, AlertTriangle, Download, ArrowUpRight, Lock, FileSpreadsheet, X } from 'lucide-react';
import {readApi} from '@/lib/api';
import { inspectFile, parseMT5, validateSpec, EURUSD, sampleDataset, csv } from '@/lib/engine';
import type { Dataset, ImportOptions, SymbolSpec } from '@/lib/engine';
export const download = (name: string, content: string, type = 'text/csv;charset=utf-8') => { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500); };
type Catalog = Omit<Dataset, 'candles'> & {
    count: number;
    published: boolean;
    first: number;
    last: number;
};
type Reply={datasets?:Catalog[];error?:string;admin:boolean;email:string|null};
export default function DataManager({ onUse, onMessage }: {
    onUse: (d: Dataset) => void;
    onMessage: (m: string) => void;
}) { const [catalog, setCatalog] = useState<Catalog[]>([]), [admin, setAdmin] = useState(false), [email, setEmail] = useState<string | null>(null), [upload, setUpload] = useState(false), [text, setText] = useState(''), [name, setName] = useState(''), [spec, setSpec] = useState<SymbolSpec>({ ...EURUSD }), [options, setOptions] = useState<ImportOptions>({ mapping: {}, minutes: 5, timezone: 'UTC+02:00', duplicate: 'reject' }), [busy, setBusy] = useState(false), [error, setError] = useState(''); const load = () => fetch('/api/datasets').then(r => readApi<Reply>(r)).then(x => { setCatalog(x.datasets ?? []); if (x.error)
    setError(x.error); }).catch(() => setError('Tidak dapat memuat katalog.')); useEffect(() => { load(); fetch('/api/identity').then(r => readApi<Reply>(r)).then(x => { setAdmin(x.admin); setEmail(x.email); }).catch(() => { }); }, []); const info = useMemo(() => { try {
    return text ? inspectFile(text) : null;
}
catch {
    return null;
} }, [text]); const parsed = useMemo(() => { try {
    return text ? { ...parseMT5(text, options), error: '' } : null;
}
catch (e) {
    return { candles: [], issues: [], duplicates: 0, gaps: 0, error: (e as Error).message };
} }, [text, options]); const read = async (file: File) => { if (file.size > 12000000) {
    setError('File maksimal 12 MB.');
    return;
} try {
    const source = await file.text(), detected = inspectFile(source);
    setText(source);
    setName(file.name.replace(/\.(csv|tsv|txt)$/i, ''));
    setOptions(o => ({ ...o, mapping: detected.mapping }));
    setError('');
}
catch (e) {
    setError((e as Error).message);
} }; const use = (d: Dataset) => { validateSpec(d.symbol); onUse(d); setUpload(false); }; const publish = async (published: boolean) => { setBusy(true); try {
    const r = await fetch('/api/datasets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, name, symbol: spec, options, published }) }), result = await readApi<Reply>(r);
    if (!r.ok)
        throw new Error(result.error);
    onMessage(published ? 'Dataset diterbitkan ke katalog publik.' : 'Dataset disimpan sebagai draft.');
    setUpload(false);
    load();
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} }; const toggle = async (d: Catalog) => { try {
    const r = await fetch('/api/datasets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, name: d.name, published: !d.published }) });
    if (!r.ok)
        throw new Error((await readApi<Reply>(r)).error);
    load();
}
catch (e) {
    onMessage((e as Error).message);
} }; return <div className="data-page"><div className="page-eyebrow">SUMBER DATA ANDA</div><div className="page-title-row"><div><h1>Mulai dari candle yang tepat.</h1><p>Impor data MT5, periksa kualitasnya, lalu pilih dataset untuk berlatih.</p></div><button className="primary" onClick={() => setUpload(true)}><Upload size={16}/> Impor MT5</button></div><div className="info-banner"><Database size={18}/><div><b>Data mandiri. Tanpa koneksi broker.</b><span>CSV atau TSV · OHLC Bid · hingga 50.000 candle per dataset</span></div><button className="text-button" onClick={() => { const d = sampleDataset(); download('contoh-mt5-sintetis.csv', csv(d.candles.map(b => ({ DATE: new Date(b.time * 1000).toISOString().slice(0, 10).replace(/-/g, '.'), TIME: new Date(b.time * 1000).toISOString().slice(11, 19), OPEN: b.open, HIGH: b.high, LOW: b.low, CLOSE: b.close, TICKVOL: b.volume, SPREAD: b.spread })))); }}>Unduh contoh <Download size={14}/></button></div><div className="dataset-grid"><div className="dataset-card sample-card"><div className="card-top"><FileSpreadsheet size={21}/><span className="pill amber">DATA SINTETIS</span></div><h3>EURUSD · Latihan September</h3><p>Dataset contoh untuk menjelajahi replay dan mencoba strategi.</p><div className="dataset-details"><span>EURUSD</span><span>M5</span><span>720 candle</span></div><button onClick={() => use(sampleDataset())}>Buka di ruang latihan <ArrowUpRight size={15}/></button></div>{catalog.map(d => <div className="dataset-card" key={d.id}><div className="card-top"><FileSpreadsheet size={21}/><span className={`pill ${d.published ? 'green' : 'amber'}`}>{d.published ? 'PUBLIK' : 'DRAFT'}</span></div>{admin ? <input aria-label="Nama dataset" value={d.name} onChange={e => setCatalog(catalog.map(x => x.id === d.id ? { ...x, name: e.target.value } : x))} onBlur={() => { fetch('/api/datasets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, published: d.published, name: d.name }) }).then(r => { if (!r.ok)
    onMessage('Gagal menyimpan nama dataset.'); }); }}/> : <h3>{d.name}</h3>}<p>{new Date(d.first * 1000).toLocaleDateString('id-ID')} – {new Date(d.last * 1000).toLocaleDateString('id-ID')} · {d.timezone}</p><div className="dataset-details"><span>{d.symbol.symbol}</span><span>M{d.minutes}</span><span>{d.count.toLocaleString('id-ID')} candle</span></div><button onClick={async () => { setBusy(true); try {
    const r = await fetch(`/api/datasets?id=${d.id}`);
    if (!r.ok)
        throw new Error('Dataset tidak tersedia.');
    use(await readApi<Dataset>(r));
}
catch (e) {
    onMessage((e as Error).message);
}
finally {
    setBusy(false);
} }}>Buka di ruang latihan <ArrowUpRight size={15}/></button>{admin && <button className="subtle" onClick={() => toggle(d)}>{d.published ? 'Jadikan draft' : 'Terbitkan dataset'}</button>}</div>)}</div><div className="admin-callout"><Lock size={20}/><div><b>{admin ? 'Admin aktif' : 'Pengelolaan dataset publik dilindungi'}</b><p>{admin ? `Masuk sebagai ${email}. Upload, ubah nama, dan terbitkan dataset Anda.` : email ? `Akun ${email} belum memiliki izin admin. Pemilik perlu mengatur ADMIN_EMAIL atau ADMIN_USER_ID.` : 'Masuk dengan akun ChatGPT pemilik untuk mengelola katalog publik. Impor lokal tetap dapat digunakan.'}</p></div>{!email && <a href="/signin-with-chatgpt?return_to=/admin" target="_top" className="button">Masuk sebagai admin <ArrowUpRight size={14}/></a>}</div>{error && <div className="error-box">{error}</div>}{busy && <div className="muted">Memproses dataset…</div>}{upload && <div className="modal-shade"><section className="modal import-modal" role="dialog" aria-modal="true" aria-label="Impor dataset MT5"><div className="modal-head"><div><span className="page-eyebrow">IMPOR DATA</span><h2>Dataset baru dari MT5</h2></div><button className="icon-button" onClick={() => setUpload(false)} aria-label="Tutup"><X size={19}/></button></div><label className="upload-drop"><Upload size={26}/><b>Pilih CSV / TSV ekspor MT5</b><span>Data OHLC Bid, maksimal 12 MB. File tidak dikirim sebelum Anda menekan simpan.</span><input type="file" accept=".csv,.tsv,.txt" onChange={e => e.target.files?.[0] && read(e.target.files[0])}/></label>{text && <><div className="form-grid"><label>Nama dataset<input value={name} onChange={e => setName(e.target.value)}/></label><label>Simbol<input value={spec.symbol} onChange={e => setSpec({ ...spec, symbol: e.target.value.toUpperCase() })}/></label><label>Timeframe dasar (menit)<input type="number" min="1" value={options.minutes} onChange={e => setOptions({ ...options, minutes: +e.target.value })}/></label><label>Zona waktu broker<select value={options.timezone} onChange={e => setOptions({ ...options, timezone: e.target.value })}>{['UTC', 'UTC+02:00', 'UTC+03:00', 'UTC+07:00', 'Europe/Helsinki', 'America/New_York', 'Asia/Jakarta'].map(t => <option key={t}>{t}</option>)}</select></label><label>Timestamp duplikat<select value={options.duplicate} onChange={e => setOptions({ ...options, duplicate: e.target.value as ImportOptions['duplicate'] })}><option value="reject">Tolak dan laporkan</option><option value="first">Simpan baris pertama</option><option value="last">Simpan baris terakhir</option></select></label><label>Mata uang profit<input value={spec.quoteCurrency} onChange={e => setSpec({ ...spec, quoteCurrency: e.target.value.toUpperCase() })}/></label></div><h4>Pemetaan kolom</h4><div className="mapping-grid">{['date', 'time', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'spread'].map(k => <label key={k}>{k}<select value={options.mapping[k] ?? ''} onChange={e => setOptions({ ...options, mapping: { ...options.mapping, [k]: e.target.value } })}><option value="">Tidak ada</option>{info?.headers.map(h => <option key={h}>{h}</option>)}</select></label>)}</div><details><summary>Spesifikasi simbol & batas lot</summary><div className="form-grid">{(['digits', 'tickSize', 'point', 'pip', 'contractSize', 'minLot', 'maxLot', 'lotStep'] as const).map(k => <label key={k}>{({ digits: 'Digit harga', tickSize: 'Tick size', point: 'Point MT5', pip: 'Ukuran pip', contractSize: 'Contract size', minLot: 'Lot minimum', maxLot: 'Lot maksimum', lotStep: 'Langkah lot' })[k]}<input type="number" step="any" value={spec[k]} onChange={e => setSpec({ ...spec, [k]: +e.target.value })}/></label>)}</div></details><h4>Pratinjau sumber</h4><div className="table-wrap"><table><thead><tr>{info?.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{info?.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table></div>{parsed && <div className={`validation ${parsed.issues.length || parsed.error ? 'invalid' : ''}`}><CheckCircle2 size={16}/><b>{parsed.candles.length.toLocaleString('id-ID')} candle valid</b><span>· {parsed.duplicates} duplikat · {parsed.gaps} gap · {parsed.issues.length} masalah</span></div>}{parsed?.error && <div className="error-box">{parsed.error}</div>}{!!parsed?.issues.length && <div className="issue-list">{parsed.issues.slice(0, 20).map((x, i) => <div key={i}>Baris {x.line}: {x.message}</div>)}{parsed.issues.length > 20 && <span>+{parsed.issues.length - 20} masalah lainnya</span>}</div>}<p className="muted small">Candle tetap disimpan sesuai sumber. Gap tidak diisi. Zona IANA mengikuti DST; waktu berulang saat DST perlu offset UTC eksplisit. Spread file dibaca sebagai point MT5.</p><div className="modal-actions"><button disabled={!parsed?.candles.length || !!parsed.error || !!parsed.issues.length || !name.trim()} onClick={() => { try {
    use({ id: 'local-' + crypto.randomUUID(), name, symbol: spec, minutes: options.minutes, timezone: options.timezone, candles: parsed!.candles });
}
catch (e) {
    setError((e as Error).message);
} }}>Gunakan di perangkat</button><button disabled={!admin || busy || !parsed?.candles.length || !!parsed.error || !!parsed.issues.length} onClick={() => publish(false)}>Simpan draft</button><button className="primary" disabled={!admin || busy || !parsed?.candles.length || !!parsed.error || !!parsed.issues.length} onClick={() => publish(true)}>Terbitkan ke publik</button></div>{!admin && <span className="muted small">Publikasi membutuhkan akun admin yang diizinkan.</span>}</>}{error && <div className="error-box"><AlertTriangle size={14}/>{error}</div>}</section></div>}</div>; }
