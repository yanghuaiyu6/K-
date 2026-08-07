export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h';

export interface MarketSymbol {
  code: string;
  name: string;
  category: string;
  tickSize: number;
  spreadTicks: number;
  commission: number;
  basePrice: number;
  volatility: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Position {
  quantity: number;
  averagePrice: number;
  realizedPnl: number;
  takeProfit: number | null;
  stopLoss: number | null;
  leverage: number;
}

export interface PendingOrder {
  id: number;
  side: Side;
  type: Exclude<OrderType, 'market'>;
  quantity: number;
  price: number;
  takeProfit: number | null;
  stopLoss: number | null;
  createdAt: number;
  leverage: number;
}

export interface Fill {
  id: number;
  side: Side;
  quantity: number;
  price: number;
  fee: number;
  time: number;
  realizedPnl: number;
  reason: 'market' | 'limit' | 'stop' | 'takeProfit' | 'stopLoss' | 'close';
}

export interface SessionConfig {
  symbolCode: string;
  timeframe: Timeframe;
  startCapital: number;
  startOffset: number;
  blindMode: boolean;
}

export const SYMBOLS: MarketSymbol[] = [
  { code: 'EURUSD', name: '欧元 / 美元', category: '外汇', tickSize: 0.0001, spreadTicks: 8, commission: 0.7, basePrice: 1.0842, volatility: 0.00042 },
  { code: 'GBPUSD', name: '英镑 / 美元', category: '外汇', tickSize: 0.0001, spreadTicks: 10, commission: 0.7, basePrice: 1.2688, volatility: 0.00055 },
  { code: 'USDJPY', name: '美元 / 日元', category: '外汇', tickSize: 0.001, spreadTicks: 9, commission: 0.7, basePrice: 156.42, volatility: 0.055 },
  { code: 'XAUUSD', name: '黄金 / 美元', category: '商品', tickSize: 0.1, spreadTicks: 18, commission: 1.2, basePrice: 2348, volatility: 1.8 },
  { code: 'NAS100', name: '纳斯达克100', category: '指数', tickSize: 0.25, spreadTicks: 4, commission: 1.5, basePrice: 18425, volatility: 18 },
  { code: 'US500', name: '标普500', category: '指数', tickSize: 0.25, spreadTicks: 4, commission: 1.2, basePrice: 5286, volatility: 5.5 },
  { code: 'BTCUSD', name: '比特币 / 美元', category: '加密', tickSize: 0.5, spreadTicks: 20, commission: 2.5, basePrice: 67240, volatility: 95 },
  { code: 'ETHUSD', name: '以太坊 / 美元', category: '加密', tickSize: 0.05, spreadTicks: 20, commission: 2.0, basePrice: 3488, volatility: 18 },
];

export const TIMEFRAMES: { id: Timeframe; label: string; minutes: number }[] = [
  { id: '1m', label: '1分', minutes: 1 },
  { id: '5m', label: '5分', minutes: 5 },
  { id: '15m', label: '15分', minutes: 15 },
  { id: '30m', label: '30分', minutes: 30 },
  { id: '1h', label: '1时', minutes: 60 },
];

export const SPEEDS = [0.5, 1, 2, 5, 10, 20, 50] as const;

function hashCode(value: string) {
  return [...value].reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0);
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
}

export function roundToTick(price: number, tickSize: number) {
  return Math.round(price / tickSize) * tickSize;
}

export function getSymbol(code: string) {
  return SYMBOLS.find((item) => item.code === code) ?? SYMBOLS[0];
}

export function generateMarketData(symbol: MarketSymbol, timeframe: Timeframe, count = 420): Candle[] {
  const minutes = TIMEFRAMES.find((item) => item.id === timeframe)?.minutes ?? 5;
  const random = createRandom(Math.abs(hashCode(`${symbol.code}-${timeframe}`)) + 20240520);
  const startTime = new Date('2024-05-20T13:30:00.000Z').getTime();
  const scale = Math.sqrt(minutes / 5);
  const candles: Candle[] = [];
  let previousClose = symbol.basePrice;

  for (let index = 0; index < count; index += 1) {
    const cycle = Math.sin(index / 11) * symbol.volatility * 0.35 * scale;
    const trend = Math.sin(index / 48) * symbol.volatility * 0.22 * scale;
    const sessionBias = index < 90 ? 0.12 : index < 180 ? -0.08 : 0.15;
    const noise = (random() - 0.49) * symbol.volatility * scale;
    const movement = noise + cycle * 0.2 + trend * 0.12 + sessionBias * symbol.volatility * scale * 0.2;
    const open = previousClose + (random() - 0.5) * symbol.volatility * 0.2 * scale;
    const close = open + movement;
    const wick = symbol.volatility * scale * (0.2 + random() * 0.6);
    const high = Math.max(open, close) + wick * random();
    const low = Math.min(open, close) - wick * random();
    const volume = Math.round(500 + random() * 1400 + Math.abs(movement) / symbol.tickSize);

    candles.push({
      time: startTime + index * minutes * 60 * 1000,
      open: roundToTick(open, symbol.tickSize),
      high: roundToTick(high, symbol.tickSize),
      low: roundToTick(low, symbol.tickSize),
      close: roundToTick(close, symbol.tickSize),
      volume,
    });
    previousClose = close;
  }

  return candles;
}

