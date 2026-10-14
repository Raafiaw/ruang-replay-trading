'use client';
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Candle, Position, SymbolSpec } from '@/lib/engine';
import {alignPlot} from '@/lib/engine';
import { timeframeBucket, timeframeDescription } from '@/lib/timeframes';
import type { PineResult } from '@/lib/pine';
export type Tool = 'cursor' | 'horizontal' | 'vertical' | 'trend' | 'rectangle' | 'text' | 'fib' | 'risk';
export type Anchor = {
    time: number;
    price: number;
};
export type Drawing = {
    id: string;
    type: Tool;
    a: Anchor;
    b: Anchor;
    text: string;
    color: string;
};
type Props = {
    bars: Candle[];
    symbol: SymbolSpec;
    minutes: number;
baseMinutes:number;
knownTime:number;
    datasetId: string;
    tool: Tool;
    drawings: Drawing[];
    selected: string | null;
    onSelect: (id: string | null) => void;
    onChange: (d: Drawing[]) => void;
    onTool: (tool: Tool) => void;
    plots: PineResult['plots'];
    positions: Position[];
};
export default function TradingChart(props: Props) {
    const host = useRef<HTMLDivElement>(null), api = useRef<IChartApi | null>(null), candle = useRef<ISeriesApi<'Candlestick'> | null>(null), volume = useRef<ISeriesApi<'Histogram'> | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const [size, setSize] = useState({ width: 800, height: 470 }), [revision, setRevision] = useState(0), [hover, setHover] = useState<Candle | null>(null), [draft, setDraft] = useState<Drawing | null>(null);
    const drag = useRef<{
        id: string;
        part: 'a' | 'b' | 'move';
        start: Anchor;
        original: Drawing;
    } | null>(null), changedDataset = useRef('');
    useEffect(() => { if (!host.current)
        return; const chart = createChart(host.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: '#111b27' }, textColor: '#72889f', fontFamily: 'Inter, Segoe UI, sans-serif', fontSize: 11, attributionLogo: true }, grid: { vertLines: { color: '#1a2937' }, horzLines: { color: '#1a2937' } }, rightPriceScale: { borderColor: '#253545', minimumWidth: 72, scaleMargins: { top: .12, bottom: .2 } }, timeScale: { borderColor: '#253545', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 8 }, crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#6c8297', labelBackgroundColor: '#2b3e50' }, horzLine: { color: '#6c8297', labelBackgroundColor: '#2b3e50' } }, handleScroll: true, handleScale: true }); const series = chart.addSeries(CandlestickSeries, { upColor: '#36d6b5', downColor: '#ef7c88', borderVisible: false, wickUpColor: '#36d6b5', wickDownColor: '#ef7c88', priceFormat: { type: 'price', precision: props.symbol.digits, minMove: props.symbol.tickSize } }); const vols = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' }); vols.priceScale().applyOptions({ scaleMargins: { top: .85, bottom: 0 }, visible: false }); api.current = chart; candle.current = series; volume.current = vols; const refresh = () => setRevision(x => x + 1); chart.timeScale().subscribeVisibleLogicalRangeChange(refresh); chart.subscribeCrosshairMove(param => { const data = param.seriesData.get(series); setHover(data && "open" in data ? data as unknown as Candle : null); }); const observer = new ResizeObserver(entries => { const r = entries[0].contentRect; setSize({ width: r.width, height: r.height }); refresh(); }); observer.observe(host.current); return () => { observer.disconnect(); chart.remove(); api.current = null; }; }, []);
    useEffect(() => { if (!api.current || !candle.current || !volume.current)
        return; candle.current.applyOptions({ priceFormat: { type: 'price', precision: props.symbol.digits, minMove: props.symbol.tickSize } }); candle.current.setData(props.bars.map(b => ({ ...b, time: b.time as UTCTimestamp }))); volume.current.setData(props.bars.map(b => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? '#36d6b51e' : '#ef7c881e' }))); if (changedDataset.current !== props.datasetId + props.minutes) {
        changedDataset.current = props.datasetId + props.minutes;
        setHover(null);
        api.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, props.bars.length - 85), to: props.bars.length + 7 });
    } setRevision(x => x + 1); }, [props.bars, props.datasetId, props.minutes, props.symbol]);
    useEffect(() => { const chart = api.current; if (!chart)
        return; const added = props.plots.map(p => { const series = chart.addSeries(LineSeries, { color: p.color, lineWidth: 2, priceScaleId: p.overlay ? 'right' : 'indicator', lastValueVisible: false, priceLineVisible: false, title: p.name }, p.overlay ? 0 : 1); series.setData(alignPlot(p.values,props.baseMinutes,props.minutes,props.knownTime).map(v => ({ time: v.time as UTCTimestamp, value: v.value }))); return series; }); return () => { added.forEach(s => { try {
        chart.removeSeries(s);
    }
    catch { } }); }; }, [props.plots, props.bars, props.minutes, props.baseMinutes, props.knownTime]);
    useEffect(() => { const series = candle.current; if (!series)
        return; const lines = props.positions.flatMap(p => { const out = [series.createPriceLine({ price: p.entry, color: p.side === 'buy' ? '#36d6b5' : '#ef7c88', lineWidth: 1, lineStyle: 2, title: `${p.side.toUpperCase()} ${p.lot}` })]; if (p.sl)
        out.push(series.createPriceLine({ price: p.sl, color: '#ef7c88', lineWidth: 1, lineStyle: 2, title: 'SL' })); if (p.tp)
        out.push(series.createPriceLine({ price: p.tp, color: '#36d6b5', lineWidth: 1, lineStyle: 2, title: 'TP' })); return out; }); return () => lines.forEach(l => series.removePriceLine(l)); }, [props.positions]);
    const width = size.width - 72, height = size.height - 28;
    const xy = (a: Anchor) => { void revision; const chart = api.current, series = candle.current; if (!chart || !series)
        return null; const time = props.minutes===props.baseMinutes?a.time:timeframeBucket(a.time, props.minutes); let x = chart.timeScale().timeToCoordinate(time as UTCTimestamp); if (x === null) {
        const bars = props.bars, index = bars.findIndex(b => b.time >= time);
        if (index >= 0)
            x = chart.timeScale().logicalToCoordinate(index as any);
    } const y = series.priceToCoordinate(a.price); return x !== null && y !== null ? { x: Number(x), y: Number(y) } : null; };
    const anchor = (event: React.PointerEvent<SVGSVGElement>): Anchor | null => { const chart = api.current, series = candle.current; if (!chart || !series)
        return null; const rect = event.currentTarget.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top, logical = chart.timeScale().coordinateToLogical(x); if (logical === null)
        return null; const bars = latest.current.bars, index = Math.max(0, Math.min(bars.length - 1, Math.round(Number(logical)))), price = series.coordinateToPrice(y); return price === null || !bars[index] ? null : { time: bars[index].time, price: Number(price) }; };
    const begin = (e: React.PointerEvent<SVGElement>, id: string, part: 'a' | 'b' | 'move') => { e.stopPropagation(); if (props.tool !== 'cursor')
        return; const svg = e.currentTarget.ownerSVGElement; if (!svg)
        return; const rect = svg.getBoundingClientRect(), logical = api.current?.timeScale().coordinateToLogical(e.clientX - rect.left), price = candle.current?.coordinateToPrice(e.clientY - rect.top); const item = props.drawings.find(d => d.id === id); if (!item || logical == null || price == null)
        return; const index = Math.max(0, Math.min(props.bars.length - 1, Math.round(Number(logical)))); drag.current = { id, part, start: { time: props.bars[index].time, price: Number(price) }, original: structuredClone(item) }; setDraft(item); props.onSelect(id); svg.setPointerCapture(e.pointerId); };
    const down = (e: React.PointerEvent<SVGSVGElement>) => { if (e.target !== e.currentTarget)
        return; const a = anchor(e); if (!a)
        return; if (props.tool === 'cursor') {
        props.onSelect(null);
        return;
    } if (draft) {
        props.onChange([...props.drawings, { ...draft, b: a }]);
        setDraft(null);
        props.onTool('cursor');
        return;
    } const drawing: Drawing = { id: crypto.randomUUID(), type: props.tool, a, b: a, text: props.tool === 'text' ? 'Catatan trading' : '', color: '#6fa9ff' }; if (['horizontal', 'vertical', 'text'].includes(props.tool)) {
        props.onChange([...props.drawings, drawing]);
        props.onSelect(drawing.id);
        props.onTool('cursor');
    }
    else
        setDraft(drawing); };
    const move = (e: React.PointerEvent<SVGSVGElement>) => { const a = anchor(e); if (!a)
        return; if (drag.current) {
        const d = drag.current;
        const next = { ...d.original };
        if (d.part === 'move') {
            const dt = a.time - d.start.time, dp = a.price - d.start.price;
            next.a = { time: d.original.a.time + dt, price: d.original.a.price + dp };
            next.b = { time: d.original.b.time + dt, price: d.original.b.price + dp };
        }
        else
            next[d.part] = a;
        setDraft(next);
    }
    else if (draft)
        setDraft({ ...draft, b: a }); };
    const up = () => { if (drag.current && draft) {
        props.onChange(props.drawings.map(d => d.id === draft.id ? draft : d));
        drag.current = null;
        setDraft(null);
    } };
    const shown = hover ?? props.bars.at(-1);
    const all = [...props.drawings.filter(d => d.id !== draft?.id), ...(draft ? [draft] : [])];
    return <div className="chart-shell"><div className="chart-legend"><strong>{props.symbol.symbol}</strong><span>· {timeframeDescription(props.minutes)}</span><span className="legend-badge">OHLC · BID</span>{shown && <div className="ohlc">O <b>{shown.open.toFixed(props.symbol.digits)}</b> H <b>{shown.high.toFixed(props.symbol.digits)}</b> L <b>{shown.low.toFixed(props.symbol.digits)}</b> C <b className={shown.close >= shown.open ? 'positive' : 'negative'}>{shown.close.toFixed(props.symbol.digits)}</b></div>}</div><div ref={host} className="chart-host"/><svg className={`draw-layer ${props.tool === 'cursor' ? 'pass' : 'drawing'}`} width={Math.max(1, width)} height={Math.max(1, height)} onPointerDown={down} onPointerMove={move} onPointerUp={up} aria-label="Lapisan alat gambar">{all.map(d => { const a = xy(d.a), b = xy(d.b); if (!a || !b)
        return null; const selected = props.selected === d.id, color = selected ? '#c5dcff' : d.color; const hit = (part: 'a' | 'b' | 'move') => (e: React.PointerEvent<SVGElement>) => begin(e, d.id, part); let shape: React.ReactNode; if (d.type === 'horizontal')
        shape = <line x1="0" x2={width} y1={a.y} y2={a.y}/>;
    else if (d.type === 'vertical')
        shape = <line x1={a.x} x2={a.x} y1="0" y2={height}/>;
    else if (d.type === 'trend')
        shape = <line x1={a.x} x2={b.x} y1={a.y} y2={b.y}/>;
    else if (d.type === 'rectangle')
        shape = <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.max(8, Math.abs(a.x - b.x))} height={Math.max(8, Math.abs(a.y - b.y))} fill={d.color + '22'}/>;
    else if (d.type === 'text')
        shape = <text x={a.x} y={a.y} fontSize="13" fill={color} stroke="none">{d.text}</text>;
    else if (d.type === 'fib')
        shape = <>{[0, .236, .382, .5, .618, .786, 1].map(r => <g key={r}><line x1={a.x} x2={b.x} y1={a.y + (b.y - a.y) * r} y2={a.y + (b.y - a.y) * r}/><text x={Math.max(a.x, b.x) + 4} y={a.y + (b.y - a.y) * r - 3} fill={color} stroke="none" fontSize="10">{r} · {(d.a.price + (d.b.price - d.a.price) * r).toFixed(props.symbol.digits)}</text></g>)}</>;
    else if (d.type === 'risk') {
        const tp = xy({ time: d.b.time, price: d.a.price + 2 * (d.a.price - d.b.price) })!;
        shape = <><rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.max(70, Math.abs(a.x - b.x))} height={Math.abs(a.y - b.y)} fill="#ef7c8830" stroke="#ef7c88"/><rect x={Math.min(a.x, b.x)} y={Math.min(a.y, tp.y)} width={Math.max(70, Math.abs(a.x - b.x))} height={Math.abs(a.y - tp.y)} fill="#36d6b526" stroke="#36d6b5"/><text x={Math.min(a.x, b.x) + 7} y={a.y - 7} fill="#c3d6e7" stroke="none" fontSize="11">R:R 2,00 · Risiko {Math.abs(d.a.price - d.b.price).toFixed(props.symbol.digits)}</text></>;
    } return <g key={d.id} stroke={color} strokeWidth={selected ? 2 : 1.2} fill="none" className="drawing-object"><g onPointerDown={hit('move')}>{shape}</g>{selected && <><circle cx={a.x} cy={a.y} r="5" fill="#111b27" onPointerDown={hit('a')}/>{!['horizontal', 'vertical', 'text'].includes(d.type) && <circle cx={b.x} cy={b.y} r="5" fill="#111b27" onPointerDown={hit('b')}/>}</>}</g>; })}</svg>{!props.bars.length && <div className="empty chart-empty">Belum ada candle tersedia.</div>}<div className="chart-note">{props.tool !== 'cursor' ? `Klik ${draft ? 'titik kedua untuk selesai' : 'chart untuk menggambar'}` : 'Geser untuk berpindah · Scroll untuk zoom'}</div></div>;
}
