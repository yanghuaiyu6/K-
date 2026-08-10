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
import { computeMacd, type Candle, type Fill, type MarketSymbol, type PendingOrder, type Position } from '../model/market';

interface ChartPaneProps {
  candles: Candle[];
  playhead: number;
  symbol: MarketSymbol;
  fills: Fill[];
  orders: PendingOrder[];
  position: Position;
  liquidationPrice?: number | null;
  overlays?: {
    cost: boolean;
    liquidation: boolean;
    protective: boolean;
    orders: boolean;
  };
  pickMode?: 'price' | 'bar' | null;
  onPickPrice?: (price: number) => void;
  onPickBar?: (timeMs: number) => void;
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
    color: candle.close >= candle.open ? 'rgba(46, 204, 113, 0.28)' : 'rgba(231, 76, 60, 0.28)',
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

function emaLine(candles: Candle[], period = 60): LineData<Time>[] {
  if (candles.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const points: LineData<Time>[] = [];
  let ema = candles[0].close;
  candles.forEach((candle, index) => {
    ema = index === 0 ? candle.close : (candle.close - ema) * multiplier + ema;
    if (index >= period - 1) {
      points.push({ time: Math.floor(candle.time / 1000) as Time, value: ema });
    }
  });
  return points;
}

export function ChartPane({
  candles,
  playhead,
  symbol,
  fills,
  orders,
  position,
  liquidationPrice = null,
  overlays = { cost: true, liquidation: true, protective: true, orders: true },
  pickMode = null,
  onPickPrice,
  onPickBar,
}: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdDifRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdDeaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const pickPriceRef = useRef(onPickPrice);
  const pickBarRef = useRef(onPickBar);
  const pickModeRef = useRef(pickMode);
  pickPriceRef.current = onPickPrice;
  pickBarRef.current = onPickBar;
  pickModeRef.current = pickMode;

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a1018' },
        textColor: '#9aa6b8',
        fontFamily: '"Manrope", "Noto Sans SC", "PingFang SC", sans-serif',
        panes: {
          separatorColor: 'rgba(245, 158, 11, 0.28)',
          separatorHoverColor: 'rgba(245, 158, 11, 0.45)',
        },
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.06)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.06)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 7,
      },
      crosshair: {
        vertLine: { color: 'rgba(251, 191, 36, 0.35)', labelBackgroundColor: '#f59e0b' },
        horzLine: { color: 'rgba(251, 191, 36, 0.35)', labelBackgroundColor: '#f59e0b' },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        pinch: true,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#2ecc71',
      downColor: '#e74c3c',
      borderUpColor: '#2ecc71',
      borderDownColor: '#e74c3c',
      wickUpColor: '#2ecc71',
      wickDownColor: '#e74c3c',
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    const maSeries = chart.addSeries(LineSeries, {
      color: '#5dade2',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const emaSeries = chart.addSeries(LineSeries, {
      color: '#f5b301',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const macdHist = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        priceScaleId: 'macd',
      },
      1,
    );
    const macdDif = chart.addSeries(
      LineSeries,
      {
        color: '#f1c40f',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: 'macd',
      },
      1,
    );
    const macdDea = chart.addSeries(
      LineSeries,
      {
        color: '#af7ac5',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: 'macd',
      },
      1,
    );

    chart.panes()[1]?.setHeight(Math.max(72, Math.round(containerRef.current.clientHeight * 0.22)));
    chart.priceScale('macd', 1).applyOptions({
      scaleMargins: { top: 0.12, bottom: 0.08 },
      borderVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    maSeriesRef.current = maSeries;
    emaSeriesRef.current = emaSeries;
    macdHistRef.current = macdHist;
    macdDifRef.current = macdDif;
    macdDeaRef.current = macdDea;
    markersRef.current = createSeriesMarkers(candleSeries, []);

    const onClick = (param: { point?: { y: number }; paneIndex?: number; time?: Time }) => {
      if (param.paneIndex !== 0) return;
      if (pickModeRef.current === 'bar' && param.time != null && pickBarRef.current) {
        const raw = typeof param.time === 'number' ? param.time : Date.parse(String(param.time)) / 1000;
        if (Number.isFinite(raw)) pickBarRef.current(raw * 1000);
        return;
      }
      if (!param.point || !candleSeriesRef.current || !pickPriceRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (typeof price === 'number') pickPriceRef.current(price);
    };
    chart.subscribeClick(onClick);

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const height = containerRef.current.clientHeight;
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height,
      });
      chartRef.current.panes()[1]?.setHeight(Math.max(72, Math.round(height * 0.22)));
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
    if (
      !series ||
      !volumeSeriesRef.current ||
      !maSeriesRef.current ||
      !emaSeriesRef.current ||
      !macdHistRef.current ||
      !macdDifRef.current ||
      !macdDeaRef.current ||
      visible.length === 0
    ) {
      return;
    }

    series.setData(toCandleData(visible));
    volumeSeriesRef.current.setData(toVolumeData(visible));
    maSeriesRef.current.setData(movingAverage(visible, 20));
    emaSeriesRef.current.setData(emaLine(visible, 60));

    const macd = computeMacd(visible);
    macdHistRef.current.setData(
      macd.map((point) => ({
        time: Math.floor(point.time / 1000) as Time,
        value: point.hist,
        color: point.hist >= 0 ? 'rgba(46, 204, 113, 0.7)' : 'rgba(231, 76, 60, 0.7)',
      })),
    );
    macdDifRef.current.setData(
      macd.map((point) => ({
        time: Math.floor(point.time / 1000) as Time,
        value: point.dif,
      })),
    );
    macdDeaRef.current.setData(
      macd.map((point) => ({
        time: Math.floor(point.time / 1000) as Time,
        value: point.dea,
      })),
    );

    markersRef.current?.setMarkers(
      fills
        .filter((fill) => fill.time <= visible.at(-1)!.time)
        .map((fill) => ({
          time: Math.floor(fill.time / 1000) as Time,
          position: fill.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: fill.side === 'buy' ? '#2ecc71' : '#e74c3c',
          shape: fill.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: fill.side === 'buy' ? 'B' : 'S',
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

    addLine(visible.at(-1)!.close, '#f59e0b', '最新');
    if (overlays.cost && position.quantity !== 0 && position.averagePrice > 0) {
      addLine(position.averagePrice, '#5dade2', '成本');
    }
    if (overlays.liquidation && liquidationPrice != null && position.quantity !== 0) {
      addLine(liquidationPrice, '#c39bd3', '强平');
    }
    if (overlays.protective) {
      if (position.takeProfit != null) addLine(position.takeProfit, '#2ecc71', '止盈');
      if (position.stopLoss != null) addLine(position.stopLoss, '#e74c3c', '止损');
    }
    if (overlays.orders) {
      for (const order of orders) {
        addLine(order.price, order.side === 'buy' ? '#58d68d' : '#f1948a', order.type === 'limit' ? '限价' : '止损单');
      }
    }

    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles, playhead, fills, orders, position, symbol.code, liquidationPrice, overlays]);

  const latestMacd = computeMacd(candles.slice(0, playhead + 1)).at(-1);

  return (
    <div className="chart-pane-wrap">
      <div className="macd-badge" aria-live="polite">
        <strong>MACD</strong>
        <span>DIF {latestMacd ? latestMacd.dif.toFixed(2) : '—'}</span>
        <span>DEA {latestMacd ? latestMacd.dea.toFixed(2) : '—'}</span>
        <span className={latestMacd && latestMacd.hist >= 0 ? 'up' : 'down'}>
          HIST {latestMacd ? latestMacd.hist.toFixed(2) : '—'}
        </span>
      </div>
      <div className="chart-pane" ref={containerRef} aria-label={`${symbol.name} 回放图表`} />
    </div>
  );
}
