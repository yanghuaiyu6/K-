import { useEffect, useMemo, useState } from 'react';
import {
  CandlestickChart,
  Dices,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  StepBack,
  StepForward,
  TrendingUp,
  X,
} from 'lucide-react';
import { ChartPane } from './components/ChartPane';
import {
  HISTORY_SOURCES,
  SYMBOLS,
  TIMEFRAMES,
  LEVERAGE_OPTIONS,
  USDT_CNY_RATE,
  applyFill,
  clampReplayOffset,
  computeMacd,
  computeStats,
  emptyPosition,
  estimateLiquidationPrice,
  findCandleIndexByTime,
  formatMoney,
  formatPrice,
  formatTime,
  generateMarketData,
  getHistorySource,
  getSymbol,
  historyBarCount,
  marketQuotes,
  matchPendingOrders,
  matchProtectiveOrders,
  maxReplayOffset,
  minReplayOffset,
  pickRandomStartOffset,
  positionMargin,
  resolveStartOffset,
  roundToTick,
  unitLabel,
  unrealizedPnl,
  unrealizedRoe,
  type CurrencyUnit,
  type Fill,
  type OrderType,
  type PendingOrder,
  type Position,
  type SessionConfig,
  type Side,
  type StartMode,
  type Timeframe,
} from './model/market';
import './styles.css';

type Screen = 'setup' | 'practice' | 'report';
type AccountTab = 'positions' | 'orders' | 'fills';
type PickMode = 'tp' | 'sl' | 'limit' | 'replay' | null;

const DEFAULT_CONFIG: SessionConfig = {
  symbolCode: 'NAS100',
  timeframe: '5m',
  startCapital: 100_000,
  startOffset: 80,
  blindMode: false,
  historySourceId: 'us-session-2024',
  startMode: 'random',
};

