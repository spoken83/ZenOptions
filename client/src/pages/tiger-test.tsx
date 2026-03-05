/**
 * DEV PAGE: Tiger vs Polygon Market Data Comparison
 * Temporary diagnostic page — not in nav. Access at /dev/tiger-test
 * Goal: determine if Tiger QuoteClient can fully replace Polygon API.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TestResult {
  symbol: string;
  tiger: {
    success: boolean;
    error?: string;
    summary?: {
      canReplaceStockQuotes: boolean;
      canReplaceHistoricalData: boolean;
      canReplaceOptionExpiries: boolean;
      canReplaceOptionChain: boolean;
      canReplaceGreeks: boolean;
      hasLeapsExpiries: boolean;
      canFullyReplacePolygon: boolean;
      verdict: string;
    };
    tests?: {
      stockQuote: any;
      historicalData: any;
      optionExpiries: any;
      optionChain: any;
    };
  };
  polygon: {
    stockQuote: any;
    historicalData: any;
    optionExpiries: any;
    optionChain: any;
  };
}

function StatusIcon({ ok, warn }: { ok: boolean | null; warn?: boolean }) {
  if (ok === null) return <AlertCircle size={16} className="text-muted-foreground" />;
  if (warn) return <AlertCircle size={16} className="text-yellow-500" />;
  return ok
    ? <CheckCircle size={16} className="text-green-500" />
    : <XCircle size={16} className="text-destructive" />;
}

function FieldRow({ label, tiger, polygon, warn }: {
  label: string;
  tiger: string | boolean | null;
  polygon: string | boolean | null;
  warn?: boolean;
}) {
  const tigerOk = tiger !== null && tiger !== false && tiger !== 'null' && tiger !== '';
  const polygonOk = polygon !== null && polygon !== false && polygon !== 'null' && polygon !== '';
  return (
    <TableRow>
      <TableCell className="text-sm font-medium">{label}</TableCell>
      <TableCell className="text-sm">
        <span className="flex items-center gap-2">
          <StatusIcon ok={tigerOk} warn={warn && tigerOk} />
          <span className={tigerOk ? 'text-foreground' : 'text-muted-foreground'}>
            {tiger === null ? '—' : tiger === true ? 'Yes' : tiger === false ? 'No' : String(tiger)}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-sm">
        <span className="flex items-center gap-2">
          <StatusIcon ok={polygonOk} />
          <span className={polygonOk ? 'text-foreground' : 'text-muted-foreground'}>
            {polygon === null ? '—' : polygon === true ? 'Yes' : polygon === false ? 'No' : String(polygon)}
          </span>
        </span>
      </TableCell>
    </TableRow>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-48">Field</TableHead>
              <TableHead className="text-xs">Tiger QuoteClient</TableHead>
              <TableHead className="text-xs">Polygon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function TigerTest() {
  const [symbol, setSymbol] = useState("AAPL");
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const { data, isLoading, error } = useQuery<TestResult>({
    queryKey: ["/api/dev/tiger-data-test", activeSymbol],
    queryFn: async () => {
      const res = await fetch(`/api/dev/tiger-data-test?symbol=${activeSymbol}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!activeSymbol,
    staleTime: Infinity, // Don't auto-refetch — only on explicit "Run Test"
  });

  const handleRun = () => setActiveSymbol(symbol.toUpperCase());

  const t = data?.tiger?.tests;
  const p = data?.polygon;
  const summary = data?.tiger?.summary;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Tiger vs Polygon — Market Data Comparison</h1>
        <p className="text-muted-foreground text-sm">
          Tests what Tiger's QuoteClient can return vs Polygon for the same symbol.
          Goal: determine if Polygon can be replaced to reduce costs.
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
        <Input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleRun()}
          placeholder="Symbol (e.g. AAPL)"
          className="w-36 font-mono"
        />
        <Button onClick={handleRun} disabled={isLoading}>
          {isLoading ? <><Loader2 size={14} className="animate-spin mr-2" />Running...</> : 'Run Test'}
        </Button>
        {data && (
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => setShowRaw(v => !v)}
          >
            {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-sm text-destructive">
          Error: {String(error)}
        </div>
      )}

      {data?.tiger?.success === false && (
        <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-sm text-destructive">
          Tiger script error: {data.tiger.error}
        </div>
      )}

      {/* Verdict */}
      {summary && (
        <Card className={`border-2 ${summary.canFullyReplacePolygon ? 'border-green-500 bg-green-500/5' : 'border-yellow-500 bg-yellow-500/5'}`}>
          <CardContent className="pt-5 pb-4">
            <div className="font-bold text-lg mb-3">
              {summary.canFullyReplacePolygon ? '✅ Tiger CAN fully replace Polygon' : '⚠️ Tiger cannot fully replace Polygon'}
            </div>
            <div className="text-sm font-mono text-muted-foreground mb-3">{summary.verdict}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {[
                { label: 'Stock quotes', ok: summary.canReplaceStockQuotes },
                { label: 'Historical data (252d)', ok: summary.canReplaceHistoricalData },
                { label: 'Option expiries', ok: summary.canReplaceOptionExpiries },
                { label: 'Option chain (bid/ask)', ok: summary.canReplaceOptionChain },
                { label: 'Greeks (delta, IV)', ok: summary.canReplaceGreeks },
                { label: 'LEAPS expiries (1y+)', ok: summary.hasLeapsExpiries },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <StatusIcon ok={ok} />
                  <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section: Stock Quote */}
      {t && p && (
        <SectionCard title="1. Stock Quote">
          <FieldRow label="Available" tiger={t.stockQuote.available} polygon={p.stockQuote.available} />
          <FieldRow label="Price" tiger={t.stockQuote.fields?.price ?? null} polygon={p.stockQuote.fields?.price ?? null} />
          <FieldRow label="Volume" tiger={t.stockQuote.fields?.volume ?? null} polygon={p.stockQuote.fields?.volume ?? null} />
          <FieldRow label="Bid" tiger={t.stockQuote.fields?.bid ?? null} polygon="—" />
          <FieldRow label="Ask" tiger={t.stockQuote.fields?.ask ?? null} polygon="—" />
          <FieldRow label="Change %" tiger={t.stockQuote.fields?.changePct ?? null} polygon="—" />
          {t.stockQuote.error && (
            <TableRow><TableCell colSpan={3} className="text-xs text-destructive">{t.stockQuote.error}</TableCell></TableRow>
          )}
          {p.stockQuote.error && (
            <TableRow><TableCell colSpan={3} className="text-xs text-destructive">Polygon: {p.stockQuote.error}</TableCell></TableRow>
          )}
        </SectionCard>
      )}

      {/* Section: Historical Data */}
      {t && p && (
        <SectionCard title="2. Historical Daily OHLCV">
          <FieldRow label="Available" tiger={t.historicalData.available} polygon={p.historicalData.available} />
          <FieldRow
            label="Days returned (need 252 for SMA200)"
            tiger={t.historicalData.daysReturned}
            polygon={p.historicalData.daysReturned}
            warn={t.historicalData.daysReturned < 220}
          />
          <FieldRow label="Sample: open" tiger={t.historicalData.sampleBar?.open ?? null} polygon={p.historicalData.sampleBar?.open ?? null} />
          <FieldRow label="Sample: high" tiger={t.historicalData.sampleBar?.high ?? null} polygon={p.historicalData.sampleBar?.high ?? null} />
          <FieldRow label="Sample: low" tiger={t.historicalData.sampleBar?.low ?? null} polygon={p.historicalData.sampleBar?.low ?? null} />
          <FieldRow label="Sample: close" tiger={t.historicalData.sampleBar?.close ?? null} polygon={p.historicalData.sampleBar?.close ?? null} />
          <FieldRow label="Sample: volume" tiger={t.historicalData.sampleBar?.volume ?? null} polygon={p.historicalData.sampleBar?.volume ?? null} />
          {t.historicalData.error && (
            <TableRow><TableCell colSpan={3} className="text-xs text-destructive">{t.historicalData.error}</TableCell></TableRow>
          )}
        </SectionCard>
      )}

      {/* Section: Option Expiries */}
      {t && p && (
        <SectionCard title="3. Option Expiry Dates">
          <FieldRow label="Available" tiger={t.optionExpiries.available} polygon={p.optionExpiries.available} />
          <FieldRow label="Total future expiries" tiger={t.optionExpiries.totalExpiries} polygon={p.optionExpiries.totalExpiries} />
          <FieldRow label="Nearest expiry" tiger={t.optionExpiries.nearestExpiry} polygon={p.optionExpiries.nearestExpiry} />
          <FieldRow label="Farthest expiry" tiger={t.optionExpiries.farthestExpiry} polygon={p.optionExpiries.farthestExpiry} />
          <FieldRow label="LEAPS expiries (365+ DTE)" tiger={t.optionExpiries.hasLeapsExpiries} polygon={p.optionExpiries.hasLeapsExpiries} />
          {t.optionExpiries.error && (
            <TableRow><TableCell colSpan={3} className="text-xs text-destructive">{t.optionExpiries.error}</TableCell></TableRow>
          )}
        </SectionCard>
      )}

      {/* Section: Option Chain */}
      {t && p && (
        <SectionCard title="4. Option Chain — CRITICAL for Scanner">
          <FieldRow label="Available" tiger={t.optionChain.available} polygon={p.optionChain.available} />
          <FieldRow label="Expiry used" tiger={t.optionChain.expiryUsed} polygon="~35 DTE" />
          <FieldRow label="Total contracts" tiger={t.optionChain.totalContracts} polygon={p.optionChain.totalContracts} />
          <FieldRow label="Call contracts" tiger={t.optionChain.callCount} polygon={p.optionChain.callCount} />
          <FieldRow label="Put contracts" tiger={t.optionChain.putCount} polygon={p.optionChain.putCount} />
          <FieldRow label="Bid/Ask available ⭐" tiger={t.optionChain.bidAskAvailable ? `Yes (${t.optionChain.bidCoverage}% of contracts)` : 'No'} polygon={p.optionChain.bidAskAvailable} />
          <FieldRow label="Implied Volatility (IV) ⭐" tiger={t.optionChain.ivAvailable ? `Yes (${t.optionChain.ivCoverage}% of contracts)` : 'No'} polygon={p.optionChain.ivAvailable} />
          <FieldRow label="Delta ⭐" tiger={t.optionChain.deltaAvailable ? `Yes (${t.optionChain.deltaCoverage}% of contracts)` : 'No'} polygon={p.optionChain.deltaAvailable} />
          <FieldRow label="Gamma" tiger={t.optionChain.sampleCall?.gamma ?? null} polygon="—" />
          <FieldRow label="Theta" tiger={t.optionChain.sampleCall?.theta ?? null} polygon="—" />
          {t.optionChain.error && (
            <TableRow><TableCell colSpan={3} className="text-xs text-destructive">{t.optionChain.error}</TableCell></TableRow>
          )}
          {p.optionChain.error && (
            <TableRow><TableCell colSpan={3} className="text-xs text-destructive">Polygon: {p.optionChain.error}</TableCell></TableRow>
          )}
        </SectionCard>
      )}

      {/* Tiger raw fields discovered */}
      {t?.optionChain?.raw_field_names?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tiger Option Contract Fields (all fields returned by API)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {t.optionChain.raw_field_names.map((f: string) => (
                <code key={f} className="text-xs bg-muted px-2 py-0.5 rounded">{f}</code>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature Gap: Ticker Search */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">5. Ticker Search (Add new symbols to watchlist)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-destructive" />
            <span>Tiger has no search-by-name API. Only Polygon supports autocomplete search.</span>
          </div>
          <div className="mt-2 text-xs">
            <strong>Workaround:</strong> Users must type exact ticker symbols. The "Add Ticker" autocomplete would stop working but manual entry still works.
          </div>
        </CardContent>
      </Card>

      {/* Raw JSON */}
      {showRaw && data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Raw Response JSON</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <pre className="text-xs overflow-auto max-h-[600px] bg-muted p-3 rounded">
              {JSON.stringify(data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground border-t pt-4">
        ⭐ = critical for scanner (credit spread/IC scoring requires bid, ask, IV, delta)
        · This is a dev-only page, not linked from navigation.
      </div>
    </div>
  );
}
