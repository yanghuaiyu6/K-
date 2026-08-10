import { equal } from '../test/assert';
import {
  applyFill,
  applyFunding,
  applySlippage,
  calcTradingFee,
  canAffordOrder,
  computeMacd,
  emptyPosition,
  estimateLiquidationPrice,
  feeRoleForFill,
  findCandleIndexByTime,
  formatFeeRate,
  formatMoney,
  formatPrice,
  generateMarketData,
  getHistorySource,
  getSymbol,
  historyBarCount,
  matchLiquidation,
  matchPendingOrders,
  matchProtectiveOrders,
  maxAffordableQuantity,
  maxReplayOffset,
  minReplayOffset,
  pickRandomStartOffset,
  resolveStartOffset,
  toDisplayAmount,
  unrealizedPnl,
  unrealizedRoe,
  updateProtectiveLevels,
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
    name: 'history sources produce long deterministic series and replay offsets',
    run() {
      const symbol = getSymbol('BTCUSD');
      const source = getHistorySource('crypto-impulse');
      const count = historyBarCount(source, '5m');
      equal(count > 1000, true);
      const candles = generateMarketData(symbol, '5m', { source });
      equal(candles.length, count);
      equal(generateMarketData(symbol, '5m', { source })[100].close, candles[100].close);
      equal(minReplayOffset(count), 60);
      equal(maxReplayOffset(count) < count, true);
      equal(resolveStartOffset('begin', count), 60);
      const random = pickRandomStartOffset(count, () => 0.5);
      equal(random >= 60 && random <= maxReplayOffset(count), true);
      const index = findCandleIndexByTime(candles, candles[120].time);
      equal(index, 120);
    },
  },
  {
    name: 'liquidation closes long when candle trades through liq price',
    run() {
      const position = {
        quantity: 2,
        averagePrice: 100,
        realizedPnl: 0,
        takeProfit: null,
        stopLoss: null,
        leverage: 10,
      };
      const liq = estimateLiquidationPrice(position, 10)!;
      const result = matchLiquidation(
        position,
        { time: 1, open: liq + 1, high: liq + 2, low: liq - 1, close: liq, volume: 10 },
        getSymbol('NAS100'),
        10,
      );
      equal(result.liquidated, true);
      equal(result.position.quantity, 0);
      equal(result.fills[0].reason, 'liquidation');
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
  {
    name: 'applySlippage widens market buys and leaves limit fills unchanged',
    run() {
      const symbol = getSymbol('NAS100');
      const marketBuy = applySlippage(100, 'buy', symbol, 'market');
      const marketSell = applySlippage(100, 'sell', symbol, 'market');
      const limitBuy = applySlippage(100, 'buy', symbol, 'limit');
      equal(marketBuy, 100 + symbol.tickSize);
      equal(marketSell, 100 - symbol.tickSize);
      equal(limitBuy, 100);
    },
  },
  {
    name: 'canAffordOrder and maxAffordableQuantity enforce margin budget',
    run() {
      equal(canAffordOrder(100, 100, 10, 10), true);
      equal(canAffordOrder(100, 100, 11, 10), false);
      equal(maxAffordableQuantity(1000, 100, 10), 100);
      equal(maxAffordableQuantity(0, 100, 10), 0);
    },
  },
  {
    name: 'applyFunding charges longs and credits shorts on notional',
    run() {
      const long = {
        quantity: 2,
        averagePrice: 100,
        realizedPnl: 0,
        takeProfit: null,
        stopLoss: null,
        leverage: 10,
      };
      const longResult = applyFunding(long, 100, 0.0001);
      equal(longResult.funding < 0, true);
      equal(longResult.position.realizedPnl, longResult.funding);

      const short = { ...long, quantity: -2 };
      const shortResult = applyFunding(short, 100, 0.0001);
      equal(shortResult.funding > 0, true);
      equal(shortResult.position.realizedPnl, shortResult.funding);
    },
  },
  {
    name: 'updateProtectiveLevels only mutates open positions',
    run() {
      equal(updateProtectiveLevels(emptyPosition(), 110, 90).quantity, 0);
      const open = {
        quantity: 1,
        averagePrice: 100,
        realizedPnl: 0,
        takeProfit: null,
        stopLoss: null,
        leverage: 10,
      };
      const next = updateProtectiveLevels(open, 120, 95);
      equal(next.takeProfit, 120);
      equal(next.stopLoss, 95);
    },
  },
  {
    name: 'OKX regular swap fees charge maker/taker percent of notional',
    run() {
      equal(calcTradingFee(100_000, 1, 'taker'), 50);
      equal(calcTradingFee(100_000, 1, 'maker'), 20);
      equal(feeRoleForFill('market'), 'taker');
      equal(feeRoleForFill('limit'), 'maker');
      equal(feeRoleForFill('stopLoss'), 'taker');
      equal(formatFeeRate('taker'), '0.05%');
    },
  },
];
