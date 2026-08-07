import { equal } from '../test/assert';
import {
  applyFill,
  computeMacd,
  emptyPosition,
  estimateLiquidationPrice,
  formatMoney,
  formatPrice,
  generateMarketData,
  getSymbol,
  matchPendingOrders,
  matchProtectiveOrders,
  toDisplayAmount,
  unrealizedPnl,
  unrealizedRoe,
} from './market';

export const tests = [
  {
    name: 'market data generation is deterministic and produces valid candles',
    run() {
      const symbol = getSymbol('NAS100');
      const first = generateMarketData(symbol, '5m', 12);
      const second = generateMarketData(symbol, '5m', 12);
      equal(first.length, 12);
      equal(first[5].close, second[5].close);
      equal(first.every((candle) => candle.high >= Math.max(candle.open, candle.close)), true);
      equal(first.every((candle) => candle.low <= Math.min(candle.open, candle.close)), true);
    },
  },
  {
    name: 'same-direction trades update the weighted average price',
    run() {
      const first = applyFill(emptyPosition(), 'buy', 2, 100, 0);
      const second = applyFill(first.position, 'buy', 2, 110, 0);
      equal(second.position.quantity, 4);
      equal(second.position.averagePrice, 105);
    },
  },
  {
    name: 'protective take-profit closes a long position',
    run() {
      const position = {
        quantity: 2,
        averagePrice: 100,
        realizedPnl: 0,
        takeProfit: 110,
        stopLoss: 90,
        leverage: 10,
      };
      const result = matchProtectiveOrders(
        position,
        { time: 1, open: 108, high: 111, low: 107, close: 110.5, volume: 10 },
        getSymbol('NAS100'),
      );
      equal(result.position.quantity, 0);
      equal(result.fills[0].reason, 'takeProfit');
    },
  },
  {
    name: 'limit buy fills when candle trades through the price',
    run() {
      const symbol = getSymbol('EURUSD');
      const result = matchPendingOrders(
        [
          {
            id: 1,
            side: 'buy',
            type: 'limit',
            quantity: 1,
            price: 1.08,
            takeProfit: null,
            stopLoss: null,
            createdAt: 1,
            leverage: 20,
          },
        ],
        { time: 2, open: 1.081, high: 1.082, low: 1.079, close: 1.08, volume: 8 },
        symbol,
        emptyPosition(),
      );
      equal(result.remainingOrders.length, 0);
      equal(result.position.quantity, 1);
      equal(result.position.leverage, 20);
      equal(result.fills[0].reason, 'limit');
    },
  },
  {
    name: 'USDT/CNY formatting and contract PnL helpers work',
    run() {
      const symbol = getSymbol('NAS100');
      equal(formatMoney(100, 'USDT').includes('USDT'), true);
      equal(formatMoney(100, 'CNY').startsWith('¥'), true);
      equal(toDisplayAmount(100, 'CNY'), 725);
      const position = {
        quantity: 2,
        averagePrice: 100,
        realizedPnl: 0,
        takeProfit: null,
        stopLoss: null,
        leverage: 10,
      };
      equal(unrealizedPnl(position, 110), 20);
      equal(Math.round(unrealizedRoe(position, 110, 10)), 100);
      equal(estimateLiquidationPrice(position, 10) !== null, true);
      equal(formatPrice(100, symbol, 'CNY').length > 0, true);
    },
  },
  {
    name: 'MACD series matches candle length and produces finite values',
    run() {
      const candles = generateMarketData(getSymbol('NAS100'), '5m', 60);
      const macd = computeMacd(candles);
      equal(macd.length, candles.length);
      equal(Number.isFinite(macd.at(-1)!.dif), true);
      equal(Number.isFinite(macd.at(-1)!.dea), true);
      equal(Number.isFinite(macd.at(-1)!.hist), true);
    },
  },
];
