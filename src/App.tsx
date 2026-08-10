import { useEffect, useMemo, useRef, useState } from 'react';
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
import { EquityCurve } from './components/EquityCurve';
import { loadHistoryCandles, supportsLiveFeed, type FeedMode } from './data/historyProvider';
import { buildEquityCurve } from './model/equity';
import {
  HISTORY_SOURCES,
  SYMBOLS,
  TIMEFRAMES,
  LEVERAGE_OPTIONS,
  USDT_CNY_RATE,
  applyFill,
  applyFunding,
  applySlippage,
  calcTradingFee,
  canAffordOrder,
  clampReplayOffset,
  computeStats,
  emptyPosition,
  estimateLiquidationPrice,
  feeRoleForFill,
  findCandleIndexByTime,
  formatFeeRate,
  formatMoney,
  formatPrice,
  formatTime,
  getHistorySource,
  getSymbol,
  historyBarCount,
  marketQuotes,
  matchLiquidation,
  matchPendingOrders,
  matchProtectiveOrders,
  maxAffordableQuantity,
  maxReplayOffset,
  minReplayOffset,
  OKX_REGULAR_SWAP_FEES,
  pickRandomStartOffset,
  positionMargin,
  resolveStartOffset,
  roundToTick,
  unitLabel,
  unrealizedPnl,
  unrealizedRoe,
  updateProtectiveLevels,
  type Candle,
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
import {
  appendJournal,
  clearSession,
  journalFromStats,
  loadJournal,
  loadSession,
  loadSettings,
  saveSession,
  saveSettings,
  type JournalEntry,
  type PracticeSnapshot,
} from './storage/persist';
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
const MAX_QTY = 200;
const FUNDING_EVERY = 8;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function JournalList({
  entries,
  money,
}: {
  entries: JournalEntry[];
  money: (value: number) => string;
}) {
  if (entries.length === 0) {
    return <div className="empty journal-empty">暂无练习日记</div>;
  }
  return (
    <div className="journal-list">
      {entries.slice(0, 8).map((entry) => (
        <div className="journal-item" key={entry.id}>
          <div>
            <strong>
              {entry.symbolCode} · {entry.timeframe}
              {entry.liquidated ? ' · 强平' : ''}
            </strong>
            <span>
              {formatTime(entry.createdAt)} · {entry.feedLabel} · {entry.trades} 笔
            </span>
          </div>
          <div className="right">
            <strong className={entry.netPnl >= 0 ? 'up' : 'down'}>{money(entry.netPnl)}</strong>
            <span>胜率 {(entry.winRate * 100).toFixed(0)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const saved = useMemo(() => loadSession(), []);
  const savedSettings = useMemo(() => loadSettings(), []);

  const [screen, setScreen] = useState<Screen>(saved?.screen ?? 'setup');
  const [config, setConfig] = useState<SessionConfig>(saved?.config ?? DEFAULT_CONFIG);
  const [feedMode, setFeedMode] = useState<FeedMode>(saved?.feedMode ?? savedSettings?.feedMode ?? 'auto');
  const [feedLabel, setFeedLabel] = useState(saved?.feedLabel ?? '本地模拟');
  const [feedDetail, setFeedDetail] = useState('');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadError, setLoadError] = useState('');

  const symbol = useMemo(() => getSymbol(config.symbolCode), [config.symbolCode]);
  const historySource = useMemo(
    () => getHistorySource(config.historySourceId),
    [config.historySourceId],
  );
  const candleCount = candles.length;
  const replayMin = minReplayOffset(candleCount || 120);
  const replayMax = maxReplayOffset(candleCount || 120);

  const [playhead, setPlayhead] = useState(saved?.playhead ?? config.startOffset);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(saved?.speed ?? 1);
  const [orderType, setOrderType] = useState<OrderType>(saved?.orderType ?? 'market');
  const [quantity, setQuantity] = useState(saved?.quantity ?? 1);
  const [leverage, setLeverage] = useState(saved?.leverage ?? savedSettings?.leverage ?? 10);
  const [currency, setCurrency] = useState<CurrencyUnit>(saved?.currency ?? savedSettings?.currency ?? 'USDT');
  const [limitPrice, setLimitPrice] = useState(saved?.limitPrice ?? '');
  const [takeProfit, setTakeProfit] = useState(saved?.takeProfit ?? '');
  const [stopLoss, setStopLoss] = useState(saved?.stopLoss ?? '');
  const [position, setPosition] = useState<Position>(saved?.position ?? emptyPosition());
  const [orders, setOrders] = useState<PendingOrder[]>(saved?.orders ?? []);
  const [fills, setFills] = useState<Fill[]>(saved?.fills ?? []);
  const [accountTab, setAccountTab] = useState<AccountTab>('positions');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [liquidated, setLiquidated] = useState(saved?.liquidated ?? false);
  const [tradeExpanded, setTradeExpanded] = useState(false);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const [chartOverlays, setChartOverlays] = useState({
    cost: true,
    liquidation: true,
    protective: true,
    orders: true,
  });
  const [confirmJump, setConfirmJump] = useState<{ offset: number; label: string; quiet?: boolean } | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadJournal());
  const [capitalInput, setCapitalInput] = useState(String(saved?.config.startCapital ?? DEFAULT_CONFIG.startCapital));
  const [editTp, setEditTp] = useState('');
  const [editSl, setEditSl] = useState('');

  const prevSymbolRef = useRef(config.symbolCode);
  const prevTfRef = useRef(config.timeframe);
  const fundingBaseRef = useRef<number | null>(null);
  const lastFundedPlayheadRef = useRef<number | null>(null);
  const hydrateRef = useRef(Boolean(saved));
  const journalWrittenRef = useRef(false);
  const loadSeqRef = useRef(0);

  const current = candles[playhead] ?? candles[0];
  const quotes = current ? marketQuotes(symbol, current.close) : { bid: 0, ask: 0, spread: 0 };
  const markPrice = current?.close ?? 0;
  const activeLeverage = position.quantity !== 0 ? position.leverage : leverage;
  const floating = unrealizedPnl(position, markPrice);
  const roe = unrealizedRoe(position, markPrice, activeLeverage);
  const usedMargin =
    position.quantity === 0 ? 0 : positionMargin(position.averagePrice, position.quantity, activeLeverage);
  const orderMargin = positionMargin(markPrice, quantity, leverage);
  const available = config.startCapital + position.realizedPnl - usedMargin;
  const equity = config.startCapital + position.realizedPnl + floating;
  const liqPrice = estimateLiquidationPrice(position, activeLeverage);
  const progress = candleCount > 1 ? (playhead / Math.max(1, candleCount - 1)) * 100 : 0;
  const displaySymbol = config.blindMode ? 'BLIND-USDT' : `${symbol.code}-USDT`;
  const stats = useMemo(() => computeStats(fills, config.startCapital), [fills, config.startCapital]);
  const equityPoints = useMemo(() => buildEquityCurve(fills, config.startCapital), [fills, config.startCapital]);
  const maxOpen = maxAffordableQuantity(available, markPrice || 1, leverage);
  const hasActivity = position.quantity !== 0 || orders.length > 0 || fills.length > 0;

  const money = (value: number) => formatMoney(value, currency);
  const priceText = (value: number) => formatPrice(value, symbol, currency);

  const clearOrdersAndFills = () => {
    setPosition(emptyPosition());
    setOrders([]);
    setFills([]);
    setLimitPrice('');
    setTakeProfit('');
    setStopLoss('');
    setEditTp('');
    setEditSl('');
    setPickMode(null);
    setAccountTab('positions');
    setSheetOpen(false);
    setLiquidated(false);
    fundingBaseRef.current = null;
    lastFundedPlayheadRef.current = null;
    journalWrittenRef.current = false;
  };

  const doJump = (offset: number, label: string, quiet = false) => {
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

  const jumpToReplay = (offset: number, label: string, quiet = false) => {
    if (hasActivity) {
      setConfirmJump({ offset, label, quiet });
      setPlaying(false);
      return;
    }
    doJump(offset, label, quiet);
  };

  const jumpToBegin = () => jumpToReplay(replayMin, '数据起点');
  const jumpToRandom = () => jumpToReplay(pickRandomStartOffset(candleCount), '随机跳转');

  const resetTradingState = (nextConfig = config, offset = nextConfig.startOffset) => {
    setPlayhead(clampReplayOffset(offset, candleCount || 120));
    setPlaying(false);
    clearOrdersAndFills();
  };

  const writeJournalIfNeeded = (overrides?: {
    fills?: Fill[];
    liquidated?: boolean;
    note?: string;
  }) => {
    if (journalWrittenRef.current) return;
    journalWrittenRef.current = true;
    const usedFills = overrides?.fills ?? fills;
    const usedLiquidated = overrides?.liquidated ?? liquidated;
    const entry = journalFromStats({
      config,
      stats: computeStats(usedFills, config.startCapital),
      feedLabel,
      liquidated: usedLiquidated,
      note: overrides?.note ?? (usedLiquidated ? '强平结束' : ''),
    });
    appendJournal(entry);
    setJournal(loadJournal());
  };

  const startSession = () => {
    if (!candles.length || loadingFeed) {
      setToast('行情加载中…');
      return;
    }
    const offset = resolveStartOffset(config.startMode, candleCount, config.startOffset);
    const nextConfig = { ...config, startOffset: offset };
    setConfig(nextConfig);
    resetTradingState(nextConfig, offset);
    journalWrittenRef.current = false;
    setScreen('practice');
    const modeLabel =
      config.startMode === 'begin' ? '从数据起点' : config.startMode === 'random' ? '随机历史时间' : '自定义起点';
    setToast(`${modeLabel}开始 · ${formatTime(candles[offset]?.time ?? Date.now())}`);
  };

  const endSession = () => {
    setPlaying(false);
    writeJournalIfNeeded();
    setScreen('report');
  };

  // Load candles when feed inputs change
  useEffect(() => {
    const seq = ++loadSeqRef.current;
    const prevTime = candles[playhead]?.time;
    const symbolChanged = prevSymbolRef.current !== config.symbolCode;
    const tfChanged = prevTfRef.current !== config.timeframe;
    setLoadingFeed(true);
    setLoadError('');

    loadHistoryCandles({
      symbol,
      timeframe: config.timeframe,
      historySourceId: config.historySourceId,
      feedMode,
    })
      .then((result) => {
        if (seq !== loadSeqRef.current) return;
        setCandles(result.candles);
        setFeedLabel(result.label);
        setFeedDetail(result.detail);
        setLoadingFeed(false);

        const count = result.candles.length;
        if (hydrateRef.current && saved) {
          hydrateRef.current = false;
          setPlayhead(clampReplayOffset(saved.playhead, count));
          prevSymbolRef.current = config.symbolCode;
          prevTfRef.current = config.timeframe;
          return;
        }

        if (symbolChanged) {
          const offset = resolveStartOffset(config.startMode, count, config.startOffset);
          setPlayhead(clampReplayOffset(offset, count));
          clearOrdersAndFills();
          setPlaying(false);
        } else if (tfChanged && prevTime != null) {
          const aligned = findCandleIndexByTime(result.candles, prevTime);
          setPlayhead(clampReplayOffset(aligned, count));
          setPlaying(false);
          // 换周期：按时间对齐，不清仓
        } else {
          setPlayhead((value) => clampReplayOffset(value, count));
        }
        prevSymbolRef.current = config.symbolCode;
        prevTfRef.current = config.timeframe;
      })
      .catch((error: Error) => {
        if (seq !== loadSeqRef.current) return;
        setLoadingFeed(false);
        setLoadError(error.message || '加载失败');
        setToast('行情加载失败');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, config.timeframe, config.historySourceId, feedMode]);

  // Persist session + settings
  useEffect(() => {
    if (loadingFeed && candles.length === 0) return;
    const snapshot: PracticeSnapshot = {
      version: 2,
      savedAt: Date.now(),
      screen,
      config,
      playhead,
      playing: false,
      speed,
      orderType,
      quantity,
      leverage,
      currency,
      limitPrice,
      takeProfit,
      stopLoss,
      position,
      orders,
      fills,
      liquidated,
      feedMode,
      feedLabel,
    };
    saveSession(snapshot);
    saveSettings({ feedMode, currency, leverage });
  }, [
    screen,
    config,
    playhead,
    speed,
    orderType,
    quantity,
    leverage,
    currency,
    limitPrice,
    takeProfit,
    stopLoss,
    position,
    orders,
    fills,
    liquidated,
    feedMode,
    feedLabel,
    loadingFeed,
    candles.length,
  ]);

  useEffect(() => {
    if (!playing || screen !== 'practice' || candleCount === 0) return undefined;
    const timer = window.setInterval(() => {
      setPlayhead((value) => {
        if (value >= candleCount - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, Math.max(50, 700 / speed));
    return () => window.clearInterval(timer);
  }, [playing, speed, candleCount, screen]);

  // Match pending orders on playhead
  useEffect(() => {
    if (screen !== 'practice' || !candles[playhead]) return;
    const candle = candles[playhead];
    setOrders((currentOrders) => {
      const matched = matchPendingOrders(currentOrders, candle, symbol, position);
      if (matched.fills.length > 0) {
        setPosition(matched.position);
        setFills((currentFills) => [...matched.fills, ...currentFills]);
        setToast(`委托成交 ${matched.fills.length} 笔`);
        setAccountTab('fills');
        if (matched.position.quantity !== 0 && fundingBaseRef.current == null) {
          fundingBaseRef.current = playhead;
        }
      }
      return matched.remainingOrders;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead]);

  // Liquidation + protective + funding
  useEffect(() => {
    if (screen !== 'practice' || liquidated || !candles[playhead]) return;
    const candle = candles[playhead];
    if (position.quantity === 0) {
      fundingBaseRef.current = null;
      lastFundedPlayheadRef.current = null;
      return;
    }

    if (fundingBaseRef.current == null) {
      fundingBaseRef.current = playhead;
    }

    const liq = matchLiquidation(position, candle, symbol, activeLeverage);
    if (liq.liquidated) {
      setPlaying(false);
      setPosition(liq.position);
      setOrders([]);
      fundingBaseRef.current = null;
      lastFundedPlayheadRef.current = null;
      setLiquidated(true);
      setToast('已强平 · 练习结束');
      setFills((currentFills) => {
        const nextFills = [...liq.fills, ...currentFills];
        window.setTimeout(() => {
          writeJournalIfNeeded({ fills: nextFills, liquidated: true, note: '强平结束' });
          setScreen('report');
        }, 650);
        return nextFills;
      });
      return;
    }

    const protective = matchProtectiveOrders(position, candle, symbol);
    if (protective.fills.length > 0) {
      setPosition(protective.position);
      setFills((currentFills) => [...protective.fills, ...currentFills]);
      setToast(protective.fills[0].reason === 'takeProfit' ? '止盈已触发' : '止损已触发');
      setAccountTab('fills');
      if (protective.position.quantity === 0) {
        fundingBaseRef.current = null;
        lastFundedPlayheadRef.current = null;
      }
      return;
    }

    const base = fundingBaseRef.current;
    if (
      base != null
      && playhead > base
      && (playhead - base) % FUNDING_EVERY === 0
      && lastFundedPlayheadRef.current !== playhead
    ) {
      lastFundedPlayheadRef.current = playhead;
      const funded = applyFunding(position, candle.close);
      if (funded.funding !== 0) {
        setPosition(funded.position);
        setToast(funded.funding < 0 ? `资金费 ${money(funded.funding)}` : `资金费收入 ${money(funded.funding)}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, position.quantity, position.takeProfit, position.stopLoss, position.averagePrice, activeLeverage, liquidated]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 650);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Sync edit TP/SL fields when position changes
  useEffect(() => {
    setEditTp(position.takeProfit != null ? String(position.takeProfit) : '');
    setEditSl(position.stopLoss != null ? String(position.stopLoss) : '');
  }, [position.takeProfit, position.stopLoss, position.quantity]);

  // Keyboard shortcuts
  useEffect(() => {
    if (screen !== 'practice') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.code === 'Space' || key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead((value) => Math.max(replayMin, value - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setPlayhead((value) => Math.min(candleCount - 1, value + 1));
        return;
      }
      if (key === 'b') {
        event.preventDefault();
        placeOrder('buy');
        return;
      }
      if (key === 's') {
        event.preventDefault();
        placeOrder('sell');
        return;
      }
      if (key === 'x') {
        event.preventDefault();
        closePosition();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, replayMin, candleCount, orderType, quantity, leverage, limitPrice, takeProfit, stopLoss, position, quotes, available, markPrice, current]);

  const parseOptional = (value: string) => {
    if (!value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? roundToTick(number, symbol.tickSize) : null;
  };

  const placeOrder = (side: Side) => {
    if (!current || liquidated) return;
    const tp = parseOptional(takeProfit);
    const sl = parseOptional(stopLoss);
    const rawPrice =
      orderType === 'market' ? (side === 'buy' ? quotes.ask : quotes.bid) : Number(limitPrice);

    if (orderType !== 'market' && (!Number.isFinite(rawPrice) || rawPrice <= 0)) {
      setToast('请输入委托价，或点图选价');
      setPickMode('limit');
      return;
    }

    const qty = Math.max(1, Math.min(MAX_QTY, quantity));
    const signed = side === 'buy' ? qty : -qty;
    const reduceOnly =
      position.quantity !== 0
      && Math.sign(position.quantity) !== Math.sign(signed)
      && qty <= Math.abs(position.quantity);

    if (orderType !== 'market') {
      if (!reduceOnly && !canAffordOrder(available, rawPrice, qty, leverage)) {
        setToast('保证金不足');
        return;
      }
      setOrders((currentOrders) => [
        {
          id: Date.now(),
          side,
          type: orderType,
          quantity: qty,
          price: rawPrice,
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

    const price = applySlippage(rawPrice, side, symbol, 'market');
    if (!reduceOnly && !canAffordOrder(available, price, qty, leverage)) {
      setToast('保证金不足');
      return;
    }

    const fee = calcTradingFee(price, qty, feeRoleForFill('market'));
    const result = applyFill(position, side, qty, price, fee, leverage);
    setPosition({
      ...result.position,
      takeProfit: tp ?? result.position.takeProfit,
      stopLoss: sl ?? result.position.stopLoss,
    });
    if (result.position.quantity !== 0 && fundingBaseRef.current == null) {
      fundingBaseRef.current = playhead;
    }
    if (result.position.quantity === 0) fundingBaseRef.current = null;
    setFills((currentFills) => [
      {
        id: Date.now(),
        side,
        quantity: qty,
        price,
        fee,
        time: current.time,
        realizedPnl: result.realizedPnl,
        reason: 'market',
      },
      ...currentFills,
    ]);
    setAccountTab('positions');
    setToast(`${side === 'buy' ? '开多' : '开空'} ${qty}张`);
  };

  const closePositionQty = (qtyRatio: number) => {
    if (position.quantity === 0 || !current || liquidated) return;
    const side: Side = position.quantity > 0 ? 'sell' : 'buy';
    const absQty = Math.abs(position.quantity);
    const qty =
      qtyRatio >= 1 ? absQty : Math.max(1, Math.floor(absQty * qtyRatio));
    const raw = side === 'buy' ? quotes.ask : quotes.bid;
    const price = applySlippage(raw, side, symbol, 'close');
    const fee = calcTradingFee(price, qty, feeRoleForFill('close'));
    const result = applyFill(position, side, qty, price, fee, position.leverage);
    const nextPos = qty >= absQty ? emptyPosition() : result.position;
    setPosition(nextPos);
    if (nextPos.quantity === 0) fundingBaseRef.current = null;
    setFills((currentFills) => [
      {
        id: Date.now(),
        side,
        quantity: qty,
        price,
        fee,
        time: current.time,
        realizedPnl: result.realizedPnl,
        reason: 'close',
      },
      ...currentFills,
    ]);
    setToast(qty >= absQty ? `已平仓 ${money(result.realizedPnl)}` : `平仓 ${qty}张 ${money(result.realizedPnl)}`);
    setAccountTab('fills');
  };

  const closePosition = () => closePositionQty(1);

  const applyPositionProtective = () => {
    if (position.quantity === 0) return;
    const next = updateProtectiveLevels(position, parseOptional(editTp), parseOptional(editSl));
    setPosition(next);
    setToast('已更新止盈止损');
  };

  const onPickPrice = (price: number) => {
    if (pickMode === 'replay') return;
    const rounded = roundToTick(price, symbol.tickSize);
    if (pickMode === 'tp') {
      setTakeProfit(String(rounded));
      setEditTp(String(rounded));
    } else if (pickMode === 'sl') {
      setStopLoss(String(rounded));
      setEditSl(String(rounded));
    } else {
      setLimitPrice(String(rounded));
    }
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
        return { ...value, startMode: mode, startOffset: pickRandomStartOffset(candleCount || 120) };
      }
      return {
        ...value,
        startMode: mode,
        startOffset: clampReplayOffset(Math.floor((candleCount || 120) * 0.35), candleCount || 120),
      };
    });
  };

  const applyCapitalInput = (raw: string) => {
    setCapitalInput(raw);
    const number = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(number) && number >= 100) {
      setConfig((value) => ({ ...value, startCapital: Math.round(number) }));
    }
  };

  const feedModeLabel =
    feedMode === 'auto' ? '自动' : feedMode === 'live' ? '实盘' : '模拟';

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
                  {supportsLiveFeed(item.code) ? ' · OKX' : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>数据源模式</span>
            <div className="chip-row">
              {([
                ['auto', '自动'],
                ['live', '实盘'],
                ['simulated', '模拟'],
              ] as [FeedMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={feedMode === mode ? 'active' : ''}
                  onClick={() => setFeedMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <small className="field-hint feed-badge">
              {loadingFeed ? '加载中…' : (
                <>
                  <em className={feedLabel.includes('OKX') || feedLabel.includes('实盘') ? 'live' : 'sim'}>
                    {feedLabel}
                  </em>
                  {' · '}
                  {feedDetail || historySource.description}
                  {loadError ? ` · ${loadError}` : ''}
                </>
              )}
            </small>
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
            {config.startMode === 'custom' && candleCount > 0 && (
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
              {loadingFeed
                ? '正在加载行情…'
                : `当前数据 ${candleCount} 根 · ${formatTime(candles[0]?.time ?? Date.now())} 至 ${formatTime(candles[candleCount - 1]?.time ?? Date.now())}`}
            </small>
          </label>

          <label>
            <span>起始保证金（USDT）</span>
            <div className="chip-row">
              {[50_000, 100_000, 200_000].map((amount) => (
                <button
                  key={amount}
                  className={config.startCapital === amount ? 'active' : ''}
                  onClick={() => {
                    setConfig((value) => ({ ...value, startCapital: amount }));
                    setCapitalInput(String(amount));
                  }}
                >
                  {(amount / 1000).toFixed(0)}K
                </button>
              ))}
            </div>
            <input
              className="capital-input"
              value={capitalInput}
              onChange={(event) => applyCapitalInput(event.target.value)}
              inputMode="numeric"
              placeholder="自定义本金，如 80000"
            />
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
            <span>手续费 {OKX_REGULAR_SWAP_FEES.label} Maker {formatFeeRate('maker')} / Taker {formatFeeRate('taker')}</span>
            <span>1 USDT ≈ {USDT_CNY_RATE} ¥</span>
            <span>源 {feedModeLabel}</span>
          </div>
        </section>

        <section className="journal-panel">
          <h2>最近练习日记</h2>
          <JournalList entries={journal} money={money} />
        </section>

        {saved && saved.screen === 'practice' && (
          <button
            type="button"
            className="ghost-cta"
            onClick={() => {
              setScreen('practice');
              setToast('已恢复上次练习');
            }}
          >
            继续上次练习
          </button>
        )}

        <button className="primary-cta sticky-cta" onClick={startSession} disabled={loadingFeed || candleCount === 0}>
          {loadingFeed ? (
            <>加载行情中…</>
          ) : (
            <>
              <Play size={18} fill="currentColor" /> 开始回放交易
            </>
          )}
        </button>

        {loadingFeed && <div className="loading-overlay" aria-live="polite">正在加载行情…</div>}
        {toast && <div className="toast" role="status">{toast}</div>}
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
          {liquidated && (
            <div className="report-banner danger">
              <strong>已强平 · 练习结束</strong>
              <span>价格触及预估强平价，仓位已被强制平仓</span>
            </div>
          )}
          <div className="report-hero">
            <span>净盈亏（{unitLabel(currency)}）</span>
            <strong className={stats.netPnl >= 0 ? 'up' : 'down'}>{money(stats.netPnl)}</strong>
          </div>
          <div className="stat"><span>胜率</span><strong>{(stats.winRate * 100).toFixed(1)}%</strong></div>
          <div className="stat"><span>获利因子</span><strong>{Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}</strong></div>
          <div className="stat"><span>最大回撤</span><strong className="down">{money(stats.maxDrawdown)}</strong></div>
          <div className="stat"><span>平仓笔数</span><strong>{stats.trades}</strong></div>
        </section>

        <EquityCurve points={equityPoints} startCapital={config.startCapital} />

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

        <section className="journal-panel compact">
          <h2>练习日记</h2>
          <JournalList entries={journal} money={money} />
        </section>

        <div className="report-actions">
          <button onClick={() => { resetTradingState(); journalWrittenRef.current = false; setScreen('practice'); }}>
            <RotateCcw size={15} /> 再练一次
          </button>
          <button
            className="primary"
            onClick={() => {
              clearSession();
              setScreen('setup');
            }}
          >
            新建会话
          </button>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="screen practice-screen">
      <header className="mobile-top">
        <div className="symbol-block">
          <strong>{displaySymbol}</strong>
          <span>
            {TIMEFRAMES.find((item) => item.id === config.timeframe)?.label} · 永续 · {feedLabel}
          </span>
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
            <div className="chart-head-actions">
              <button
                type="button"
                className={`sheet-chip ${overlayMenuOpen ? 'active' : ''}`}
                onClick={() => setOverlayMenuOpen((value) => !value)}
              >
                参考线
              </button>
              <button type="button" className="sheet-chip" onClick={() => setSheetOpen(true)}>
                持仓 {position.quantity === 0 ? 0 : Math.abs(position.quantity)}
                {orders.length ? ` · ${orders.length}` : ''}
              </button>
            </div>
          </div>

          {overlayMenuOpen && (
            <div className="overlay-toggles" aria-label="图表参考线">
              {(
                [
                  ['cost', '成本价'],
                  ['liquidation', '强平价'],
                  ['protective', '止盈止损'],
                  ['orders', '挂单'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={chartOverlays[key] ? 'active' : ''}
                  onClick={() => setChartOverlays((value) => ({ ...value, [key]: !value[key] }))}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {pickMode && (
            <div className="pick-tip">
              {pickMode === 'replay'
                ? '点图表 K 线选择回放起点'
                : `点图表设置${pickMode === 'tp' ? '止盈' : pickMode === 'sl' ? '止损' : '委托价'}`}
              <button onClick={() => setPickMode(null)}>取消</button>
            </div>
          )}

          <div className="chart-frame">
            {loadingFeed && <div className="loading-overlay inline">换源加载中…</div>}
            {candles.length > 0 && (
              <ChartPane
                candles={candles}
                playhead={playhead}
                symbol={symbol}
                fills={fills}
                orders={orders}
                position={position}
                liquidationPrice={liqPrice}
                overlays={chartOverlays}
                pickMode={pickMode === 'replay' ? 'bar' : pickMode ? 'price' : null}
                onPickPrice={onPickPrice}
                onPickBar={onPickBar}
              />
            )}
          </div>

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
                onClick={() => { setPlaying(false); setPlayhead((value) => Math.min(candleCount - 1, value + 1)); }}
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
              <span className="replay-meta">{current ? formatTime(current.time) : '—'}</span>
            </div>
          </div>
        </section>

        <section className={`trade-panel ${tradeExpanded ? 'is-expanded' : 'is-compact'}`} aria-label="下单区">
          {position.quantity !== 0 && (
            <div className="pos-strip slim">
              <strong className={position.quantity > 0 ? 'up' : 'down'}>
                {position.quantity > 0 ? '多' : '空'} {Math.abs(position.quantity)}张 · {activeLeverage}x
              </strong>
              <span className={floating >= 0 ? 'up' : 'down'}>{money(floating)}</span>
              <button type="button" className="ghost-link" onClick={() => setSheetOpen(true)}>详情</button>
              <button type="button" onClick={() => closePositionQty(1)} disabled={liquidated}>全平</button>
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
                  onChange={(event) => setQuantity(Math.max(1, Math.min(MAX_QTY, Number(event.target.value) || 1)))}
                  inputMode="numeric"
                />
                <button type="button" onClick={() => setQuantity((value) => Math.min(MAX_QTY, value + 1))}>+</button>
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
                placeholder={priceText(markPrice)}
                inputMode="decimal"
              />
            </label>
          )}

          <div className="order-actions compact">
            <button className="buy" onClick={() => placeOrder('buy')} disabled={liquidated}>
              <span>开多</span>
              <strong>{priceText(orderType === 'market' ? quotes.ask : Number(limitPrice) || quotes.ask)}</strong>
            </button>
            <button className="sell" onClick={() => placeOrder('sell')} disabled={liquidated}>
              <span>开空</span>
              <strong>{priceText(orderType === 'market' ? quotes.bid : Number(limitPrice) || quotes.bid)}</strong>
            </button>
            <button className="flat" onClick={closePosition} disabled={position.quantity === 0 || liquidated}>
              平仓
            </button>
          </div>

          <div className="margin-line compact">
            <span>保证金 {money(orderMargin)}</span>
            <span>可开 {Math.min(MAX_QTY, Math.max(0, maxOpen))}张</span>
            <button type="button" className="more-toggle" onClick={() => setTradeExpanded((value) => !value)}>
              {tradeExpanded ? '收起选项' : '更多选项'}
            </button>
          </div>

          {tradeExpanded && (
            <div className="trade-extra">
              <div className="qty-presets">
                {[1, 2, 5, 10].map((n) => (
                  <button key={n} type="button" className={quantity === n ? 'active' : ''} onClick={() => setQuantity(n)}>
                    {n}张
                  </button>
                ))}
                <button
                  type="button"
                  className={quantity === Math.max(1, maxOpen) ? 'active' : ''}
                  onClick={() => setQuantity(Math.max(1, Math.min(MAX_QTY, maxOpen)))}
                >
                  可开{Math.min(MAX_QTY, maxOpen)}
                </button>
              </div>

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

              {position.quantity !== 0 && (
                <div className="protective-edit">
                  <label>
                    <span>持仓止盈</span>
                    <input value={editTp} onChange={(event) => setEditTp(event.target.value)} placeholder="空=清除" inputMode="decimal" />
                  </label>
                  <label>
                    <span>持仓止损</span>
                    <input value={editSl} onChange={(event) => setEditSl(event.target.value)} placeholder="空=清除" inputMode="decimal" />
                  </label>
                  <button type="button" onClick={applyPositionProtective}>改 TP/SL</button>
                </div>
              )}

              {position.quantity !== 0 && (
                <div className="partial-row">
                  <button type="button" onClick={() => closePositionQty(0.25)}>平25%</button>
                  <button type="button" onClick={() => closePositionQty(0.5)}>平50%</button>
                  <button type="button" onClick={() => closePositionQty(1)}>全平</button>
                </div>
              )}

              <div className="margin-line">
                <span>
                  预估手续费 {money(calcTradingFee(
                    orderType === 'market' ? (quotes.ask + quotes.bid) / 2 : Number(limitPrice) || markPrice,
                    quantity,
                    orderType === 'market' ? 'taker' : 'maker',
                  ))}
                </span>
                <span>{priceText(quotes.bid)} / {priceText(quotes.ask)}</span>
              </div>
            </div>
          )}
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
                    <div className="partial-row sheet">
                      <button type="button" onClick={() => closePositionQty(0.25)}>平25%</button>
                      <button type="button" onClick={() => closePositionQty(0.5)}>平50%</button>
                      <button type="button" onClick={() => closePositionQty(1)}>全平</button>
                    </div>
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

      {confirmJump && (
        <div className="confirm-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="jump-confirm-title">
            <h3 id="jump-confirm-title">将清空仓位，是否继续</h3>
            <p>跳转回放会清空当前持仓、委托与成交记录。</p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setConfirmJump(null)}>取消</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const next = confirmJump;
                  setConfirmJump(null);
                  doJump(next.offset, next.label, next.quiet);
                }}
              >
                继续跳转
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
