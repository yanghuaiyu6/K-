import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock3,
  Gauge,
  History,
  LayoutDashboard,
  ListFilter,
  Minus,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  StepBack,
  StepForward,
  Target,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { TradingChart } from './components/TradingChart';
import {
  executeTrade,
  formatMoney,
  formatPrice,
  formatReplayTime,
  generateMarketData,
  SYMBOLS,
  type MarketSymbol,
  type Position,
  type Side,
  type Trade,
} from './model/market';
import './styles.css';

type BottomTab = 'positions' | 'orders' | 'history';
type OrderType = 'market' | 'limit' | 'stop';

interface PendingOrder {
  id: number;
  side: Side;
  quantity: number;
  type: OrderType;
  price: number;
  createdAt: number;
}

const INITIAL_PLAYHEAD = 88;
const INITIAL_POSITION: Position = { quantity: 0, averagePrice: 0, realizedPnl: 0 };

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: '交易台', active: true },
  { icon: BarChart3, label: '复盘报告' },
  { icon: CalendarDays, label: '交易日历' },
  { icon: BookOpen, label: '交易日志' },
];

function MetricCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {label}
        <CircleHelp size={13} />
      </div>
      <strong className={accent ? 'up-text' : undefined}>{value}</strong>
      <span>{note}</span>
    </div>
  );
}