export function emptyPosition(): Position {
  return { quantity: 0, averagePrice: 0, realizedPnl: 0, takeProfit: null, stopLoss: null, leverage: 10 };
}

export function marketQuotes(symbol: MarketSymbol, mid: number) {
  const half = (symbol.spreadTicks * symbol.tickSize) / 2;
  return {
    bid: roundToTick(mid - half, symbol.tickSize),
    ask: roundToTick(mid + half, symbol.tickSize),
    spread: roundToTick(half * 2, symbol.tickSize),
  };
}

export function applyFill(
  position: Position,
  side: Side,
  quantity: number,
  price: number,
  fee: number,
  leverage = position.leverage || 10,
): { position: Position; realizedPnl: number } {
  const signed = side === 'buy' ? quantity : -quantity;
  const current = position.quantity;

  if (current === 0 || Math.sign(current) === Math.sign(signed)) {
    const nextQuantity = current + signed;
    const averagePrice =
      (Math.abs(current) * position.averagePrice + Math.abs(signed) * price) / Math.abs(nextQuantity);
    return {
      position: {
        ...position,
        quantity: nextQuantity,
        averagePrice,
        realizedPnl: position.realizedPnl - fee,
        leverage: current === 0 ? leverage : position.leverage,
      },
      realizedPnl: -fee,
    };
  }

  const closing = Math.min(Math.abs(current), Math.abs(signed));
  const direction = Math.sign(current);
  const tradePnl = (price - position.averagePrice) * closing * direction - fee;
  const nextQuantity = current + signed;

  return {
    position: {
      quantity: nextQuantity,
      averagePrice:
        nextQuantity === 0
          ? 0
          : Math.sign(nextQuantity) === Math.sign(current)
            ? position.averagePrice
            : price,
      realizedPnl: position.realizedPnl + tradePnl,
      takeProfit: nextQuantity === 0 ? null : position.takeProfit,
      stopLoss: nextQuantity === 0 ? null : position.stopLoss,
      leverage: nextQuantity === 0 ? leverage : Math.sign(nextQuantity) === Math.sign(current) ? position.leverage : leverage,
    },
    realizedPnl: tradePnl,
  };
}

export function matchPendingOrders(
  orders: PendingOrder[],
  candle: Candle,
  symbol: MarketSymbol,
  position: Position,
): {
  remainingOrders: PendingOrder[];
  position: Position;
  fills: Fill[];
} {
  let nextPosition = position;
  const remaining: PendingOrder[] = [];
  const fills: Fill[] = [];

  for (const order of orders) {
    const hit =
      order.type === 'limit'
        ? order.side === 'buy'
          ? candle.low <= order.price
          : candle.high >= order.price
        : order.side === 'buy'
          ? candle.high >= order.price
          : candle.low <= order.price;

    if (!hit) {
      remaining.push(order);
      continue;
    }

    const result = applyFill(
      nextPosition,
      order.side,
      order.quantity,
      order.price,
      symbol.commission * order.quantity,
      order.leverage || nextPosition.leverage || 10,
    );
    nextPosition = {
      ...result.position,
      takeProfit: order.takeProfit,
      stopLoss: order.stopLoss,
    };
    fills.push({
      id: Date.now() + fills.length,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
      fee: symbol.commission * order.quantity,
      time: candle.time,
      realizedPnl: result.realizedPnl,
      reason: order.type,
    });
  }

  return { remainingOrders: remaining, position: nextPosition, fills };
}

export function matchProtectiveOrders(
  position: Position,
  candle: Candle,
  symbol: MarketSymbol,
): { position: Position; fills: Fill[] } {
  if (position.quantity === 0) return { position, fills: [] };

  const fills: Fill[] = [];
  let next = position;
  const isLong = position.quantity > 0;

  if (position.stopLoss != null) {
    const hit = isLong ? candle.low <= position.stopLoss : candle.high >= position.stopLoss;
    if (hit) {
      const side: Side = isLong ? 'sell' : 'buy';
      const result = applyFill(next, side, Math.abs(next.quantity), position.stopLoss, symbol.commission * Math.abs(next.quantity));
      fills.push({
        id: Date.now() + 11,
        side,
        quantity: Math.abs(position.quantity),
        price: position.stopLoss,
        fee: symbol.commission * Math.abs(position.quantity),
        time: candle.time,
        realizedPnl: result.realizedPnl,
        reason: 'stopLoss',
      });
      return { position: emptyPosition(), fills };
    }
  }

  if (position.takeProfit != null) {
    const hit = isLong ? candle.high >= position.takeProfit : candle.low <= position.takeProfit;
    if (hit) {
      const side: Side = isLong ? 'sell' : 'buy';
      const result = applyFill(next, side, Math.abs(next.quantity), position.takeProfit, symbol.commission * Math.abs(next.quantity));
      fills.push({
        id: Date.now() + 12,
        side,
        quantity: Math.abs(position.quantity),
        price: position.takeProfit,
        fee: symbol.commission * Math.abs(position.quantity),
        time: candle.time,
        realizedPnl: result.realizedPnl,
        reason: 'takeProfit',
      });
      return { position: emptyPosition(), fills };
    }
  }

  return { position: next, fills };
}

