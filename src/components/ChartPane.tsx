import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import type { Candle, Fill, MarketSymbol, PendingOrder, Position } from '../model/market';

interface ChartPaneProps {
  candles: Candle[];
  playhead: number;
  symbol: MarketSymbol;
  fills: Fill[];
  orders: PendingOrder[];
  position: Position;
  onPickPrice?: (price: number) => void;
}

function toCandleData(candles: Candle[]): CandlestickData<Time>[] {
  return candles.map((candle) => ({
    time: Math.floor(candle.time / 1000) as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

function toVolumeData(candles: Candle[]): HistogramData<Time>[] {
  return candles.map((candle) => ({
    time: Math.floor(candle.time / 1000) as Time,
    value: candle.volume,
    color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
  }));
}

function movingAverage(candles: Candle[], period = 20): LineData<Time>[] {
  const points: LineData<Time>[] = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    const slice = candles.slice(index - period + 1, index + 1);
    const value = slice.reduce((sum, candle) => sum + candle.close, 0) / period;
    points.push({ time: Math.floor(candles[index].time / 1000) as Time, value });
  }
  return points;
}

export function ChartPane({
  candles,
  playhead,
  symbol,
  fills,
  orders,
  position,
  onPickPrice,
}: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const pickRef = useRef(onPickPrice);
  pickRef.current = onPickPrice;

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f14' },
        textColor: '#8b95a7',
        fontFamily: '"IBM Plex Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.15)' },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.15)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(251, 191, 36, 0.35)', labelBackgroundColor: '#f59e0b' },
        horzLine: { color: 'rgba(251, 191, 36, 0.35)', labelBackgroundColor: '#f59e0b' },
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    const maSeries = chart.addSeries(LineSeries, {
      color: '#60a5fa',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    maSeriesRef.current = maSeries;
    markersRef.current = createSeriesMarkers(candleSeries, []);

    const onClick = (param: { point?: { y: number } }) => {
      if (!param.point || !candleSeriesRef.current || !pickRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (typeof price === 'number') pickRef.current(price);
    };
    chart.subscribeClick(onClick);

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.unsubscribeClick(onClick);
      chart.remove();
      chartRef.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const visible = candles.slice(0, playhead + 1);
    const series = candleSeriesRef.current;
    if (!series || !volumeSeriesRef.current || !maSeriesRef.current || visible.length === 0) return;

    series.setData(toCandleData(visible));
    volumeSeriesRef.current.setData(toVolumeData(visible));
    maSeriesRef.current.setData(movingAverage(visible));

    markersRef.current?.setMarkers(
      fills
        .filter((fill) => fill.time <= visible.at(-1)!.time)
        .map((fill) => ({
          time: Math.floor(fill.time / 1000) as Time,
          position: fill.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: fill.side === 'buy' ? '#22c55e' : '#ef4444',
          shape: fill.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: fill.side === 'buy' ? `买 ${fill.quantity}` : `卖 ${fill.quantity}`,
        })),
    );

    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];

    const addLine = (price: number, color: string, title: string) => {
      priceLinesRef.current.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title,
        }),
      );
    };

    addLine(visible.at(-1)!.close, '#f59e0b', symbol.code);
    if (position.takeProfit != null) addLine(position.takeProfit, '#22c55e', '止盈');
    if (position.stopLoss != null) addLine(position.stopLoss, '#ef4444', '止损');
    for (const order of orders) {
      addLine(order.price, order.side === 'buy' ? '#34d399' : '#f87171', order.type === 'limit' ? '限价' : '止损单');
    }

    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles, playhead, fills, orders, position, symbol.code]);

  return <div className="chart-pane" ref={containerRef} aria-label={`${symbol.name} 回放图表`} />;
}
