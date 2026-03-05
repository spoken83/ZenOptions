import axios from 'axios';
import OpenAI from 'openai';
import { db } from '../db';
import { watchlist, marketContextAnalysis } from '@shared/schema';
import type { MarketContextResult, MarketContextTickerSentiment } from '@shared/schema';
import { sql, desc } from 'drizzle-orm';
import { trackApiCall } from './api-usage-tracker';

interface MarketData {
  vix: number;
  spy: number;
  qqq: number;
  spyChange: number;
  qqqChange: number;
}

interface TickerNews {
  symbol: string;
  headlines: string[];
}

export class MarketContextService {
  private openai: OpenAI | null = null;
  private polygonApiKey: string;
  private fredApiKey: string;
  private isEnabled: boolean = false;

  constructor() {
    // Initialize OpenAI (optional - graceful degradation)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
      this.isEnabled = true;
    } else {
      console.warn('⚠️  OPENAI_API_KEY not set - Market context analysis will be unavailable');
      this.isEnabled = false;
    }

    // Initialize Polygon API key
    this.polygonApiKey = process.env.POLYGON_API_KEY || '';
    if (!this.polygonApiKey && this.isEnabled) {
      console.warn('⚠️  POLYGON_API_KEY not set - Market context will have limited functionality');
    }

    // Initialize FRED API key for VIX
    this.fredApiKey = process.env.FRED_API_KEY || '';
    if (!this.fredApiKey && this.isEnabled) {
      console.warn('⚠️  FRED_API_KEY not set - VIX data may be unavailable');
    }

