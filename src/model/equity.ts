import type { Fill } from '../model/market';

export interface EquityPoint {
  time: number;
  equity: number;
}

export function buildEquityCurve(fills: Fill[], startCapital: number): EquityPoint[] {
  const points: EquityPoint[] = [{ time: fills.at(-1)?.time ?? Date.now(), equity: startCapital }];
  if (fills.length === 0) return points;

  let equity = startCapital;
  const chronological = [...fills].reverse();
  for (const fill of chronological) {
    equity += fill.realizedPnl;
    points.push({ time: fill.time, equity });
  }
  return points;
}
