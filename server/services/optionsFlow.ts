/**
 * Options Flow / Unusual Activity Service
 * Detects unusual options activity for a given ticker using Polygon snapshots.
 * Unusual = high volume-to-OI ratio (fresh buying) or large absolute volume.
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE = 'https://api.polygon.io';

export interface OptionsFlowItem {
  contract: string;         // e.g. "AAPL240119C00185000"
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;           // YYYY-MM-DD
  dte: number;
  volume: number;
  openInterest: number;
  volumeOiRatio: number;    // volume / OI — higher = fresher activity
  iv: number | null;        // implied volatility (0-1)
  delta: number | null;
  bid: number;
  ask: number;
  lastPrice: number | null;
  unusualScore: number;     // 0-100 composite score
  unusualReason: string;
}

export interface OptionsFlowResult {
  symbol: string;
  unusual: OptionsFlowItem[];
  scannedContracts: number;
  fetchedAt: string;
}

// Simple in-memory cache: per-symbol, 10-minute TTL
const flowCache = new Map<string, { result: OptionsFlowResult; expiresAt: number }>();
const FLOW_CACHE_TTL_MS = 10 * 60 * 1000;

export class OptionsFlowService {
  async getUnusualActivity(symbol: string): Promise<OptionsFlowResult> {
    const key = symbol.toUpperCase();

    // Check cache
    const cached = flowCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    if (!POLYGON_API_KEY) {
      return { symbol: key, unusual: [], scannedContracts: 0, fetchedAt: new Date().toISOString() };
    }

    try {
      const contracts = await this.fetchAllOptionSnapshots(key);
      const unusual = this.detectUnusual(key, contracts);

      const result: OptionsFlowResult = {
        symbol: key,
        unusual,
        scannedContracts: contracts.length,
        fetchedAt: new Date().toISOString(),
      };

      flowCache.set(key, { result, expiresAt: Date.now() + FLOW_CACHE_TTL_MS });
      return result;
    } catch (error: any) {
      console.error(`Options flow error for ${symbol}:`, error.message);
      return { symbol: key, unusual: [], scannedContracts: 0, fetchedAt: new Date().toISOString() };
    }
  }

  private async fetchAllOptionSnapshots(symbol: string): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    // Only look at options expiring 7-180 DTE
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 180);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    const url = `${POLYGON_BASE}/v3/snapshot/options/${symbol}?expiration_date.gte=${today}&expiration_date.lte=${maxDateStr}&limit=250&apiKey=${POLYGON_API_KEY}`;

    const allResults: any[] = [];
    let nextUrl: string | null = url;

    // Fetch up to 3 pages (750 contracts max)
    for (let page = 0; page < 3 && nextUrl; page++) {
      const httpRes = await fetch(nextUrl);
      if (!httpRes.ok) break;
      const pageData: any = await httpRes.json();
      if (Array.isArray(pageData.results)) {
        allResults.push(...pageData.results);
      }
      nextUrl = pageData.next_url ? `${pageData.next_url}&apiKey=${POLYGON_API_KEY}` : null;
    }

    return allResults;
  }

  private detectUnusual(symbol: string, snapshots: any[]): OptionsFlowItem[] {
    const now = new Date();
    const items: OptionsFlowItem[] = [];

    for (const snap of snapshots) {
      const day = snap.day ?? {};
      const details = snap.details ?? {};
      const greeks = snap.greeks ?? {};
      const lastQuote = snap.last_quote ?? {};
      const lastTrade = snap.last_trade ?? {};

      const volume: number = day.volume ?? 0;
      const oi: number = snap.open_interest ?? 0;
      const iv: number | null = snap.implied_volatility ?? null;
      const delta: number | null = greeks.delta ?? null;
      const bid: number = lastQuote.bid ?? 0;
      const ask: number = lastQuote.ask ?? 0;
      const lastPrice: number | null = lastTrade.price ?? null;
      const strike: number = details.strike_price ?? 0;
      const expiryStr: string = details.expiration_date ?? '';
      const type: 'call' | 'put' = (details.contract_type ?? '').toLowerCase() === 'call' ? 'call' : 'put';
      const ticker: string = snap.details?.ticker ?? '';

      if (volume < 100 || strike === 0 || !expiryStr) continue;

      const expiryDate = new Date(expiryStr);
      const dte = Math.floor((expiryDate.getTime() - now.getTime()) / 86400000);
      if (dte < 3) continue;

      const volumeOiRatio = oi > 0 ? parseFloat((volume / oi).toFixed(2)) : volume;

      // Score: high vol/OI ratio is the strongest signal
      let score = 0;
      const reasons: string[] = [];

      // 1. Volume-to-OI ratio >= 1 means more contracts traded today than exist — fresh activity
      if (volumeOiRatio >= 3) {
        score += 50;
        reasons.push(`vol/OI ${volumeOiRatio}x`);
      } else if (volumeOiRatio >= 1) {
        score += 25;
        reasons.push(`vol/OI ${volumeOiRatio}x`);
      }

      // 2. Absolute volume significance
      if (volume >= 10000) {
        score += 30;
        reasons.push(`${volume.toLocaleString()} contracts`);
      } else if (volume >= 2000) {
        score += 15;
        reasons.push(`${volume.toLocaleString()} contracts`);
      } else if (volume >= 500) {
        score += 5;
        reasons.push(`${volume.toLocaleString()} contracts`);
      }

      // 3. Wide bid-ask relative to premium = likely real fill at ask (sweep indicator)
      const mid = (bid + ask) / 2;
      if (mid > 0 && (ask - bid) / mid < 0.15 && volume > 500) {
        // Tight spread + volume = likely institutional/sweep
        score += 10;
        reasons.push('tight spread');
      }

      // 4. Near-term expirations with high volume are more noteworthy
      if (dte <= 30 && volume >= 500) {
        score += 10;
        reasons.push(`${dte} DTE`);
      }

      // Only include items with a meaningful score
      if (score < 25) continue;

      items.push({
        contract: ticker,
        symbol,
        type,
        strike,
        expiry: expiryStr,
        dte,
        volume,
        openInterest: oi,
        volumeOiRatio,
        iv,
        delta,
        bid,
        ask,
        lastPrice,
        unusualScore: Math.min(100, score),
        unusualReason: reasons.join(', '),
      });
    }

    // Sort by score descending, return top 20
    return items.sort((a, b) => b.unusualScore - a.unusualScore).slice(0, 20);
  }

  clearCache(symbol?: string) {
    if (symbol) {
      flowCache.delete(symbol.toUpperCase());
    } else {
      flowCache.clear();
    }
  }
}

export const optionsFlowService = new OptionsFlowService();
