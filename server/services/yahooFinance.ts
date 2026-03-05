import axios from 'axios';

interface YahooQuoteResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        chartPreviousClose: number;
        symbol: string;
      };
    }>;
    error: null | { code: string; description: string };
  };
}

export class YahooFinanceService {
  private baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';

  async getQuote(symbol: string): Promise<{ price: number; change: number; changePercent: number }> {
    try {
      const url = `${this.baseUrl}/${symbol}?interval=1d&range=1d`;
      const response = await axios.get<YahooQuoteResponse>(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      if (response.data.chart.error) {
        throw new Error(`Yahoo Finance API error: ${response.data.chart.error.description}`);
      }

      const result = response.data.chart.result[0];
      if (!result || !result.meta) {
        throw new Error(`No data returned for ${symbol}`);
      }

      const price = result.meta.regularMarketPrice;
      const previousClose = result.meta.chartPreviousClose;
      const change = price - previousClose;
      const changePercent = (change / previousClose) * 100;

      return {
        price: Number(price.toFixed(2)),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2))
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Yahoo Finance API error for ${symbol}:`, error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
        }
      }
      throw new Error(`Failed to fetch ${symbol} from Yahoo Finance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getVixData(): Promise<{
    vix: number;
    vixChange: number;
    vixChangePercent: number;
    vvix: number;
    vvixChange: number;
    vvixChangePercent: number;
  }> {
    try {
      // Fetch VIX and VVIX in parallel
      const [vixData, vvixData] = await Promise.all([
        this.getQuote('^VIX'),
        this.getQuote('^VVIX')
      ]);

      return {
        vix: vixData.price,
        vixChange: vixData.change,
        vixChangePercent: vixData.changePercent,
        vvix: vvixData.price,
        vvixChange: vvixData.change,
        vvixChangePercent: vvixData.changePercent
      };
    } catch (error) {
      console.error('Error fetching VIX data from Yahoo Finance:', error);
      throw error;
    }
  }
}

export const yahooFinanceService = new YahooFinanceService();
