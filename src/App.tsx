import { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CandlestickChart,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react';
import { ChartPane } from './components/ChartPane';
import {
  SYMBOLS,
  TIMEFRAMES,
  LEVERAGE_OPTIONS,
  USDT_CNY_RATE,
  applyFill,
  computeMacd,
  computeStats,
  emptyPosition,
  estimateLiquidationPrice,
  formatMoney,
  formatPrice,
  formatTime,
  generateMarketData,
  getSymbol,
  marketQuotes,
  matchPendingOrders,
  matchProtectiveOrders,
  positionMargin,
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
  type Timeframe,
} from './model/market';
import './styles.css';

type Screen = 'setup' | 'practice' | 'report';
type MobileTab = 'chart' | 'trade' | 'account';
type AccountTab = 'positions' | 'orders' | 'fills';

const DEFAULT_CONFIG: SessionConfig = {
  symbolCode: 'NAS100',
  timeframe: '5m',
  startCapital: 100_000,
  startOffset: 80,
  blindMode: false,
};

const MOBILE_SPEEDS = [0.5, 1, 2, 5, 10, 20, 50] as const;

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_CONFIG);
  const symbol = useMemo(() => getSymbol(config.symbolCode), [config.symbolCode]);
  const candles = useMemo(
    () => generateMarketData(symbol, config.timeframe),
    [symbol, config.timeframe],
  );

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
  const [mobileTab, setMobileTab] = useState<MobileTab>('chart');
  const [accountTab, setAccountTab] = useState<AccountTab>('positions');
  const [toast, setToast] = useState('');
  const [pickMode, setPickMode] = useState<'tp' | 'sl' | 'limit' | null>(null);

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

  const resetTradingState = (nextConfig = config) => {
    setPlayhead(nextConfig.startOffset);
    setPlaying(false);
    setPosition(emptyPosition());
    setOrders([]);
    setFills([]);
    setLimitPrice('');
    setTakeProfit('');
    setStopLoss('');
    setPickMode(null);
    setMobileTab('chart');
    setAccountTab('positions');
  };

  const startSession = () => {
    resetTradingState(config);
    setScreen('practice');
    setToast('会话已开始，点播放即可逐根练习');
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
      setMobileTab('account');
      setAccountTab('fills');
    }
  }, [playhead, position.quantity, position.takeProfit, position.stopLoss]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2000);
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
      setToast('请输入委托价，或到行情页点图选价');
      setPickMode('limit');
      setMobileTab('chart');
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
      setMobileTab('account');
      setToast(`${side === 'buy' ? '买入' : '卖出'}委托已挂单 · ${leverage}x`);
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
    setToast(`${side === 'buy' ? '开多' : '开空'} ${quantity} 张 · ${leverage}x`);
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
    setToast(`已平仓 · 实现盈亏 ${money(result.realizedPnl)}`);
    setAccountTab('fills');
  };

  const onPickPrice = (price: number) => {
    const rounded = roundToTick(price, symbol.tickSize);
    if (pickMode === 'tp') setTakeProfit(String(rounded));
    else if (pickMode === 'sl') setStopLoss(String(rounded));
    else setLimitPrice(String(rounded));
    setPickMode(null);
    setToast(`已选 ${priceText(rounded)}`);
    setMobileTab('trade');
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
                  {item.category} · {item.code}
                </option>
              ))}
            </select>
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

      <main className="mobile-main">
        {mobileTab === 'chart' && (
          <section className="chart-view">
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
              <div className="quote-mini">
                <span className="up">{priceText(quotes.bid)}</span>
                <span>/</span>
                <span className="down">{priceText(quotes.ask)}</span>
              </div>
            </div>

            {pickMode && (
              <div className="pick-tip">
                点图表设置{pickMode === 'tp' ? '止盈' : pickMode === 'sl' ? '止损' : '委托价'}
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
              onPickPrice={onPickPrice}
            />

            <div className="replay-dock">
              <div className="progress-line">
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className="replay-row">
                <button type="button" className="ctrl" onClick={() => setPlayhead(0)} aria-label="回到开始">
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className="ctrl"
                  onClick={() => { setPlaying(false); setPlayhead((value) => Math.max(0, value - 1)); }}
                  aria-label="上一根K线"
                >
                  <StepBack size={16} />
                </button>
                <button
                  type="button"
                  className={`play-toggle ${playing ? 'is-playing' : 'is-paused'}`}
                  onClick={() => setPlaying((value) => !value)}
                  aria-label={playing ? '暂停回放' : '开始回放'}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                  <span>{playing ? '暂停' : '播放'}</span>
                </button>
                <button
                  type="button"
                  className="ctrl"
                  onClick={() => { setPlaying(false); setPlayhead((value) => Math.min(candles.length - 1, value + 1)); }}
                  aria-label="下一根K线"
                >
                  <StepForward size={16} />
                </button>
                <button type="button" className="ctrl" onClick={() => setPlayhead(candles.length - 1)} aria-label="跳到最后">
                  <SkipForward size={16} />
                </button>
                <label className="speed-select">
                  <span>速率</span>
                  <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                    {MOBILE_SPEEDS.map((item) => (
                      <option key={item} value={item}>{item}x</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="macd-mini">
                <span>MACD</span>
                <span>DIF {macd ? macd.dif.toFixed(2) : '—'}</span>
                <span>DEA {macd ? macd.dea.toFixed(2) : '—'}</span>
                <span className={macd && macd.hist >= 0 ? 'up' : 'down'}>柱 {macd ? macd.hist.toFixed(2) : '—'}</span>
                <span>{formatTime(current.time)}</span>
              </div>
            </div>
          </section>
        )}

        {mobileTab === 'trade' && (
          <section className="trade-view">
            <div className="panel-tabs">
              {([
                ['market', '市价'],
                ['limit', '限价'],
                ['stop', '止损单'],
              ] as [OrderType, string][]).map(([value, label]) => (
                <button key={value} className={orderType === value ? 'active' : ''} onClick={() => setOrderType(value)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="trade-price-card">
              <div>
                <span>买一</span>
                <strong className="up">{priceText(quotes.bid)}</strong>
              </div>
              <div>
                <span>卖一</span>
                <strong className="down">{priceText(quotes.ask)}</strong>
              </div>
              <div>
                <span>点差</span>
                <strong>{priceText(quotes.spread)}</strong>
              </div>
            </div>

            <label className="field">
              <span>杠杆</span>
              <div className="leverage-row">
                {LEVERAGE_OPTIONS.map((item) => (
                  <button
                    key={item}
                    className={leverage === item ? 'active' : ''}
                    onClick={() => setLeverage(item)}
                  >
                    {item}x
                  </button>
                ))}
              </div>
            </label>

            {orderType !== 'market' && (
              <label className="field">
                <span>
                  委托价格（{unitLabel(currency)}）
                  <button type="button" onClick={() => { setPickMode('limit'); setMobileTab('chart'); }}>点图选价</button>
                </span>
                <input
                  value={limitPrice}
                  onChange={(event) => setLimitPrice(event.target.value)}
                  placeholder={priceText(current.close)}
                  inputMode="decimal"
                />
              </label>
            )}

            <label className="field">
              <span>数量（张）</span>
              <div className="stepper">
                <button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  inputMode="numeric"
                />
                <button onClick={() => setQuantity((value) => Math.min(50, value + 1))}>+</button>
              </div>
            </label>

            <div className="margin-preview">
              <div><span>保证金</span><strong>{money(orderMargin)}</strong></div>
              <div><span>可开</span><strong>{Math.max(0, Math.floor((available * leverage) / Math.max(markPrice, 1)))} 张</strong></div>
              <div><span>汇率</span><strong>1 USDT ≈ {USDT_CNY_RATE} ¥</strong></div>
            </div>

            <div className="tp-sl-grid">
              <label>
                <span>
                  止盈
                  <button type="button" onClick={() => { setPickMode('tp'); setMobileTab('chart'); }}>点图</button>
                </span>
                <input value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="可选" inputMode="decimal" />
              </label>
              <label>
                <span>
                  止损
                  <button type="button" onClick={() => { setPickMode('sl'); setMobileTab('chart'); }}>点图</button>
                </span>
                <input value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="可选" inputMode="decimal" />
              </label>
            </div>

            <div className="order-actions">
              <button className="buy" onClick={() => placeOrder('buy')}>
                <span>买入开多</span>
                <strong>{priceText(orderType === 'market' ? quotes.ask : Number(limitPrice) || quotes.ask)}</strong>
              </button>
              <button className="sell" onClick={() => placeOrder('sell')}>
                <span>卖出开空</span>
                <strong>{priceText(orderType === 'market' ? quotes.bid : Number(limitPrice) || quotes.bid)}</strong>
              </button>
            </div>

            <button className="close-btn" onClick={closePosition} disabled={position.quantity === 0}>
              {position.quantity === 0 ? '当前无持仓' : `市价平仓 ${Math.abs(position.quantity)} 张`}
            </button>
          </section>
        )}

        {mobileTab === 'account' && (
          <section className="account-view">
            <div className="account-summary okx-summary">
              <div><span>账户权益</span><strong>{money(equity)}</strong></div>
              <div><span>未实现盈亏</span><strong className={floating >= 0 ? 'up' : 'down'}>{money(floating)}</strong></div>
              <div><span>已实现盈亏</span><strong className={position.realizedPnl >= 0 ? 'up' : 'down'}>{money(position.realizedPnl)}</strong></div>
              <div><span>占用保证金</span><strong>{money(usedMargin)}</strong></div>
              <div><span>可用</span><strong>{money(available)}</strong></div>
              <div><span>收益率</span><strong className={roe >= 0 ? 'up' : 'down'}>{roe.toFixed(2)}%</strong></div>
            </div>

            <div className="panel-tabs">
              <button className={accountTab === 'positions' ? 'active' : ''} onClick={() => setAccountTab('positions')}>持仓</button>
              <button className={accountTab === 'orders' ? 'active' : ''} onClick={() => setAccountTab('orders')}>委托 {orders.length || ''}</button>
              <button className={accountTab === 'fills' ? 'active' : ''} onClick={() => setAccountTab('fills')}>成交 {fills.length || ''}</button>
            </div>

            <div className="list-scroll">
              {accountTab === 'positions' && (
                position.quantity === 0 ? (
                  <div className="empty">暂无持仓，去「交易」页开仓</div>
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
                    <div className="kv">
                      <span>止盈 {position.takeProfit ? priceText(position.takeProfit) : '—'}</span>
                      <span>止损 {position.stopLoss ? priceText(position.stopLoss) : '—'}</span>
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
        )}
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        <button className={mobileTab === 'chart' ? 'active' : ''} onClick={() => setMobileTab('chart')}>
          <CandlestickChart size={20} />
          <span>行情</span>
        </button>
        <button className={mobileTab === 'trade' ? 'active' : ''} onClick={() => setMobileTab('trade')}>
          <WalletCards size={20} />
          <span>交易</span>
        </button>
        <button className={mobileTab === 'account' ? 'active' : ''} onClick={() => setMobileTab('account')}>
          <BriefcaseBusiness size={20} />
          <span>账户</span>
        </button>
      </nav>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
