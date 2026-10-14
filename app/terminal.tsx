'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Activity, ArrowLeft, ArrowRight, Play, Pause, RotateCcw, Save, ChevronDown, Settings2, Database, Code2, History, ChartNoAxesCombined, BookOpen, Plus, Download, MousePointer2, Minus, MoveVertical, TrendingUp, Square, Type, Layers, ScanLine, Undo2, Redo2, Trash2, PanelRightClose, Check, GitBranch, X, Wallet, ArrowUpRight, Info, Maximize2 } from 'lucide-react';
import {readApi} from '@/lib/api';
import { IS_PAGES, siteFetch, homeURL } from '@/lib/site-client';
import { persistActive, restoreActive, listLocalSessions } from '@/lib/pages-store';
import { parseSessionBackup } from '@/lib/pages-backup';
import TradingChart from './chart';
import type { Drawing, Tool } from './chart';
import DataManager, { download } from './data-manager';
import { sampleDataset, DEFAULT_CONFIG, aggregate, simulate, metrics, quotes, branchEvent, report, csv, profit, decimal, validateConfig } from '@/lib/engine';
import type { Dataset, Config, Branch, Event, Trade } from '@/lib/engine';
import { INDICATOR_EXAMPLE, STRATEGY_EXAMPLE } from '@/lib/pine';
import type { PineResult } from '@/lib/pine';
export type Session = {
    id: string;
    name: string;
    datasetId: string;
    index: number;
    timeframe: number;
    config: Config;
    branches: Branch[];
    active: string;
    drawings: Drawing[];
    journal: string;
    source: string;
};
type Reply={error?:string;ok?:boolean;sessions?:{id:string;payload:Session;updatedAt:number}[]};
const initial = (data: Dataset): Session => { const index = Math.min(180, data.candles.length - 1); return { id: crypto.randomUUID(), name: 'Sesi latihan', datasetId: data.id, index, timeframe: data.minutes, config: { ...DEFAULT_CONFIG, currency: data.symbol.quoteCurrency }, branches: [{ id: 'main', name: 'Sesi utama', events: [], furthest: index }], active: 'main', drawings: [], journal: '', source: INDICATOR_EXAMPLE }; };
const money = (n: number, c = 'USD') => new Intl.NumberFormat('id-ID', { style: 'currency', currency: c, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const stamp = (time: number) => new Date(time * 1000).toLocaleString('id-ID', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const localDate = (time: number) => new Date(time * 1000).toISOString().slice(0, 16);
const tools: {
    id: Tool;
    label: string;
    Icon: typeof MousePointer2;
}[] = [{ id: 'cursor', label: 'Pilih / geser gambar', Icon: MousePointer2 }, { id: 'horizontal', label: 'Garis horizontal', Icon: Minus }, { id: 'vertical', label: 'Garis vertikal', Icon: MoveVertical }, { id: 'trend', label: 'Trendline', Icon: TrendingUp }, { id: 'rectangle', label: 'Rectangle / zona', Icon: Square }, { id: 'text', label: 'Teks', Icon: Type }, { id: 'fib', label: 'Fibonacci', Icon: Layers }, { id: 'risk', label: 'Risk / reward', Icon: ScanLine }];
function EquityCurve({ values }: {
    values: {
        time: number;
        equity: number;
    }[];
}) {
    if (values.length < 2)
        return <div className="empty">Belum ada kurva equity.</div>;
    const nums = values.map(v => v.equity), min = Math.min(...nums), max = Math.max(...nums), range = max - min || 1;
    const pts = values.map((v, i) => `${i / (values.length - 1) * 760},${110 - (v.equity - min) / range * 90}`).join(' ');
    return <svg viewBox="0 0 760 135" className="equity-svg" role="img" aria-label={`Kurva equity, awal ${nums[0].toFixed(2)}, akhir ${nums.at(-1)!.toFixed(2)}`}><defs><linearGradient id="equity-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#36d6b5" stopOpacity=".25"/><stop offset="1" stopColor="#36d6b5" stopOpacity="0"/></linearGradient></defs>{[20, 65, 110].map(y => <line key={y} x1="0" x2="760" y1={y} y2={y} stroke="#243342"/>)}<polygon points={`0,130 ${pts} 760,130`} fill="url(#equity-fill)"/><polyline points={pts} stroke="#36d6b5" fill="none" strokeWidth="2"/><text x="5" y="13" fill="#849aaf" fontSize="10">{max.toFixed(2)}</text><text x="5" y="126" fill="#849aaf" fontSize="10">{min.toFixed(2)}</text></svg>;
}
function Trades({ trades, currency }: {
    trades: Trade[];
    currency: string;
}) { return trades.length ? <div className="table-wrap"><table><thead><tr><th>Waktu entry · UTC</th><th>Posisi</th><th>Lot</th><th>Entry</th><th>Exit</th><th>Hasil bersih</th><th>Alasan</th></tr></thead><tbody>{[...trades].reverse().map((t, i) => <tr key={i}><td>{stamp(t.entryTime)}</td><td><span className={t.side === 'buy' ? 'positive' : 'negative'}>{t.side.toUpperCase()}</span></td><td>{t.lot}</td><td>{t.entry.toFixed(5)}</td><td>{t.exit.toFixed(5)}</td><td className={t.pnl >= 0 ? 'positive' : 'negative'}>{money(t.pnl, currency)}</td><td>{t.reason}{t.ambiguous && <span title="Urutan intrabar tidak diketahui" className="pill amber">AMBIGU</span>}</td></tr>)}</tbody></table></div> : <div className="empty"><History size={24}/><b>Belum ada transaksi selesai</b><span>Pasang order dan lanjutkan replay untuk menguji keputusan Anda.</span></div>; }
export default function Terminal({ initialPage = 'terminal' }: {
    initialPage?: 'terminal' | 'data';
}) {
    const [data, setData] = useState<Dataset>(() => sampleDataset()), [session, setSession] = useState<Session | null>(null), [page, setPage] = useState<'terminal' | 'data' | 'guide'>(initialPage), [tab, setTab] = useState<'pine' | 'trades' | 'backtest' | 'journal'>('pine'), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [tool, setTool] = useState<Tool>('cursor'), [selected, setSelected] = useState<string | null>(null), [undo, setUndo] = useState<Drawing[][]>([]), [redo, setRedo] = useState<Drawing[][]>([]), [message, setMessage] = useState(''), [modal, setModal] = useState<'account' | 'sessions' | 'jump' | null>(null), [accountDraft, setAccountDraft] = useState<Config>({ ...DEFAULT_CONFIG }), [deposit, setDeposit] = useState('1000'), [lot, setLot] = useState('0.10'), [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market'), [orderPrice, setOrderPrice] = useState(''), [sl, setSl] = useState(''), [tp, setTp] = useState(''), [orderError, setOrderError] = useState(''), [spreadDraft, setSpreadDraft] = useState('0.25'), [spreadUnit, setSpreadUnit] = useState<Config['spreadUnit']>('pip'), [spreadSource, setSpreadSource] = useState<Config['spreadSource']>('manual'), [jump, setJump] = useState(''), [pine, setPine] = useState<PineResult | null>(null), [pineError, setPineError] = useState<{
        line: number;
        message: string;
    } | null>(null), [running, setRunning] = useState(false), [activeScript, setActiveScript] = useState(INDICATOR_EXAMPLE), [inputs, setInputs] = useState<Record<string, unknown>>({}), [btConfig, setBtConfig] = useState<Config>({ ...DEFAULT_CONFIG }), [btLot, setBtLot] = useState('0.10'), [btFrom, setBtFrom] = useState(''), [btTo, setBtTo] = useState(''), [saved, setSaved] = useState<{
        id: string;
        payload: Session;
        updatedAt: number;
    }[]>([]), [scripts, setScripts] = useState<{
        name: string;
        source: string;
    }[]>([]), [scriptName, setScriptName] = useState('Dua EMA'), [saveState, setSaveState] = useState('Tersimpan di perangkat'), [panel, setPanel] = useState(true), [fullscreen, setFullscreen] = useState(false);
    const worker = useRef<Worker | null>(null), job = useRef(0), editor = useRef<HTMLTextAreaElement>(null), lastRef = useRef<Session | null>(null), serverReady = useRef(false);
    lastRef.current = session;
    const toast = (m: string) => { setMessage(m); setTimeout(() => setMessage(''), 4500); };
    useEffect(() => {
        if (IS_PAGES) {
            let cancelled = false;
            (async () => {
                const demo = sampleDataset();
                let active = null;
                try { active = await restoreActive<Session>(); setSaved(await listLocalSessions<Session>()); }
                catch { setSaveState('Penyimpanan browser tidak tersedia'); }
                if (cancelled) return;
                const dataset = active?.data ?? demo;
                const restored = active?.session ?? initial(dataset);
                restored.index = Math.max(0, Math.min(restored.index, dataset.candles.length - 1));
                setData(dataset); setSession(restored);
                setBtFrom(localDate(dataset.candles[0].time));
                setBtTo(localDate(dataset.candles[restored.index].time));
                try { setScripts(JSON.parse(localStorage.getItem('rr-scripts') ?? '[]')); } catch { }
            })();
            return () => { cancelled = true; worker.current?.terminate(); };
        }
        const demo = sampleDataset();
        let next: Session = initial(demo);
        try {
            const local = JSON.parse(localStorage.getItem('rr-session') ?? 'null');
            const localData = JSON.parse(localStorage.getItem('rr-dataset') ?? 'null');
            if (localData?.candles?.length && local?.datasetId === localData.id) {
                setData(localData);
                next = local;
            }
            else if (local?.datasetId === demo.id)
                next = local;
            setScripts(JSON.parse(localStorage.getItem('rr-scripts') ?? '[]'));
        }
        catch { }
        setSession(next);
        setBtFrom(localDate(demo.candles[0].time));
        setBtTo(localDate(demo.candles[next.index].time));
        siteFetch('/api/sessions').then(r => readApi<Reply>(r)).then(x => { serverReady.current = !x.error; setSaved(x.sessions ?? []); }).catch(() => { });
        return () => worker.current?.terminate();
    }, []);
    useEffect(() => {
        if (!session)
            return;
        if (IS_PAGES) {
            const timer = setTimeout(() => {
                persistActive(session, data).then(() => setSaveState('Tersimpan di browser ini'))
                    .catch(() => setSaveState('Penyimpanan browser penuh atau tidak tersedia'));
            }, 250);
            return () => clearTimeout(timer);
        }
        try {
            localStorage.setItem('rr-session', JSON.stringify(session));
            if (data.id.startsWith('local-'))
                localStorage.setItem('rr-dataset', JSON.stringify(data));
            else
                localStorage.removeItem('rr-dataset');
            setSaveState('Tersimpan di perangkat');
        }
        catch {
            setSaveState('Penyimpanan perangkat penuh');
        }
        const timer = setTimeout(() => {
            if (!serverReady.current || data.id.startsWith('local-'))
                return;
            siteFetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: session.id, payload: session }) }).then(r => readApi<Reply>(r)).then(x => setSaveState(x.ok ? 'Sesi tersimpan' : 'Simpan lokal · ' + (x.error ?? 'offline'))).catch(() => setSaveState('Simpan lokal · offline'));
        }, 1800);
        return () => clearTimeout(timer);
    }, [session, data]);
    const branch = session?.branches.find(b => b.id === session.active) ?? session?.branches[0];
    const config = useMemo(() => branch && session ? branch.events.filter(e => e.index <= session.index && e.kind === 'config').reduce((c, e) => ({ ...c, ...e.config }), session.config) : DEFAULT_CONFIG, [session, branch]);
    const current = session ? data.candles[session.index] ?? data.candles[0] : data.candles[0];
    const account = useMemo(() => simulate(data, session?.config ?? DEFAULT_CONFIG, branch?.events ?? [], session?.index ?? 0), [data, session?.config, branch?.events, session?.index]);
    const amounts = metrics(account, current, data.symbol, config), q = quotes(current, config, data.symbol);
    const bars = useMemo(() => aggregate(data.candles, data.minutes, session?.timeframe ?? data.minutes, session?.index ?? 0), [data, session?.timeframe, session?.index]);
    const visiblePine = pine?.plots ?? [];
    const stats = report(account, session?.config ?? DEFAULT_CONFIG);
    const drawing = session?.drawings.find(d => d.id === selected);
    useEffect(() => {
        if (!playing || !session)
            return;
        const timer = setInterval(() => setSession(s => {
            if (!s)
                return s;
            if (s.index >= data.candles.length - 1) {
                setPlaying(false);
                return s;
            }
            const index = s.index + 1;
            return { ...s, index, branches: s.branches.map(b => b.id === s.active ? { ...b, furthest: Math.max(index, b.furthest) } : b) };
        }), 1000 / speed);
        return () => clearInterval(timer);
    }, [playing, speed, data.candles.length, session?.id]);
    const step = (delta: number) => {
        setPlaying(false);
        setSession(s => {
            if (!s)
                return s;
            const index = Math.max(0, Math.min(data.candles.length - 1, s.index + delta));
            return { ...s, index, branches: s.branches.map(b => b.id === s.active ? { ...b, furthest: Math.max(index, b.furthest) } : b) };
        });
    };
    const event = (input: Omit<Event, 'index'>) => {
        if (!session || !branch)
            return false;
        const e = { ...input, index: session.index };
        try {
            const test = simulate(data, session.config, [...branch.events, e], session.index);
            if (test.errors.length > account.errors.length) {
                throw new Error(test.errors.at(-1)!.message);
            }
            setSession(s => {
                if (!s)
                    return s;
                const b = s.branches.find(x => x.id === s.active)!;
                const next = branchEvent(b, { ...input, index: s.index });
                if (next.id !== b.id) {
                    toast('Keputusan baru disimpan sebagai ' + next.name);
                    return { ...s, active: next.id, branches: [...s.branches, next] };
                }
                return { ...s, branches: s.branches.map(x => x.id === b.id ? next : x) };
            });
            setOrderError('');
            return true;
        }
        catch (e) {
            setOrderError((e as Error).message);
            return false;
        }
    };
    const place = (side: 'buy' | 'sell') => {
        if (event({ kind: 'order', order: { id: crypto.randomUUID(), side, type: orderType, lot: decimal(lot), price: orderType === 'market' ? undefined : decimal(orderPrice), sl: sl.trim() ? decimal(sl) : undefined, tp: tp.trim() ? decimal(tp) : undefined } }))
            toast(`${side.toUpperCase()} ${lot} lot ${orderType === 'market' ? 'dibuka' : 'dipasang'}.`);
    };
    const changeDrawings = (drawings: Drawing[]) => {
        if (!session)
            return;
        setUndo(x => [...x, session.drawings].slice(-30));
        setRedo([]);
        setSession({ ...session, drawings });
    };
    const loadData = (d: Dataset) => { setPlaying(false); setData(d); const next = initial(d); setSession(next); setPage('terminal'); setPine(null); setUndo([]); setRedo([]); setSelected(null); setBtFrom(localDate(d.candles[0].time)); setBtTo(localDate(d.candles[next.index].time)); toast('Dataset ' + d.name + ' dibuka.'); };
    const run = (code = activeScript, backtest = false) => {
        if (!session)
            return;
        worker.current?.terminate();
        const id = ++job.current;
        setRunning(true);
        setPineError(null);
        let timer: ReturnType<typeof setTimeout>;
        try {
            const w = new Worker(new URL('../lib/pine.worker.ts', import.meta.url), { type: 'module' });
            worker.current = w;
            const known = Math.min(session.index, 4999);
            if (session.index > 4999) {
                throw new Error('Pine maksimal 5.000 candle; gunakan dataset yang lebih pendek.');
            }
            w.onmessage = e => {
                if (id !== job.current)
                    return;
                clearTimeout(timer);
                w.terminate();
                setRunning(false);
                if (e.data.ok) {
                    setPine(e.data.result);
                    if (backtest)
                        setTab('backtest');
                }
                else {
                    setPineError({ line: e.data.line, message: e.data.error });
                    setPine(null);
                }
            };
            w.onerror = () => { clearTimeout(timer); w.terminate(); setRunning(false); setPineError({ line: 1, message: 'Worker Pine gagal dimuat. Coba jalankan ulang.' }); };
            timer = setTimeout(() => {
                w.terminate();
                if (id === job.current) {
                    setRunning(false);
                    setPineError({ line: 1, message: 'Batas waktu 3 detik terlampaui.' });
                }
            }, 3000);
            w.postMessage({ source: code, data: { ...data, candles: data.candles.slice(0, known + 1) }, knownIndex: known, config: backtest ? btConfig : config, inputs, lot: decimal(btLot), range: backtest ? { from: Date.parse(btFrom + 'Z') / 1000, to: Math.min(current.time, Date.parse(btTo + 'Z') / 1000) } : undefined });
        }
        catch (e) {
            worker.current?.terminate();
            setRunning(false);
            setPineError({ line: 1, message: (e as Error).message });
        }
    };
    useEffect(() => {
        if (session && activeScript.includes('indicator(')) {
            const timer = setTimeout(() => run(activeScript), 150);
            return () => clearTimeout(timer);
        }
        if (pine && session && pine.account.curve.at(-1)?.time !== current.time)
            setPine(null);
    }, [session?.index, session?.datasetId, activeScript, inputs]);
    const saveSession = async () => {
        if (!session)
            return;
        try {
            if (IS_PAGES) await persistActive(session, data);
            const r = await siteFetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: session.id, payload: session }) }), body = await readApi<Reply>(r);
            if (!r.ok)
                throw new Error(body.error);
            toast(IS_PAGES ? 'Sesi tersimpan di browser ini.' : 'Sesi tersimpan di server.');
            setSaveState('Sesi tersimpan');
        }
        catch (e) {
            toast('Tersimpan di perangkat. ' + (e as Error).message);
        }
    };
    const openSession = async (s: Session) => {
        try {
            let d = data;
            if (s.datasetId === sampleDataset().id)
                d = sampleDataset();
            else if (s.datasetId !== data.id) {
                const r = await siteFetch('/api/datasets?id=' + s.datasetId);
                if (!r.ok)
                    throw new Error('Dataset sesi tidak lagi tersedia.');
                d = await readApi<Dataset>(r);
            }
            setData(d);
            setSession(s);
            setModal(null);
            setPlaying(false);
            setPine(null);
            setUndo([]);
            setRedo([]);
            setPage('terminal');
            toast('Sesi dipulihkan.');
        }
        catch (e) {
            toast((e as Error).message);
        }
    };
    const applyAccount = () => {
        try {
            validateConfig(accountDraft, data.symbol);
            const next = initial(data);
            next.config = { ...accountDraft };
            next.index = session?.index ?? next.index;
            next.branches[0].furthest = next.index;
            setSession(next);
            setBtConfig({ ...accountDraft });
            setModal(null);
            setPlaying(false);
            setPine(null);
            toast('Akun virtual baru dibuat.');
        }
        catch (e) {
            toast((e as Error).message);
        }
    };
    const highlighted = (session?.source ?? '').split(/(".*?"|\/\/[^\n]*|\b(?:if|true|false|var|input|indicator|strategy|plot|ta|color|math)\b|\b\d+(?:\.\d+)?\b)/g).map((part, i) => <span key={i} className={part.startsWith('//') ? 'syntax-comment' : part.startsWith('"') ? 'syntax-string' : /^(if|true|false|var|input|indicator|strategy|plot|ta|color|math)$/.test(part) ? 'syntax-keyword' : /^\d/.test(part) ? 'syntax-number' : ''}>{part}</span>);
    if (!session)
        return <div className="loading"><Activity /> Menyiapkan ruang latihan…</div>;
    return <div className={`app ${fullscreen ? 'focus-mode' : ''}`}><header className="topbar"><a className="brand" href={homeURL} aria-label="Ruang Replay"><span className="brand-mark"><Activity size={23}/></span><span>ruang<span className="brand-light">replay</span><small>LABORATORIUM TRADING</small></span></a><nav>{([{ id: 'terminal', label: 'Ruang latihan' }, { id: 'data', label: IS_PAGES ? 'Dataset' : 'Dataset & admin' }, { id: 'guide', label: 'Panduan' }] as const).map(n => <button className={page === n.id ? 'active' : ''} key={n.id} onClick={() => {
                setPage(n.id);
                if (n.id !== 'terminal')
                    setPlaying(false);
            }}>{n.label}</button>)}</nav><div className="header-end"><span className="virtual-pill"><span />AKUN VIRTUAL</span><button className="icon-button" title="Sesi tersimpan" onClick={() => { siteFetch('/api/sessions').then(r => readApi<Reply>(r)).then(x => setSaved(x.sessions ?? [])); setModal('sessions'); }} aria-label="Sesi tersimpan"><History size={19}/></button><button className="avatar" onClick={() => { setAccountDraft({ ...config }); setModal('account'); }} title="Pengaturan akun">TR</button></div></header>{page === 'data' ? <DataManager onUse={loadData} onMessage={toast}/> : page === 'guide' ? <main className="guide-page"><div className="page-eyebrow">CARA KERJA RUANG REPLAY</div><h1>Satu candle. Satu keputusan.</h1><p className="guide-intro">Latihan yang dapat diulang, dengan perhitungan yang dapat Anda periksa.</p><div className="guide-grid"><article><span className="step-number">01</span><h3>Pilih data, atur akun.</h3><p>Dataset contoh bersifat sintetis. Gunakan Dataset & admin untuk impor CSV/TSV MT5. OHLC diasumsikan sebagai harga Bid. Setiap timestamp adalah waktu buka candle; replay menampilkan candle tersebut setelah selesai.</p></article><article><span className="step-number">02</span><h3>Replay tanpa masa depan.</h3><p>Play, langkah maju/mundur, atau pilih waktu UTC. Timeframe besar dibentuk dari candle yang sudah tersedia; candle terakhir bisa parsial. Saat mundur, akun dihitung ulang. Keputusan berbeda membuat cabang, dan sesi asal tetap tersimpan.</p></article><article><span className="step-number">03</span><h3>Bid, Ask, dan biaya.</h3><p>Ask = Bid + spread. Buy masuk di Ask dan keluar di Bid; sell sebaliknya. Spread manual memakai pip, point, atau harga. Spread dataset memakai point MT5. Keduanya tidak dijumlahkan. Slippage berlaku sebagai point harga secara merugikan pada fill.</p></article><article><span className="step-number">04</span><h3>Margin berbeda dari profit.</h3><p>P/L = arah × lot × contract size × perubahan harga × kurs. Margin = lot × contract size × harga Bid × kurs ÷ leverage. Margin dihitung dengan model linear notional; simbol inverse/futures membutuhkan model lain. Kurs mata uang akun harus Anda isi bila berbeda dari mata uang profit.</p></article><article><span className="step-number">05</span><h3>Model eksekusi OHLC.</h3><p>Order manual di close candle yang terlihat. Sinyal strategi masuk di open berikutnya. Pending order memakai open ketika terjadi gap. Jika SL dan TP kena dalam satu candle, SL dipilih dan diberi label ambigu. Entry pending dan exit dalam candle sama juga ambigu. Tidak ada simulasi tick atau stop-out otomatis.</p></article><article><span className="step-number">06</span><h3>Pine 5/6 terbatas.</h3><p>Interpreter internal mendukung assignment, if, operator, histori [n], input, plot, hline, SMA/EMA/RMA/RSI/ATR, highest/lowest/stdev, crossover/crossunder, entry, close, exit stop/limit absolut. Loop, array, fungsi buatan pengguna, request.*, multi-timeframe Pine, dan sebagian besar API Pine belum didukung.</p><p>Strategi memakai satu posisi arah tanpa pyramiding; qty ditafsirkan sebagai lot. Input akun/backtest di layar mengatur biaya. Batas: 5.000 candle, 24 KB kode, 5 juta operasi, timeout worker 3 detik. Struktur data dibatasi; browser tidak menyediakan batas heap memori keras.</p></article></div><details open><summary>Transparansi data dan statistik</summary><p>Net profit adalah jumlah P/L bersih transaksi yang ditutup. Profit factor = total keuntungan ÷ total kerugian absolut. Win rate memakai transaksi tertutup. Drawdown dihitung dari equity per close candle, setelah mengeluarkan setoran virtual. Posisi yang masih terbuka ditampilkan terpisah; tidak dilikuidasi paksa pada akhir backtest. Semua sesi tersimpan menurut identitas pengunjung; sesi anonim terikat cookie perangkat, sesi masuk terikat akun ChatGPT.</p></details><div className="info-banner"><Info size={18}/><div><b>Pustaka & atribusi</b><span>Chart oleh TradingView Lightweight Charts 5.2.1 (Apache-2.0). Interpreter Pine internal, bukan mesin TradingView.</span></div><a target="_blank" rel="noreferrer" href="https://www.tradingview.com/">TradingView <ArrowUpRight size={14}/></a></div><button className="primary" onClick={() => setPage('terminal')}>Mulai latihan <ArrowRight size={16}/></button></main> : <main className="terminal"><section className="sessionbar"><div><div className="page-eyebrow">RUANG LATIHAN</div><div className="session-name"><input value={session.name} aria-label="Nama sesi" onChange={e => setSession({ ...session, name: e.target.value })}/><ChevronDown size={14}/><span className="session-date">{data.symbol.symbol} / M{data.minutes}</span></div></div><div className="session-actions"><span className="save-status"><Check size={13}/>{saveState}</span><button onClick={saveSession}><Save size={14}/> Simpan sesi</button><button className="icon-button" onClick={() => { setAccountDraft({ ...config }); setModal('account'); }} aria-label="Pengaturan akun"><Settings2 size={17}/></button></div></section><section className="metrics-strip">{([{ label: 'Balance', value: amounts.balance }, { label: 'Equity', value: amounts.equity }, { label: 'Floating P/L', value: amounts.floating }, { label: 'Margin', value: amounts.margin }, { label: 'Free margin', value: amounts.freeMargin }] as const).map((m, i) => <div key={m.label}><span>{m.label}{i === 2 && <span className="live-dot"/>}</span><strong className={i === 2 ? m.value >= 0 ? 'positive' : 'negative' : ''}>{money(m.value, config.currency)}</strong></div>)}<div className="leverage-metric"><span>Leverage</span><strong>1:{config.leverage}</strong></div></section><div className="workspace-top"><button className="instrument-button" onClick={() => setPage('data')}><span className="instrument-icon">€</span><div><strong>{data.symbol.symbol}</strong><span>{data.sample ? 'Dataset sintetis' : 'Dataset MT5'}</span></div><ChevronDown size={15}/></button><div className="timeframe-group">{[...new Set([data.minutes, ...[5, 15, 30, 60, 240, 1440].filter(m => m >= data.minutes && m % data.minutes === 0)])].map(m => <button key={m} className={session.timeframe === m ? 'active' : ''} onClick={() => setSession({ ...session, timeframe: m })}>{m < 60 ? `M${m}` : m < 1440 ? `H${m / 60}` : 'D1'}</button>)}</div><div className="replay-controls"><button className="icon-button" title="Mundur satu candle" onClick={() => step(-1)} disabled={!session.index} aria-label="Mundur satu candle"><ArrowLeft size={16}/></button><button className="play-button" title={playing ? 'Pause' : 'Play replay'} onClick={() => setPlaying(!playing)} disabled={session.index === data.candles.length - 1}>{playing ? <Pause size={16}/> : <Play size={16} fill="currentColor"/>}<span>{playing ? 'Pause' : 'Replay'}</span></button><button className="icon-button" onClick={() => step(1)} disabled={session.index === data.candles.length - 1} aria-label="Maju satu candle"><ArrowRight size={16}/></button><select aria-label="Kecepatan replay" value={speed} onChange={e => setSpeed(+e.target.value)}>{[.5, 1, 2, 4, 8].map(v => <option key={v} value={v}>{v}×</option>)}</select><span className="control-separator"/><button className="replay-time" onClick={() => { setJump(localDate(current.time)); setModal('jump'); }}><History size={13}/>{stamp(current.time)}<ChevronDown size={12}/></button></div><button className="icon-button chart-expand" onClick={() => setFullscreen(!fullscreen)} aria-label="Fokus chart"><Maximize2 size={16}/></button></div><div className={`workspace ${panel ? '' : 'without-panel'}`}><div className="drawing-tools">{tools.map(t => <button key={t.id} className={tool === t.id ? 'active' : ''} title={t.label} onClick={() => setTool(t.id)} aria-label={t.label}><t.Icon size={18}/></button>)}<span className="tool-divider"/><button title="Undo gambar" disabled={!undo.length} onClick={() => { const previous = undo.at(-1)!; setRedo([...redo, session.drawings]); setUndo(undo.slice(0, -1)); setSession({ ...session, drawings: previous }); }} aria-label="Undo gambar"><Undo2 size={17}/></button><button title="Redo gambar" disabled={!redo.length} onClick={() => { const next = redo.at(-1)!; setUndo([...undo, session.drawings]); setRedo(redo.slice(0, -1)); setSession({ ...session, drawings: next }); }} aria-label="Redo gambar"><Redo2 size={17}/></button><button title="Hapus gambar dipilih" disabled={!selected} onClick={() => { changeDrawings(session.drawings.filter(d => d.id !== selected)); setSelected(null); }} aria-label="Hapus gambar"><Trash2 size={17}/></button></div><section className="chart-area"><TradingChart bars={bars} symbol={data.symbol} minutes={session.timeframe} baseMinutes={data.minutes} knownTime={current.time} datasetId={data.id} tool={tool} drawings={session.drawings} selected={selected} onSelect={setSelected} onChange={changeDrawings} onTool={setTool} plots={visiblePine} positions={account.positions}/>{drawing && <div className="drawing-editor"><span>Edit {drawing.type}</span><input aria-label="Harga anchor A" type="number" step="any" value={drawing.a.price} onChange={e => changeDrawings(session.drawings.map(d => d.id === drawing.id ? { ...d, a: { ...d.a, price: +e.target.value } } : d))}/>{drawing.type === 'text' && <input aria-label="Teks gambar" value={drawing.text} onChange={e => changeDrawings(session.drawings.map(d => d.id === drawing.id ? { ...d, text: e.target.value } : d))}/>}<input aria-label="Warna gambar" type="color" value={drawing.color} onChange={e => changeDrawings(session.drawings.map(d => d.id === drawing.id ? { ...d, color: e.target.value } : d))}/><button className="icon-button" onClick={() => setSelected(null)} aria-label="Tutup edit gambar"><X size={13}/></button></div>}<div className="replay-progress"><span className="pill green">{playing ? 'REPLAY BERJALAN' : 'REPLAY SIAP'}</span><input type="range" min="0" max={data.candles.length - 1} value={session.index} aria-label="Posisi replay" onChange={e => { setPlaying(false); const index = +e.target.value; setSession({ ...session, index, branches: session.branches.map(b => b.id === session.active ? { ...b, furthest: Math.max(index, b.furthest) } : b) }); }}/><span>{session.index + 1} / {data.candles.length} candle</span><span className="partial-label" title="Timeframe besar hanya memakai data sampai replay">{session.timeframe > data.minutes ? 'HTF parsial' : 'Per candle'}</span><button className="icon-button" onClick={() => setPanel(!panel)} aria-label="Tampilkan/sembunyikan panel order"><PanelRightClose size={15}/></button></div></section>{panel && <aside className="order-panel"><div className="panel-head"><h3>Order baru</h3><span className="pill">VIRTUAL</span></div><div className="quote-row"><div><span>BID</span><b>{q.bid.toFixed(data.symbol.digits)}</b></div><span className="quote-divider"/><div><span>ASK</span><b>{q.ask.toFixed(data.symbol.digits)}</b></div></div><label>Jenis order<select value={orderType} onChange={e => setOrderType(e.target.value as typeof orderType)}><option value="market">Market · harga saat ini</option><option value="limit">Limit order</option><option value="stop">Stop order</option></select></label><div className="lot-field"><label>Ukuran posisi <span>lot</span></label><div><button onClick={() => setLot(Math.max(data.symbol.minLot, decimal(lot) - data.symbol.lotStep).toFixed(2))} aria-label="Kurangi lot">−</button><input aria-label="Lot order" inputMode="decimal" value={lot} onChange={e => setLot(e.target.value)}/><button onClick={() => setLot(Math.min(data.symbol.maxLot, decimal(lot) + data.symbol.lotStep).toFixed(2))} aria-label="Tambah lot">+</button></div><small>{(decimal(lot) * data.symbol.contractSize).toLocaleString('id-ID')} unit · kontrak {data.symbol.contractSize.toLocaleString('id-ID')}</small></div>{orderType !== 'market' && <label>Harga {orderType}<input value={orderPrice} placeholder={q.bid.toFixed(data.symbol.digits)} inputMode="decimal" onChange={e => setOrderPrice(e.target.value)}/></label>}<div className="sl-tp"><label>Stop loss<input placeholder="Opsional" inputMode="decimal" value={sl} onChange={e => setSl(e.target.value)}/></label><label>Take profit<input placeholder="Opsional" inputMode="decimal" value={tp} onChange={e => setTp(e.target.value)}/></label></div><div className="trade-buttons"><button className="sell-button" onClick={() => place('sell')}><ArrowLeft size={15}/> SELL</button><button className="buy-button" onClick={() => place('buy')}>BUY <ArrowRight size={15}/></button></div><p className="order-caption">{orderType === 'market' ? 'Eksekusi pada close candle yang terlihat.' : 'Order dipicu pada candle berikutnya.'}</p>{orderError && <div className="error-box">{orderError}</div>}<div className="spread-box"><div className="section-label"><span>SPREAD</span><span>{q.spread.toFixed(data.symbol.digits)} harga</span></div><select aria-label="Sumber spread" value={spreadSource} onChange={e => setSpreadSource(e.target.value as typeof spreadSource)}><option value="manual">Manual</option><option value="dataset" disabled={!data.candles.every(b => b.spread !== undefined)}>Dari dataset · point MT5</option></select>{spreadSource === 'manual' && <><div className="spread-input-row"><input aria-label="Spread desimal" inputMode="decimal" value={spreadDraft} onChange={e => setSpreadDraft(e.target.value)}/><select aria-label="Satuan spread" value={spreadUnit} onChange={e => setSpreadUnit(e.target.value as typeof spreadUnit)}><option value="pip">pip</option><option value="point">point MT5</option><option value="price">harga</option></select></div><input type="range" aria-label="Slider spread 0 sampai 1" min="0" max="1" step="0.01" value={Math.min(1, Math.max(0, decimal(spreadDraft) || 0))} onChange={e => setSpreadDraft(e.target.value)}/><div className="range-labels"><span>0</span><span>0,5</span><span>1</span></div></>}<button className="subtle apply-spread" onClick={() => {
                    if (event({ kind: 'config', config: { spread: decimal(spreadDraft), spreadUnit, spreadSource } }))
                        toast('Spread diterapkan mulai candle ini.');
                }}>Terapkan spread <Check size={13}/></button><p>1 pip = {data.symbol.pip} · 1 point = {data.symbol.point}</p></div><div className="positions-mini"><div className="section-label"><span>POSISI TERBUKA</span><b>{account.positions.length}</b></div>{!account.positions.length ? <span className="muted small">Belum ada posisi. Mulai dengan order pertama.</span> : account.positions.map(p => <div className="position-card" key={p.id}><div><b className={p.side === 'buy' ? 'positive' : 'negative'}>{p.side.toUpperCase()} {p.lot} lot</b><span className={profit(p.side, p.lot, p.entry, p.side === 'buy' ? q.bid : q.ask, data.symbol, config) >= 0 ? 'positive' : 'negative'}>{money(profit(p.side, p.lot, p.entry, p.side === 'buy' ? q.bid : q.ask, data.symbol, config), config.currency)}</span></div><span>Entry {p.entry.toFixed(data.symbol.digits)} · SL {p.sl ?? '—'} · TP {p.tp ?? '—'}</span><div className="position-actions"><button onClick={() => { setSl(p.sl?.toString() ?? ''); setTp(p.tp?.toString() ?? ''); setSelected(null); setOrderError('Isi SL/TP di form lalu klik Terapkan SL/TP pada posisi ini.'); }}>Edit</button><button onClick={() => event({ kind: 'modify', id: p.id, sl: sl.trim() ? decimal(sl) : undefined, tp: tp.trim() ? decimal(tp) : undefined })}>Terapkan SL/TP</button><button onClick={() => event({ kind: 'close', id: p.id })}>Tutup</button></div></div>)}{!!account.pending.length && <><div className="section-label"><span>PENDING ORDER</span><b>{account.pending.length}</b></div>{account.pending.map(o => <div className="pending-item" key={o.id}><span>{o.side.toUpperCase()} {o.type} · {o.lot} @ {o.price}</span><button className="icon-button" onClick={() => event({ kind: 'cancel', id: o.id })} aria-label="Batalkan pending order"><X size={12}/></button></div>)}</>}<button className="topup-button" onClick={() => { setAccountDraft({ ...config }); setModal('account'); }}><Wallet size={14}/> Kelola saldo virtual <ArrowUpRight size={13}/></button></div></aside>}</div><section className="bottom-panel"><div className="bottom-tabs">{([{ id: 'pine', label: 'Pine Editor', Icon: Code2 }, { id: 'trades', label: 'Transaksi', Icon: History }, { id: 'backtest', label: 'Hasil backtest', Icon: ChartNoAxesCombined }, { id: 'journal', label: 'Jurnal', Icon: BookOpen }] as const).map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><t.Icon size={15}/>{t.label}{t.id === 'trades' && <span className="tab-count">{account.trades.length}</span>}</button>)}<div className="branch-control"><GitBranch size={13}/><select aria-label="Cabang sesi" value={session.active} onChange={e => { setPlaying(false); setSession({ ...session, active: e.target.value }); }}>{session.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div></div>{tab === 'pine' ? <div className="pine-layout"><div className="pine-editor-area"><div className="editor-toolbar"><input aria-label="Nama skrip" value={scriptName} onChange={e => setScriptName(e.target.value)}/><span className="pill">PINE 5/6 · TERBATAS</span><div className="editor-actions"><select aria-label="Buka skrip" value="" onChange={e => { const chosen = e.target.value; const source = chosen === 'indicator' ? INDICATOR_EXAMPLE : chosen === 'strategy' ? STRATEGY_EXAMPLE : scripts[+chosen].source; setSession({ ...session, source }); setPineError(null); }}><option value="">Buka skrip</option><option value="indicator">Contoh · Dua EMA</option><option value="strategy">Contoh · Strategi EMA</option>{scripts.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select><button className="icon-button" title="Simpan skrip" onClick={() => { const next = [...scripts.filter(s => s.name !== scriptName), { name: scriptName, source: session.source }]; setScripts(next); localStorage.setItem('rr-scripts', JSON.stringify(next)); toast('Skrip tersimpan di perangkat.'); }} aria-label="Simpan skrip"><Save size={15}/></button><button className="run-button" disabled={running} onClick={() => { setActiveScript(session.source); run(session.source, session.source.includes('strategy(')); }}><Play size={12} fill="currentColor"/>{running ? 'Menjalankan…' : 'Jalankan'}</button></div></div><div className="code-editor"><div className="line-numbers">{session.source.split('\n').map((_, i) => <span key={i} className={pineError?.line === i + 1 ? 'error-line' : ''}>{i + 1}</span>)}</div><div className="code-stack"><pre aria-hidden="true">{highlighted}{'\n'}</pre><textarea ref={editor} aria-label="Editor Pine Script" spellCheck={false} value={session.source} onChange={e => setSession({ ...session, source: e.target.value })} onKeyDown={e => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const target = e.currentTarget, start = target.selectionStart, end = target.selectionEnd;
                        setSession({ ...session, source: session.source.slice(0, start) + '    ' + session.source.slice(end) });
                        setTimeout(() => { target.selectionStart = target.selectionEnd = start + 4; }, 0);
                    }
                }}/></div></div>{pineError && <div className="pine-error"><button onClick={() => { const before = session.source.split('\n').slice(0, pineError.line - 1).join('\n').length + (pineError.line > 1 ? 1 : 0); editor.current?.focus(); editor.current?.setSelectionRange(before, before + session.source.split('\n')[pineError.line - 1]?.length); }}>Baris {pineError.line}</button>{pineError.message}</div>}</div><aside className="pine-info"><Code2 size={21}/><h4>Uji ide Anda.</h4><p>Indikator dan strategi hanya memakai candle sampai posisi replay.</p>{pine?.inputs.map(x => <label key={x.name}>{x.name}<input type={x.type==='bool'?'checkbox':x.type==='string'?'text':'number'} checked={x.type==='bool'?Boolean(inputs[x.name]??x.value):undefined} value={x.type==='bool'?undefined:String(inputs[x.name]??x.value)} onChange={e=>setInputs({...inputs,[x.name]:x.type==='bool'?e.target.checked:x.type==='string'?e.target.value:+e.target.value})}/></label>)}<button className="text-button" onClick={() => setPage('guide')}>Lihat dukungan Pine <ArrowUpRight size={13}/></button><span className="small muted">{pine ? `${pine.plots.length} plot · ${pine.mode === 'strategy' ? pine.stats.trades + ' transaksi' : 'indikator aktif'}` : 'Timeframe dasar · 3 detik'}</span></aside></div> : tab === 'trades' ? <div className="tab-content"><div className="tab-toolbar"><span>{stats.trades} transaksi · <b className={stats.netProfit >= 0 ? 'positive' : 'negative'}>{money(stats.netProfit, config.currency)}</b> profit terealisasi</span><button onClick={() => download('transaksi-' + session.name + '.csv', csv(account.trades.map(t => ({ ...t, entryTime: stamp(t.entryTime), exitTime: stamp(t.exitTime) }))))} disabled={!account.trades.length}><Download size={14}/> Ekspor CSV</button></div><Trades trades={account.trades} currency={config.currency}/>{!!account.deposits.length && <details><summary>{account.deposits.length} setoran virtual · tercatat terpisah</summary>{account.deposits.map((d, i) => <div className="deposit-row" key={i}>{stamp(d.time)} <b>{money(d.amount, config.currency)}</b></div>)}</details>}{!!account.errors.length && <details><summary>{account.errors.length} order ditolak</summary>{account.errors.map((e, i) => <div key={i} className="error-box">Candle {e.index + 1}: {e.message}</div>)}</details>}</div> : tab === 'backtest' ? <div className="tab-content backtest-content"><div className="backtest-setup"><label>Dari · UTC<input type="datetime-local" value={btFrom} onChange={e => setBtFrom(e.target.value)}/></label><label>Sampai · UTC<input type="datetime-local" value={btTo} max={localDate(current.time)} onChange={e => setBtTo(e.target.value)}/></label><label>Modal awal<input type="number" value={btConfig.initial} onChange={e => setBtConfig({ ...btConfig, initial: +e.target.value })}/></label><label>Lot<input value={btLot} onChange={e => setBtLot(e.target.value)}/></label><label>Leverage<input type="number" value={btConfig.leverage} onChange={e => setBtConfig({ ...btConfig, leverage: +e.target.value })}/></label><label>Spread (pip)<input type="number" step="any" value={btConfig.spread} onChange={e => setBtConfig({ ...btConfig, spread: +e.target.value, spreadUnit: 'pip', spreadSource: 'manual' })}/></label><label>Komisi /lot/sisi<input type="number" step="any" value={btConfig.commission} onChange={e => setBtConfig({ ...btConfig, commission: +e.target.value })}/></label><label>Slippage (point)<input type="number" step="any" value={btConfig.slippage} onChange={e => setBtConfig({ ...btConfig, slippage: +e.target.value })}/></label><button className="primary" disabled={running} onClick={() => {
                    if (!session.source.includes('strategy(')) {
                        setPineError({ line: 2, message: 'Gunakan skrip strategy() untuk backtest.' });
                        setTab('pine');
                        return;
                    }
                    if (!btFrom || !btTo || btFrom > btTo) {
                        toast('Rentang tanggal tidak valid.');
                        return;
                    }
                    setActiveScript(session.source);
                    run(session.source, true);
                }}><Play size={13}/>{running ? 'Menghitung…' : 'Backtest'}</button></div><p className="muted small">Rentang otomatis dibatasi hingga candle replay. Kurs {btConfig.quoteToAccount} {btConfig.currency}/{data.symbol.quoteCurrency}. Ukuran qty Pine = lot; biaya diatur di form ini.</p>{pineError && <div className="error-box">Baris {pineError.line}: {pineError.message}</div>}{pine?.mode === 'strategy' ? <><div className="backtest-metrics">{[{ label: 'Net profit', value: money(pine.stats.netProfit, btConfig.currency) }, { label: 'Win rate', value: pine.stats.winRate.toFixed(1) + '%' }, { label: 'Profit factor', value: Number.isFinite(pine.stats.profitFactor) ? pine.stats.profitFactor.toFixed(2) : '∞' }, { label: 'Max drawdown', value: money(pine.stats.maxDrawdown, btConfig.currency) }, { label: 'Transaksi', value: String(pine.stats.trades) }].map(m => <div key={m.label}><span>{m.label}</span><strong>{m.value}</strong></div>)}</div><div className="equity-heading"><b>Kurva equity</b><button onClick={() => download('laporan-backtest.csv', csv([{ ...pine.stats, initial: btConfig.initial, currency: btConfig.currency, leverage: btConfig.leverage, openPositions: pine.account.positions.length }, { ...pine.stats, type: 'Aturan: SL dahulu, entry open berikutnya' }]))}><Download size={13}/> Laporan CSV</button><button disabled={!pine.account.trades.length} onClick={() => download('backtest-transaksi.csv', csv(pine.account.trades.map(t => ({ ...t }))))}><Download size={13}/> Transaksi CSV</button></div><EquityCurve values={pine.account.curve}/><p className="muted small">{pine.stats.ambiguous} transaksi ambigu · {pine.account.positions.length} posisi terbuka di akhir · {pine.account.errors.length} order ditolak</p><Trades trades={pine.account.trades} currency={btConfig.currency}/>{pine.account.errors.map((e, i) => <div className="error-box" key={i}>Candle {e.index + 1}: {e.message}</div>)}</> : <div className="empty"><ChartNoAxesCombined size={25}/><b>Strategi Anda, diuji dengan data.</b><span>Buka contoh Strategi EMA di Pine Editor, lalu jalankan backtest.</span><button onClick={() => { setSession({ ...session, source: STRATEGY_EXAMPLE }); setTab('pine'); }}>Buka contoh strategi <ArrowUpRight size={13}/></button></div>}</div> : <div className="journal-area"><div><BookOpen size={22}/><h3>Catat alasan di balik keputusan.</h3><p>Setup, emosi, dan pelajaran untuk latihan berikutnya. Jurnal tersimpan bersama sesi.</p></div><textarea aria-label="Jurnal trading" placeholder="Apa yang Anda lihat di chart? Mengapa entry di sini? Apa yang akan Anda perbaiki?" value={session.journal} onChange={e => setSession({ ...session, journal: e.target.value })}/><button onClick={() => download('jurnal-' + session.name + '.txt', session.journal, 'text/plain')}>Ekspor jurnal <Download size={14}/></button></div>}</section><footer className="statusbar"><span><span className="status-dot"/> {data.name}</span><span>{data.sample ? 'Data sintetis · untuk latihan' : 'Dataset MT5 · tanpa broker'}<span className="footer-divider">|</span>UTC<span className="footer-divider">|</span>OHLC per candle</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Chart oleh TradingView ↗</a></footer></main>}{message && <div className="toast" role="status"><Check size={17}/>{message}</div>}{modal && <div className="modal-shade"><section className="modal" role="dialog" aria-modal="true" aria-label={modal === 'account' ? 'Kelola akun' : modal === 'jump' ? 'Pilih waktu replay' : 'Sesi tersimpan'}><div className="modal-head"><h2>{modal === 'account' ? 'Akun trading virtual' : modal === 'jump' ? 'Pilih waktu replay' : 'Sesi tersimpan'}</h2><button className="icon-button" onClick={() => setModal(null)} aria-label="Tutup"><X size={18}/></button></div>{modal === 'account' ? <><div className="balance-summary"><Wallet size={23}/><div><span>Balance saat ini</span><strong>{money(amounts.balance, config.currency)}</strong></div></div><div className="deposit-form"><label>Tambah saldo virtual<input inputMode="decimal" value={deposit} onChange={e => setDeposit(e.target.value)}/></label><button className="primary" onClick={() => {
                    if (event({ kind: 'deposit', amount: decimal(deposit) })) {
                        toast('Setoran virtual dicatat terpisah.');
                        setModal(null);
                    }
                }}><Plus size={15}/> Tambah</button></div><hr /><h4>Buat akun & sesi baru</h4><p className="muted small">Mengubah modal, mata uang, atau model biaya membuat sesi baru. Sesi lama sudah tersimpan.</p><div className="form-grid"><label>Saldo awal<input type="number" value={accountDraft.initial} onChange={e => setAccountDraft({ ...accountDraft, initial: +e.target.value })}/></label><label>Mata uang akun<select value={accountDraft.currency} onChange={e => setAccountDraft({ ...accountDraft, currency: e.target.value, quoteToAccount: e.target.value === data.symbol.quoteCurrency ? 1 : accountDraft.quoteToAccount })}>{[...new Set(['USD', 'EUR', 'IDR', data.symbol.quoteCurrency])].map(c => <option key={c}>{c}</option>)}</select></label><label>Leverage<select value={accountDraft.leverage} onChange={e => setAccountDraft({ ...accountDraft, leverage: +e.target.value })}>{[1, 10, 30, 50, 100, 200, 500, 1000].map(l => <option key={l} value={l}>1:{l}</option>)}</select></label><label>Kurs {data.symbol.quoteCurrency} → {accountDraft.currency}<input type="number" min="0.000001" step="any" value={accountDraft.quoteToAccount} disabled={accountDraft.currency === data.symbol.quoteCurrency} onChange={e => setAccountDraft({ ...accountDraft, quoteToAccount: +e.target.value })}/></label><label>Komisi ({accountDraft.currency}/lot/sisi)<input type="number" min="0" step="any" value={accountDraft.commission} onChange={e => setAccountDraft({ ...accountDraft, commission: +e.target.value })}/></label><label>Slippage (point MT5)<input type="number" min="0" step="any" value={accountDraft.slippage} onChange={e => setAccountDraft({ ...accountDraft, slippage: +e.target.value })}/></label></div><div className="info-banner small">Contract size {data.symbol.contractSize.toLocaleString('id-ID')} · tick {data.symbol.tickSize} · pip {data.symbol.pip} · quote {data.symbol.quoteCurrency}</div><button className="primary full" onClick={applyAccount}>Buat sesi baru <ArrowRight size={15}/></button>{orderError && <div className="error-box">{orderError}</div>}</> : modal === 'jump' ? <><p>Pilih waktu buka candle dalam UTC. Candle terdekat sebelum waktu ini akan dipilih. Mundur memulihkan akun dan order.</p><label>Waktu · UTC<input type="datetime-local" value={jump} min={localDate(data.candles[0].time)} max={localDate(data.candles.at(-1)!.time)} onChange={e => setJump(e.target.value)}/></label><button className="primary full" onClick={() => {
                    const time = Date.parse(jump + 'Z') / 1000;
                    if (!Number.isFinite(time)) {
                        toast('Waktu tidak valid.');
                        return;
                    }
                    let index = data.candles.findLastIndex(b => b.time <= time);
                    index = Math.max(0, index);
                    setPlaying(false);
                    setSession({ ...session, index, branches: session.branches.map(b => b.id === session.active ? { ...b, furthest: Math.max(index, b.furthest) } : b) });
                    setModal(null);
                }}>Pindah ke candle <ArrowRight size={15}/></button></> : <>{saved.length ? saved.map(s => <div className="saved-session" key={s.id}><div><b>{s.payload.name}</b><span>{new Date(s.updatedAt).toLocaleString('id-ID')} · candle {s.payload.index + 1}</span></div><button onClick={() => openSession(s.payload)}>Buka</button><button className="icon-button" onClick={() => siteFetch('/api/sessions?id=' + s.id, { method: 'DELETE' }).then(() => setSaved(saved.filter(x => x.id !== s.id)))} aria-label="Hapus sesi tersimpan"><Trash2 size={15}/></button></div>) : <div className="empty">Belum ada sesi tersimpan. Gunakan tombol Simpan sesi.</div>}{IS_PAGES ? <><p className="muted small">Sesi dan dataset impor disimpan di browser ini. Membersihkan data browser akan menghapus simpanan. Gunakan cadangan sesi untuk memindahkannya.</p><button className="button" onClick={() => download("cadangan-ruang-replay.json", JSON.stringify({version:1,session,data}), "application/json")}>Unduh cadangan sesi <Download size={14}/></button><label className="button">Buka cadangan sesi<input type="file" accept=".json" hidden onChange={async e => {const file=e.target.files?.[0];if(!file)return;try{if(file.size>12000000)throw new Error("Cadangan maksimal 12 MB.");const backup=parseSessionBackup(await file.text());await persistActive(backup.session,backup.data);await openSession(backup.session);}catch(error){toast((error as Error).message);}}}/></label></> : <><p className="muted small">Sesi anonim terikat cookie browser. Masuk dengan ChatGPT untuk penyimpanan lintas perangkat. Dataset impor lokal tersimpan di perangkat ini.</p><a className="button" href="/signin-with-chatgpt?return_to=/" target="_top">Masuk dengan ChatGPT <ArrowUpRight size={14}/></a></>}</>}</section></div>}</div>;
}
