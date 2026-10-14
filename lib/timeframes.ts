export const TIMEFRAMES = [
    { minutes: 1, label: 'M1', description: '1 menit' },
    { minutes: 2, label: 'M2', description: '2 menit' },
    { minutes: 3, label: 'M3', description: '3 menit' },
    { minutes: 5, label: 'M5', description: '5 menit' },
    { minutes: 10, label: 'M10', description: '10 menit' },
    { minutes: 15, label: 'M15', description: '15 menit' },
    { minutes: 30, label: 'M30', description: '30 menit' },
    { minutes: 60, label: 'H1', description: '1 jam' },
    { minutes: 120, label: 'H2', description: '2 jam' },
    { minutes: 240, label: 'H4', description: '4 jam' },
    { minutes: 1440, label: 'D1', description: '1 hari' },
    { minutes: 10080, label: 'W1', description: '1 minggu' },
] as const;

export function timeframeLabel(minutes: number): string {
    if (minutes % 10080 === 0) return `W${minutes / 10080}`;
    if (minutes % 1440 === 0) return `D${minutes / 1440}`;
    if (minutes % 60 === 0) return `H${minutes / 60}`;
    return `M${minutes}`;
}

export function timeframeDescription(minutes: number): string {
    return TIMEFRAMES.find(timeframe => timeframe.minutes === minutes)?.description
        ?? `${minutes} menit`;
}

export function canAggregate(base: number, target: number): boolean {
    return Number.isInteger(base) && base > 0 && Number.isInteger(target)
        && target >= base && target % base === 0;
}

export function chartTimeframes(base: number) {
    return [...new Set([...TIMEFRAMES.map(timeframe => Number(timeframe.minutes)), base])]
        .sort((a, b) => a - b)
        .map(minutes => ({ minutes, label: timeframeLabel(minutes), available: canAggregate(base, minutes) }));
}

export function timeframeFromFilename(filename: string): number | undefined {
    const matches = TIMEFRAMES.filter(({ label }) =>
        new RegExp(`(?:^|[_.\\s-])${label}(?=$|[_.\\s-])`, 'i').test(filename));
    return matches.length === 1 ? matches[0].minutes : undefined;
}

// Daily bars use midnight UTC; weekly bars start on Monday at midnight UTC.
// January 5, 1970 is the first Monday after the Unix epoch.
export function timeframeBucket(time: number, minutes: number): number {
    const seconds = minutes * 60;
    const origin = minutes % 10080 === 0 ? 4 * 86400 : 0;
    return Math.floor((time - origin) / seconds) * seconds + origin;
}
