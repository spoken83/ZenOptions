import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface TigerPosition {
  symbol: string;
  secType: string;
  quantity: number;
  averageCost: number;
  marketValue: number;
  unrealizedPL: number;
  realizedPL: number;
  strike?: number;
  expiry?: string;
  right?: string;
}

export interface TigerFilledOrder {
  orderId: string;
  symbol: string;
  secType: string;
  action: string;
  quantity: number;
  filledQuantity: number;
  avgFillPrice: number;
  orderTime: number;
  filledTime: number;
  strike?: number;
  expiry?: string;
  right?: string;
}

export interface TigerAccountInfo {
  cashBalance: number;
  totalValue: number;
  buyingPower: number;
  accountType: string; // 'Margin' or 'Cash'
}

export interface TigerPositionsResponse {
  success: boolean;
  timestamp: string;
  account?: string;
  positions?: TigerPosition[];
  filledOrders?: TigerFilledOrder[];
  accountValue?: number;
  accountInfo?: TigerAccountInfo;
  error?: string;
}

export class TigerBrokersService {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(process.cwd(), 'server', 'integrations', 'tiger', 'fetch_positions.py');
  }

  async fetchPositions(accountNumber?: string): Promise<TigerPositionsResponse> {
    try {
      console.log('🐯 Fetching positions from Tiger Brokers...');
      
      // Execute Python script
      const { stdout, stderr } = await execAsync(`python3 ${this.pythonScriptPath}`, {
        env: {
          ...process.env,
          TIGER_ID: process.env.TIGER_ID || '',
          TIGER_ACCOUNT: accountNumber || process.env.TIGER_ACCOUNT || '',
          TIGER_PRIVATE_KEY: process.env.TIGER_PRIVATE_KEY || '',
        },
        timeout: 30000, // 30 second timeout
      });

      if (stderr) {
        console.error('Tiger Brokers stderr:', stderr);
      }

      // Parse JSON output
      const result: TigerPositionsResponse = JSON.parse(stdout);
      
      if (!result.success) {
        console.error('Tiger Brokers error:', result.error);
        throw new Error(result.error || 'Unknown error from Tiger Brokers API');
      }

      console.log(`✅ Fetched ${result.positions?.length || 0} positions from Tiger Brokers`);
      return result;

    } catch (error: any) {
      console.error('Error fetching Tiger positions:', error);
      
      // Check if it's a credentials issue
      if (error.message?.includes('Missing required Tiger API credentials')) {
        return {
          success: false,
          timestamp: new Date().toISOString(),
          error: 'Tiger Brokers API credentials not configured. Please add TIGER_ID and TIGER_PRIVATE_KEY to your secrets, and set tiger_account_number in settings.',
        };
      }
      
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: error.message || 'Failed to fetch positions from Tiger Brokers',
      };
    }
  }

  /**
   * Check if Tiger Brokers credentials are configured
   * accountNumber can come from settings or environment
   */
  isConfigured(accountNumber?: string): boolean {
    return !!(
      process.env.TIGER_ID &&
      (accountNumber || process.env.TIGER_ACCOUNT) &&
      process.env.TIGER_PRIVATE_KEY
    );
  }
}

export const tigerBrokersService = new TigerBrokersService();