const MOBILE_SPEEDS = [0.5, 1, 2, 5, 10, 20, 50] as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_CONFIG);
  const symbol = useMemo(() => getSymbol(config.symbolCode), [config.symbolCode]);
  const historySource = useMemo(
    () => getHistorySource(config.historySourceId),
    [config.historySourceId],
  );
  const candles = useMemo(
    () => generateMarketData(symbol, config.timeframe, { source: historySource }),
    [symbol, config.timeframe, historySource],
  );
  const candleCount = candles.length;
  const replayMin = minReplayOffset(candleCount);
  const replayMax = maxReplayOffset(candleCount);

  const [playhead, setPlayhead] = useState(config.startOffset);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState(1);
  const [leverage, setLeverage] = useState(10);
  const [currency, setCurrency] = useState<CurrencyUnit>('USDT');
  const [limitPrice, setLimitPrice] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [position, setPosition] = useState<Position>(emptyPosition());
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [fills, setFills] = useState<Fill[]>([]);
  const [accountTab, setAccountTab] = useState<AccountTab>('positions');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [pickMode, setPickMode] = useState<PickMode>(null);

  const current = candles[playhead] ?? candles[0];
  const quotes = marketQuotes(symbol, current.close);
  const markPrice = current.close;
  const activeLeverage = position.quantity !== 0 ? position.leverage : leverage;
  const floating = unrealizedPnl(position, markPrice);
  const roe = unrealizedRoe(position, markPrice, activeLeverage);
  const usedMargin =
    position.quantity === 0 ? 0 : positionMargin(position.averagePrice, position.quantity, activeLeverage);
  const orderMargin = positionMargin(markPrice, quantity, leverage);
  const available = config.startCapital + position.realizedPnl - usedMargin;
  const equity = config.startCapital + position.realizedPnl + floating;
  const liqPrice = estimateLiquidationPrice(position, activeLeverage);
  const progress = (playhead / Math.max(1, candles.length - 1)) * 100;
  const displaySymbol = config.blindMode ? 'BLIND-USDT' : `${symbol.code}-USDT`;
  const stats = useMemo(() => computeStats(fills, config.startCapital), [fills, config.startCapital]);
  const macd = useMemo(
    () => computeMacd(candles.slice(0, playhead + 1)).at(-1),
    [candles, playhead],
  );

  const money = (value: number) => formatMoney(value, currency);
  const priceText = (value: number) => formatPrice(value, symbol, currency);

  const clearOrdersAndFills = () => {
    setPosition(emptyPosition());
    setOrders([]);
    setFills([]);
    setLimitPrice('');
    setTakeProfit('');
    setStopLoss('');
    setPickMode(null);
    setAccountTab('positions');
    setSheetOpen(false);
  };

  const jumpToReplay = (offset: number, label: string, quiet = false) => {
    const next = clampReplayOffset(offset, candleCount);
    setPlaying(false);
    setPlayhead(next);
    setConfig((value) => ({ ...value, startOffset: next, startMode: 'custom' }));
    clearOrdersAndFills();
    const candle = candles[next];
    if (!quiet) {
      setToast(`${label} · ${candle ? formatTime(candle.time) : ''}`);
    }
  };

  const jumpToBegin = () => jumpToReplay(replayMin, '数据起点');
  const jumpToRandom = () => jumpToReplay(pickRandomStartOffset(candleCount), '随机跳转');

  const resetTradingState = (nextConfig = config, offset = nextConfig.startOffset) => {
    setPlayhead(clampReplayOffset(offset, candleCount));
    setPlaying(false);
    clearOrdersAndFills();
  };

  const startSession = () => {
    const offset = resolveStartOffset(config.startMode, candleCount, config.startOffset);
    const nextConfig = { ...config, startOffset: offset };
    setConfig(nextConfig);
    resetTradingState(nextConfig, offset);
    setScreen('practice');
    const modeLabel =
      config.startMode === 'begin' ? '从数据起点' : config.startMode === 'random' ? '随机历史时间' : '自定义起点';
    setToast(`${modeLabel}开始 · ${formatTime(candles[offset]?.time ?? Date.now())}`);
  };

  const endSession = () => {
    setPlaying(false);
    setScreen('report');
  };

  useEffect(() => {
    if (!playing || screen !== 'practice') return undefined;
    const timer = window.setInterval(() => {
      setPlayhead((value) => {
        if (value >= candles.length - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, Math.max(50, 700 / speed));
    return () => window.clearInterval(timer);
  }, [playing, speed, candles.length, screen]);

  useEffect(() => {
    setPlayhead((value) => clampReplayOffset(value, candleCount));
  }, [candleCount, config.historySourceId, config.timeframe]);

  useEffect(() => {
    if (screen !== 'practice') return;
    const candle = candles[playhead];
    if (!candle) return;
    setOrders((currentOrders) => {
      const matched = matchPendingOrders(currentOrders, candle, symbol, position);
      if (matched.fills.length > 0) {
        setPosition(matched.position);
        setFills((currentFills) => [...matched.fills, ...currentFills]);
        setToast(`委托成交 ${matched.fills.length} 笔`);
        setAccountTab('fills');
      }
      return matched.remainingOrders;
    });
  }, [playhead]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (screen !== 'practice') return;
    const candle = candles[playhead];
    if (!candle || position.quantity === 0) return;
    const protective = matchProtectiveOrders(position, candle, symbol);
    if (protective.fills.length > 0) {
      setPosition(protective.position);
      setFills((currentFills) => [...protective.fills, ...currentFills]);
      setToast(protective.fills[0].reason === 'takeProfit' ? '止盈已触发' : '止损已触发');
      setAccountTab('fills');
    }
  }, [playhead, position.quantity, position.takeProfit, position.stopLoss]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 900);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const parseOptional = (value: string) => {
    if (!value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? roundToTick(number, symbol.tickSize) : null;
  };

  const placeOrder = (side: Side) => {
    const tp = parseOptional(takeProfit);
    const sl = parseOptional(stopLoss);
    const price =
      orderType === 'market' ? (side === 'buy' ? quotes.ask : quotes.bid) : Number(limitPrice);

    if (orderType !== 'market' && (!Number.isFinite(price) || price <= 0)) {
      setToast('请输入委托价，或点图选价');
      setPickMode('limit');
      return;
    }

    if (orderType !== 'market') {
      setOrders((currentOrders) => [
        {
          id: Date.now(),
          side,
          type: orderType,
          quantity,
          price,
          takeProfit: tp,
          stopLoss: sl,
          createdAt: current.time,
          leverage,
        },
        ...currentOrders,
      ]);
      setAccountTab('orders');
      setToast(`${side === 'buy' ? '买入' : '卖出'}已挂单`);
      return;
    }

    const result = applyFill(position, side, quantity, price, symbol.commission * quantity, leverage);
    setPosition({
      ...result.position,
      takeProfit: tp ?? result.position.takeProfit,
      stopLoss: sl ?? result.position.stopLoss,
    });
    setFills((currentFills) => [
      {
        id: Date.now(),
        side,
        quantity,
        price,
        fee: symbol.commission * quantity,
        time: current.time,
        realizedPnl: result.realizedPnl,
        reason: 'market',
      },
      ...currentFills,
    ]);
    setAccountTab('positions');
    setToast(`${side === 'buy' ? '开多' : '开空'} ${quantity}张`);
  };

  const closePosition = () => {
    if (position.quantity === 0) return;
    const side: Side = position.quantity > 0 ? 'sell' : 'buy';
    const qty = Math.abs(position.quantity);
    const price = side === 'buy' ? quotes.ask : quotes.bid;
    const result = applyFill(position, side, qty, price, symbol.commission * qty, position.leverage);
    setPosition(emptyPosition());
    setFills((currentFills) => [
      {
        id: Date.now(),
        side,
        quantity: qty,
        price,
        fee: symbol.commission * qty,
        time: current.time,
        realizedPnl: result.realizedPnl,
        reason: 'close',
      },
      ...currentFills,
    ]);
    setToast(`已平仓 ${money(result.realizedPnl)}`);
    setAccountTab('fills');
  };

  const onPickPrice = (price: number) => {
    if (pickMode === 'replay') return;
    const rounded = roundToTick(price, symbol.tickSize);
    if (pickMode === 'tp') setTakeProfit(String(rounded));
    else if (pickMode === 'sl') setStopLoss(String(rounded));
    else setLimitPrice(String(rounded));
    setPickMode(null);
    setToast(`已选 ${priceText(rounded)}`);
  };

  const onPickBar = (timeMs: number) => {
    if (pickMode !== 'replay') return;
    const index = findCandleIndexByTime(candles, timeMs);
    jumpToReplay(index, '选点回放');
  };

  const setStartMode = (mode: StartMode) => {
    setConfig((value) => {
      if (mode === 'begin') {
        return { ...value, startMode: mode, startOffset: replayMin };
      }
      if (mode === 'random') {
        return { ...value, startMode: mode, startOffset: pickRandomStartOffset(candleCount) };
      }
      return {
        ...value,
        startMode: mode,
        startOffset: clampReplayOffset(Math.floor(candleCount * 0.35), candleCount),
      };
    });
  };

  if (screen === 'setup') {
    return (
      <div className="screen setup-screen">
        <div className="setup-top">
          <div className="brand">
            <span className="brand-mark"><TrendingUp size={18} /></span>
            <div>
              <strong>ReplayTrader</strong>
              <em>中文专业复盘</em>
            </div>
          </div>
          <p>一屏完成设置，马上开始逐根回放交易。</p>
        </div>

        <section className="setup-card">
          <h1>新建练习</h1>

          <label>
            <span>交易品种</span>
            <select
              value={config.symbolCode}
              onChange={(event) => setConfig((value) => ({ ...value, symbolCode: event.target.value }))}
            >
              {SYMBOLS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.category} · {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>历史数据源</span>
            <select
              value={config.historySourceId}
              onChange={(event) => setConfig((value) => ({ ...value, historySourceId: event.target.value }))}
            >
              {HISTORY_SOURCES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {historyBarCount(item, config.timeframe)} 根
                </option>
              ))}
            </select>
            <small className="field-hint">{historySource.description}</small>
          </label>

          <label>
            <span>时间周期</span>
            <div className="chip-row">
              {TIMEFRAMES.map((item) => (
                <button
                  key={item.id}
                  className={config.timeframe === item.id ? 'active' : ''}
                  onClick={() => setConfig((value) => ({ ...value, timeframe: item.id }))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>回放起点（类似 TradingView Replay）</span>
            <div className="chip-row start-mode-row">
              <button
                type="button"
                className={config.startMode === 'begin' ? 'active' : ''}
                onClick={() => setStartMode('begin')}
              >
                数据起点
              </button>
              <button
                type="button"
                className={config.startMode === 'random' ? 'active' : ''}
                onClick={() => setStartMode('random')}
              >
                随机时间
              </button>
              <button
                type="button"
                className={config.startMode === 'custom' ? 'active' : ''}
                onClick={() => setStartMode('custom')}
              >
                自定义进度
              </button>
            </div>
            {config.startMode === 'custom' && (
              <div className="start-scrub">
                <input
                  type="range"
                  min={replayMin}
                  max={replayMax}
                  value={clampReplayOffset(config.startOffset, candleCount)}
                  onChange={(event) =>
                    setConfig((value) => ({
                      ...value,
                      startMode: 'custom',
                      startOffset: Number(event.target.value),
                    }))
                  }
                />
                <span>
                  {formatTime(candles[clampReplayOffset(config.startOffset, candleCount)]?.time ?? Date.now())}
                  · {clampReplayOffset(config.startOffset, candleCount) + 1}/{candleCount}
                </span>
              </div>
            )}
            <small className="field-hint">
              当前数据 {candleCount} 根 · {formatTime(candles[0]?.time ?? Date.now())} 至{' '}
              {formatTime(candles[candleCount - 1]?.time ?? Date.now())}
            </small>
          </label>

          <label>
            <span>起始保证金（USDT）</span>
            <div className="chip-row">
              {[50_000, 100_000, 200_000].map((amount) => (
                <button
                  key={amount}
                  className={config.startCapital === amount ? 'active' : ''}
                  onClick={() => setConfig((value) => ({ ...value, startCapital: amount }))}
                >
                  {(amount / 1000).toFixed(0)}K
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>默认杠杆</span>
            <select value={leverage} onChange={(event) => setLeverage(Number(event.target.value))}>
              {LEVERAGE_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}x</option>
              ))}
            </select>
          </label>

          <label>
            <span>计价单位</span>
            <div className="currency-toggle">
              <button type="button" className={currency === 'USDT' ? 'active' : ''} onClick={() => setCurrency('USDT')}>USDT</button>
              <button type="button" className={currency === 'CNY' ? 'active' : ''} onClick={() => setCurrency('CNY')}>人民币</button>
            </div>
          </label>

          <label className="toggle-row">
            <span>
              <strong>盲盒模式</strong>
              <small>隐藏品种名</small>
            </span>
            <button
              className={config.blindMode ? 'switch on' : 'switch'}
              onClick={() => setConfig((value) => ({ ...value, blindMode: !value.blindMode }))}
              aria-label="切换盲盒模式"
            >
              <i />
            </button>
          </label>

          <div className="setup-meta">
            <span>点差 {priceText(symbol.spreadTicks * symbol.tickSize)}</span>
            <span>手续费 {money(symbol.commission)}</span>
            <span>1 USDT ≈ {USDT_CNY_RATE} ¥</span>
          </div>
        </section>

        <button className="primary-cta sticky-cta" onClick={startSession}>
          <Play size={18} fill="currentColor" /> 开始回放交易
        </button>
      </div>
    );
  }

  if (screen === 'report') {
    return (
      <div className="screen report-screen">
        <header className="report-head">
          <div>
            <p className="eyebrow">会话报告</p>
            <h1>{displaySymbol} · {TIMEFRAMES.find((item) => item.id === config.timeframe)?.label}</h1>
          </div>
          <div className="currency-toggle compact">
            <button className={currency === 'USDT' ? 'active' : ''} onClick={() => setCurrency('USDT')}>USDT</button>
            <button className={currency === 'CNY' ? 'active' : ''} onClick={() => setCurrency('CNY')}>人民币</button>
          </div>
          <button className="ghost" onClick={() => setScreen('setup')}><X size={16} /></button>
        </header>

        <section className="report-grid">
          <div className="report-hero">
            <span>净盈亏（{unitLabel(currency)}）</span>
            <strong className={stats.netPnl >= 0 ? 'up' : 'down'}>{money(stats.netPnl)}</strong>
          </div>
          <div className="stat"><span>胜率</span><strong>{(stats.winRate * 100).toFixed(1)}%</strong></div>
          <div className="stat"><span>获利因子</span><strong>{Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}</strong></div>
          <div className="stat"><span>最大回撤</span><strong className="down">{money(stats.maxDrawdown)}</strong></div>
          <div className="stat"><span>平仓笔数</span><strong>{stats.trades}</strong></div>
        </section>

        <section className="report-list">
          <h2>最近成交</h2>
          <div className="list-scroll">
            {fills.length === 0 ? (
              <div className="empty">本次没有成交</div>
            ) : (
              fills.slice(0, 12).map((fill) => (
                <div className="list-item" key={fill.id}>
                  <div>
                    <strong className={fill.side === 'buy' ? 'up' : 'down'}>{fill.side === 'buy' ? '买入' : '卖出'} {fill.quantity}张</strong>
                    <span>{formatTime(fill.time)}</span>
                  </div>
                  <div className="right">
                    <strong>{priceText(fill.price)}</strong>
                    <span className={fill.realizedPnl >= 0 ? 'up' : 'down'}>{money(fill.realizedPnl)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="report-actions">
          <button onClick={() => { resetTradingState(); setScreen('practice'); }}>
            <RotateCcw size={15} /> 再练一次
          </button>
          <button className="primary" onClick={() => setScreen('setup')}>新建会话</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen practice-screen">
      <header className="mobile-top">
        <div className="symbol-block">
          <strong>{displaySymbol}</strong>
          <span>{TIMEFRAMES.find((item) => item.id === config.timeframe)?.label} · 永续</span>
        </div>
        <div className="currency-toggle">
          <button className={currency === 'USDT' ? 'active' : ''} onClick={() => setCurrency('USDT')}>USDT</button>
          <button className={currency === 'CNY' ? 'active' : ''} onClick={() => setCurrency('CNY')}>¥</button>
        </div>
        <button className="end-chip" onClick={endSession}>结束</button>
      </header>

      <section className="okx-ticker" aria-label="合约行情">
        <div>
          <span>最新价</span>
          <strong className={floating >= 0 ? 'up' : 'down'}>{priceText(markPrice)}</strong>
        </div>
        <div>
          <span>标记价格</span>
          <strong>{priceText(markPrice)}</strong>
        </div>
        <div>
          <span>实时盈亏</span>
          <strong className={floating >= 0 ? 'up' : 'down'}>
            {money(floating)}
            <em>{position.quantity === 0 ? '' : ` (${roe >= 0 ? '+' : ''}${roe.toFixed(2)}%)`}</em>
          </strong>
        </div>
        <div>
          <span>可用</span>
          <strong>{money(available)}</strong>
        </div>
      </section>

      <main className="desk">
        <section className="chart-stack">
          <div className="chart-head">
            <div className="tf-row">
              {TIMEFRAMES.map((item) => (
                <button
                  key={item.id}
                  className={config.timeframe === item.id ? 'active' : ''}
                  onClick={() => {
                    setConfig((value) => ({ ...value, timeframe: item.id as Timeframe }));
                    setPlaying(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className="sheet-chip" onClick={() => setSheetOpen(true)}>
              持仓 {position.quantity === 0 ? 0 : Math.abs(position.quantity)}
              {orders.length ? ` · 委托${orders.length}` : ''}
            </button>
          </div>

          {pickMode && (
            <div className="pick-tip">
              {pickMode === 'replay'
                ? '点图表 K 线选择回放起点'
                : `点图表设置${pickMode === 'tp' ? '止盈' : pickMode === 'sl' ? '止损' : '委托价'}`}
              <button onClick={() => setPickMode(null)}>取消</button>
            </div>
          )}

          <ChartPane
            candles={candles}
            playhead={playhead}
            symbol={symbol}
            fills={fills}
            orders={orders}
            position={position}
            pickMode={pickMode === 'replay' ? 'bar' : pickMode ? 'price' : null}
            onPickPrice={onPickPrice}
            onPickBar={onPickBar}
          />

          <div className="replay-dock compact">
            <label className="progress-scrub">
              <input
                type="range"
                min={replayMin}
                max={Math.max(replayMin, candleCount - 1)}
                value={playhead}
                onChange={(event) => jumpToReplay(Number(event.target.value), '进度定位', true)}
                aria-label="回放进度"
              />
              <i style={{ width: `${progress}%` }} />
            </label>
            <div className="replay-row">
              <button type="button" className="ctrl" onClick={jumpToBegin} aria-label="数据起点" title="数据起点">
                <SkipBack size={15} />
              </button>
              <button
                type="button"
                className="ctrl"
                onClick={() => { setPlaying(false); setPlayhead((value) => Math.max(replayMin, value - 1)); }}
                aria-label="上一根"
              >
                <StepBack size={15} />
              </button>
              <button
                type="button"
                className={`play-toggle ${playing ? 'is-playing' : 'is-paused'}`}
                onClick={() => setPlaying((value) => !value)}
                aria-label={playing ? '暂停' : '播放'}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
                <span>{playing ? '暂停' : '播放'}</span>
              </button>
              <button
                type="button"
                className="ctrl"
                onClick={() => { setPlaying(false); setPlayhead((value) => Math.min(candles.length - 1, value + 1)); }}
                aria-label="下一根"
              >
                <StepForward size={15} />
              </button>
              <button type="button" className="ctrl" onClick={jumpToRandom} aria-label="随机时间" title="随机时间">
                <Dices size={15} />
              </button>
              <button
                type="button"
                className={`ctrl ${pickMode === 'replay' ? 'active-ctrl' : ''}`}
                onClick={() => setPickMode((value) => (value === 'replay' ? null : 'replay'))}
                aria-label="选点回放"
              >
                <CandlestickChart size={15} />
              </button>
              <label className="speed-select">
                <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="速率">
                  {MOBILE_SPEEDS.map((item) => (
                    <option key={item} value={item}>{item}x</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="macd-mini">
              <span>{formatTime(current.time)}</span>
              <span>{playhead + 1}/{candleCount}</span>
              <span className={macd && macd.hist >= 0 ? 'up' : 'down'}>MACD {macd ? macd.hist.toFixed(2) : '—'}</span>
            </div>
          </div>
        </section>

        <section className="trade-panel" aria-label="下单区">
          {position.quantity !== 0 && (
            <div className="pos-strip">
              <strong className={position.quantity > 0 ? 'up' : 'down'}>
                {position.quantity > 0 ? '多' : '空'} {Math.abs(position.quantity)}张 · {activeLeverage}x
              </strong>
              <span className={floating >= 0 ? 'up' : 'down'}>{money(floating)} ({roe.toFixed(2)}%)</span>
              <button type="button" onClick={closePosition}>平仓</button>
            </div>
          )}

          <div className="trade-toolbar">
            <div className="panel-tabs compact">
              {([
                ['market', '市价'],
                ['limit', '限价'],
                ['stop', '止损'],
              ] as [OrderType, string][]).map(([value, label]) => (
                <button key={value} className={orderType === value ? 'active' : ''} onClick={() => setOrderType(value)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="inline-field">
              <span>杠杆</span>
              <select value={leverage} onChange={(event) => setLeverage(Number(event.target.value))}>
                {LEVERAGE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}x</option>
                ))}
              </select>
            </label>
            <label className="inline-field qty-field">
              <span>数量</span>
              <div className="stepper compact">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  inputMode="numeric"
                />
                <button type="button" onClick={() => setQuantity((value) => Math.min(50, value + 1))}>+</button>
              </div>
            </label>
          </div>

          {orderType !== 'market' && (
            <label className="field compact-field">
              <span>
                委托价
                <button type="button" onClick={() => setPickMode('limit')}>点图</button>
              </span>
              <input
                value={limitPrice}
                onChange={(event) => setLimitPrice(event.target.value)}
                placeholder={priceText(current.close)}
                inputMode="decimal"
              />
            </label>
          )}

          <div className="tp-sl-grid compact">
            <label>
              <span>
                止盈
                <button type="button" onClick={() => setPickMode('tp')}>点图</button>
              </span>
              <input value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="可选" inputMode="decimal" />
            </label>
            <label>
              <span>
                止损
                <button type="button" onClick={() => setPickMode('sl')}>点图</button>
              </span>
              <input value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="可选" inputMode="decimal" />
            </label>
          </div>

          <div className="margin-line">
            <span>保证金 {money(orderMargin)}</span>
            <span>可开 {Math.max(0, Math.floor((available * leverage) / Math.max(markPrice, 1)))}张</span>
            <span>{priceText(quotes.bid)} / {priceText(quotes.ask)}</span>
          </div>

          <div className="order-actions compact">
            <button className="buy" onClick={() => placeOrder('buy')}>
              <span>开多</span>
              <strong>{priceText(orderType === 'market' ? quotes.ask : Number(limitPrice) || quotes.ask)}</strong>
            </button>
            <button className="sell" onClick={() => placeOrder('sell')}>
              <span>开空</span>
              <strong>{priceText(orderType === 'market' ? quotes.bid : Number(limitPrice) || quotes.bid)}</strong>
            </button>
            <button className="flat" onClick={closePosition} disabled={position.quantity === 0}>
              平仓
            </button>
          </div>
        </section>
      </main>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} role="presentation">
          <section className="account-sheet" onClick={(event) => event.stopPropagation()} aria-label="持仓账户">
            <header className="sheet-head">
              <strong>账户</strong>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="关闭"><X size={16} /></button>
            </header>
            <div className="account-summary okx-summary compact">
              <div><span>权益</span><strong>{money(equity)}</strong></div>
              <div><span>未实现</span><strong className={floating >= 0 ? 'up' : 'down'}>{money(floating)}</strong></div>
              <div><span>可用</span><strong>{money(available)}</strong></div>
            </div>
            <div className="panel-tabs compact">
              <button className={accountTab === 'positions' ? 'active' : ''} onClick={() => setAccountTab('positions')}>持仓</button>
              <button className={accountTab === 'orders' ? 'active' : ''} onClick={() => setAccountTab('orders')}>委托 {orders.length || ''}</button>
              <button className={accountTab === 'fills' ? 'active' : ''} onClick={() => setAccountTab('fills')}>成交 {fills.length || ''}</button>
            </div>
            <div className="list-scroll">
              {accountTab === 'positions' && (
                position.quantity === 0 ? (
                  <div className="empty">暂无持仓</div>
                ) : (
                  <div className="position-card okx-position">
                    <div className="row-between">
                      <strong>{displaySymbol}</strong>
                      <span className={position.quantity > 0 ? 'up' : 'down'}>
                        {position.quantity > 0 ? '多' : '空'} · {activeLeverage}x
                      </span>
                    </div>
                    <div className="okx-grid">
                      <div><span>持仓量</span><strong>{Math.abs(position.quantity)} 张</strong></div>
                      <div><span>开仓均价</span><strong>{priceText(position.averagePrice)}</strong></div>
                      <div><span>标记价格</span><strong>{priceText(markPrice)}</strong></div>
                      <div><span>预估强平价</span><strong>{liqPrice == null ? '—' : priceText(liqPrice)}</strong></div>
                      <div><span>保证金</span><strong>{money(usedMargin)}</strong></div>
                      <div><span>收益率</span><strong className={roe >= 0 ? 'up' : 'down'}>{roe.toFixed(2)}%</strong></div>
                    </div>
                    <div className="live-pnl">
                      <span>未实现盈亏</span>
                      <strong className={floating >= 0 ? 'up' : 'down'}>{money(floating)}</strong>
                    </div>
                    <button onClick={closePosition}>市价平仓</button>
                  </div>
                )
              )}
              {accountTab === 'orders' && (
                orders.length === 0 ? (
                  <div className="empty">暂无挂单</div>
                ) : (
                  orders.map((order) => (
                    <div className="list-item" key={order.id}>
                      <div>
                        <strong className={order.side === 'buy' ? 'up' : 'down'}>
                          {order.side === 'buy' ? '买' : '卖'} · {order.type === 'limit' ? '限价' : '止损单'}
                        </strong>
                        <span>{order.quantity} 张 · {order.leverage}x @ {priceText(order.price)}</span>
                      </div>
                      <button onClick={() => setOrders((value) => value.filter((item) => item.id !== order.id))}>撤单</button>
                    </div>
                  ))
                )
              )}
              {accountTab === 'fills' && (
                fills.length === 0 ? (
                  <div className="empty">暂无成交</div>
                ) : (
                  fills.map((fill) => (
                    <div className="list-item" key={fill.id}>
                      <div>
                        <strong className={fill.side === 'buy' ? 'up' : 'down'}>{fill.side === 'buy' ? '买' : '卖'} {fill.quantity}张</strong>
                        <span>{formatTime(fill.time)}</span>
                      </div>
                      <div className="right">
                        <strong>{priceText(fill.price)}</strong>
                        <span className={fill.realizedPnl >= 0 ? 'up' : 'down'}>{money(fill.realizedPnl)}</span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
