import { useMemo } from 'react';
import type { Candle, MarketSymbol, Trade } from '../model/market';
import { formatPrice, formatReplayTime } from '../model/market';

interface TradingChartProps {
  candles: Candle[];
  playhead: number;
  symbol: MarketSymbol;
  trades: Trade[];
}

const WIDTH = 1160;
const HEIGHT = 480;
const PRICE_TOP = 28;
const PRICE_BOTTOM = 368;
const VOLUME_TOP = 390;
const VOLUME_BOTTOM = 452;
const PRICE_LEFT = 14;
const PRICE_RIGHT = 1086;

function pointsForMovingAverage(candles: Candle[], xStep: number, min: number, range: number) {
  return candles
    .map((_, index) => {
      if (index < 19) return null;
      const average =
        candles.slice(index - 19, index + 1).reduce((sum, candle) => sum + candle.close, 0) / 20;
      const x = PRICE_LEFT + index * xStep + xStep / 2;
      const y = PRICE_BOTTOM - ((average - min) / range) * (PRICE_BOTTOM - PRICE_TOP);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
}

export function TradingChart({ candles, playhead, symbol, trades }: TradingChartProps) {
  const visibleCandles = useMemo(
    () => candles.slice(Math.max(0, playhead - 76), playhead + 1),
    [candles, playhead],
  );

  const metrics = useMemo(() => {
    const highs = visibleCandles.map((candle) => candle.high);
    const lows = visibleCandles.map((candle) => candle.low);
    const rawMax = Math.max(...highs);
    const rawMin = Math.min(...lows);
    const padding = (rawMax - rawMin) * 0.08 || 1;
    const min = rawMin - padding;
    const max = rawMax + padding;
    return {
      min,
      max,
      range: max - min,
      maxVolume: Math.max(...visibleCandles.map((candle) => candle.volume)),
      xStep: (PRICE_RIGHT - PRICE_LEFT) / visibleCandles.length,
    };
  }, [visibleCandles]);

  const latest = visibleCandles.at(-1);
  if (!latest) return null;

  const priceToY = (price: number) =>
    PRICE_BOTTOM - ((price - metrics.min) / metrics.range) * (PRICE_BOTTOM - PRICE_TOP);
  const latestY = priceToY(latest.close);
  const movingAverage = pointsForMovingAverage(
    visibleCandles,
    metrics.xStep,
    metrics.min,
    metrics.range,
  );
  const firstVisibleTime = visibleCandles[0].time;
  const visibleTrades = trades.filter(
    (trade) => trade.time >= firstVisibleTime && trade.time <= latest.time,
  );

  return (
    <div className="chart-wrap" aria-label={`${symbol.name} K线图`}>
      <div className="chart-legend">
        <div>
          <span className="legend-symbol">{symbol.code}</span>
          <span>· 5分钟 · {symbol.exchange}</span>
        </div>
        <div className="ohlc-row">
          <span>开 <b>{formatPrice(latest.open, symbol)}</b></span>
          <span>高 <b>{formatPrice(latest.high, symbol)}</b></span>
          <span>低 <b>{formatPrice(latest.low, symbol)}</b></span>
          <span>收 <b className={latest.close >= latest.open ? 'up-text' : 'down-text'}>
            {formatPrice(latest.close, symbol)}
          </b></span>
        </div>
      </div>

      <svg
        className="trading-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
      >
        <defs>
          <linearGradient id="volumeUp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#24c989" stopOpacity=".48" />
            <stop offset="100%" stopColor="#24c989" stopOpacity=".08" />
          </linearGradient>
          <linearGradient id="volumeDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef5b5b" stopOpacity=".44" />
            <stop offset="100%" stopColor="#ef5b5b" stopOpacity=".06" />
          </linearGradient>
        </defs>

        {Array.from({ length: 6 }).map((_, index) => {
          const y = PRICE_TOP + ((PRICE_BOTTOM - PRICE_TOP) / 5) * index;
          const price = metrics.max - (metrics.range / 5) * index;
          return (
            <g key={`price-grid-${index}`}>
              <line x1={PRICE_LEFT} y1={y} x2={WIDTH} y2={y} className="grid-line" />
              <text x={1098} y={y - 7} className="axis-label">
                {formatPrice(price, symbol)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 7 }).map((_, index) => {
          const candleIndex = Math.min(
            visibleCandles.length - 1,
            Math.round((visibleCandles.length - 1) * (index / 6)),
          );
          const x = PRICE_LEFT + candleIndex * metrics.xStep + metrics.xStep / 2;
          return (
            <g key={`time-grid-${index}`}>
              <line x1={x} y1={PRICE_TOP} x2={x} y2={VOLUME_BOTTOM} className="grid-line" />
              <text x={x} y={474} textAnchor="middle" className="axis-label">
                {new Date(visibleCandles[candleIndex].time).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </text>
            </g>
          );
        })}

        <line x1={PRICE_LEFT} y1={378} x2={WIDTH} y2={378} className="section-line" />
        <text x={PRICE_LEFT + 5} y={407} className="volume-label">成交量</text>

        {visibleCandles.map((candle, index) => {
          const x = PRICE_LEFT + index * metrics.xStep + metrics.xStep / 2;
          const bodyWidth = Math.max(2.2, metrics.xStep * 0.62);
          const isUp = candle.close >= candle.open;
          const openY = priceToY(candle.open);
          const closeY = priceToY(candle.close);
          const highY = priceToY(candle.high);
          const lowY = priceToY(candle.low);
          const volumeHeight =
            (candle.volume / metrics.maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP);

          return (
            <g key={candle.time}>
              <line
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
                className={isUp ? 'candle-up' : 'candle-down'}
              />
              <rect
                x={x - bodyWidth / 2}
                y={Math.min(openY, closeY)}
                width={bodyWidth}
                height={Math.max(1.4, Math.abs(closeY - openY))}
                rx=".6"
                className={isUp ? 'candle-body-up' : 'candle-body-down'}
              />
              <rect
                x={x - bodyWidth / 2}
                y={VOLUME_BOTTOM - volumeHeight}
                width={bodyWidth}
                height={volumeHeight}
                fill={isUp ? 'url(#volumeUp)' : 'url(#volumeDown)'}
              />
            </g>
          );
        })}

        {movingAverage && <polyline points={movingAverage} className="ma-line" />}

        {visibleTrades.map((trade) => {
          const candleIndex = visibleCandles.findIndex((candle) => candle.time === trade.time);
          if (candleIndex < 0) return null;
          const x = PRICE_LEFT + candleIndex * metrics.xStep + metrics.xStep / 2;
          const y = priceToY(trade.price);
          const isBuy = trade.side === 'buy';
          const direction = isBuy ? -1 : 1;
          const markerY = y + direction * 18;
          return (
            <g key={trade.id}>
              <path
                d={`M ${x} ${y} L ${x - 6} ${markerY} L ${x + 6} ${markerY} Z`}
                className={isBuy ? 'trade-marker-buy' : 'trade-marker-sell'}
              />
              <text
                x={x}
                y={markerY + (isBuy ? -5 : 13)}
                textAnchor="middle"
                className={isBuy ? 'trade-label-buy' : 'trade-label-sell'}
              >
                {isBuy ? `买${trade.quantity}` : `卖${trade.quantity}`}
              </text>
            </g>
          );
        })}

        <line x1={PRICE_LEFT} y1={latestY} x2={WIDTH} y2={latestY} className="current-price-line" />
        <rect x={1087} y={latestY - 12} width={73} height={24} rx="4" className="current-price-tag" />
        <text x={1123.5} y={latestY + 4} textAnchor="middle" className="current-price-text">
          {formatPrice(latest.close, symbol)}
        </text>
      </svg>

      <div className="chart-date-badge">{formatReplayTime(latest.time)} · 模拟行情</div>
    </div>
  );
}