export type CurrencyUnit = 'USDT' | 'CNY';

/** 演示用固定汇率，便于 USDT / 人民币切换展示 */
export const USDT_CNY_RATE = 7.25;

export const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 75, 100] as const;

export function toDisplayAmount(usdtValue: number, unit: CurrencyUnit) {
  return unit === 'CNY' ? usdtValue * USDT_CNY_RATE : usdtValue;
}

export function formatPrice(price: number, symbol: MarketSymbol, unit: CurrencyUnit = 'USDT') {
  const scaled = toDisplayAmount(price, unit);
  const decimals =
    unit === 'CNY'
      ? symbol.tickSize >= 1
        ? 2
        : 2
      : symbol.tickSize >= 1
        ? 2
        : symbol.tickSize >= 0.1
          ? 1
          : symbol.tickSize >= 0.01
            ? 2
            : 4;
  return scaled.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMoney(value: number, unit: CurrencyUnit = 'USDT') {
  const scaled = toDisplayAmount(value, unit);
  if (unit === 'CNY') {
    return `¥${scaled.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${scaled.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}

export function unitLabel(unit: CurrencyUnit) {
  return unit === 'CNY' ? '人民币' : 'USDT';
}

export function contractNotional(price: number, quantity: number) {
  return Math.abs(price * quantity);
}

export function positionMargin(price: number, quantity: number, leverage: number) {
  return contractNotional(price, quantity) / Math.max(1, leverage);
}

export function unrealizedPnl(position: Position, markPrice: number) {
  if (position.quantity === 0) return 0;
  return (markPrice - position.averagePrice) * position.quantity;
}

export function unrealizedRoe(position: Position, markPrice: number, leverage: number) {
  if (position.quantity === 0) return 0;
  const margin = positionMargin(position.averagePrice, position.quantity, leverage);
  if (margin <= 0) return 0;
  return (unrealizedPnl(position, markPrice) / margin) * 100;
}

/** 简化的隔离保证金预估强平价（演示用） */
export function estimateLiquidationPrice(position: Position, leverage: number, maintenanceRate = 0.005) {
  if (position.quantity === 0) return null;
  const entry = position.averagePrice;
  if (position.quantity > 0) {
    return Math.max(0, entry * (1 - 1 / leverage + maintenanceRate));
  }
  return entry * (1 + 1 / leverage - maintenanceRate);
}

export function formatTime(time: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(time);
}

export interface MacdPoint {
  time: number;
  dif: number;
  dea: number;
  hist: number;
}

function emaSeries(values: number[], period: number) {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = values[0] ?? 0;
  values.forEach((value, index) => {
    ema = index === 0 ? value : (value - ema) * multiplier + ema;
    result.push(ema);
  });
  return result;
}

export function computeMacd(candles: Candle[], fast = 12, slow = 26, signal = 9): MacdPoint[] {
  if (candles.length === 0) return [];
  const closes = candles.map((candle) => candle.close);
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const dif = closes.map((_, index) => fastEma[index] - slowEma[index]);
  const dea = emaSeries(dif, signal);
  return candles.map((candle, index) => ({
    time: candle.time,
    dif: dif[index],
    dea: dea[index],
    hist: (dif[index] - dea[index]) * 2,
  }));
}

export interface SessionStats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netPnl: number;
  maxDrawdown: number;
  grossProfit: number;
  grossLoss: number;
}

export function computeStats(fills: Fill[], startCapital: number): SessionStats {
  let equity = startCapital;
  let peak = startCapital;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;

  for (const fill of [...fills].reverse()) {
    equity += fill.realizedPnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);

    const isExit =
      fill.reason === 'close' || fill.reason === 'takeProfit' || fill.reason === 'stopLoss';
    if (!isExit) continue;

    if (fill.realizedPnl > 0) {
      wins += 1;
      grossProfit += fill.realizedPnl;
    } else if (fill.realizedPnl < 0) {
      losses += 1;
      grossLoss += Math.abs(fill.realizedPnl);
    }
  }

  const trades = wins + losses;
  return {
    trades,
    wins,
    losses,
    winRate: trades === 0 ? 0 : wins / trades,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss,
    netPnl: equity - startCapital,
    maxDrawdown,
    grossProfit,
    grossLoss,
  };
}