    console.log(this.isEnabled ? '✅ Market Context Service initialized' : '⚠️  Market Context Service disabled (missing API keys)');
  }

  /**
   * Check if service is enabled and throw user-friendly error if not
   */
  private checkEnabled(): void {
    if (!this.isEnabled || !this.openai) {
      throw new Error('Market context analysis is not available. Please configure OPENAI_API_KEY to enable this feature.');
    }
  }

  /**
   * Fetch current market data (VIX, SPY, QQQ)
   */
  private async fetchMarketData(): Promise<MarketData> {
    console.log('📊 Fetching market data (VIX, SPY, QQQ)...');

    // Fetch VIX from FRED (same source as market ticker - end-of-day closing values)
    let vix = 0;
    try {
      const fredResponse = await trackApiCall('fred', 'getVIX', async () => {
        return axios.get('https://api.stlouisfed.org/fred/series/observations', {
          params: {
            series_id: 'VIXCLS',
            api_key: this.fredApiKey,
            file_type: 'json',
            sort_order: 'desc',
            limit: 1
          }
        });
      });

      if (fredResponse.data.observations && fredResponse.data.observations.length > 0) {
        vix = parseFloat(fredResponse.data.observations[0].value);
        const vixDate = fredResponse.data.observations[0].date;
        console.log(`   VIX: ${vix} (FRED closing value from ${vixDate})`);
      }
    } catch (error: any) {
      console.error('   Error fetching VIX from FRED:', error.message);
    }

    // Fetch SPY and QQQ from Polygon
    const spyData = await this.fetchPolygonSnapshot('SPY');
    const qqqData = await this.fetchPolygonSnapshot('QQQ');

    const spy = spyData.price;
    const qqq = qqqData.price;
    const spyChange = spyData.changePercent;
    const qqqChange = qqqData.changePercent;

    console.log(`   SPY: $${spy} (${spyChange > 0 ? '+' : ''}${spyChange.toFixed(2)}%)`);
    console.log(`   QQQ: $${qqq} (${qqqChange > 0 ? '+' : ''}${qqqChange.toFixed(2)}%)`);

    return { vix, spy, qqq, spyChange, qqqChange };
  }

  /**
   * Fetch Polygon snapshot for a ticker
   */
  private async fetchPolygonSnapshot(symbol: string): Promise<{ price: number; changePercent: number }> {
    const response = await trackApiCall('polygon', 'marketContextSnapshot', async () => {
      return axios.get(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`,
        {
          headers: { 'Authorization': `Bearer ${this.polygonApiKey}` },
          timeout: 10000
        }
      );
    });

    const ticker = response.data.ticker;
    if (!ticker || !ticker.day) {
      throw new Error(`Invalid Polygon snapshot response for ${symbol}`);
    }

    const price = ticker.day.c || ticker.prevDay?.c || 0;
    const prevClose = ticker.prevDay?.c || price;
    const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    return { price, changePercent };
  }

  /**
   * Collect all unique tickers from active users' watchlists
   */
  private async collectUniqueTickers(): Promise<string[]> {
    console.log('📋 Collecting unique tickers from all watchlists...');

    const result = await db
      .selectDistinct({ symbol: watchlist.symbol })
      .from(watchlist)
      .where(sql`${watchlist.active} = true`);

    // Normalize to uppercase for consistent lookups
    const tickers = result.map(r => r.symbol.toUpperCase());
    console.log(`   Found ${tickers.length} unique tickers: ${tickers.slice(0, 10).join(', ')}${tickers.length > 10 ? '...' : ''}`);

    return tickers;
  }

  /**
   * Fetch news for a specific ticker from Polygon
   */
  private async fetchTickerNews(symbol: string, limit: number = 5): Promise<string[]> {
    try {
      const response = await axios.get(
        `https://api.polygon.io/v2/reference/news`,
        {
          params: {
            ticker: symbol,
            limit,
            order: 'desc',
            sort: 'published_utc'
          },
          headers: { 'Authorization': `Bearer ${this.polygonApiKey}` },
          timeout: 10000
        }
      );

      if (response.data.results && response.data.results.length > 0) {
        return response.data.results.map((article: any) => article.title);
      }

      return [];
    } catch (error: any) {
      console.error(`   Error fetching news for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch news for all tickers
   */
  private async fetchAllTickerNews(tickers: string[]): Promise<TickerNews[]> {
    console.log(`📰 Fetching news for ${tickers.length} tickers...`);

    // Limit to 100 tickers max to avoid overwhelming LLM and API rate limits
    const tickersToFetch = tickers.slice(0, 100);

    const newsPromises = tickersToFetch.map(async (symbol) => {
      const headlines = await this.fetchTickerNews(symbol, 3); // 3 headlines per ticker
      return { symbol, headlines };
    });

    const allNews = await Promise.all(newsPromises);

    // Filter out tickers with no news
    const newsWithHeadlines = allNews.filter(n => n.headlines.length > 0);
    console.log(`   ${newsWithHeadlines.length} tickers have news`);

    return newsWithHeadlines;
  }

  /**
   * Run LLM analysis using GPT-4o with structured output
   */
  private async runLLMAnalysis(
    marketData: MarketData,
    tickerNews: TickerNews[],
    analysisType: 'pre-market' | 'intra-day' | 'eod'
  ): Promise<MarketContextResult> {
    console.log(`🤖 Running GPT-4o market analysis (${analysisType})...`);

    const systemPrompt = `You are a professional options trading analyst specializing in Credit Spreads, Iron Condors, and LEAPS strategies.

Analyze current market conditions and provide systematic guidance for options trading. Focus on:
- Market regime (bullish/bearish/neutral) based on VIX levels and index movements
- VIX levels and volatility expectations
- Per-ticker sentiment analysis based on recent news
- Strategy suitability based on market conditions
- Key risks and upcoming catalysts

Return structured analysis in JSON format following the specified schema.`;

    // Customize prompt based on analysis type
    const analysisContext = {
      'pre-market': {
        title: 'Pre-Market Analysis',
        focus: 'Analyze overnight news and pre-market price action. Focus on setup for the trading day ahead.'
      },
      'intra-day': {
        title: 'Intraday Market Update',
        focus: 'Analyze current market price action and any breaking news. Focus on intraday momentum shifts and emerging opportunities.'
      },
      'eod': {
        title: 'End-of-Day Analysis',
        focus: 'Analyze the full trading day and after-hours developments. Focus on daily trends and setup for tomorrow.'
      }
    }[analysisType];

    const userPrompt = `Perform ${analysisContext.title} for ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET.

${analysisContext.focus}

MARKET DATA:
- VIX: ${marketData.vix.toFixed(2)}
- SPY: $${marketData.spy.toFixed(2)} (${marketData.spyChange > 0 ? '+' : ''}${marketData.spyChange.toFixed(2)}%)
- QQQ: $${marketData.qqq.toFixed(2)} (${marketData.qqqChange > 0 ? '+' : ''}${marketData.qqqChange.toFixed(2)}%)

TICKER NEWS (${tickerNews.length} tickers):
${tickerNews.map(t => `${t.symbol}:\n${t.headlines.map(h => `  - ${h}`).join('\n')}`).join('\n\n')}

Provide systematic trading guidance for current market conditions. For each ticker with news, analyze the sentiment and provide clear reasoning.`;

    // Define structured output schema
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }
    
    const openaiClient = this.openai;
    const response = await trackApiCall('openai', 'marketContext', async () => {
      return openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'market_context_analysis',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                marketRegime: {
                  type: 'string',
                  enum: ['bearish', 'neutral', 'bullish']
                },
                vixAssessment: {
                  type: 'string',
                  enum: ['low', 'normal', 'elevated', 'high']
                },
                summary: {
                  type: 'string',
                  description: 'Brief 2-3 sentence summary for traders'
                },
                recommendations: {
                  type: 'object',
                  properties: {
                    creditSpreads: {
                      type: 'object',
                      properties: {
                        enabled: { type: 'boolean' },
                        direction: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
                        confidence: { type: 'number' },
                        reasoning: { type: 'string' }
                      },
                      required: ['enabled', 'direction', 'confidence', 'reasoning'],
                      additionalProperties: false
                    },
                    ironCondor: {
                      type: 'object',
                      properties: {
                        enabled: { type: 'boolean' },
                        confidence: { type: 'number' },
                        reasoning: { type: 'string' }
                      },
                      required: ['enabled', 'confidence', 'reasoning'],
                      additionalProperties: false
                    },
                    leaps: {
                      type: 'object',
                      properties: {
                        enabled: { type: 'boolean' },
                        confidence: { type: 'number' },
                        reasoning: { type: 'string' }
                      },
                      required: ['enabled', 'confidence', 'reasoning'],
                      additionalProperties: false
                    }
                  },
                  required: ['creditSpreads', 'ironCondor', 'leaps'],
                  additionalProperties: false
                },
                tickerAnalysis: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      symbol: { type: 'string' },
                      sentiment: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
                      confidence: { type: 'number' },
                      reasoning: { type: 'string' },
                      keyNews: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['symbol', 'sentiment', 'confidence', 'reasoning', 'keyNews'],
                    additionalProperties: false
                  }
                },
                keyRisks: {
                  type: 'array',
                  items: { type: 'string' }
                }
              },
              required: ['marketRegime', 'vixAssessment', 'summary', 'recommendations', 'tickerAnalysis', 'keyRisks'],
              additionalProperties: false
            }
          }
        },
        temperature: 0.3, // Lower temperature for more consistent analysis
      });
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No response from GPT-4o');
    }

    const analysis = JSON.parse(content);
    console.log(`   Market Regime: ${analysis.marketRegime}`);
    console.log(`   VIX Assessment: ${analysis.vixAssessment}`);
    console.log(`   Tickers Analyzed: ${analysis.tickerAnalysis.length}`);

    // Convert array of ticker analyses to Record format for storage
    const tickerAnalysisRecord: Record<string, any> = {};
    for (const ticker of analysis.tickerAnalysis) {
      tickerAnalysisRecord[ticker.symbol] = {
        sentiment: ticker.sentiment,
        confidence: ticker.confidence,
        reasoning: ticker.reasoning,
        keyNews: ticker.keyNews
      };
    }

    return {
      timestamp: new Date(),
      analysisType,
      marketRegime: analysis.marketRegime,
      vixLevel: marketData.vix,
      vixAssessment: analysis.vixAssessment,
      summary: analysis.summary,
      recommendations: analysis.recommendations,
      tickerAnalysis: tickerAnalysisRecord,
      keyRisks: analysis.keyRisks,
      // Include SPY/QQQ prices for UI display
      spy: marketData.spy,
      qqq: marketData.qqq,
      spyChange: marketData.spyChange,
      qqqChange: marketData.qqqChange
    };
  }

  /**
   * Save analysis to database
   */
  private async saveAnalysis(result: MarketContextResult): Promise<void> {
    console.log('💾 Saving market context to database...');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 4);

    await db.insert(marketContextAnalysis).values({
      timestamp: result.timestamp,
      analysisType: result.analysisType,
      marketRegime: result.marketRegime,
      vixLevel: result.vixLevel,
      vixAssessment: result.vixAssessment,
      summary: result.summary,
      recommendations: result.recommendations as any,
      tickerAnalysis: result.tickerAnalysis as any,
      rawData: result as any,
      expiresAt
    });

    console.log('✅ Market context saved');
  }

  /**
   * Get the latest market context analysis
   */
  async getLatestAnalysis(): Promise<MarketContextResult | null> {
    // Only return analysis that hasn't expired (i.e. within the last 4 hours)
    const results = await db
      .select()
      .from(marketContextAnalysis)
      .where(sql`${marketContextAnalysis.expiresAt} > NOW()`)
      .orderBy(desc(marketContextAnalysis.timestamp))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const record = results[0];
    const rawData = record.rawData as any;
    return {
      timestamp: record.timestamp,
      analysisType: record.analysisType as 'pre-market' | 'intra-day' | 'eod',
      marketRegime: record.marketRegime as 'bearish' | 'neutral' | 'bullish',
      vixLevel: record.vixLevel || 0,
      vixAssessment: (record.vixAssessment || 'normal') as 'low' | 'normal' | 'elevated' | 'high',
      summary: record.summary,
      recommendations: record.recommendations as any,
      tickerAnalysis: record.tickerAnalysis as any,
      keyRisks: rawData?.keyRisks || [],
      // SPY/QQQ data from rawData (for existing records) or top-level (for new records)
      spy: rawData?.spy,
      qqq: rawData?.qqq,
      spyChange: rawData?.spyChange,
      qqqChange: rawData?.qqqChange,
      rawData: rawData
    };
  }

  /**
   * Main function to perform market context analysis
   */
  async performAnalysis(analysisType: 'pre-market' | 'intra-day' | 'eod' = 'intra-day'): Promise<MarketContextResult> {
    this.checkEnabled();
    console.log(`🚀 Starting market context analysis (${analysisType})...`);

    try {
      // 1. Fetch market data
      const marketData = await this.fetchMarketData();

      // 2. Collect unique tickers from all watchlists
      const tickers = await this.collectUniqueTickers();

      // 3. Fetch news for all tickers
      const tickerNews = await this.fetchAllTickerNews(tickers);

      // 4. Run LLM analysis
      const result = await this.runLLMAnalysis(marketData, tickerNews, analysisType);

      // 5. Save to database
      await this.saveAnalysis(result);

      console.log(`✅ Market context analysis complete (${analysisType})`);
      return result;
    } catch (error: any) {
      console.error(`❌ Market context analysis failed (${analysisType}):`, error.message);
      throw error;
    }
  }

  /**
   * Clean up old market context records (older than 30 days)
   */
  async cleanupOldRecords(): Promise<number> {
    console.log('🧹 Cleaning up old market context records...');

    const result = await db
      .delete(marketContextAnalysis)
      .where(sql`${marketContextAnalysis.expiresAt} < NOW()`);

    const deletedCount = result.rowCount || 0;
    console.log(`   Deleted ${deletedCount} expired records`);

    return deletedCount;
  }
}

// Export singleton instance
export const marketContextService = new MarketContextService();
