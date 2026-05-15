import type { TimeframeDefinition } from './types';

export const timeframes: TimeframeDefinition[] = [
  { id: '1m', label: '1 分钟', minutes: 1, color: '#38bdf8' },
  { id: '5m', label: '5 分钟', minutes: 5, color: '#22c55e' },
  { id: '15m', label: '15 分钟', minutes: 15, color: '#facc15' },
  { id: '60m', label: '60 分钟', minutes: 60, color: '#fb7185' },
  { id: '1d', label: '日线', minutes: 1440, color: '#a78bfa' },
];

export function findTimeframeIndex(timeframeId: string): number {
  const index = timeframes.findIndex((timeframe) => timeframe.id === timeframeId);
  if (index === -1) {
    throw new Error(`Unknown timeframe: ${timeframeId}`);
  }
  return index;
}
