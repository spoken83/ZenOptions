import type { TigerPosition, TigerFilledOrder } from './tigerBrokers';
import type { InsertPosition } from '@shared/schema';

export interface MappedPosition extends Partial<InsertPosition> {
  tigerData?: {
    secType: string;
    quantity: number;
    averageCost: number;
    marketValue?: number;
    unrealizedPL?: number;
  };
}

interface PositionGroup {
  symbol: string;
  expiry: Date;
  legs: TigerPosition[];
}

export class TigerPositionMapper {
  /**
   * Map Tiger Brokers positions to our schema
   * Tiger returns individual option legs - we group them to reconstruct spreads/condors
   */
  mapPositions(positions: TigerPosition[]): MappedPosition[] {
    const mappedPositions: MappedPosition[] = [];
    
    // Filter for option positions only
    const optionPositions = positions.filter(p => p.secType === 'OPT');
    
    // Group positions by symbol + expiry
    const groups = this.groupPositions(optionPositions);
    
    // Process each group to detect strategy types
    // Note: Each group may contain multiple spreads/condors
    for (const group of groups) {
      try {
        const strategies = this.reconstructStrategies(group);
        mappedPositions.push(...strategies);
      } catch (error) {
        console.error(`Error reconstructing strategies for ${group.symbol}:`, error);
      }
    }
    
    return mappedPositions;
  }

