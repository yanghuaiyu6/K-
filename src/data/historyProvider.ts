import {
  TIMEFRAMES,
  generateMarketData,
  getHistorySource,
  historyBarCount,
  roundToTick,
  type Candle,
  type HistorySource,
  type MarketSymbol,
  type Timeframe,
} from '../model/market';

export type FeedMode = 'auto' | 'live' | 'simulated';

export interface HistoryLoadResult {
  candles: Candle[];
  feed: 'live' | 'simulated';
  label: string;
  detail: string;
}

/** OKX 公共行情映射；无映射时回退本地模拟长序列 */
const OKX_INST: Record<string, string> = {
  BTCUSD: 'BTC-USDT',
  ETHUSD: 'ETH-USDT',
  SOLUSD: 'SOL-USDT',
  BNBUSD: 'BNB-USDT',
  XAUUSD: 'XAU-USDT',
  XAGUSD: 'XAG-USDT',
  EURUSD: 'EUR-USDT',
  GBPUSD: 'GBP-USDT',
  USDJPY: 'JPY-USDT',
  AUDUSD: 'AUD-USDT',
};

const OKX_BAR: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
};

function okxToCandles(rows: string[][], tickSize: number): Candle[] {
  // OKX returns newest first: [ts, o, h, l, c, vol, ...]
  return [...rows]
    .reverse()
    .map((row) => ({
      time: Number(row[0]),
      open: roundToTick(Number(row[1]), tickSize),
      high: roundToTick(Number(row[2]), tickSize),
      low: roundToTick(Number(row[3]), tickSize),
      close: roundToTick(Number(row[4]), tickSize),
      volume: Math.max(1, Math.round(Number(row[5]) || 1)),
    }))
    .filter((candle) => Number.isFinite(candle.time) && candle.high >= candle.low);
}

async function fetchOkxPage(instId: string, bar: string, after?: string): Promise<string[][]> {
  const params = new URLSearchParams({
    instId,
    bar,
    limit: '300',
  });
  if (after) params.set('after', after);
  const endpoint = after
    ? `https://www.okx.com/api/v5/market/history-candles?${params}`
    : `https://www.okx.com/api/v5/market/candles?${params}`;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);
  const json = (await response.json()) as { code?: string; data?: string[][]; msg?: string };
  if (json.code !== '0' || !Array.isArray(json.data)) {
    throw new Error(json.msg || 'OKX 返回异常');
  }
  return json.data;
}

export async function fetchOkxHistory(
  symbol: MarketSymbol,
  timeframe: Timeframe,
  targetCount: number,
): Promise<Candle[]> {
  const instId = OKX_INST[symbol.code];
  if (!instId) throw new Error('该品种暂无实盘公共源');
  const bar = OKX_BAR[timeframe];
  const collected: string[][] = [];
  let after: string | undefined;

  while (collected.length < targetCount) {
    const page = await fetchOkxPage(instId, bar, after);
    if (page.length === 0) break;
    collected.push(...page);
    const oldest = page[page.length - 1]?.[0];
    if (!oldest || oldest === after) break;
    after = oldest;
    if (page.length < 100) break;
  }

  const candles = okxToCandles(collected, symbol.tickSize);
  if (candles.length < 120) throw new Error('实盘 K 线过少');
  return candles.slice(-Math.min(targetCount, candles.length));
}

export function simulatedHistory(
  symbol: MarketSymbol,
  timeframe: Timeframe,
  source: HistorySource,
): HistoryLoadResult {
  const candles = generateMarketData(symbol, timeframe, { source });
  return {
    candles,
    feed: 'simulated',
    label: '本地模拟',
    detail: `${source.label} · ${candles.length} 根`,
  };
}

export function supportsLiveFeed(symbolCode: string) {
  return Boolean(OKX_INST[symbolCode]);
}

export async function loadHistoryCandles(options: {
  symbol: MarketSymbol;
  timeframe: Timeframe;
  historySourceId: string;
  feedMode: FeedMode;
}): Promise<HistoryLoadResult> {
  const source = getHistorySource(options.historySourceId);
  const target = historyBarCount(source, options.timeframe);
  const preferLive = options.feedMode === 'live' || (options.feedMode === 'auto' && supportsLiveFeed(options.symbol.code));

  if (preferLive && supportsLiveFeed(options.symbol.code)) {
    try {
      const candles = await fetchOkxHistory(options.symbol, options.timeframe, Math.min(4500, Math.max(target, 800)));
      return {
        candles,
        feed: 'live',
        label: 'OKX 实盘',
        detail: `${OKX_INST[options.symbol.code]} · ${TIMEFRAMES.find((item) => item.id === options.timeframe)?.label} · ${candles.length} 根`,
      };
    } catch (error) {
      if (options.feedMode === 'live') {
        // still fall back so练习可继续，但标明失败
        const fallback = simulatedHistory(options.symbol, options.timeframe, source);
        return {
          ...fallback,
          label: '模拟(实盘失败)',
          detail: `${fallback.detail} · ${(error as Error).message || '网络失败'}`,
        };
      }
    }
  }

  return simulatedHistory(options.symbol, options.timeframe, source);
}
