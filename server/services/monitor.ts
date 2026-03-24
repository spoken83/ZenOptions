import { storage } from '../storage';
import { marketDataService } from './marketData';
import { zenStatusService, type ZenStatus, type PositionWithPnL } from './zenStatus';
import type { InsertAlert, Position } from '@shared/schema';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { differenceInCalendarDays, differenceInHours } from 'date-fns';

export class MonitorService {
  /**
   * Check all open positions for a user and generate ZenStatus-based alerts
   */
  async checkPositions(userId: string): Promise<void> {
    const openPositions = await storage.getPositions(userId, 'open');
    
    // Get user's alert settings
    const alertSettings = await this.getUserAlertSettings(userId);

    for (const position of openPositions) {
      try {
        // Get current market data and calculate P/L
        const positionWithPnL = await this.enrichPositionWithPnL(position);
        
        // Calculate ZenStatus
        const zenAnalysis = zenStatusService.calculateZenStatus(positionWithPnL);
        
        // Generate alerts based on ZenStatus and user settings
        await this.generateZenStatusAlert(userId, position, positionWithPnL, zenAnalysis.zenStatus, alertSettings);
        
      } catch (error) {
        console.error(`Error checking position ${position.id}:`, error);
      }
    }
  }

  /**
   * Get user's alert settings
   */
  private async getUserAlertSettings(userId: string): Promise<{
    alertOnProfitReady: boolean;
    alertOnActionNeeded: boolean;
    alertOnMonitor: boolean;
    profitThreshold: number;
    cooldownHours: number;
    // Granular action triggers
    actionBeBreached: boolean;
    actionStrikeBreached: boolean;
    actionCsDte: boolean;
    actionCsDteThreshold: number;
    actionIcDte: boolean;
    actionIcDteThreshold: number;
    actionLossZone: boolean;
    actionLossZoneThreshold: number;
  }> {
    const settings = await storage.getAllSettings(userId);
    const getValue = (key: string, defaultValue: string) => 
      settings.find((s: { key: string; value: string }) => s.key === key)?.value || defaultValue;
    
    return {
      // Per-trigger Telegram alert toggles (Pro feature)
      alertOnProfitReady: getValue('alert_on_profit_ready', 'true') === 'true',
      alertOnActionNeeded: getValue('alert_on_action_needed', 'true') === 'true',
      alertOnMonitor: getValue('alert_on_monitor', 'false') === 'true',
      profitThreshold: parseInt(getValue('alert_profit_threshold', '60')),
      cooldownHours: parseInt(getValue('alert_cooldown_hours', '4')),
      // Granular action triggers
      actionBeBreached: getValue('alert_action_be_breached', 'true') === 'true',
      actionStrikeBreached: getValue('alert_action_strike_breached', 'true') === 'true',
      actionCsDte: getValue('alert_action_cs_dte', 'true') === 'true',
      actionCsDteThreshold: parseInt(getValue('alert_action_cs_dte_threshold', '21')),
      actionIcDte: getValue('alert_action_ic_dte', 'true') === 'true',
      actionIcDteThreshold: parseInt(getValue('alert_action_ic_dte_threshold', '21')),
      actionLossZone: getValue('alert_action_loss_zone', 'true') === 'true',
      actionLossZoneThreshold: parseInt(getValue('alert_action_loss_zone_threshold', '40')),
    };
  }

