import cron from 'node-cron';
import { scannerService } from './scanner';
import { monitorService } from './monitor';
import { telegramService } from './telegram';
import { marketContextService } from './marketContext';
import { supportResistanceService } from './supportResistance';
import { storage } from '../storage';
import type { User } from '@shared/schema';

export class SchedulerService {
  private lastMonitorRunTime: Map<string, number> = new Map();
  private lastAutoScanRunTime: Map<string, number> = new Map();

  private getCurrentTimeET(): string {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = String(etTime.getHours()).padStart(2, '0');
    const minutes = String(etTime.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private shouldRunMonitoring(userId: string, intervalMinutes: number): boolean {
    const now = Date.now();
    const lastRun = this.lastMonitorRunTime.get(userId) || 0;
    const intervalMs = intervalMinutes * 60 * 1000;
    
    if (now - lastRun >= intervalMs) {
      this.lastMonitorRunTime.set(userId, now);
      return true;
    }
    return false;
  }

  private shouldRunAutoScan(userId: string, intervalMinutes: number): boolean {
    const now = Date.now();
    const lastRun = this.lastAutoScanRunTime.get(userId) || 0;
    const intervalMs = intervalMinutes * 60 * 1000;
    
    if (now - lastRun >= intervalMs) {
      this.lastAutoScanRunTime.set(userId, now);
      return true;
    }
    return false;
  }

  private isTimeMatch(currentTime: string, targetTime: string): boolean {
    return currentTime === targetTime;
  }

  private isWithinTimeWindow(currentTime: string, startTime: string, endTime: string): boolean {
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  private async getActiveProUsers(): Promise<User[]> {
    return await storage.getProUsers();
  }

  private async getActiveFreeUsers(): Promise<User[]> {
    const allUsers = await storage.getUsers();
    return allUsers.filter(u => u.subscriptionTier === 'free' && u.isActive);
  }

  private getAlertPriority(alertType: string): number {
    const priorities: Record<string, number> = {
      'tp50': 10,
      'tp25': 9,
      'stop2x': 8,
      'sl1_5x': 7,
      'sl1x': 6,
      'dte21': 5,
      'dte25': 4,
      'dte28': 3,
    };
    return priorities[alertType] || 0;
  }

  private deduplicateAlerts(alertsWithPositions: Array<{ alert: any; position: any }>): Array<{ alert: any; position: any }> {
    const positionAlerts = new Map<string, Array<{ alert: any; position: any }>>();
    
    for (const item of alertsWithPositions) {
      const positionId = item.position.id;
      if (!positionAlerts.has(positionId)) {
        positionAlerts.set(positionId, []);
      }
      positionAlerts.get(positionId)!.push(item);
    }
    
    const deduplicated: Array<{ alert: any; position: any }> = [];
    const groupedAlerts = Array.from(positionAlerts.values());
    
    for (const items of groupedAlerts) {
      if (items.length === 1) {
        deduplicated.push(items[0]);
      } else {
        const sorted = items.sort((a: { alert: any; position: any }, b: { alert: any; position: any }) => 
          this.getAlertPriority(b.alert.type) - this.getAlertPriority(a.alert.type)
        );
        deduplicated.push(sorted[0]);
      }
    }
    
    return deduplicated;
  }

  async startScheduler(): Promise<void> {
    console.log('🚀 Starting scheduler service with multi-user support...');
    
    cron.schedule('* 6-18 * * 1-5', async () => {
      const currentTime = this.getCurrentTimeET();
      
      try {
        const proUsers = await this.getActiveProUsers();
        console.log(`Found ${proUsers.length} Pro users to check for scheduled scans`);
        
        for (const user of proUsers) {
          try {
            const dailyScanTime = (await storage.getSetting(user.id, 'daily_scan_time'))?.value;
            const preOpeningTime = (await storage.getSetting(user.id, 'pre_opening_scan_time'))?.value;
            const marketOpenTime = (await storage.getSetting(user.id, 'market_open_scan_time'))?.value;
            const marketCloseTime = (await storage.getSetting(user.id, 'market_close_scan_time'))?.value;
            
            if (dailyScanTime && this.isTimeMatch(currentTime, dailyScanTime)) {
              console.log(`[User ${user.id}] Running daily digest at ${currentTime}`);
              await scannerService.runDailyScan(user.id);
              await telegramService.sendDailyDigest(user.id);
            }
            
            if (preOpeningTime && this.isTimeMatch(currentTime, preOpeningTime)) {
              console.log(`[User ${user.id}] Running pre-opening scan at ${currentTime}`);
              await scannerService.runDailyScan(user.id);
              await telegramService.sendPreOpeningScan(user.id);
            }
            
            if (marketOpenTime && this.isTimeMatch(currentTime, marketOpenTime)) {
              console.log(`[User ${user.id}] Running market open scan at ${currentTime}`);
              await scannerService.runDailyScan(user.id);
              await telegramService.sendMarketOpenScan(user.id);
            }
            
            if (marketCloseTime && this.isTimeMatch(currentTime, marketCloseTime)) {
              console.log(`[User ${user.id}] Running market close scan at ${currentTime}`);
              await scannerService.runDailyScan(user.id);
              await telegramService.sendMarketCloseScan(user.id);
            }
          } catch (error) {
            console.error(`[User ${user.id}] Error in scheduled scan:`, error);
          }
        }
      } catch (error) {
        console.error('Error in scheduled scans check:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    cron.schedule('* 9-16 * * 1-5', async () => {
      const currentTime = this.getCurrentTimeET();
      
      try {
        const proUsers = await this.getActiveProUsers();
        
        for (const user of proUsers) {
          try {
            const monitorEnabled = (await storage.getSetting(user.id, 'monitor_enabled'))?.value === 'true';
            if (!monitorEnabled) {
              continue;
            }
            
            const monitorStart = (await storage.getSetting(user.id, 'monitor_start_time'))?.value || '09:30';
            const monitorEnd = (await storage.getSetting(user.id, 'monitor_end_time'))?.value || '12:00';
            const monitorInterval = parseInt((await storage.getSetting(user.id, 'monitor_interval_minutes'))?.value || '30');
            
            if (this.isWithinTimeWindow(currentTime, monitorStart, monitorEnd)) {
              if (this.shouldRunMonitoring(user.id, monitorInterval)) {
                console.log(`[User ${user.id}] Running position monitoring at ${currentTime} (${monitorInterval}min interval)`);
                await monitorService.checkPositions(user.id);
                
                const alerts = await storage.getActiveAlerts(user.id);
                const alertsWithPositions: Array<{ alert: any; position: any }> = [];
                
                for (const alert of alerts) {
                  const position = await storage.getPosition(user.id, alert.positionId!);
                  if (position && position.status === 'open' && !alert.dismissed) {
                    alertsWithPositions.push({ alert, position });
                  }
                }
                
                const deduplicatedAlerts = this.deduplicateAlerts(alertsWithPositions);
                
                if (deduplicatedAlerts.length > 0) {
                  console.log(`[User ${user.id}] Sending ${deduplicatedAlerts.length} alerts`);
                  await telegramService.sendBatchedAlerts(user.id, deduplicatedAlerts);
                }
              }
            }
          } catch (error) {
            console.error(`[User ${user.id}] Error in position monitoring:`, error);
          }
        }
      } catch (error) {
        console.error('Error in position monitoring check:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    cron.schedule('* 9-16 * * 1-5', async () => {
      const currentTime = this.getCurrentTimeET();
      
      try {
        const proUsers = await this.getActiveProUsers();
        
        for (const user of proUsers) {
          try {
            const autoScanEnabled = (await storage.getSetting(user.id, 'auto_scan_enabled'))?.value === 'true';
            if (!autoScanEnabled) {
              continue;
            }
            
            const autoScanStart = (await storage.getSetting(user.id, 'auto_scan_start_time'))?.value || '09:30';
            const autoScanEnd = (await storage.getSetting(user.id, 'auto_scan_end_time'))?.value || '16:00';
            const autoScanInterval = parseInt((await storage.getSetting(user.id, 'auto_scan_interval_minutes'))?.value || '30');
            
            if (this.isWithinTimeWindow(currentTime, autoScanStart, autoScanEnd)) {
              if (this.shouldRunAutoScan(user.id, autoScanInterval)) {
                console.log(`[User ${user.id}] Running auto scanner at ${currentTime} (${autoScanInterval}min interval)`);
                await scannerService.runDailyScan(user.id);
                await telegramService.sendScanResultsOnly(user.id);
              }
            }
          } catch (error) {
            console.error(`[User ${user.id}] Error in auto scanner:`, error);
          }
        }
      } catch (error) {
        console.error('Error in auto scanner check:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    // Free tier scheduled scans at market open (9:30 AM ET, Mon-Fri)
    cron.schedule('30 9 * * 1-5', async () => {
      console.log('📊 Running scheduled scan for Free tier users (9:30 AM ET)...');
      try {
        const freeUsers = await this.getActiveFreeUsers();
        console.log(`Found ${freeUsers.length} Free tier users for market open scan`);
        
        for (const user of freeUsers) {
          try {
            console.log(`[Free User ${user.id}] Running scheduled market open scan`);
            await scannerService.runDailyScan(user.id);
          } catch (error) {
            console.error(`[Free User ${user.id}] Error in scheduled market open scan:`, error);
          }
        }
        console.log('✅ Free tier market open scans completed');
      } catch (error) {
        console.error('Error in free tier market open scan:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    // Daily pre-market context analysis (9:00 AM ET, 30 mins before market open, Mon-Fri)
    cron.schedule('0 9 * * 1-5', async () => {
      console.log('🌅 Running daily pre-market context analysis (9:00 AM ET)...');
      try {
        await marketContextService.performAnalysis('pre-market');
        console.log('✅ Daily pre-market context analysis completed');
      } catch (error: any) {
        // Gracefully handle disabled service (missing API keys)
        if (error.message && error.message.includes('not available')) {
          console.log('⚠️  Skipping market context analysis - service disabled (missing OPENAI_API_KEY)');
        } else {
          console.error('❌ Error in pre-market context analysis:', error);
        }
      }
    }, {
      timezone: 'America/New_York'
    });

    cron.schedule('0 2 * * 0', async () => {
      console.log('Running weekly cleanup of old scan results...');
      try {
        const users = await storage.getUsers();
        console.log(`Cleaning up scan results for ${users.length} users`);
        
        for (const user of users) {
          try {
            console.log(`[User ${user.id}] Clearing old scan results (keeping 30 days)`);
            await storage.clearOldScanResults(user.id, 30);
          } catch (error) {
            console.error(`[User ${user.id}] Error cleaning up scan results:`, error);
          }
        }
        
        console.log('✅ Weekly cleanup completed');
      } catch (error) {
        console.error('Error in weekly cleanup:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    // Daily cleanup of old market context records (2:30 AM ET)
    cron.schedule('30 2 * * *', async () => {
      console.log('🧹 Running daily market context cleanup...');
      try {
        const deletedCount = await marketContextService.cleanupOldRecords();
        console.log(`✅ Market context cleanup completed (${deletedCount} records deleted)`);
      } catch (error) {
        console.error('❌ Error in market context cleanup:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    // Daily S/R auto-refresh for all watchlist tickers (9:00 AM ET, 30 mins before market open, Mon-Fri)
    cron.schedule('0 9 * * 1-5', async () => {
      console.log('📊 Running daily S/R auto-refresh for all watchlist tickers (9:00 AM ET)...');
      try {
        const result = await supportResistanceService.analyzeAllWatchlistTickers();
        console.log(`✅ Daily S/R refresh completed: ${result.success} successful, ${result.errors} errors, ${result.skipped} skipped`);
        
        if (result.errors > 0) {
          console.warn(`⚠️  ${result.errors} tickers failed during daily S/R refresh`);
          if (result.details.length > 0) {
            console.log('Error details:', result.details.slice(0, 5));
          }
        }
      } catch (error: any) {
        // Gracefully handle disabled service (missing API keys)
        if (error.message && error.message.includes('not available')) {
          console.log('⚠️  Skipping daily S/R refresh - service disabled (missing OPENAI_API_KEY or POLYGON_API_KEY)');
        } else {
          console.error('❌ Error in daily S/R refresh:', error);
        }
      }
    }, {
      timezone: 'America/New_York'
    });

    console.log('✅ Scheduler started successfully with America/New_York timezone');
    console.log('📅 Scheduled jobs (multi-user support):');
    console.log('   - Scheduled scans: Every minute, 6 AM - 6 PM ET (Mon-Fri)');
    console.log('     * Checks exact time match for each Pro user: daily_scan_time, pre_opening_scan_time, market_open_scan_time, market_close_scan_time');
    console.log('   - Position monitoring: Every minute, 9 AM - 4 PM ET (Mon-Fri)');
    console.log('     * Honors each Pro user\'s configured monitor_interval_minutes setting');
    console.log('   - Auto scanner: Every minute, 9 AM - 4 PM ET (Mon-Fri)');
    console.log('     * Honors each Pro user\'s configured auto_scan_interval_minutes setting');
    console.log('   - Market context analysis: 9:00 AM ET (Mon-Fri) - 30 mins before market open');
    console.log('   - S/R auto-refresh: 9:00 AM ET (Mon-Fri) - 30 mins before market open');
    console.log('   - Weekly cleanup: Sunday 2:00 AM ET (all users)');
    console.log('   - Market context cleanup: Daily 2:30 AM ET');
  }
}

export const schedulerService = new SchedulerService();
