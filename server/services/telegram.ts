import axios from 'axios';
import { storage } from '../storage';
import { trackApiCall } from './api-usage-tracker';

export class TelegramService {
  private async sendMessage(userId: string, message: string): Promise<void> {
    // Get user's chat ID
    const user = await storage.getUserById(userId);
    if (!user || !user.telegramChatId) {
      console.log(`Skipping Telegram message for user ${userId} - no chat ID configured`);
      return;
    }

    // Use global bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.log(`⚠️  Global TELEGRAM_BOT_TOKEN not configured`);
      return;
    }

    const response = await trackApiCall('telegram', 'sendMessage', async () => {
      return axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: user.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
      });
    });
    console.log(`✅ Telegram message sent successfully for user ${userId}`);
    return response.data;
  }

  async sendTestMessage(userId: string): Promise<void> {
    const message = `🎯 *Welcome to Zen Options*\n\nYour Telegram notifications are now active! I will be sending you personalized options alerts including:\n\n📊 Watchlist updates\n📈 Position alerts (take-profit, stop-loss, DTE warnings)\n🔍 Scan results with qualified trade candidates\n📅 Daily market digests\n\nStay informed and trade with confidence! 🚀`;
    await this.sendMessage(userId, message);
  }

  async sendDailyDigest(userId: string): Promise<void> {
    const scanResults = await storage.getLatestScanResults(userId);
    const qualified = scanResults.filter(r => r.status === 'qualified');
    const openPositions = await storage.getPositions(userId, 'open');

    // Calculate days to expiration and P&L for each position
    const now = new Date();
    
    // Group positions by (symbol, expiry) to batch API calls
    const positionGroups: Record<string, typeof openPositions> = {};
    for (const pos of openPositions) {
      const key = `${pos.symbol}_${pos.expiry}`;
      if (!positionGroups[key]) positionGroups[key] = [];
      positionGroups[key].push(pos);
    }

    // Fetch option chains for each unique (symbol, expiry) in parallel
    const { marketDataService } = await import('./marketData');
    const optionChainCache: Record<string, any[]> = {};
    await Promise.all(
      Object.keys(positionGroups).map(async (key) => {
        const [symbol, expiryStr] = key.split('_');
        try {
          const expiryDate = new Date(expiryStr);
          const chain = await marketDataService.getOptionChain(symbol, expiryDate);
          optionChainCache[key] = chain;
        } catch (error) {
          console.error(`Error fetching option chain for ${symbol} ${expiryStr}:`, error);
          optionChainCache[key] = [];
        }
      })
    );

    // Calculate P&L and DTE for each position
    const positionsWithData = openPositions.map(pos => {
      const expiry = new Date(pos.expiry);
      const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      const key = `${pos.symbol}_${pos.expiry}`;
      const chain = optionChainCache[key] || [];

      // Find current option prices for both legs
      const shortLeg = chain.find(opt => 
        opt.type === pos.type.toLowerCase() &&
        Math.abs(opt.strike - pos.shortStrike) < 0.01
      );
      const longLeg = chain.find(opt => 
        opt.type === pos.type.toLowerCase() &&
        Math.abs(opt.strike - pos.longStrike) < 0.01
      );

      let pnlDollars = null;
      let pnlPercent = null;

      if (shortLeg && longLeg) {
        const shortMid = (shortLeg.bid + shortLeg.ask) / 2;
        const longMid = (longLeg.bid + longLeg.ask) / 2;

        if (shortMid > 0 && longMid > 0) {
          const currentCostPerShare = Math.abs(longMid - shortMid);
          const currentCostCents = Math.round(currentCostPerShare * 100);
          const pnlCents = pos.entryCreditCents - currentCostCents;
          // P/L in full contract value (×100 shares)
          pnlDollars = pnlCents;
          pnlPercent = pos.entryCreditCents > 0 ? (pnlCents / pos.entryCreditCents) * 100 : 0;
        }
      }
      
      return { ...pos, dte, pnlDollars, pnlPercent };
    });

    let message = `📊 *Daily Digest*\n\n`;
    
    // Open Positions Section
    message += `📈 *Open Positions: ${openPositions.length}*\n\n`;
    
    if (openPositions.length > 0) {
      for (const pos of positionsWithData) {
        const expiryDate = new Date(pos.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        message += this.formatPositionDescription(pos) + `\n`;
        
        if (pos.pnlDollars !== null && pos.pnlPercent !== null) {
          const pnlSign = pos.pnlDollars >= 0 ? '+' : '';
          message += `Expiry: ${expiryDate} (${pos.dte} DTE) | P/L: ${pnlSign}$${pos.pnlDollars.toFixed(2)} (${pnlSign}${pos.pnlPercent.toFixed(1)}%)\n\n`;
        } else {
          message += `Expiry: ${expiryDate} (${pos.dte} DTE) | P/L: N/A\n\n`;
        }
      }
    } else {
      message += `No open positions\n\n`;
    }

    // Trade Candidates Section
    message += `🎯 *Trade Candidates: ${qualified.length}*\n\n`;

    if (qualified.length > 0) {
      for (const result of qualified) {
        const creditDollars = (result.creditMidCents || 0) / 100;
        const expiryDate = new Date(result.expiry || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const type = result.signal?.includes('PUT') ? 'PUT' : result.signal?.includes('CALL') ? 'CALL' : '';
        
        message += `*${result.symbol}* ${type} ${result.shortStrike}/${result.longStrike} • Score: ${result.score?.toFixed(1) || 'N/A'}\n`;
        message += `Expiry: ${expiryDate} (${result.dte} DTE) | Credit: $${creditDollars.toFixed(2)}\n`;
        message += `R:R ${result.rr?.toFixed(2)}:1 | Delta: ${result.delta?.toFixed(2) || 'N/A'}\n\n`;
      }
    } else {
      message += `No qualified candidates today\n\n`;
    }

    await this.sendMessage(userId, message);
  }

  // Helper to format position description based on strategy type
  private formatPositionDescription(position: any): string {
    if (position.strategyType === 'IRON_CONDOR') {
      // Iron Condor: show both put and call spreads
      const putSpread = `P ${position.shortStrike}/${position.longStrike}`;
      const callSpread = `C ${position.callShortStrike}/${position.callLongStrike}`;
      return `*${position.symbol}* IC\n${putSpread} | ${callSpread}`;
    } else if (position.strategyType === 'LEAPS') {
      return `*${position.symbol}* LEAPS ${position.shortStrike}`;
    } else {
      // Credit Spread
      return `*${position.symbol}* ${position.type} ${position.shortStrike}/${position.longStrike}`;
    }
  }

  async sendAlert(userId: string, alert: any, position: any): Promise<void> {
    let message = `🔔 *Position Alert*\n\n`;
    message += this.formatPositionDescription(position) + `\n`;
    message += `Expiry: ${new Date(position.expiry).toLocaleDateString()}\n\n`;

    // ZenStatus-based alerts
    if (alert.type === 'profit_ready') {
      message += `💰 *PROFIT READY*\n`;
      message += `Time to consider taking profits on this position.\n`;
      message += `Review and close per systematic rules.`;
    } else if (alert.type === 'action_needed') {
      message += `🚨 *ACTION NEEDED*\n`;
      message += `This position requires immediate attention.\n`;
      message += `Review for potential exit or adjustment.`;
    } else if (alert.type === 'monitor') {
      message += `👀 *MONITOR*\n`;
      message += `Position needs closer attention.\n`;
      message += `Watch for changes and be ready to act.`;
    }
    // Legacy alert types for backward compatibility
    else if (alert.type === 'tp25') {
      const entryCreditDollars = position.entryCreditCents / 100;
      const currentMidDollars = (alert.currentMidCents || 0) / 100;
      message += `✅ *Take Profit 25% reached*\n`;
      message += `Entry: $${entryCreditDollars.toFixed(2)} | Current: $${currentMidDollars.toFixed(2)}`;
    } else if (alert.type === 'tp50') {
      const entryCreditDollars = position.entryCreditCents / 100;
      const currentMidDollars = (alert.currentMidCents || 0) / 100;
      message += `✅ *Take Profit 50% reached*\n`;
      message += `Entry: $${entryCreditDollars.toFixed(2)} | Current: $${currentMidDollars.toFixed(2)}`;
    } else if (alert.type === 'sl1x') {
      message += `⚠️ *Stop Loss 1x reached*\n`;
      message += `Consider closing position`;
    } else if (alert.type === 'sl1_5x') {
      message += `⚠️ *Stop Loss 1.5x reached*\n`;
      message += `Consider closing position`;
    } else if (alert.type === 'stop2x') {
      message += `⚠️ *Stop Loss 2x reached*\n`;
      message += `Consider closing position`;
    } else if (alert.type === 'dte28') {
      message += `📅 *28 DTE Management Rule*\n`;
      message += `Review for exit or roll`;
    } else if (alert.type === 'dte25') {
      message += `📅 *25 DTE Management Rule*\n`;
      message += `Review for exit or roll`;
    } else if (alert.type === 'dte21') {
      message += `📅 *21 DTE Management Rule*\n`;
      message += `Review for exit or roll`;
    }

    await this.sendMessage(userId, message);
  }

  async sendBatchedAlerts(userId: string, alertsWithPositions: Array<{ alert: any; position: any }>): Promise<void> {
    if (alertsWithPositions.length === 0) return;

    let message = `🔔 *Position Alerts*\n\n`;
    
    for (const { alert, position } of alertsWithPositions) {
      // Calculate DTE
      const now = new Date();
      const expiry = new Date(position.expiry);
      const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Format date as DD/MM/YYYY
      const day = expiry.getDate().toString().padStart(2, '0');
      const month = (expiry.getMonth() + 1).toString().padStart(2, '0');
      const year = expiry.getFullYear();
      const formattedDate = `${day}/${month}/${year}`;
      
      message += this.formatPositionDescription(position) + `\n`;
      message += `Expiry: ${formattedDate} (DTE${dte})\n`;

      // ZenStatus-based alerts
      if (alert.type === 'profit_ready') {
        message += `💰 *PROFIT READY*: Consider taking profits\n`;
      } else if (alert.type === 'action_needed') {
        message += `🚨 *ACTION NEEDED*: Review for exit/adjustment\n`;
      } else if (alert.type === 'monitor') {
        message += `👀 *MONITOR*: Watch for changes\n`;
      }
      // Legacy alert types
      else if (alert.type === 'tp25') {
        const entryCreditDollars = position.entryCreditCents / 100;
        const currentMidDollars = (alert.currentMidCents || 0) / 100;
        message += `✅ *TP25*: Entry $${entryCreditDollars.toFixed(2)} | Current $${currentMidDollars.toFixed(2)}\n`;
      } else if (alert.type === 'tp50') {
        const entryCreditDollars = position.entryCreditCents / 100;
        const currentMidDollars = (alert.currentMidCents || 0) / 100;
        message += `✅ *TP50*: Entry $${entryCreditDollars.toFixed(2)} | Current $${currentMidDollars.toFixed(2)}\n`;
      } else if (alert.type === 'sl1x') {
        message += `⚠️ *SL1×*: Consider closing position\n`;
      } else if (alert.type === 'sl1_5x') {
        message += `⚠️ *SL1.5×*: Consider closing position\n`;
      } else if (alert.type === 'stop2x') {
        message += `⚠️ *SL2×*: Consider closing position\n`;
      } else if (alert.type === 'dte28') {
        message += `📅 *28 DTE*: Review for exit or roll\n`;
      } else if (alert.type === 'dte25') {
        message += `📅 *25 DTE*: Review for exit or roll\n`;
      } else if (alert.type === 'dte21') {
        message += `📅 *21 DTE*: Review for exit or roll\n`;
      }
      
      message += `\n`;
    }

    await this.sendMessage(userId, message);
  }

  async sendPreOpeningScan(userId: string): Promise<void> {
    const scanResults = await storage.getLatestScanResults(userId);
    const qualified = scanResults.filter(r => r.status === 'qualified');

    let message = `🌅 *Pre-Opening Scan Update*\n\n`;
    message += `📊 ${qualified.length} Trade Candidate${qualified.length !== 1 ? 's' : ''}\n\n`;

    if (qualified.length > 0) {
      message += `🎯 *Trade Candidates:*\n\n`;
      for (const result of qualified) {
        const creditDollars = (result.creditMidCents || 0) / 100;
        const expiryDate = new Date(result.expiry || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const type = result.signal?.includes('PUT') ? 'PUT' : result.signal?.includes('CALL') ? 'CALL' : '';
        
        message += `*${result.symbol}* ${type} ${result.shortStrike}/${result.longStrike} • Score: ${result.score?.toFixed(1) || 'N/A'}\n`;
        message += `Expiry: ${expiryDate} (${result.dte} DTE) | Credit: $${creditDollars.toFixed(2)}\n`;
        message += `R:R ${result.rr?.toFixed(2)}:1 | Delta: ${result.delta?.toFixed(2) || 'N/A'}\n\n`;
      }
    }

    await this.sendMessage(userId, message);
  }

  async sendMarketOpenScan(userId: string): Promise<void> {
    const scanResults = await storage.getLatestScanResults(userId);
    const qualified = scanResults.filter(r => r.status === 'qualified');

    let message = `🚀 *Market Open Scan Update*\n\n`;
    message += `📊 ${qualified.length} Trade Candidate${qualified.length !== 1 ? 's' : ''}\n\n`;

    if (qualified.length > 0) {
      message += `🎯 *Trade Candidates:*\n\n`;
      for (const result of qualified) {
        const creditDollars = (result.creditMidCents || 0) / 100;
        const expiryDate = new Date(result.expiry || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const type = result.signal?.includes('PUT') ? 'PUT' : result.signal?.includes('CALL') ? 'CALL' : '';
        
        message += `*${result.symbol}* ${type} ${result.shortStrike}/${result.longStrike} • Score: ${result.score?.toFixed(1) || 'N/A'}\n`;
        message += `Expiry: ${expiryDate} (${result.dte} DTE) | Credit: $${creditDollars.toFixed(2)}\n`;
        message += `R:R ${result.rr?.toFixed(2)}:1 | Delta: ${result.delta?.toFixed(2) || 'N/A'}\n\n`;
      }
    }

    await this.sendMessage(userId, message);
  }

  async sendMarketCloseScan(userId: string): Promise<void> {
    const scanResults = await storage.getLatestScanResults(userId);
    const qualified = scanResults.filter(r => r.status === 'qualified');

    let message = `🌙 *Market Close Scan Update*\n\n`;
    message += `📊 ${qualified.length} Trade Candidate${qualified.length !== 1 ? 's' : ''}\n\n`;

    if (qualified.length > 0) {
      message += `🎯 *Trade Candidates:*\n\n`;
      for (const result of qualified) {
        const creditDollars = (result.creditMidCents || 0) / 100;
        const expiryDate = new Date(result.expiry || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const type = result.signal?.includes('PUT') ? 'PUT' : result.signal?.includes('CALL') ? 'CALL' : '';
        
        message += `*${result.symbol}* ${type} ${result.shortStrike}/${result.longStrike} • Score: ${result.score?.toFixed(1) || 'N/A'}\n`;
        message += `Expiry: ${expiryDate} (${result.dte} DTE) | Credit: $${creditDollars.toFixed(2)}\n`;
        message += `R:R ${result.rr?.toFixed(2)}:1 | Delta: ${result.delta?.toFixed(2) || 'N/A'}\n\n`;
      }
    }

    await this.sendMessage(userId, message);
  }

  async sendScanResultsOnly(userId: string): Promise<void> {
    const scanResults = await storage.getLatestScanResults(userId);
    const qualified = scanResults.filter(r => r.status === 'qualified');

    let message = `🔍 *Scan Results*\n\n`;
    message += `📊 ${qualified.length} Trade Candidate${qualified.length !== 1 ? 's' : ''}\n\n`;

    if (qualified.length > 0) {
      message += `🎯 *Trade Candidates:*\n\n`;
      for (const result of qualified) {
        const creditDollars = (result.creditMidCents || 0) / 100;
        const expiryDate = new Date(result.expiry || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const type = result.signal?.includes('PUT') ? 'PUT' : result.signal?.includes('CALL') ? 'CALL' : '';
        
        message += `*${result.symbol}* ${type} ${result.shortStrike}/${result.longStrike} • Score: ${result.score?.toFixed(1) || 'N/A'}\n`;
        message += `Expiry: ${expiryDate} (${result.dte} DTE) | Credit: $${creditDollars.toFixed(2)}\n`;
        message += `R:R ${result.rr?.toFixed(2)}:1 | Delta: ${result.delta?.toFixed(2) || 'N/A'}\n\n`;
      }
    } else {
      message += `No qualified trade candidates found in latest scan.\n`;
    }

    await this.sendMessage(userId, message);
  }
}

export const telegramService = new TelegramService();