  /**
   * Enrich position with current P/L data
   */
  private async enrichPositionWithPnL(position: Position): Promise<PositionWithPnL> {
    let currentPrice: number | null = null;
    let pnlCents: number | null = null;
    let pnlPercent: number | null = null;

    try {
      // Get current stock price for strike breach analysis
      const stockQuote = await marketDataService.getQuote(position.symbol);
      currentPrice = stockQuote?.price || null;

      if (position.strategyType === 'STOCK') {
        // STOCK: simple price comparison, no option chain needed, no ×100 multiplier
        if (currentPrice && position.entryDebitCents) {
          const currentPriceCents = Math.round(currentPrice * 100);
          // P&L per share × shares (no ×100 multiplier for stocks)
          pnlCents = (currentPriceCents - position.entryDebitCents) * position.contracts;
          pnlPercent = ((currentPriceCents - position.entryDebitCents) / position.entryDebitCents) * 100;
        }
      } else {
      // Get option chain for spread pricing
      const expiry = new Date(position.expiry);
      const chain = await marketDataService.getOptionChain(position.symbol, expiry);

      if (position.strategyType === 'IRON_CONDOR') {
        // Calculate current value for Iron Condor
        const putShortOpt = chain.find(opt => opt.strike === position.shortStrike && opt.type === 'put');
        const putLongOpt = chain.find(opt => opt.strike === position.longStrike && opt.type === 'put');
        const callShortOpt = chain.find(opt => opt.strike === position.callShortStrike && opt.type === 'call');
        const callLongOpt = chain.find(opt => opt.strike === position.callLongStrike && opt.type === 'call');

        if (putShortOpt && putLongOpt && callShortOpt && callLongOpt) {
          const putSpreadMidCents = Math.round(
            (((putShortOpt.bid + putShortOpt.ask) / 2) - ((putLongOpt.bid + putLongOpt.ask) / 2)) * 100
          );
          const callSpreadMidCents = Math.round(
            (((callShortOpt.bid + callShortOpt.ask) / 2) - ((callLongOpt.bid + callLongOpt.ask) / 2)) * 100
          );
          const currentMidCents = putSpreadMidCents + callSpreadMidCents;
          const entryCreditCents = position.entryCreditCents || 0;
          
          pnlCents = (entryCreditCents - currentMidCents) * position.contracts * 100;
          pnlPercent = entryCreditCents > 0 ? ((entryCreditCents - currentMidCents) / entryCreditCents) * 100 : 0;
        }
      } else if (position.strategyType === 'LEAPS') {
        // LEAPS: debit position, calculate current value vs entry
        const opt = chain.find(
          opt => opt.strike === position.shortStrike && opt.type === position.type.toLowerCase() as 'put' | 'call'
        );
        if (opt && position.entryDebitCents) {
          const currentMidCents = Math.round(((opt.bid + opt.ask) / 2) * 100);
          pnlCents = (currentMidCents - position.entryDebitCents) * position.contracts * 100;
          pnlPercent = ((currentMidCents - position.entryDebitCents) / position.entryDebitCents) * 100;
        }
      } else {
        // Regular credit spread
        const shortOpt = chain.find(
          opt => opt.strike === position.shortStrike && opt.type === position.type.toLowerCase() as 'put' | 'call'
        );
        const longOpt = chain.find(
          opt => opt.strike === position.longStrike && opt.type === position.type.toLowerCase() as 'put' | 'call'
        );

        if (shortOpt && longOpt) {
          const currentMidCents = Math.round(
            (((shortOpt.bid + shortOpt.ask) / 2) - ((longOpt.bid + longOpt.ask) / 2)) * 100
          );
          const entryCreditCents = position.entryCreditCents || 0;
          
          pnlCents = (entryCreditCents - currentMidCents) * position.contracts * 100;
          pnlPercent = entryCreditCents > 0 ? ((entryCreditCents - currentMidCents) / entryCreditCents) * 100 : 0;
        }
      }
      } // end else (non-STOCK)
    } catch (error) {
      console.error(`Error enriching position ${position.id} with P/L:`, error);
    }

    return {
      ...position,
      currentPrice,
      pnlCents,
      pnlPercent,
    };
  }

