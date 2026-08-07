import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { ChartPane } from './components/ChartPane';
import {
  SPEEDS,
  SYMBOLS,
  TIMEFRAMES,
  applyFill,
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
  type MarketSymbol,
  type OrderType,
  type PendingOrder,
  type Position,
  type SessionConfig,
  type Side,
  type Timeframe,
} from './model/market';
import './styles.css';

type Screen = 'setup' | 'practice' | 'report';
type BottomTab = 'positions' | 'orders' | 'fills';

const DEFAULT_CONFIG: SessionConfig = {
  symbolCode: 'NAS100',
  timeframe: '5m',
  startCapital: 100_000,
  startOffset: 80,
  blindMode: false,
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="stat-chip">
      <span>{label}</span>
      <strong className={tone === 'up' ? 'up' : tone === 'down' ? 'down' : undefined}>{value}</strong>
    </div>
  );
}

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
  const [leverage, setLeverage] = useState(5);
  const [limitPrice, setLimitPrice] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [position, setPosition] = useState<Position>(emptyPosition());
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [fills, setFills] = useState<Fill[]>([]);
  const [tab, setTab] = useState<BottomTab>('positions');
  const [toast, setToast] = useState('');
  const [pickMode, setPickMode] = useState<'tp' | 'sl' | 'limit' | null>(null);

  const current = candles[playhead] ?? candles[0];
  const quotes = marketQuotes(symbol, current.close);
  const unrealized =
    position.quantity === 0
      ? 0
      : (current.close - position.averagePrice) * position.quantity;
  const equity = config.startCapital + position.realizedPnl + unrealized;
  const progress = (playhead / Math.max(1, candles.length - 1)) * 100;
  const displaySymbol = config.blindMode ? 'BLIND' : symbol.code;
  const stats = useMemo(() => computeStats(fills, config.startCapital), [fills, config.startCapital]);

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
    setTab('positions');
  };

  const startSession = () => {
    resetTradingState(config);
    setScreen('practice');
    setToast('练习会话已开始，按空格播放/暂停');
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
    }, Math.max(40, 700 / speed));
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
      setTab('fills');
    }
  }, [playhead, position.quantity, position.takeProfit, position.stopLoss]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (screen !== 'practice') return undefined;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead((value) => Math.min(candles.length - 1, value + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead((value) => Math.max(0, value - 1));
      } else if (event.key.toLowerCase() === 'b') {
        placeOrder('buy');
      } else if (event.key.toLowerCase() === 's') {
        placeOrder('sell');
      } else if (event.key.toLowerCase() === 'x') {
        closePosition();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const parseOptional = (value: string) => {
    if (!value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? roundToTick(number, symbol.tickSize) : null;
  };

  const placeOrder = (side: Side) => {
    const tp = parseOptional(takeProfit);
    const sl = parseOptional(stopLoss);
    const price =
      orderType === 'market'
        ? side === 'buy'
          ? quotes.ask
          : quotes.bid
        : Number(limitPrice);

    if (orderType !== 'market' && (!Number.isFinite(price) || price <= 0)) {
      setToast('请输入有效委托价格，或点击图表选价');
      setPickMode('limit');
      return;
    }

    if (orderType !== 'market') {
      const order: PendingOrder = {
        id: Date.now(),
        side,
        type: orderType,
        quantity,
        price,
        takeProfit: tp,
        stopLoss: sl,
        createdAt: current.time,
      };
      setOrders((currentOrders) => [order, ...currentOrders]);
      setTab('orders');
      setToast(`${side === 'buy' ? '买入' : '卖出'}委托已挂单`);
      return;
    }

    const result = applyFill(position, side, quantity, price, symbol.commission * quantity);
    const fill: Fill = {
      id: Date.now(),
      side,
      quantity,
      price,
      fee: symbol.commission * quantity,
      time: current.time,
      realizedPnl: result.realizedPnl,
      reason: 'market',
    };
    setPosition({
      ...result.position,
      takeProfit: tp ?? result.position.takeProfit,
      stopLoss: sl ?? result.position.stopLoss,
    });
    setFills((currentFills) => [fill, ...currentFills]);
    setTab('positions');
    setToast(`${side === 'buy' ? '买入' : '卖出'} ${quantity} 手 @ ${formatPrice(price, symbol)}`);
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
    setToast('持仓已市价平仓');
  };

  const onPickPrice = (price: number) => {
    const rounded = roundToTick(price, symbol.tickSize);
    if (pickMode === 'tp') setTakeProfit(String(rounded));
    else if (pickMode === 'sl') setStopLoss(String(rounded));
    else if (pickMode === 'limit') setLimitPrice(String(rounded));
    else setLimitPrice(String(rounded));
    setPickMode(null);
    setToast(`已选价格 ${formatPrice(rounded, symbol)}`);
  };

  if (screen === 'setup') {
    return (
      <div className="setup-shell">
        <header className="setup-hero">
          <div className="brand">
            <span className="brand-mark"><TrendingUp size={18} /></span>
            <div>
              <strong>ReplayTrader</strong>
              <em>中文复盘交易室</em>
            </div>
          </div>
          <p>选择市场、日期节奏与本金，按 K 线逐根回放真实交易决策。</p>
        </header>

        <section className="setup-card">
          <h1>新建练习会话</h1>
          <p className="setup-copy">像原版一样：先选品种，再设置周期，然后开始回放交易。</p>

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
            <select
              value={config.startCapital}
              onChange={(event) =>
                setConfig((value) => ({ ...value, startCapital: Number(event.target.value) }))
              }
            >
              {[25_000, 50_000, 100_000, 200_000].map((amount) => (
                <option key={amount} value={amount}>{formatMoney(amount)}</option>
              ))}
            </select>
          </label>

          <label className="toggle-row">
            <span>
              <strong>盲盒模式</strong>
              <small>隐藏品种名称，专注价格行为</small>
            </span>
            <button
              className={config.blindMode ? 'switch on' : 'switch'}
              onClick={() => setConfig((value) => ({ ...value, blindMode: !value.blindMode }))}
              aria-label="切换盲盒模式"
            >
              <i />
            </button>
          </label>

          <div className="setup-preview">
            <div><span>点差</span><strong>{formatPrice(symbol.spreadTicks * symbol.tickSize, symbol)}</strong></div>
            <div><span>手续费</span><strong>{formatMoney(symbol.commission)} / 手</strong></div>
            <div><span>起始位置</span><strong>第 {config.startOffset + 1} 根 K 线</strong></div>
          </div>

          <button className="primary-cta" onClick={startSession}>
            <Play size={18} fill="currentColor" /> 开始回放交易
          </button>
        </section>
      </div>
    );
  }

  if (screen === 'report') {
    return (
      <div className="report-shell">
        <header>
          <div>
            <p className="eyebrow">会话复盘报告</p>
            <h1>{displaySymbol} · {TIMEFRAMES.find((item) => item.id === config.timeframe)?.label}</h1>
          </div>
          <div className="report-actions">
            <button onClick={() => { resetTradingState(); setScreen('practice'); }}>
              <RotateCcw size={15} /> 再练一次
            </button>
            <button className="primary" onClick={() => setScreen('setup')}>新建会话</button>
          </div>
        </header>

        <section className="report-grid">
          <Stat label="净盈亏" value={formatMoney(stats.netPnl)} tone={stats.netPnl >= 0 ? 'up' : 'down'} />
          <Stat label="胜率" value={`${(stats.winRate * 100).toFixed(1)}%`} />
          <Stat label="获利因子" value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'} />
          <Stat label="最大回撤" value={formatMoney(stats.maxDrawdown)} tone="down" />
          <Stat label="平仓笔数" value={String(stats.trades)} />
          <Stat label="账户权益" value={formatMoney(config.startCapital + stats.netPnl)} />
        </section>

        <section className="report-table">
          <h2>成交明细</h2>
          {fills.length === 0 ? (
            <div className="empty">本次会话没有成交记录</div>
          ) : (
            <div className="table">
              {fills.map((fill) => (
                <div key={fill.id} className="row">
                  <span>{formatTime(fill.time)}</span>
                  <span className={fill.side === 'buy' ? 'up' : 'down'}>{fill.side === 'buy' ? '买' : '卖'}</span>
                  <span>{fill.quantity} 手</span>
                  <span>{formatPrice(fill.price, symbol)}</span>
                  <span className={fill.realizedPnl >= 0 ? 'up' : 'down'}>{formatMoney(fill.realizedPnl)}</span>
                  <span>{fill.reason}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="practice-shell">
      <header className="topbar">
        <div className="brand compact">
          <span className="brand-mark"><TrendingUp size={16} /></span>
          <strong>ReplayTrader</strong>
          <em>中文版</em>
        </div>
        <div className="session-meta">
          <strong>{displaySymbol}</strong>
          <span>{symbol.category}</span>
          <span>{TIMEFRAMES.find((item) => item.id === config.timeframe)?.label}</span>
          <span>{formatTime(current.time)}</span>
        </div>
        <div className="equity-strip">
          <Stat label="权益" value={formatMoney(equity)} />
          <Stat label="浮动" value={formatMoney(unrealized)} tone={unrealized >= 0 ? 'up' : 'down'} />
          <Stat label="已实现" value={formatMoney(position.realizedPnl)} tone={position.realizedPnl >= 0 ? 'up' : 'down'} />
        </div>
        <button className="end-btn" onClick={endSession}><X size={14} /> 结束会话</button>
      </header>

      <div className="workspace">
        <aside className="tool-rail" aria-label="图表工具">
          <button className={pickMode === null ? 'active' : ''} onClick={() => setPickMode(null)} title="十字光标">
            <Crosshair size={16} />
          </button>
          <button className={pickMode === 'limit' ? 'active' : ''} onClick={() => setPickMode('limit')} title="点击图表选委托价">
            <Target size={16} />
          </button>
          <button className={pickMode === 'tp' ? 'active' : ''} onClick={() => setPickMode('tp')} title="点击图表设止盈">
            <TrendingUp size={16} />
          </button>
          <button className={pickMode === 'sl' ? 'active' : ''} onClick={() => setPickMode('sl')} title="点击图表设止损">
            <BarChart3 size={16} />
          </button>
        </aside>

        <section className="chart-stage">
          <div className="chart-toolbar">
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
            <div className="quote-inline">
              <span className="up">买 {formatPrice(quotes.bid, symbol)}</span>
              <span>点差 {formatPrice(quotes.spread, symbol)}</span>
              <span className="down">卖 {formatPrice(quotes.ask, symbol)}</span>
            </div>
          </div>

          <ChartPane
            candles={candles}
            playhead={playhead}
            symbol={symbol}
            fills={fills}
            orders={orders}
            position={position}
            onPickPrice={onPickPrice}
          />

          <div className="replay-bar">
            <div className="scrubber">
              <input
                type="range"
                min={0}
                max={candles.length - 1}
                value={playhead}
                onChange={(event) => {
                  setPlaying(false);
                  setPlayhead(Number(event.target.value));
                }}
              />
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="transport">
              <button onClick={() => setPlayhead(0)} aria-label="回到开始"><SkipBack size={16} /></button>
              <button onClick={() => setPlayhead((value) => Math.max(0, value - 1))} aria-label="后退"><StepBack size={16} /></button>
              <button className="play" onClick={() => setPlaying((value) => !value)} aria-label="播放暂停">
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button onClick={() => setPlayhead((value) => Math.min(candles.length - 1, value + 1))} aria-label="前进"><StepForward size={16} /></button>
              <button onClick={() => setPlayhead(candles.length - 1)} aria-label="跳到最后"><SkipForward size={16} /></button>
            </div>
            <div className="speed-row">
              {SPEEDS.map((item) => (
                <button key={item} className={speed === item ? 'active' : ''} onClick={() => setSpeed(item)}>
                  {item}x
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="trade-panel">
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

          {orderType !== 'market' && (
            <label className="field">
              <span>委托价格 <button type="button" onClick={() => setPickMode('limit')}>点图选价</button></span>
              <input value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} placeholder={formatPrice(current.close, symbol)} />
            </label>
          )}

          <label className="field">
            <span>下单数量（手）</span>
            <div className="stepper">
              <button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>-</button>
              <input value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} />
              <button onClick={() => setQuantity((value) => Math.min(50, value + 1))}>+</button>
            </div>
          </label>

          <label className="field">
            <span>杠杆 {leverage}x</span>
            <input type="range" min={1} max={20} value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} />
          </label>

          <div className="tp-sl-grid">
            <label>
              <span>止盈 <button type="button" onClick={() => setPickMode('tp')}>点图</button></span>
              <input value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="可选" />
            </label>
            <label>
              <span>止损 <button type="button" onClick={() => setPickMode('sl')}>点图</button></span>
              <input value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="可选" />
            </label>
          </div>

          <div className="order-actions">
            <button className="buy" onClick={() => placeOrder('buy')}>
              <span>买入 / 做多</span>
              <strong>{formatPrice(orderType === 'market' ? quotes.ask : Number(limitPrice) || quotes.ask, symbol)}</strong>
              <small>快捷键 B</small>
            </button>
            <button className="sell" onClick={() => placeOrder('sell')}>
              <span>卖出 / 做空</span>
              <strong>{formatPrice(orderType === 'market' ? quotes.bid : Number(limitPrice) || quotes.bid, symbol)}</strong>
              <small>快捷键 S</small>
            </button>
          </div>

          <button className="close-btn" onClick={closePosition} disabled={position.quantity === 0}>
            市价平仓 · X
          </button>

          <div className="hint">
            <Zap size={14} />
            <p>空格播放/暂停，方向键逐根前进后退。点击图表可快速设置委托价、止盈或止损。</p>
          </div>
        </aside>
      </div>

      <section className="bottom-dock">
        <div className="dock-tabs">
          <button className={tab === 'positions' ? 'active' : ''} onClick={() => setTab('positions')}>持仓 {position.quantity !== 0 ? '1' : ''}</button>
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>委托 {orders.length || ''}</button>
          <button className={tab === 'fills' ? 'active' : ''} onClick={() => setTab('fills')}>成交 {fills.length || ''}</button>
        </div>
        <div className="dock-body">
          {tab === 'positions' && (
            position.quantity === 0 ? (
              <div className="empty">暂无持仓。用右侧面板下单，或按 B / S。</div>
            ) : (
              <div className="row dense">
                <span>{displaySymbol}</span>
                <span className={position.quantity > 0 ? 'up' : 'down'}>{position.quantity > 0 ? '多' : '空'} {Math.abs(position.quantity)}</span>
                <span>{formatPrice(position.averagePrice, symbol)}</span>
                <span>{formatPrice(current.close, symbol)}</span>
                <span className={unrealized >= 0 ? 'up' : 'down'}>{formatMoney(unrealized)}</span>
                <span>TP {position.takeProfit ? formatPrice(position.takeProfit, symbol) : '—'}</span>
                <span>SL {position.stopLoss ? formatPrice(position.stopLoss, symbol) : '—'}</span>
                <button onClick={closePosition}>平仓</button>
              </div>
            )
          )}
          {tab === 'orders' && (
            orders.length === 0 ? (
              <div className="empty">暂无挂单。限价/止损单会在价格触及后成交。</div>
            ) : (
              orders.map((order) => (
                <div className="row dense" key={order.id}>
                  <span>{displaySymbol}</span>
                  <span className={order.side === 'buy' ? 'up' : 'down'}>{order.side === 'buy' ? '买' : '卖'}</span>
                  <span>{order.type === 'limit' ? '限价' : '止损单'}</span>
                  <span>{order.quantity} 手</span>
                  <span>{formatPrice(order.price, symbol)}</span>
                  <button onClick={() => setOrders((value) => value.filter((item) => item.id !== order.id))}>撤单</button>
                </div>
              ))
            )
          )}
          {tab === 'fills' && (
            fills.length === 0 ? (
              <div className="empty">暂无成交记录。</div>
            ) : (
              fills.slice(0, 8).map((fill) => (
                <div className="row dense" key={fill.id}>
                  <span>{formatTime(fill.time)}</span>
                  <span className={fill.side === 'buy' ? 'up' : 'down'}>{fill.side === 'buy' ? '买' : '卖'}</span>
                  <span>{fill.quantity} 手</span>
                  <span>{formatPrice(fill.price, symbol)}</span>
                  <span className={fill.realizedPnl >= 0 ? 'up' : 'down'}>{formatMoney(fill.realizedPnl)}</span>
                  <span>{fill.reason}</span>
                </div>
              ))
            )
          )}
        </div>
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