  /**
   * Group positions by symbol and expiry
   */
  private groupPositions(positions: TigerPosition[]): PositionGroup[] {
    const groupMap = new Map<string, PositionGroup>();
    
    for (const pos of positions) {
      if (!pos.strike || !pos.expiry || !pos.right) {
        console.warn(`Incomplete option data for ${pos.symbol}, skipping`);
        continue;
      }

      // Parse expiry date (format: YYYYMMDD from Tiger)
      const expiryStr = pos.expiry.toString();
      const expiry = new Date(
        parseInt(expiryStr.substring(0, 4)),
        parseInt(expiryStr.substring(4, 6)) - 1,
        parseInt(expiryStr.substring(6, 8))
      );

      const key = `${pos.symbol}-${pos.expiry}`;
      
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          symbol: pos.symbol,
          expiry,
          legs: []
        });
      }
      
      groupMap.get(key)!.legs.push(pos);
    }
    
    return Array.from(groupMap.values());
  }

  /**
   * Reconstruct strategies from grouped legs
   * Handles multiple spreads/condors at the same expiry
   */
  private reconstructStrategies(group: PositionGroup): MappedPosition[] {
    const strategies: MappedPosition[] = [];
    const { symbol, expiry, legs } = group;
    
    // Create a working copy of legs that we'll consume as we match them
    const remainingLegs = [...legs];
    
    // Try to match iron condors first (most legs)
    while (true) {
      const condor = this.tryMatchIronCondor(symbol, expiry, remainingLegs);
      if (!condor) break;
      
      strategies.push(condor.strategy);
      // Remove matched legs
      condor.matchedLegs.forEach(leg => {
        const idx = remainingLegs.findIndex(l => l === leg);
        if (idx >= 0) remainingLegs.splice(idx, 1);
      });
    }
    
    // Try to match credit spreads
    while (true) {
      const spread = this.tryMatchCreditSpread(symbol, expiry, remainingLegs);
      if (!spread) break;
      
      strategies.push(spread.strategy);
      // Remove matched legs
      spread.matchedLegs.forEach(leg => {
        const idx = remainingLegs.findIndex(l => l === leg);
        if (idx >= 0) remainingLegs.splice(idx, 1);
      });
    }
    
    // Try to match LEAPS
    while (true) {
      const leaps = this.tryMatchLeaps(symbol, expiry, remainingLegs);
      if (!leaps) break;
      
      strategies.push(leaps.strategy);
      // Remove matched leg
      const idx = remainingLegs.findIndex(l => l === leaps.matchedLeg);
      if (idx >= 0) remainingLegs.splice(idx, 1);
    }
    
    // Log any unmatched legs
    if (remainingLegs.length > 0) {
      console.warn(`Unmatched legs for ${symbol} ${expiry.toISOString().split('T')[0]}:`, 
        remainingLegs.map(l => `${l.right} ${l.strike} qty=${l.quantity}`));
    }
    
    return strategies;
  }

  /**
   * Try to match an iron condor from available legs
   */
  private tryMatchIronCondor(
    symbol: string,
    expiry: Date,
    legs: TigerPosition[]
  ): { strategy: MappedPosition; matchedLegs: TigerPosition[] } | null {
    const putLegs = legs.filter(l => l.right === 'PUT').sort((a, b) => a.strike! - b.strike!);
    const callLegs = legs.filter(l => l.right === 'CALL').sort((a, b) => a.strike! - b.strike!);
    
    const longPuts = putLegs.filter(l => l.quantity > 0);
    const shortPuts = putLegs.filter(l => l.quantity < 0);
    const longCalls = callLegs.filter(l => l.quantity > 0);
    const shortCalls = callLegs.filter(l => l.quantity < 0);
    
    if (shortPuts.length === 0 || longPuts.length === 0 || 
        shortCalls.length === 0 || longCalls.length === 0) {
      return null;
    }
    
    // Match legs with same quantity
    for (const shortPut of shortPuts) {
      for (const longPut of longPuts) {
        for (const shortCall of shortCalls) {
          for (const longCall of longCalls) {
            const qty = Math.abs(shortPut.quantity);
            if (Math.abs(longPut.quantity) === qty &&
                Math.abs(shortCall.quantity) === qty &&
                Math.abs(longCall.quantity) === qty) {
              
              // Calculate total credit
              const shortPutCredit = Math.abs(shortPut.averageCost) * qty;
              const longPutDebit = Math.abs(longPut.averageCost) * qty;
              const shortCallCredit = Math.abs(shortCall.averageCost) * qty;
              const longCallDebit = Math.abs(longCall.averageCost) * qty;
              
              const totalCreditCents = Math.round((shortPutCredit + shortCallCredit - longPutDebit - longCallDebit) * 100);
              
              // Calculate total unrealized PL and market value from Tiger
              const tigerUnrealizedPl = (shortPut.unrealizedPL || 0) + (longPut.unrealizedPL || 0) + 
                                        (shortCall.unrealizedPL || 0) + (longCall.unrealizedPL || 0);
              const tigerMarketValue = (shortPut.marketValue || 0) + (longPut.marketValue || 0) + 
                                       (shortCall.marketValue || 0) + (longCall.marketValue || 0);
              
              return {
                strategy: {
                  symbol,
                  strategyType: 'IRON_CONDOR',
                  type: 'PUT',
                  shortStrike: shortPut.strike!,
                  longStrike: longPut.strike!,
                  callShortStrike: shortCall.strike!,
                  callLongStrike: longCall.strike!,
                  expiry,
                  contracts: qty,
                  status: 'open',
                  entryCreditCents: totalCreditCents,
                  tigerUnrealizedPlCents: Math.round(tigerUnrealizedPl * 100),
                  tigerMarketValueCents: Math.round(tigerMarketValue * 100),
                  dataSource: 'tiger',
                  notes: `Imported from Tiger Brokers on ${new Date().toISOString().split('T')[0]}`,
                  tigerData: {
                    secType: 'OPT',
                    quantity: qty,
                    averageCost: totalCreditCents / 100,
                    unrealizedPL: tigerUnrealizedPl
                  }
                },
                matchedLegs: [shortPut, longPut, shortCall, longCall]
              };
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Try to match a credit spread from available legs
   */
  private tryMatchCreditSpread(
    symbol: string,
    expiry: Date,
    legs: TigerPosition[]
  ): { strategy: MappedPosition; matchedLegs: TigerPosition[] } | null {
    const putLegs = legs.filter(l => l.right === 'PUT').sort((a, b) => a.strike! - b.strike!);
    const callLegs = legs.filter(l => l.right === 'CALL').sort((a, b) => a.strike! - b.strike!);
    
    // Try PUT spread first
    const longPuts = putLegs.filter(l => l.quantity > 0);
    const shortPuts = putLegs.filter(l => l.quantity < 0);
    
    for (const shortPut of shortPuts) {
      for (const longPut of longPuts) {
        const qty = Math.abs(shortPut.quantity);
        if (Math.abs(longPut.quantity) === qty) {
          const shortCredit = Math.abs(shortPut.averageCost) * qty;
          const longDebit = Math.abs(longPut.averageCost) * qty;
          const netCreditCents = Math.round((shortCredit - longDebit) * 100);
          
          // Calculate total unrealized PL and market value from Tiger
          const tigerUnrealizedPl = (shortPut.unrealizedPL || 0) + (longPut.unrealizedPL || 0);
          const tigerMarketValue = (shortPut.marketValue || 0) + (longPut.marketValue || 0);
          
          return {
            strategy: {
              symbol,
              strategyType: 'CREDIT_SPREAD',
              type: 'PUT',
              shortStrike: shortPut.strike!,
              longStrike: longPut.strike!,
              expiry,
              contracts: qty,
              status: 'open',
              entryCreditCents: netCreditCents,
              tigerUnrealizedPlCents: Math.round(tigerUnrealizedPl * 100),
              tigerMarketValueCents: Math.round(tigerMarketValue * 100),
              dataSource: 'tiger',
              notes: `Imported from Tiger Brokers on ${new Date().toISOString().split('T')[0]}`,
              tigerData: {
                secType: 'OPT',
                quantity: qty,
                averageCost: netCreditCents / 100,
                unrealizedPL: tigerUnrealizedPl
              }
            },
            matchedLegs: [shortPut, longPut]
          };
        }
      }
    }
    
    // Try CALL spread
    const longCalls = callLegs.filter(l => l.quantity > 0);
    const shortCalls = callLegs.filter(l => l.quantity < 0);
    
    for (const shortCall of shortCalls) {
      for (const longCall of longCalls) {
        const qty = Math.abs(shortCall.quantity);
        if (Math.abs(longCall.quantity) === qty) {
          const shortCredit = Math.abs(shortCall.averageCost) * qty;
          const longDebit = Math.abs(longCall.averageCost) * qty;
          const netCreditCents = Math.round((shortCredit - longDebit) * 100);
          
          // Calculate total unrealized PL and market value from Tiger
          const tigerUnrealizedPl = (shortCall.unrealizedPL || 0) + (longCall.unrealizedPL || 0);
          const tigerMarketValue = (shortCall.marketValue || 0) + (longCall.marketValue || 0);
          
          return {
            strategy: {
              symbol,
              strategyType: 'CREDIT_SPREAD',
              type: 'CALL',
              shortStrike: shortCall.strike!,
              longStrike: longCall.strike!,
              expiry,
              contracts: qty,
              status: 'open',
              entryCreditCents: netCreditCents,
              tigerUnrealizedPlCents: Math.round(tigerUnrealizedPl * 100),
              tigerMarketValueCents: Math.round(tigerMarketValue * 100),
              dataSource: 'tiger',
              notes: `Imported from Tiger Brokers on ${new Date().toISOString().split('T')[0]}`,
              tigerData: {
                secType: 'OPT',
                quantity: qty,
                averageCost: netCreditCents / 100,
                unrealizedPL: tigerUnrealizedPl
              }
            },
            matchedLegs: [shortCall, longCall]
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Try to match a LEAPS (long CALL) from available legs
   * CRITICAL: Only match if this is truly a naked long call
   * (no short calls or put legs remaining that could indicate an incomplete spread)
   */
  private tryMatchLeaps(
    symbol: string,
    expiry: Date,
    legs: TigerPosition[]
  ): { strategy: MappedPosition; matchedLeg: TigerPosition } | null {
    const longCalls = legs.filter(l => l.right === 'CALL' && l.quantity > 0);
    
    if (longCalls.length === 0) return null;
    
    // CRITICAL FIX: Only treat as LEAPS if there are NO other legs
    // If there are short calls or put legs, this is likely a partial spread
    const hasShortCalls = legs.some(l => l.right === 'CALL' && l.quantity < 0);
    const hasPutLegs = legs.some(l => l.right === 'PUT');
    
    if (hasShortCalls || hasPutLegs) {
      // Not a true LEAPS - likely a partial or unmatched spread
      return null;
    }
    
    const longCall = longCalls[0];
    const qty = Math.abs(longCall.quantity);
    
    // FIX: Multiply by contract count for total debit
    const debitCents = Math.round(Math.abs(longCall.averageCost) * qty * 100);
    
    // Get Tiger's unrealized PL and market value
    const tigerUnrealizedPl = longCall.unrealizedPL || 0;
    const tigerMarketValue = longCall.marketValue || 0;
    
    return {
      strategy: {
        symbol,
        strategyType: 'LEAPS',
        type: 'CALL',
        shortStrike: longCall.strike!,
        expiry,
        contracts: qty,
        status: 'open',
        entryDebitCents: debitCents,
        tigerUnrealizedPlCents: Math.round(tigerUnrealizedPl * 100),
        tigerMarketValueCents: Math.round(tigerMarketValue * 100),
        dataSource: 'tiger',
        notes: `Imported from Tiger Brokers on ${new Date().toISOString().split('T')[0]}`,
        tigerData: {
          secType: 'OPT',
          quantity: longCall.quantity,
          averageCost: longCall.averageCost,
          unrealizedPL: tigerUnrealizedPl
        }
      },
      matchedLeg: longCall
    };

  }

  /**
   * Detect closed positions from filled orders
   * Note: This is disabled for v1 - Tiger's filled orders API is complex
   * and requires matching opening/closing trades across multi-leg strategies
   */
  detectClosedPositions(_filledOrders: TigerFilledOrder[]): MappedPosition[] {
    // Disabled for v1 - too complex to reliably match multi-leg strategies
    // User can manually enter closed positions or we can enhance this later
    console.log('Note: Closed position detection from Tiger orders is disabled in v1');
    return [];
  }
}

export const tigerPositionMapper = new TigerPositionMapper();
