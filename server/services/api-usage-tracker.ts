import { db } from '../db';
import { apiUsage } from '@shared/schema';
import { eq, and, sql, gte, lte, desc } from 'drizzle-orm';

export type ApiProvider = 'polygon' | 'openai' | 'fred' | 'stripe' | 'telegram';

interface ApiCallResult {
  provider: ApiProvider;
  endpoint: string;
  success: boolean;
  latencyMs: number;
}

interface DailyStats {
  date: string;
  provider: string;
  endpoint: string;
  successCount: number;
  failureCount: number;
  totalCalls: number;
  successRate: number;
  avgLatencyMs: number;
}

interface ProviderSummary {
  provider: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
  endpoints: {
    endpoint: string;
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number;
  }[];
}

class ApiUsageTracker {
  private static instance: ApiUsageTracker;
  private pendingUpdates: Map<string, ApiCallResult[]> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 5000;

  private constructor() {
    this.startFlushInterval();
  }

  static getInstance(): ApiUsageTracker {
    if (!ApiUsageTracker.instance) {
      ApiUsageTracker.instance = new ApiUsageTracker();
    }
    return ApiUsageTracker.instance;
  }

  private startFlushInterval(): void {
    if (this.flushInterval) return;
    
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => {
        console.error('[ApiUsageTracker] Error flushing metrics:', err);
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  private getDateKey(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
  }

  private getUpdateKey(provider: ApiProvider, endpoint: string, dateKey: string): string {
    return `${dateKey}:${provider}:${endpoint}`;
  }

  async logCall(result: ApiCallResult): Promise<void> {
    const dateKey = this.getDateKey();
    const updateKey = this.getUpdateKey(result.provider, result.endpoint, dateKey);
    
    if (!this.pendingUpdates.has(updateKey)) {
      this.pendingUpdates.set(updateKey, []);
    }
    this.pendingUpdates.get(updateKey)!.push(result);
  }

  async flush(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    const updates = new Map(this.pendingUpdates);
    this.pendingUpdates.clear();

    for (const [key, calls] of updates) {
      const [dateKey, provider, endpoint] = key.split(':');
      const date = new Date(dateKey + 'T00:00:00.000Z');
      
      const successCount = calls.filter(c => c.success).length;
      const failureCount = calls.filter(c => !c.success).length;
      const totalLatencyMs = calls.reduce((sum, c) => sum + c.latencyMs, 0);

      try {
        await db
          .insert(apiUsage)
          .values({
            date,
            provider,
            endpoint,
            successCount,
            failureCount,
            totalLatencyMs,
          })
          .onConflictDoUpdate({
            target: [apiUsage.date, apiUsage.provider, apiUsage.endpoint],
            set: {
              successCount: sql`${apiUsage.successCount} + ${successCount}`,
              failureCount: sql`${apiUsage.failureCount} + ${failureCount}`,
              totalLatencyMs: sql`${apiUsage.totalLatencyMs} + ${totalLatencyMs}`,
              lastCalledAt: sql`now()`,
            },
          });
      } catch (error) {
        console.error(`[ApiUsageTracker] Error persisting metrics for ${key}:`, error);
        const existing = this.pendingUpdates.get(key) || [];
        this.pendingUpdates.set(key, [...existing, ...calls]);
      }
    }
  }

  async getDailyStats(days: number = 7): Promise<DailyStats[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const rows = await db
      .select()
      .from(apiUsage)
      .where(gte(apiUsage.date, startDate))
      .orderBy(desc(apiUsage.date));

    return rows.map(row => {
      const totalCalls = row.successCount + row.failureCount;
      return {
        date: row.date.toISOString().split('T')[0],
        provider: row.provider,
        endpoint: row.endpoint,
        successCount: row.successCount,
        failureCount: row.failureCount,
        totalCalls,
        successRate: totalCalls > 0 ? (row.successCount / totalCalls) * 100 : 0,
        avgLatencyMs: totalCalls > 0 ? row.totalLatencyMs / totalCalls : 0,
      };
    });
  }

  async getProviderSummary(days: number = 7): Promise<ProviderSummary[]> {
    const dailyStats = await this.getDailyStats(days);
    
    const providerMap = new Map<string, {
      totalCalls: number;
      successCount: number;
      failureCount: number;
      totalLatencyMs: number;
      endpointMap: Map<string, { calls: number; successes: number; latencyMs: number }>;
    }>();

    for (const stat of dailyStats) {
      if (!providerMap.has(stat.provider)) {
        providerMap.set(stat.provider, {
          totalCalls: 0,
          successCount: 0,
          failureCount: 0,
          totalLatencyMs: 0,
          endpointMap: new Map(),
        });
      }

      const provider = providerMap.get(stat.provider)!;
      provider.totalCalls += stat.totalCalls;
      provider.successCount += stat.successCount;
      provider.failureCount += stat.failureCount;
      provider.totalLatencyMs += stat.avgLatencyMs * stat.totalCalls;

      if (!provider.endpointMap.has(stat.endpoint)) {
        provider.endpointMap.set(stat.endpoint, { calls: 0, successes: 0, latencyMs: 0 });
      }
      const endpoint = provider.endpointMap.get(stat.endpoint)!;
      endpoint.calls += stat.totalCalls;
      endpoint.successes += stat.successCount;
      endpoint.latencyMs += stat.avgLatencyMs * stat.totalCalls;
    }

    return Array.from(providerMap.entries()).map(([provider, data]) => ({
      provider,
      totalCalls: data.totalCalls,
      successCount: data.successCount,
      failureCount: data.failureCount,
      successRate: data.totalCalls > 0 ? (data.successCount / data.totalCalls) * 100 : 0,
      avgLatencyMs: data.totalCalls > 0 ? data.totalLatencyMs / data.totalCalls : 0,
      endpoints: Array.from(data.endpointMap.entries()).map(([endpoint, endpointData]) => ({
        endpoint,
        totalCalls: endpointData.calls,
        successRate: endpointData.calls > 0 ? (endpointData.successes / endpointData.calls) * 100 : 0,
        avgLatencyMs: endpointData.calls > 0 ? endpointData.latencyMs / endpointData.calls : 0,
      })),
    }));
  }

  async getTotalCostEstimate(days: number = 30): Promise<{
    polygon: { calls: number; estimatedCost: number };
    openai: { calls: number; estimatedCost: number };
    fred: { calls: number; estimatedCost: number };
    stripe: { calls: number; estimatedCost: number };
    telegram: { calls: number; estimatedCost: number };
    total: number;
  }> {
    const summary = await this.getProviderSummary(days);
    
    const providerCosts: Record<string, { calls: number; costPerCall: number }> = {
      polygon: { calls: 0, costPerCall: 0.00001 },
      openai: { calls: 0, costPerCall: 0.01 },
      fred: { calls: 0, costPerCall: 0 },
      stripe: { calls: 0, costPerCall: 0 },
      telegram: { calls: 0, costPerCall: 0 },
    };

    for (const provider of summary) {
      if (providerCosts[provider.provider]) {
        providerCosts[provider.provider].calls = provider.totalCalls;
      }
    }

    const result = {
      polygon: {
        calls: providerCosts.polygon.calls,
        estimatedCost: providerCosts.polygon.calls * providerCosts.polygon.costPerCall,
      },
      openai: {
        calls: providerCosts.openai.calls,
        estimatedCost: providerCosts.openai.calls * providerCosts.openai.costPerCall,
      },
      fred: {
        calls: providerCosts.fred.calls,
        estimatedCost: 0,
      },
      stripe: {
        calls: providerCosts.stripe.calls,
        estimatedCost: 0,
      },
      telegram: {
        calls: providerCosts.telegram.calls,
        estimatedCost: 0,
      },
      total: 0,
    };

    result.total = result.polygon.estimatedCost + result.openai.estimatedCost;
    return result;
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export const apiUsageTracker = ApiUsageTracker.getInstance();

export function trackApiCall<T>(
  provider: ApiProvider,
  endpoint: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  return fn()
    .then(result => {
      const latencyMs = Date.now() - startTime;
      apiUsageTracker.logCall({ provider, endpoint, success: true, latencyMs });
      return result;
    })
    .catch(error => {
      const latencyMs = Date.now() - startTime;
      apiUsageTracker.logCall({ provider, endpoint, success: false, latencyMs });
      throw error;
    });
}