export default function App() {
  const [symbol, setSymbol] = useState<MarketSymbol>(SYMBOLS[0]);
  const candles = useMemo(() => generateMarketData(symbol), [symbol]);
  const [playhead, setPlayhead] = useState(INITIAL_PLAYHEAD);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [position, setPosition] = useState<Position>(INITIAL_POSITION);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [bottomTab, setBottomTab] = useState<BottomTab>('positions');
  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [riskEnabled, setRiskEnabled] = useState(false);

  const currentCandle = candles[playhead];
  const previousCandle = candles[Math.max(0, playhead - 1)];
  const priceChange = currentCandle.close - previousCandle.close;
  const priceChangePercent = (priceChange / previousCandle.close) * 100;
  const unrealizedPnl =
    position.quantity === 0
      ? 0
      : (currentCandle.close - position.averagePrice) * position.quantity;
  const totalPnl = position.realizedPnl + unrealizedPnl;
  const equity = 100_000 + totalPnl;
  const progress = (playhead / (candles.length - 1)) * 100;

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setPlayhead((current) => {
        if (current >= candles.length - 1) {
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, Math.max(120, 900 / speed));
    return () => window.clearInterval(timer);
  }, [isPlaying, speed, candles.length]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const resetSession = (nextSymbol = symbol) => {
    setSymbol(nextSymbol);
    setPlayhead(INITIAL_PLAYHEAD);
    setIsPlaying(false);
    setPosition(INITIAL_POSITION);
    setTrades([]);
    setOrders([]);
    setLimitPrice('');
  };

  const placeOrder = (side: Side, orderQuantity = quantity) => {
    const spread = symbol.tickSize;
    const marketPrice =
      currentCandle.close + (side === 'buy' ? spread : -spread);
    const requestedPrice = Number(limitPrice);

    if (orderType !== 'market' && (!Number.isFinite(requestedPrice) || requestedPrice <= 0)) {
      setToast('请输入有效的委托价格');
      return;
    }

    if (orderType !== 'market') {
      const order: PendingOrder = {
        id: Date.now(),
        side,
        quantity: orderQuantity,
        type: orderType,
        price: requestedPrice,
        createdAt: currentCandle.time,
      };
      setOrders((current) => [order, ...current]);
      setBottomTab('orders');
      setToast(`${side === 'buy' ? '买入' : '卖出'}委托已挂单`);
      return;
    }

    const nextPosition = executeTrade(position, side, orderQuantity, marketPrice);
    const trade: Trade = {
      id: Date.now(),
      side,
      quantity: orderQuantity,
      price: marketPrice,
      time: currentCandle.time,
      realizedPnl: nextPosition.realizedPnl - position.realizedPnl,
    };
    setPosition(nextPosition);
    setTrades((current) => [trade, ...current]);
    setToast(
      `${side === 'buy' ? '买入' : '卖出'} ${orderQuantity} 手 @ ${formatPrice(marketPrice, symbol)}`,
    );
  };

  const closePosition = () => {
    if (position.quantity === 0) return;
    placeOrder(position.quantity > 0 ? 'sell' : 'buy', Math.abs(position.quantity));
  };

  const cancelOrder = (id: number) => {
    setOrders((current) => current.filter((order) => order.id !== id));
    setToast('委托已撤销');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="复盘交易室">
          <TrendingUp size={22} strokeWidth={2.6} />
        </div>
        <nav className="side-nav" aria-label="主导航">
          {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
            <button key={label} className={active ? 'active' : ''} title={label} aria-label={label}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button title="帮助中心" aria-label="帮助中心"><CircleHelp size={19} /></button>
          <button title="设置" aria-label="设置"><Settings size={19} /></button>
          <button className="avatar-button" title="个人中心" aria-label="个人中心">林</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="product-name">
            <span>复盘交易室</span>
            <em>REPLAY TRADER</em>
          </div>
          <div className="topbar-center">
            <span className="simulation-pill"><span /> 模拟回放</span>
            <span className="session-date">
              <CalendarDays size={14} />
              2024年5月20日 · 美股常规时段
            </span>
          </div>
          <div className="topbar-actions">
            <button aria-label="切换主题"><Moon size={17} /></button>
            <button aria-label="通知" className="notification-button">
              <Bell size={17} /><span />
            </button>
            <button className="account-menu">
              <UserRound size={16} />
              模拟账户
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        <section className="dashboard">
          <div className="page-heading">
            <div>
              <p className="eyebrow">历史行情训练</p>
              <h1>交易回放台</h1>
              <p>像真实市场一样练习，在每一次决策中进步。</p>
            </div>
            <div className="heading-actions">
              <button className="ghost-button"><History size={15} /> 回放记录</button>
              <button className="primary-button" onClick={() => resetSession()}>
                <RotateCcw size={15} /> 重置本次回放
              </button>
            </div>
          </div>

          <section className="metrics-grid" aria-label="账户概览">
            <MetricCard label="账户权益" value={formatMoney(equity)} note="初始资金 $100,000.00" />
            <MetricCard
              label="本次盈亏"
              value={`${totalPnl >= 0 ? '+' : ''}${formatMoney(totalPnl)}`}
              note={`${trades.length} 笔成交`}
              accent={totalPnl >= 0}
            />
            <MetricCard
              label="已实现盈亏"
              value={`${position.realizedPnl >= 0 ? '+' : ''}${formatMoney(position.realizedPnl)}`}
              note="不含当前持仓"
              accent={position.realizedPnl >= 0}
            />
            <div className="metric-card progress-card">
              <div className="metric-label">回放进度 <span>{Math.round(progress)}%</span></div>
              <strong>{formatReplayTime(currentCandle.time)}</strong>
              <div className="mini-progress"><i style={{ width: `${progress}%` }} /></div>
            </div>
          </section>

          <section className="trading-workspace">
            <div className="chart-panel">
              <div className="instrument-toolbar">
                <div className="symbol-picker-wrap">
                  <button
                    className="symbol-picker"
                    onClick={() => setSymbolMenuOpen((open) => !open)}
                    aria-expanded={symbolMenuOpen}
                  >
                    <span className="symbol-badge">{symbol.code.slice(0, 2)}</span>
                    <span>
                      <strong>{symbol.code}</strong>
                      <small>{symbol.name}</small>
                    </span>
                    <ChevronDown size={15} />
                  </button>
                  {symbolMenuOpen && (
                    <div className="symbol-menu">
                      <div className="symbol-search"><Search size={14} /> 搜索品种</div>
                      {SYMBOLS.map((item) => (
                        <button
                          key={item.code}
                          className={item.code === symbol.code ? 'selected' : ''}
                          onClick={() => {
                            resetSession(item);
                            setSymbolMenuOpen(false);
                          }}
                        >
                          <span><strong>{item.code}</strong><small>{item.exchange}</small></span>
                          <em>{item.name}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="timeframe-list">
                  {['1分', '5分', '15分', '1时', '4时', '日线'].map((item) => (
                    <button key={item} className={item === '5分' ? 'active' : ''}>{item}</button>
                  ))}
                </div>
                <div className="chart-tools">
                  <button><ListFilter size={15} /> 指标</button>
                  <button aria-label="更多设置"><MoreHorizontal size={18} /></button>
                </div>
              </div>

              <div className="price-summary">
                <div>
                  <strong>{formatPrice(currentCandle.close, symbol)}</strong>
                  <span className={priceChange >= 0 ? 'up-badge' : 'down-badge'}>
                    {priceChange >= 0 ? '+' : ''}{formatPrice(priceChange, symbol)}
                    {' '}({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                  </span>
                </div>
                <span>数据为本地生成，仅用于交易练习</span>
              </div>

              <TradingChart candles={candles} playhead={playhead} symbol={symbol} trades={trades} />

              <div className="replay-controls">
                <div className="timeline">
                  <span style={{ width: `${progress}%` }} />
                  <i style={{ left: `${progress}%` }} />
                </div>
                <div className="control-inner">
                  <div className="replay-status">
                    <span className={isPlaying ? 'pulse-dot playing' : 'pulse-dot'} />
                    <div>
                      <strong>{isPlaying ? '正在回放' : '回放已暂停'}</strong>
                      <small>{formatReplayTime(currentCandle.time)}</small>
                    </div>
                  </div>
                  <div className="transport">
                    <button onClick={() => setPlayhead(0)} aria-label="回到开始"><SkipBack size={17} /></button>
                    <button
                      onClick={() => setPlayhead((current) => Math.max(0, current - 1))}
                      aria-label="后退一根K线"
                    ><StepBack size={18} /></button>
                    <button
                      className="play-button"
                      onClick={() => setIsPlaying((playing) => !playing)}
                      aria-label={isPlaying ? '暂停' : '播放'}
                    >
                      {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    </button>
                    <button
                      onClick={() => setPlayhead((current) => Math.min(candles.length - 1, current + 1))}
                      aria-label="前进一根K线"
                    ><StepForward size={18} /></button>
                    <button onClick={() => setPlayhead(candles.length - 1)} aria-label="跳到最后">
                      <SkipForward size={17} />
                    </button>
                  </div>
                  <div className="speed-control">
                    <Clock3 size={14} />
                    <span>速度</span>
                    {[0.5, 1, 2, 4].map((item) => (
                      <button
                        key={item}
                        className={speed === item ? 'active' : ''}
                        onClick={() => setSpeed(item)}
                      >{item}x</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="order-panel">
              <div className="order-panel-heading">
                <div><Zap size={17} /><strong>模拟下单</strong></div>
                <button aria-label="下单设置"><Settings size={16} /></button>
              </div>
              <div className="order-tabs">
                {([
                  ['market', '市价'],
                  ['limit', '限价'],
                  ['stop', '止损'],
                ] as [OrderType, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    className={orderType === value ? 'active' : ''}
                    onClick={() => setOrderType(value)}
                  >{label}</button>
                ))}
              </div>

              <div className="quote-strip">
                <div>
                  <span>买一</span>
                  <strong className="up-text">{formatPrice(currentCandle.close - symbol.tickSize, symbol)}</strong>
                </div>
                <div className="spread">
                  <span>点差</span>
                  <strong>{formatPrice(symbol.tickSize * 2, symbol)}</strong>
                </div>
                <div>
                  <span>卖一</span>
                  <strong className="down-text">{formatPrice(currentCandle.close + symbol.tickSize, symbol)}</strong>
                </div>
              </div>

              <label className="order-field">
                <span>下单数量 <em>单位：手</em></span>
                <div className="stepper">
                  <button onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus size={15} /></button>
                  <input
                    value={quantity}
                    onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                    inputMode="numeric"
                  />
                  <button onClick={() => setQuantity((value) => Math.min(100, value + 1))}><Plus size={15} /></button>
                </div>
              </label>

              {orderType !== 'market' && (
                <label className="order-field">
                  <span>{orderType === 'limit' ? '限价价格' : '触发价格'}</span>
                  <div className="price-input">
                    <input
                      value={limitPrice}
                      onChange={(event) => setLimitPrice(event.target.value)}
                      placeholder={formatPrice(currentCandle.close, symbol)}
                      inputMode="decimal"
                    />
                    <em>USD</em>
                  </div>
                </label>
              )}

              <div className="risk-switch">
                <button
                  className={riskEnabled ? 'switch on' : 'switch'}
                  onClick={() => setRiskEnabled((enabled) => !enabled)}
                  aria-label="启用止盈止损"
                ><span /></button>
                <div><strong>预设止盈 / 止损</strong><small>成交后自动创建保护单</small></div>
              </div>

              {riskEnabled && (
                <div className="risk-inputs">
                  <label><span>止盈</span><input defaultValue="80" /><em>点</em></label>
                  <label><span>止损</span><input defaultValue="35" /><em>点</em></label>
                </div>
              )}

              <div className="order-buttons">
                <button className="buy-button" onClick={() => placeOrder('buy')}>
                  <span>买入 / 做多</span>
                  <strong>{formatPrice(currentCandle.close + symbol.tickSize, symbol)}</strong>
                  <small>{orderType === 'market' ? '即时成交' : '提交委托'}</small>
                </button>
                <button className="sell-button" onClick={() => placeOrder('sell')}>
                  <span>卖出 / 做空</span>
                  <strong>{formatPrice(currentCandle.close - symbol.tickSize, symbol)}</strong>
                  <small>{orderType === 'market' ? '即时成交' : '提交委托'}</small>
                </button>
              </div>

              <div className="estimated-order">
                <div><span>预估名义价值</span><strong>{formatMoney(currentCandle.close * quantity)}</strong></div>
                <div><span>模拟手续费</span><strong>{formatMoney(quantity * 2.2)}</strong></div>
              </div>

              <div className="practice-note">
                <Sparkles size={16} />
                <p><strong>练习提示</strong>先制定入场、止损与目标位，再执行交易。</p>
              </div>
            </aside>
          </section>

          <section className="activity-panel">
            <div className="activity-tabs">
              <button
                className={bottomTab === 'positions' ? 'active' : ''}
                onClick={() => setBottomTab('positions')}
              >
                <WalletCards size={15} /> 当前持仓
                {position.quantity !== 0 && <i>1</i>}
              </button>
              <button
                className={bottomTab === 'orders' ? 'active' : ''}
                onClick={() => setBottomTab('orders')}
              >
                <Target size={15} /> 委托订单
                {orders.length > 0 && <i>{orders.length}</i>}
              </button>
              <button
                className={bottomTab === 'history' ? 'active' : ''}
                onClick={() => setBottomTab('history')}
              >
                <History size={15} /> 成交记录
                {trades.length > 0 && <i>{trades.length}</i>}
              </button>
            </div>

            <div className="activity-content">
              {bottomTab === 'positions' && (
                position.quantity === 0 ? (
                  <div className="empty-state">
                    <Gauge size={24} />
                    <div><strong>暂无持仓</strong><span>从右侧下单面板开始你的第一笔模拟交易</span></div>
                  </div>
                ) : (
                  <div className="position-row table-row">
                    <div><small>合约</small><strong>{symbol.code}</strong><span>{symbol.name}</span></div>
                    <div><small>方向 / 数量</small><strong className={position.quantity > 0 ? 'up-text' : 'down-text'}>
                      {position.quantity > 0 ? '多头' : '空头'} {Math.abs(position.quantity)} 手
                    </strong></div>
                    <div><small>持仓均价</small><strong>{formatPrice(position.averagePrice, symbol)}</strong></div>
                    <div><small>最新价格</small><strong>{formatPrice(currentCandle.close, symbol)}</strong></div>
                    <div><small>浮动盈亏</small><strong className={unrealizedPnl >= 0 ? 'up-text' : 'down-text'}>
                      {unrealizedPnl >= 0 ? '+' : ''}{formatMoney(unrealizedPnl)}
                    </strong></div>
                    <button onClick={closePosition}>市价平仓</button>
                  </div>
                )
              )}

              {bottomTab === 'orders' && (
                orders.length === 0 ? (
                  <div className="empty-state">
                    <Target size={24} />
                    <div><strong>暂无待成交委托</strong><span>限价单与止损单会显示在这里</span></div>
                  </div>
                ) : (
                  <div className="compact-table">
                    <div className="table-head"><span>品种</span><span>方向</span><span>类型</span><span>数量</span><span>委托价</span><span>状态</span><span /></div>
                    {orders.map((order) => (
                      <div className="table-line" key={order.id}>
                        <strong>{symbol.code}</strong>
                        <span className={order.side === 'buy' ? 'up-text' : 'down-text'}>{order.side === 'buy' ? '买入' : '卖出'}</span>
                        <span>{order.type === 'limit' ? '限价' : '止损'}</span>
                        <span>{order.quantity} 手</span>
                        <span>{formatPrice(order.price, symbol)}</span>
                        <span className="pending-status">等待成交</span>
                        <button onClick={() => cancelOrder(order.id)}>撤单</button>
                      </div>
                    ))}
                  </div>
                )
              )}

              {bottomTab === 'history' && (
                trades.length === 0 ? (
                  <div className="empty-state">
                    <History size={24} />
                    <div><strong>暂无成交记录</strong><span>市价成交会实时记录在这里</span></div>
                  </div>
                ) : (
                  <div className="compact-table">
                    <div className="table-head"><span>成交时间</span><span>品种</span><span>方向</span><span>数量</span><span>成交价</span><span>已实现盈亏</span><span>类型</span></div>
                    {trades.map((trade) => (
                      <div className="table-line" key={trade.id}>
                        <span>{formatReplayTime(trade.time)}</span>
                        <strong>{symbol.code}</strong>
                        <span className={trade.side === 'buy' ? 'up-text' : 'down-text'}>{trade.side === 'buy' ? '买入' : '卖出'}</span>
                        <span>{trade.quantity} 手</span>
                        <span>{formatPrice(trade.price, symbol)}</span>
                        <span className={trade.realizedPnl >= 0 ? 'up-text' : 'down-text'}>
                          {trade.realizedPnl === 0 ? '—' : formatMoney(trade.realizedPnl)}
                        </span>
                        <span>市价</span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </section>

          <footer>
            <span><span className="online-dot" /> 本地模拟引擎正常</span>
            <span>行情为演示数据，不构成投资建议</span>
            <span>中文界面 · v1.0 MVP</span>
          </footer>
        </section>
      </main>

      {toast && (
        <div className="toast" role="status">
          <span><Zap size={15} /></span>
          {toast}
          <button onClick={() => setToast('')}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