  /**
   * Generate alerts based on ZenStatus and user's configured thresholds
   */
  private async generateZenStatusAlert(
    userId: string,
    position: Position,
    positionWithPnL: PositionWithPnL,
    zenStatus: ZenStatus,
    alertSettings: {
      alertOnProfitReady: boolean;
      alertOnActionNeeded: boolean;
      alertOnMonitor: boolean;
      profitThreshold: number;
      cooldownHours: number;
      actionBeBreached: boolean;
      actionStrikeBreached: boolean;
      actionCsDte: boolean;
      actionCsDteThreshold: number;
      actionIcDte: boolean;
      actionIcDteThreshold: number;
      actionLossZone: boolean;
      actionLossZoneThreshold: number;
    }
  ): Promise<void> {
    // Each alert type is controlled by its own toggle (alertOnProfitReady, alertOnActionNeeded, alertOnMonitor)
    // No global master toggle - per-trigger control for Pro users
    
    // Get existing alerts for cooldown check
    const existingAlerts = await storage.getAlertsByPosition(userId, position.id);
    
    // Helper to check cooldown
    const isWithinCooldown = (alertType: string): boolean => {
      const recentAlert = existingAlerts.find(a => {
        if (a.type !== alertType) return false;
        const hoursSinceAlert = differenceInHours(new Date(), new Date(a.firedAt));
        return hoursSinceAlert < alertSettings.cooldownHours;
      });
      return !!recentAlert;
    };
    
    // Helper to create alert
    const createAlertIfNeeded = async (alertType: string) => {
      if (isWithinCooldown(alertType)) {
        return false; // Already alerted within cooldown period
      }
      
      const currentMidCents = positionWithPnL.pnlCents 
        ? Math.round(positionWithPnL.pnlCents / (position.contracts * 100)) 
        : null;
      
      await storage.createAlert(userId, {
        positionId: position.id,
        type: alertType,
        currentMidCents,
      });
      
      console.log(`[MonitorService] ${alertType.toUpperCase()} alert created for ${position.symbol} ${position.type} ${position.shortStrike}/${position.longStrike}`);
      return true;
    };
    
    // Calculate DTE for custom exit threshold check
    const dte = differenceInCalendarDays(new Date(position.expiry), new Date());
    
    // Determine strategy type
    const isIronCondor = position.strategyType === 'IRON_CONDOR';
    const isCreditSpread = position.strategyType === 'CREDIT_SPREAD' || (!isIronCondor && position.strategyType !== 'LEAPS');
    
    // Check for PROFIT_READY based on user's configured threshold
    if (alertSettings.alertOnProfitReady && positionWithPnL.pnlPercent !== null) {
      if (positionWithPnL.pnlPercent >= alertSettings.profitThreshold) {
        if (await createAlertIfNeeded('profit_ready')) return;
      }
    }
    
    // Check for ACTION_NEEDED based on granular triggers
    if (alertSettings.alertOnActionNeeded) {
      
      // 1. DTE-based alerts (strategy-specific thresholds)
      if (isCreditSpread && alertSettings.actionCsDte && dte <= alertSettings.actionCsDteThreshold) {
        if (await createAlertIfNeeded('action_needed')) return;
      }
      
      if (isIronCondor && alertSettings.actionIcDte && dte <= alertSettings.actionIcDteThreshold) {
        if (await createAlertIfNeeded('action_needed')) return;
      }
      
      // 2. Loss Zone Warning (e.g., 40% of max loss)
      if (alertSettings.actionLossZone && positionWithPnL.pnlPercent !== null) {
        // Loss zone threshold is stored as positive number (20, 30, 40, 50)
        // Convert to negative percentage for comparison
        const lossThreshold = -alertSettings.actionLossZoneThreshold;
        if (positionWithPnL.pnlPercent <= lossThreshold) {
          if (await createAlertIfNeeded('action_needed')) return;
        }
      }
      
      // 3. B/E breached (from ZenStatus analysis - ZenStatus already checks this)
      // The ZenStatus service already analyzes breakeven breach in its guidance
      if (alertSettings.actionBeBreached && zenStatus === 'action') {
        // ZenStatus 'action' typically means near-strike conditions
        if (await createAlertIfNeeded('action_needed')) return;
      }
      
      // 4. Strike breached (from ZenStatus)
      if (alertSettings.actionStrikeBreached && zenStatus === 'action') {
        if (await createAlertIfNeeded('action_needed')) return;
      }
    }
    
    // Check for MONITOR (from ZenStatus)
    if (zenStatus === 'monitor' && alertSettings.alertOnMonitor) {
      await createAlertIfNeeded('monitor');
      return;
    }
    
    // ZEN status = no alert needed
  }

}

export const monitorService = new MonitorService();
