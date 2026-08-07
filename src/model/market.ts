export type Side = 'buy' | 'sell';

export interface MarketSymbol {
  code: string;
  name: string;
  exchange: string;
  tickSize: number;
  currency: string;
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

export interface Trade {
  id: number;
  side: Side;
  quantity: number;
  price: number;
  time: number;
  realizedPnl: number;
}

export interface Position {
  quantity: number;
  averagePrice: number;
  realizedPnl: number;
}

export const SYMBOLS: MarketSymbol[] = [
  {
    code: 'NQ1!',
    name: '纳斯达克100 E-mini',
    exchange: 'CME',
    tickSize: 0.25,
    currency: 'USD',
    basePrice: 18_425,
    volatility: 22,
  },
  {
    code: 'ES1!',
    name: '标普500 E-mini',
    exchange: 'CME',
    tickSize: 0.25,
    currency: 'USD',
    basePrice: 5_286,
    volatility: 6.8,
  },
  {
    code: 'BTCUSD',
    name: '比特币 / 美元',
    exchange: 'COINBASE',
    tickSize: 0.5,
    currency: 'USD',
    basePrice: 67_240,
    volatility: 94,
  },
  {
    code: 'AAPL',
    name: '苹果公司',
    exchange: 'NASDAQ',
    tickSize: 0.01,
    currency: 'USD',
    basePrice: 191.4,
    volatility: 0.65,
  },
];

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

export function generateMarketData(symbol: MarketSymbol, count = 240): Candle[] {
  const random = createRandom(Math.abs(hashCode(symbol.code)) + 20240520);
  const startTime = new Date('2024-05-20T13:30:00.000Z').getTime();
  const candles: Candle[] = [];
  let previousClose = symbol.basePrice;

  for (let index = 0; index < count; index += 1) {
    const cycle = Math.sin(index / 9) * symbol.volatility * 0.32;
    const longTrend = Math.sin(index / 42) * symbol.volatility * 0.18;
    const sessionBias = index < 70 ? 0.11 : index < 135 ? -0.06 : 0.14;
    const noise = (random() - 0.49) * symbol.volatility;
    const movement = noise + cycle * 0.18 + longTrend * 0.1 + sessionBias * symbol.volatility;
    const open = previousClose + (random() - 0.5) * symbol.volatility * 0.24;
    const close = open + movement;
    const wick = symbol.volatility * (0.18 + random() * 0.55);
    const high = Math.max(open, close) + wick * random();
    const low = Math.min(open, close) - wick * random();
    const volume = Math.round(620 + random() * 1250 + Math.abs(movement) * 21);

    candles.push({
      time: startTime + index * 5 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
    });
    previousClose = close;
  }

  return candles;
}

export function executeTrade(position: Position, side: Side, quantity: number, price: number): Position {
  const signedQuantity = side === 'buy' ? quantity : -quantity;
  const currentQuantity = position.quantity;

  if (currentQuantity === 0 || Math.sign(currentQuantity) === Math.sign(signedQuantity)) {
    const nextQuantity = currentQuantity + signedQuantity;
    const weightedCost =
      Math.abs(currentQuantity) * position.averagePrice + Math.abs(signedQuantity) * price;
    return {
      quantity: nextQuantity,
      averagePrice: weightedCost / Math.abs(nextQuantity),
      realizedPnl: position.realizedPnl,
    };
  }

  const closingQuantity = Math.min(Math.abs(currentQuantity), Math.abs(signedQuantity));
  const direction = Math.sign(currentQuantity);
  const realizedPnl = position.realizedPnl + (price - position.averagePrice) * closingQuantity * direction;
  const nextQuantity = currentQuantity + signedQuantity;

  return {
    quantity: nextQuantity,
    averagePrice:
      nextQuantity === 0
        ? 0
        : Math.sign(nextQuantity) === Math.sign(currentQuantity)
          ? position.averagePrice
          : price,
    realizedPnl,
  };
}

export function formatPrice(price: number, symbol: MarketSymbol) {
  const decimals = symbol.tickSize < 0.1 ? 2 : symbol.tickSize < 1 ? 2 : 0;
  return price.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatReplayTime(time: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(time);
}
