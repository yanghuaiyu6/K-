import { equal } from '../test/assert';
import { executeTrade, generateMarketData, SYMBOLS } from './market';

export const tests = [
  {
    name: 'market data generation is deterministic and produces valid candles',
    run() {
      const first = generateMarketData(SYMBOLS[0], 12);
      const second = generateMarketData(SYMBOLS[0], 12);

      equal(first.length, 12);
      equal(first[5].close, second[5].close);
      equal(first.every((candle) => candle.high >= Math.max(candle.open, candle.close)), true);
      equal(first.every((candle) => candle.low <= Math.min(candle.open, candle.close)), true);
      equal(first.every((candle) => candle.volume > 0), true);
    },
  },
  {
    name: 'same-direction trades update the weighted average price',
    run() {
      const empty = { quantity: 0, averagePrice: 0, realizedPnl: 0 };
      const firstBuy = executeTrade(empty, 'buy', 2, 100);
      const secondBuy = executeTrade(firstBuy, 'buy', 2, 110);

      equal(secondBuy.quantity, 4);
      equal(secondBuy.averagePrice, 105);
      equal(secondBuy.realizedPnl, 0);
    },
  },
  {
    name: 'closing and reversing a position realizes profit correctly',
    run() {
      const longPosition = { quantity: 3, averagePrice: 100, realizedPnl: 0 };
      const reduced = executeTrade(longPosition, 'sell', 2, 112);
      const reversed = executeTrade(reduced, 'sell', 3, 108);

      equal(reduced.quantity, 1);
      equal(reduced.averagePrice, 100);
      equal(reduced.realizedPnl, 24);
      equal(reversed.quantity, -2);
      equal(reversed.averagePrice, 108);
      equal(reversed.realizedPnl, 32);
    },
  },
];
