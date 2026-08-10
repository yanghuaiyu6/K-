import type {
  CurrencyUnit,
  Fill,
  OrderType,
  PendingOrder,
  Position,
  SessionConfig,
  SessionStats,
} from '../model/market';
import type { FeedMode } from '../data/historyProvider';

const SESSION_KEY = 'replay-trader-session-v2';
const JOURNAL_KEY = 'replay-trader-journal-v2';
const SETTINGS_KEY = 'replay-trader-settings-v2';

export interface PracticeSnapshot {
  version: 2;
  savedAt: number;
  screen: 'setup' | 'practice' | 'report';
  config: SessionConfig;
  playhead: number;
  playing: boolean;
  speed: number;
  orderType: OrderType;
  quantity: number;
  leverage: number;
  currency: CurrencyUnit;
  limitPrice: string;
  takeProfit: string;
  stopLoss: string;
  position: Position;
  orders: PendingOrder[];
  fills: Fill[];
  liquidated: boolean;
  feedMode: FeedMode;
  feedLabel: string;
}

export interface JournalEntry {
  id: string;
  createdAt: number;
  symbolCode: string;
  timeframe: string;
  feedLabel: string;
  netPnl: number;
  winRate: number;
  trades: number;
  maxDrawdown: number;
  liquidated: boolean;
  note: string;
  startCapital: number;
}

export interface AppSettings {
  feedMode: FeedMode;
  currency: CurrencyUnit;
  leverage: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function loadSettings(): AppSettings | null {
  return readJson<AppSettings>(SETTINGS_KEY);
}

export function saveSettings(settings: AppSettings) {
  writeJson(SETTINGS_KEY, settings);
}

export function loadSession(): PracticeSnapshot | null {
  return readJson<PracticeSnapshot>(SESSION_KEY);
}

export function saveSession(snapshot: PracticeSnapshot) {
  writeJson(SESSION_KEY, snapshot);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function loadJournal(): JournalEntry[] {
  return readJson<JournalEntry[]>(JOURNAL_KEY) ?? [];
}

export function appendJournal(entry: JournalEntry) {
  const list = loadJournal();
  writeJson(JOURNAL_KEY, [entry, ...list].slice(0, 40));
}

export function journalFromStats(input: {
  config: SessionConfig;
  stats: SessionStats;
  feedLabel: string;
  liquidated: boolean;
  note?: string;
}): JournalEntry {
  return {
    id: `${Date.now()}`,
    createdAt: Date.now(),
    symbolCode: input.config.symbolCode,
    timeframe: input.config.timeframe,
    feedLabel: input.feedLabel,
    netPnl: input.stats.netPnl,
    winRate: input.stats.winRate,
    trades: input.stats.trades,
    maxDrawdown: input.stats.maxDrawdown,
    liquidated: input.liquidated,
    note: input.note ?? '',
    startCapital: input.config.startCapital,
  };
}
