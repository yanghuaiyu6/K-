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
  applyFill,
  computeMacd,
  computeStats,
  emptyPosition,
  formatMoney,
  formatPrice,
  formatTime,
  generateMarketData,
  getSymbol,
  marketQuotes,
  matchPendingOrders,
  matchProtectiveOrders,
  roundToTick,
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

const MOBILE_SPEEDS = [1, 2, 5, 10, 20] as const;

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
  const unrealized =
    position.quantity === 0 ? 0 : (current.close - position.averagePrice) * position.quantity;
  const equity = config.startCapital + position.realizedPnl + unrealized;
  const progress = (playhead / Math.max(1, candles.length - 1)) * 100;
  const displaySymbol = config.blindMode ? 'BLIND' : symbol.code;
  const stats = useMemo(() => computeStats(fills, config.startCapital), [fills, config.startCapital]);
  const macd = useMemo(
    () => computeMacd(candles.slice(0, playhead + 1)).at(-1),
    [candles, playhead],
  );

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
        },
        ...currentOrders,
      ]);
      setAccountTab('orders');
      setMobileTab('account');
      setToast(`${side === 'buy' ? '买入' : '卖出'}委托已挂单`);
      return;
    }

    const result = applyFill(position, side, quantity, price, symbol.commission * quantity);
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
    setToast(`${side === 'buy' ? '买入' : '卖出'} ${quantity} 手成功`);
  };

  const closePosition = () => {
    if (position.quantity === 0) return;
    const side: Side = position.quantity > 0 ? 'sell' : 'buy';
    const qty = Math.abs(position.quantity);
    const price = side === 'buy' ? quotes.ask : quotes.bid;
    const result = applyFill(position, side, qty, price, symbol.commission * qty);
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
    setToast('已市价平仓');
    setAccountTab('fills');
  };

  const onPickPrice = (price: number) => {
    const rounded = roundToTick(price, symbol.tickSize);
    if (pickMode === 'tp') setTakeProfit(String(rounded));
    else if (pickMode === 'sl') setStopLoss(String(rounded));
    else setLimitPrice(String(rounded));
    setPickMode(null);
    setToast(`已选 ${formatPrice(rounded, symbol)}`);
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
            <span>起始资金</span>
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
            <span>点差 {formatPrice(symbol.spreadTicks * symbol.tickSize, symbol)}</span>
            <span>手续费 {formatMoney(symbol.commission)}</span>
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
          <button className="ghost" onClick={() => setScreen('setup')}><X size={16} /></button>
        </header>

        <section className="report-grid">
          <div className="report-hero">
            <span>净盈亏</span>
            <strong className={stats.netPnl >= 0 ? 'up' : 'down'}>{formatMoney(stats.netPnl)}</strong>
          </div>
          <div className="stat"><span>胜率</span><strong>{(stats.winRate * 100).toFixed(1)}%</strong></div>
          <div className="stat"><span>获利因子</span><strong>{Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}</strong></div>
          <div className="stat"><span>最大回撤</span><strong className="down">{formatMoney(stats.maxDrawdown)}</strong></div>
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
                    <strong className={fill.side === 'buy' ? 'up' : 'down'}>{fill.side === 'buy' ? '买入' : '卖出'} {fill.quantity}手</strong>
                    <span>{formatTime(fill.time)}</span>
                  </div>
                  <div className="right">
                    <strong>{formatPrice(fill.price, symbol)}</strong>
                    <span className={fill.realizedPnl >= 0 ? 'up' : 'down'}>{formatMoney(fill.realizedPnl)}</span>
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
          <span>{TIMEFRAMES.find((item) => item.id === config.timeframe)?.label} · {formatTime(current.time)}</span>
        </div>
        <div className="pnl-block">
          <strong className={unrealized + position.realizedPnl >= 0 ? 'up' : 'down'}>
            {formatMoney(unrealized + position.realizedPnl)}
          </strong>
          <span>权益 {formatMoney(equity)}</span>
        </div>
        <button className="end-chip" onClick={endSession}>结束</button>
      </header>

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
                <span className="up">{formatPrice(quotes.bid, symbol)}</span>
                <span>/</span>
                <span className="down">{formatPrice(quotes.ask, symbol)}</span>
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
                <button onClick={() => setPlayhead(0)} aria-label="开始"><SkipBack size={18} /></button>
                <button onClick={() => { setPlaying(false); setPlayhead((value) => Math.max(0, value - 1)); }} aria-label="上一根"><StepBack size={18} /></button>
                <button className="play" onClick={() => setPlaying((value) => !value)} aria-label="播放暂停">
                  {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <button onClick={() => { setPlaying(false); setPlayhead((value) => Math.min(candles.length - 1, value + 1)); }} aria-label="下一根"><StepForward size={18} /></button>
                <button onClick={() => setPlayhead(candles.length - 1)} aria-label="结束"><SkipForward size={18} /></button>
                <div className="speed-mini">
                  {(MOBILE_SPEEDS as readonly number[]).map((item) => (
                    <button key={item} className={speed === item ? 'active' : ''} onClick={() => setSpeed(item)}>
                      {item}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="macd-mini">
                <span>MACD</span>
                <span>DIF {macd ? macd.dif.toFixed(2) : '—'}</span>
                <span>DEA {macd ? macd.dea.toFixed(2) : '—'}</span>
                <span className={macd && macd.hist >= 0 ? 'up' : 'down'}>柱 {macd ? macd.hist.toFixed(2) : '—'}</span>
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
                <span>买价</span>
                <strong className="up">{formatPrice(quotes.bid, symbol)}</strong>
              </div>
              <div>
                <span>卖价</span>
                <strong className="down">{formatPrice(quotes.ask, symbol)}</strong>
              </div>
              <div>
                <span>点差</span>
                <strong>{formatPrice(quotes.spread, symbol)}</strong>
              </div>
            </div>

            {orderType !== 'market' && (
              <label className="field">
                <span>
                  委托价格
                  <button type="button" onClick={() => { setPickMode('limit'); setMobileTab('chart'); }}>点图选价</button>
                </span>
                <input
                  value={limitPrice}
                  onChange={(event) => setLimitPrice(event.target.value)}
                  placeholder={formatPrice(current.close, symbol)}
                  inputMode="decimal"
                />
              </label>
            )}

            <label className="field">
              <span>手数</span>
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
                <span>买入做多</span>
                <strong>{formatPrice(orderType === 'market' ? quotes.ask : Number(limitPrice) || quotes.ask, symbol)}</strong>
              </button>
              <button className="sell" onClick={() => placeOrder('sell')}>
                <span>卖出做空</span>
                <strong>{formatPrice(orderType === 'market' ? quotes.bid : Number(limitPrice) || quotes.bid, symbol)}</strong>
              </button>
            </div>

            <button className="close-btn" onClick={closePosition} disabled={position.quantity === 0}>
              {position.quantity === 0 ? '当前无持仓' : `市价平仓 ${Math.abs(position.quantity)} 手`}
            </button>
          </section>
        )}

        {mobileTab === 'account' && (
          <section className="account-view">
            <div className="account-summary">
              <div><span>权益</span><strong>{formatMoney(equity)}</strong></div>
              <div><span>浮动</span><strong className={unrealized >= 0 ? 'up' : 'down'}>{formatMoney(unrealized)}</strong></div>
              <div><span>已实现</span><strong className={position.realizedPnl >= 0 ? 'up' : 'down'}>{formatMoney(position.realizedPnl)}</strong></div>
            </div>

            <div className="panel-tabs">
              <button className={accountTab === 'positions' ? 'active' : ''} onClick={() => setAccountTab('positions')}>持仓</button>
              <button className={accountTab === 'orders' ? 'active' : ''} onClick={() => setAccountTab('orders')}>委托 {orders.length || ''}</button>
              <button className={accountTab === 'fills' ? 'active' : ''} onClick={() => setAccountTab('fills')}>成交 {fills.length || ''}</button>
            </div>

            <div className="list-scroll">
              {accountTab === 'positions' && (
                position.quantity === 0 ? (
                  <div className="empty">暂无持仓，去「交易」页下单</div>
                ) : (
                  <div className="position-card">
                    <div className="row-between">
                      <strong>{displaySymbol}</strong>
                      <span className={position.quantity > 0 ? 'up' : 'down'}>
                        {position.quantity > 0 ? '多' : '空'} {Math.abs(position.quantity)} 手
                      </span>
                    </div>
                    <div className="kv">
                      <span>均价 {formatPrice(position.averagePrice, symbol)}</span>
                      <span>现价 {formatPrice(current.close, symbol)}</span>
                    </div>
                    <div className="kv">
                      <span>止盈 {position.takeProfit ? formatPrice(position.takeProfit, symbol) : '—'}</span>
                      <span>止损 {position.stopLoss ? formatPrice(position.stopLoss, symbol) : '—'}</span>
                    </div>
                    <strong className={unrealized >= 0 ? 'up' : 'down'}>{formatMoney(unrealized)}</strong>
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
                        <span>{order.quantity} 手 @ {formatPrice(order.price, symbol)}</span>
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
                        <strong className={fill.side === 'buy' ? 'up' : 'down'}>{fill.side === 'buy' ? '买' : '卖'} {fill.quantity}手</strong>
                        <span>{formatTime(fill.time)}</span>
                      </div>
                      <div className="right">
                        <strong>{formatPrice(fill.price, symbol)}</strong>
                        <span className={fill.realizedPnl >= 0 ? 'up' : 'down'}>{formatMoney(fill.realizedPnl)}</span>
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
