import type { Position } from '@shared/schema';
import { differenceInCalendarDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export type ZenStatus = 'zen' | 'profit' | 'monitor' | 'action';

export interface ZenAnalysis {
  zenStatus: ZenStatus;
  guidanceText: string;
  guidanceDetails: {
    situation: string;
    rule: string;
    decisionPoints: string[];
  };
}

export interface PositionWithPnL extends Position {
  currentPrice: number | null;
  pnlCents: number | null;
  pnlPercent: number | null;
  /** Total premium collected from linked short calls (PMCC parent LEAPS only) */
  pmccPremiumCollectedCents?: number;
}

export class ZenStatusService {
  /**
   * Calculate ZenStatus for a position
   */
  calculateZenStatus(position: PositionWithPnL): ZenAnalysis {
    if (position.strategyType === 'STOCK') {
      return this.calculateStockZenStatus(position);
    }
    if (position.strategyType === 'LEAPS') {
      // If this LEAPS has linked short calls, use PMCC-aware status
      if (position.pmccPremiumCollectedCents && position.pmccPremiumCollectedCents > 0) {
        return this.calculatePmccLeapsZenStatus(position);
      }
      return this.calculateLeapsZenStatus(position);
    }
    // Linked short call (covered call against LEAPS) — use PMCC covered call guidance
    if (position.linkedPositionId) {
      return this.calculateCoveredCallZenStatus(position);
    }
    return this.calculateCreditSpreadZenStatus(position);
  }

  /**
   * PMCC parent LEAPS: ZenStatus that accounts for premium collected from linked short calls.
   * Effective cost basis = entryDebitCents − pmccPremiumCollectedCents.
   */
  private calculatePmccLeapsZenStatus(position: PositionWithPnL): ZenAnalysis {
    const dte = this.getDTE(position.expiry);
    const premiumCollected = position.pmccPremiumCollectedCents ?? 0;
    const entryDebit = position.entryDebitCents ?? 0;
    const effectiveCost = entryDebit - premiumCollected;
    const contracts = position.contracts ?? 1;

    // Calculate effective P&L percent against effective cost basis
    const pnlCents = position.pnlCents ?? 0;
    let effectivePnlPercent = position.pnlPercent ?? 0;
    if (effectiveCost > 0) {
      effectivePnlPercent = parseFloat(((pnlCents / effectiveCost) * 100).toFixed(1));
    }

    const collectedDollars = (premiumCollected * contracts / 100).toFixed(0);
    const costReduction = entryDebit > 0
      ? Math.round((premiumCollected / entryDebit) * 100)
      : 0;
    const pmccContext = `$${collectedDollars} premium collected (${costReduction}% cost reduction)`;

    // ACTION: <90 DTE — roll the LEAPS
    if (dte < 90) {
      return {
        zenStatus: 'action',
        guidanceText: `PMCC LEAPS approaching expiration at ${dte} DTE. Roll LEAPS to maintain your covered call engine. ${pmccContext}.`,
        guidanceDetails: {
          situation: `LEAPS has ${dte} DTE. ${pmccContext}. Effective cost basis: $${(effectiveCost / 100).toFixed(2)}.`,
          rule: 'Systematic Rule: Roll LEAPS before 90 DTE. Close any open covered calls first, then roll LEAPS out in time.',
          decisionPoints: [
            'Close open covered calls first to avoid assignment risk',
            'Roll LEAPS to a new expiration 1-2 years out',
            'Consider rolling to a different strike if outlook has changed'
          ]
        }
      };
    }

    // MONITOR: Significant loss even after collected premium
    if (effectivePnlPercent < -50) {
      return {
        zenStatus: 'monitor',
        guidanceText: `PMCC LEAPS down significantly at ${effectivePnlPercent.toFixed(1)}% on effective cost. Re-evaluate thesis. ${pmccContext}.`,
        guidanceDetails: {
          situation: `LEAPS at ${(position.pnlPercent ?? 0).toFixed(1)}% raw P&L. After ${pmccContext}, effective P&L is ${effectivePnlPercent.toFixed(1)}%.`,
          rule: 'Systematic Rule: PMCC losses exceeding -50% of effective cost signal thesis may be wrong. Collected premium provides cushion.',
          decisionPoints: [
            `Premium collected has reduced your cost basis by ${costReduction}%`,
            'Continue selling calls if bullish thesis remains intact',
            'Roll LEAPS down if moderately bearish and sufficient premium available',
            dte > 180 ? 'Significant time remains — continue PMCC if thesis valid' : 'Consider exiting full PMCC position'
          ]
        }
      };
    }

    // PROFIT: 90-180 DTE and profitable on effective basis
    if (dte >= 90 && dte <= 180 && effectivePnlPercent > 0) {
      return {
        zenStatus: 'profit',
        guidanceText: `PMCC profitable at +${effectivePnlPercent.toFixed(1)}% on effective cost with ${pmccContext}. Consider rolling.`,
        guidanceDetails: {
          situation: `LEAPS +${(position.pnlPercent ?? 0).toFixed(1)}% raw, +${effectivePnlPercent.toFixed(1)}% effective. ${pmccContext}. ${dte} DTE remaining.`,
          rule: 'Systematic Rule: 90-180 DTE is the window to roll profitable LEAPS while continuing to sell covered calls.',
          decisionPoints: [
            'Roll LEAPS out in time to maintain covered call engine',
            'Harvest gains and redeploy to a higher strike if bullish',
            'Continue selling covered calls through the roll process'
          ]
        }
      };
    }

    // ZEN: >180 DTE — hold and keep selling covered calls
    return {
      zenStatus: 'zen',
      guidanceText: `PMCC on track — ${pmccContext}. Effective position at ${effectivePnlPercent.toFixed(1)}% with ${dte} DTE.`,
      guidanceDetails: {
        situation: `LEAPS at ${(position.pnlPercent ?? 0).toFixed(1)}% raw P&L. Effective cost basis reduced by collected premium. ${dte} DTE remaining.`,
        rule: 'Systematic Rule: Hold LEAPS >180 DTE and continue selling covered calls to reduce cost basis over time.',
        decisionPoints: [
          `Keep selling covered calls — ${costReduction}% of cost basis already recovered`,
          'Target: sell calls until cost basis approaches zero (free position)',
          effectivePnlPercent > 0 ? 'Position profitable on effective basis — let winners run' : 'Continue selling calls to improve effective P&L'
        ]
      }
    };
  }

  /**
   * Covered call (short call) that is linked to a parent LEAPS as part of a PMCC.
   * Uses the same DTE/profit thresholds as credit spreads but with PMCC-specific guidance.
   */
  private calculateCoveredCallZenStatus(position: PositionWithPnL): ZenAnalysis {
    const dte = this.getDTE(position.expiry);
    const pnlPercent = position.pnlPercent ?? 0;
    const currentPrice = position.currentPrice ?? 0;
    const shortStrike = position.shortStrike;

    // ACTION: <=21 DTE — exit or roll the covered call
    if (dte <= 21) {
      return {
        zenStatus: 'action',
        guidanceText: `Covered call at ${dte} DTE — close and re-sell a new call at a later expiry to keep the PMCC engine running.`,
        guidanceDetails: {
          situation: `Covered call has ${dte} DTE. At 21 DTE theta decay accelerates and assignment risk increases.`,
          rule: 'Systematic Rule: Close covered calls at 21 DTE and sell a new call 30-45 DTE out to maximize premium collection.',
          decisionPoints: [
            'Close this covered call to avoid assignment',
            'Sell a new covered call 30-45 DTE for fresh premium',
            'Choose a strike at or above your LEAPS strike to avoid locking in losses'
          ]
        }
      };
    }

    // ACTION: Short strike breached (price above the strike you sold)
    if (currentPrice > (shortStrike || 0)) {
      const breach = (currentPrice - (shortStrike || 0)).toFixed(2);
      return {
        zenStatus: 'action',
        guidanceText: `Covered call short strike $${shortStrike} breached (price $${currentPrice.toFixed(2)}, +$${breach} above). Consider rolling up or accepting assignment.`,
        guidanceDetails: {
          situation: `Stock price $${currentPrice.toFixed(2)} is above the covered call strike $${shortStrike} by $${breach}. Covered call is deeply ITM.`,
          rule: 'Systematic Rule: When a covered call goes deep ITM, roll it up and out (higher strike, later expiry) to protect upside or accept assignment.',
          decisionPoints: [
            `Roll to a higher strike (>${shortStrike}) and later expiry for a credit or small debit`,
            'Accept assignment if you want to close the PMCC — LEAPS still captures upside',
            'If LEAPS still has significant intrinsic value, rolling is usually better'
          ]
        }
      };
    }

    // PROFIT: >50% — close and re-sell
    if (pnlPercent > 50) {
      return {
        zenStatus: 'profit',
        guidanceText: `Covered call at +${pnlPercent.toFixed(1)}% profit. Close now and sell a fresh call to maximize PMCC premium collection.`,
        guidanceDetails: {
          situation: `Covered call showing +${pnlPercent.toFixed(1)}% profit with ${dte} DTE remaining. Classic profit-taking point for PMCC.`,
          rule: 'Systematic Rule: Close covered calls at 50-70% profit and immediately re-sell a new call to accelerate cost basis reduction.',
          decisionPoints: [
            'Close this call at profit',
            'Sell a new covered call 30-45 DTE for fresh premium',
            `Re-selling now vs waiting saves ~${Math.round(dte * 0.4)} days of idle capital`
          ]
        }
      };
    }

    // ZEN: Positive, >21 DTE — hold and let theta work
    if (pnlPercent >= 0 && dte > 21) {
      return {
        zenStatus: 'zen',
        guidanceText: `Covered call on track at +${pnlPercent.toFixed(1)}% with ${dte} DTE. Hold until 50% profit or 21 DTE.`,
        guidanceDetails: {
          situation: `Covered call collecting theta. Stock at $${currentPrice.toFixed(2)} vs short strike $${shortStrike || 0} — $${((shortStrike || 0) - currentPrice).toFixed(2)} buffer.`,
          rule: 'Systematic Rule: Hold PMCC covered calls until 50% profit or 21 DTE to maximize premium income.',
          decisionPoints: [
            `Strike buffer: $${((shortStrike || 0) - currentPrice).toFixed(2)} before breached`,
            `Target 50% profit (currently +${pnlPercent.toFixed(1)}%)`,
            'Theta decay increasing as expiry approaches'
          ]
        }
      };
    }

    // MONITOR: Negative position
    return {
      zenStatus: 'monitor',
      guidanceText: `Covered call at ${pnlPercent.toFixed(1)}% with ${dte} DTE. Monitor — position is losing but strike still safe.`,
      guidanceDetails: {
        situation: `Covered call at ${pnlPercent.toFixed(1)}% loss. Stock $${currentPrice.toFixed(2)} vs short strike $${shortStrike}.`,
        rule: 'Systematic Rule: A losing covered call means the stock price dropped — this is actually good for your PMCC LEAPS.',
        decisionPoints: [
          'Stock declining = covered call declines in value (works in your favor)',
          `At ${dte} DTE, consider holding for recovery to 50% profit`,
          'Exit at 21 DTE regardless of P/L and re-sell at a lower strike if bearish'
        ]
      }
    };
  }

  /**
   * Calculate ZenStatus for Credit Spreads and Iron Condors
   */
  private calculateCreditSpreadZenStatus(position: PositionWithPnL): ZenAnalysis {
    const dte = this.getDTE(position.expiry);
    const pnlPercent = position.pnlPercent || 0;
    const currentPrice = position.currentPrice || 0;
    
    // Determine if position is positive or negative
    const isPositive = pnlPercent > 0;
    
    // Check strike breaches
    const strikeAnalysis = this.analyzeStrikeBreaches(position, currentPrice);

    // ACTION NEEDED: <=21 DTE (systematic exit)
    if (dte <= 21) {
      return {
        zenStatus: 'action',
        guidanceText: `Exit systematically at ${dte} DTE. Close position regardless of P/L per trading rules.`,
        guidanceDetails: {
          situation: `Position has ${dte} days until expiration, which is at or below the systematic exit threshold of 21 DTE.`,
          rule: 'Systematic Rule: Exit all credit spreads at 21 DTE or less to avoid gamma risk and assignment complications.',
          decisionPoints: [
            'Close position now to avoid increased risk',
            'Do not wait for additional profit or recovery',
            'Move capital to new opportunities with better risk/reward'
          ]
        }
      };
    }

    // ACTION NEEDED: >21 DTE with second strike breached
    if (strikeAnalysis.secondStrikeBreach) {
      return {
        zenStatus: 'action',
        guidanceText: `Max loss zone reached - ${strikeAnalysis.secondStrikeDescription}. Decide to hold for rebound or exit to limit loss.`,
        guidanceDetails: {
          situation: `Long strike breached at $${strikeAnalysis.longStrike}. Current price $${currentPrice.toFixed(2)} is ${strikeAnalysis.direction} the long strike. Maximum loss exposure.`,
          rule: 'Systematic Rule: When long strike is breached (max loss zone), evaluate whether thesis remains intact and if time allows for recovery.',
          decisionPoints: [
            strikeAnalysis.recoveryPotential ? 'Consider holding if you believe price will rebound and sufficient time remains' : 'Recovery unlikely - consider closing to prevent further loss',
            'Exit now to limit max loss and redeploy capital',
            `Monitor closely - if price continues ${strikeAnalysis.direction}, loss is capped but may want to exit early`
          ]
        }
      };
    }

    // PROFIT READY: >+60%
    if (pnlPercent > 60) {
      return {
        zenStatus: 'profit',
        guidanceText: `Profit target reached (+${pnlPercent.toFixed(1)}%). Consider taking profits per systematic rule.`,
        guidanceDetails: {
          situation: `Position showing strong profit of +${pnlPercent.toFixed(1)}% with ${dte} days remaining. Well above the 50-60% profit target.`,
          rule: 'Systematic Rule: Close credit spreads at 50-70% of maximum profit to lock in gains and reduce risk.',
          decisionPoints: [
            'Close position now to secure profit',
            `Set alert at 70% if you want to maximize gains`,
            `At ${dte} DTE, theta decay advantage is ${dte > 30 ? 'still strong' : 'declining'}`
          ]
        }
      };
    }

    // MONITOR: >21 DTE, positive position at +50%
    if (isPositive && pnlPercent >= 50 && dte > 21) {
      return {
        zenStatus: 'monitor',
        guidanceText: `Near profit target at +${pnlPercent.toFixed(1)}%. Can take profits now or wait for 60% threshold.`,
        guidanceDetails: {
          situation: `Position at +${pnlPercent.toFixed(1)}% profit with ${dte} days remaining. Approaching systematic profit-taking zone.`,
          rule: 'Systematic Rule: Consider taking profits between 50-70% of max profit, balancing locked gains vs. additional upside.',
          decisionPoints: [
            'Take profits now (good gain secured)',
            'Wait for 60% threshold if you want maximum systematic profit',
            'Risk: Waiting could reduce gains if position reverses'
          ]
        }
      };
    }

    // MONITOR: >21 DTE, negative position, first strike breached
    if (!isPositive && dte > 21 && strikeAnalysis.firstStrikeBreach) {
      return {
        zenStatus: 'monitor',
        guidanceText: `Short strike breached at $${strikeAnalysis.shortStrike} - ${strikeAnalysis.firstStrikeDescription}. Monitor for recovery or further breach.`,
        guidanceDetails: {
          situation: `Short strike breached. Current price ${currentPrice.toFixed(2)} vs short strike $${strikeAnalysis.shortStrike}. Loss at ${pnlPercent.toFixed(1)}% with ${dte} DTE remaining.`,
          rule: 'Systematic Rule: Hold positions with short strike breach if >21 DTE remains, unless long strike also breached (max loss).',
          decisionPoints: [
            `Watch for price movement back ${strikeAnalysis.direction === 'below' ? 'above' : 'below'} short strike`,
            `Long strike at $${strikeAnalysis.longStrike} still provides $${strikeAnalysis.bufferToLong.toFixed(2)} buffer`,
            `Exit at 21 DTE regardless of recovery (${dte} days remaining)`
          ]
        }
      };
    }

    // MONITOR: 21-25 DTE with negative position (no strike breach)
    if (!isPositive && dte >= 21 && dte <= 25 && !strikeAnalysis.firstStrikeBreach) {
      return {
        zenStatus: 'monitor',
        guidanceText: `Approaching 21 DTE exit with ${pnlPercent.toFixed(1)}% loss. Decide to cut loss now or wait for systematic exit.`,
        guidanceDetails: {
          situation: `Position showing ${pnlPercent.toFixed(1)}% loss with ${dte} days remaining. Nearing the 21 DTE systematic exit threshold.`,
          rule: 'Systematic Rule: Exit at 21 DTE regardless of P/L. Between 21-25 DTE, evaluate whether to exit early or wait.',
          decisionPoints: [
            'Cut loss now if recovery seems unlikely',
            `Wait ${dte - 21} more days for potential recovery before systematic exit`,
            'Short strike still safe - recovery possible'
          ]
        }
      };
    }

    // ZEN: Positive position, >21 DTE, not yet at 50%
    if (isPositive && dte > 21 && pnlPercent < 50) {
      return {
        zenStatus: 'zen',
        guidanceText: `On track with +${pnlPercent.toFixed(1)}% profit. Hold until 50% profit target or 21 DTE per systematic plan.`,
        guidanceDetails: {
          situation: `Position showing healthy profit of +${pnlPercent.toFixed(1)}% with ${dte} days remaining. Theta decay working in your favor.`,
          rule: 'Systematic Rule: Hold credit spreads until 50% profit target OR 21 DTE, whichever comes first.',
          decisionPoints: [
            `Target: +50% profit (currently +${pnlPercent.toFixed(1)}%)`,
            `Or hold until ${dte - 21} days from now (21 DTE exit)`,
            'Position trending positively - continue systematic approach'
          ]
        }
      };
    }

    // ZEN: Negative position, >25 DTE, no strike breach
    if (!isPositive && dte > 25 && !strikeAnalysis.firstStrikeBreach) {
      return {
        zenStatus: 'zen',
        guidanceText: `Position negative at ${pnlPercent.toFixed(1)}% but short strike safe. Hold per systematic rule - plenty of time for recovery.`,
        guidanceDetails: {
          situation: `Position down ${pnlPercent.toFixed(1)}% with ${dte} days remaining. Current price $${currentPrice.toFixed(2)} is ${strikeAnalysis.bufferToShort.toFixed(2)} away from short strike $${strikeAnalysis.shortStrike}.`,
          rule: 'Systematic Rule: Hold losing positions if short strike is safe and >25 DTE remains. Time allows for recovery.',
          decisionPoints: [
            `${dte - 25} days cushion before monitoring period begins`,
            `Short strike buffer: $${strikeAnalysis.bufferToShort.toFixed(2)}`,
            'Systematic exit not until 21 DTE - stay disciplined'
          ]
        }
      };
    }

    // Default to MONITOR for edge cases
    return {
      zenStatus: 'monitor',
      guidanceText: `Review position status. ${dte} DTE remaining with ${pnlPercent.toFixed(1)}% P/L.`,
      guidanceDetails: {
        situation: `Position requires attention: ${pnlPercent.toFixed(1)}% P/L with ${dte} DTE remaining.`,
        rule: 'Systematic Rule: Evaluate position against standard thresholds (21 DTE exit, 50% profit target, strike safety).',
        decisionPoints: [
          'Review strike distances and price movement',
          'Consider closing if position no longer fits thesis',
          'Systematic exit at 21 DTE if held'
        ]
      }
    };
  }

  /**
   * Calculate ZenStatus for LEAPS positions
   */
  private calculateLeapsZenStatus(position: PositionWithPnL): ZenAnalysis {
    const dte = this.getDTE(position.expiry);
    const pnlPercent = position.pnlPercent || 0;

    // ACTION NEEDED: <90 DTE
    if (dte < 90) {
      return {
        zenStatus: 'action',
        guidanceText: `LEAPS approaching expiration at ${dte} DTE. Exit or roll position to maintain long-term exposure.`,
        guidanceDetails: {
          situation: `LEAPS position has ${dte} days remaining, which is below the 90-day threshold for long-term options.`,
          rule: 'Systematic Rule: Exit or roll LEAPS positions before 90 DTE to avoid rapid theta decay in final months.',
          decisionPoints: [
            'Close position and realize P/L',
            'Roll to new LEAPS expiration to maintain exposure',
            'Time decay accelerates significantly below 90 DTE'
          ]
        }
      };
    }

    // MONITOR: Any DTE with P/L < -50%
    if (pnlPercent < -50) {
      return {
        zenStatus: 'monitor',
        guidanceText: `Significant loss at ${pnlPercent.toFixed(1)}% (${dte} DTE). Re-evaluate thesis - consider cutting loss or averaging down.`,
        guidanceDetails: {
          situation: `LEAPS down ${pnlPercent.toFixed(1)}% with ${dte} days remaining. Significant drawdown requires thesis review.`,
          rule: 'Systematic Rule: LEAPS losses exceeding -50% signal thesis may be wrong. Re-evaluate fundamental outlook.',
          decisionPoints: [
            'Review fundamental thesis - is it still valid?',
            'Consider cutting loss if outlook has changed',
            dte > 180 ? 'Significant time remains for recovery' : 'Limited time for substantial recovery',
            'Could average down if conviction remains strong'
          ]
        }
      };
    }

    // PROFIT READY: 90-180 DTE and positive
    if (dte >= 90 && dte <= 180 && pnlPercent > 0) {
      return {
        zenStatus: 'profit',
        guidanceText: `LEAPS profitable at +${pnlPercent.toFixed(1)}% in the 90-180 DTE window. Consider rolling to new LEAPS and taking profits.`,
        guidanceDetails: {
          situation: `LEAPS showing +${pnlPercent.toFixed(1)}% profit with ${dte} days remaining. In the optimal profit-taking and rolling window.`,
          rule: 'Systematic Rule: Between 90-180 DTE, consider rolling profitable LEAPS to lock in gains while maintaining exposure.',
          decisionPoints: [
            'Roll to new LEAPS expiration (same or different strike)',
            'Take full profits and redeploy to new opportunity',
            'Partial profit-taking: Close portion, roll remainder'
          ]
        }
      };
    }

    // MONITOR: 90-180 DTE with loss (but not <-50%)
    if (dte >= 90 && dte <= 180) {
      return {
        zenStatus: 'monitor',
        guidanceText: `LEAPS in 90-180 DTE window at ${pnlPercent.toFixed(1)}%. Evaluate whether to hold, roll, or exit.`,
        guidanceDetails: {
          situation: `LEAPS at ${pnlPercent.toFixed(1)}% with ${dte} days remaining. Approaching the decision window for long-term positions.`,
          rule: 'Systematic Rule: 90-180 DTE is the optimal window to evaluate LEAPS positions for rolling or exiting.',
          decisionPoints: [
            pnlPercent > -20 ? 'Small loss - consider rolling to extend position' : 'Significant loss - review thesis validity',
            'Could roll down to lower strike if bullish outlook remains',
            `${dte} days may allow for recovery before 90 DTE threshold`
          ]
        }
      };
    }

    // ZEN: >180 DTE
    if (dte > 180) {
      return {
        zenStatus: 'zen',
        guidanceText: `LEAPS on track with ${dte} DTE remaining. Hold for long-term appreciation per systematic plan.`,
        guidanceDetails: {
          situation: `LEAPS position at ${pnlPercent.toFixed(1)}% with ${dte} days remaining. Ample time for thesis to play out.`,
          rule: 'Systematic Rule: Hold LEAPS positions with >180 DTE to allow long-term thesis to develop. Time is your advantage.',
          decisionPoints: [
            'Continue holding - significant time value remains',
            'Review fundamental thesis periodically',
            'Consider rolling or exiting when approaching 180 DTE',
            pnlPercent > 0 ? 'Position profitable - let winners run' : 'Drawdown manageable with time for recovery'
          ]
        }
      };
    }

    // Default
    return {
      zenStatus: 'zen',
      guidanceText: `LEAPS position with ${dte} DTE. Continue monitoring per systematic approach.`,
      guidanceDetails: {
        situation: `LEAPS at ${pnlPercent.toFixed(1)}% with ${dte} days remaining.`,
        rule: 'Systematic Rule: Monitor LEAPS positions for DTE thresholds and significant P/L changes.',
        decisionPoints: [
          'Review position regularly',
          'Evaluate thesis against market conditions',
          'Plan for 90-180 DTE decision window'
        ]
      }
    };
  }

  /**
   * Analyze strike breaches for credit spreads
   */
  private analyzeStrikeBreaches(position: PositionWithPnL, currentPrice: number): {
    firstStrikeBreach: boolean;
    secondStrikeBreach: boolean;
    shortStrike: number;
    longStrike: number;
    bufferToShort: number;
    bufferToLong: number;
    direction: string;
    firstStrikeDescription: string;
    secondStrikeDescription: string;
    recoveryPotential: boolean;
  } {
    const isCall = position.type === 'CALL';
    const shortStrike = position.shortStrike || 0;
    const longStrike = position.longStrike || shortStrike;

    let firstStrikeBreach = false;
    let secondStrikeBreach = false;
    let direction = '';
    let bufferToShort = 0;
    let bufferToLong = 0;

    if (position.strategyType === 'IRON_CONDOR') {
      // For Iron Condor, check both PUT and CALL sides
      const putShortStrike = position.shortStrike || 0;
      const putLongStrike = position.longStrike || putShortStrike;
      const callShortStrike = position.callShortStrike || putShortStrike;
      const callLongStrike = position.callLongStrike || putLongStrike;

      // Check PUT side (price dropping below strikes)
      const putShortBreach = currentPrice < putShortStrike;
      const putLongBreach = currentPrice < putLongStrike;

      // Check CALL side (price rising above strikes)
      const callShortBreach = currentPrice > callShortStrike;
      const callLongBreach = currentPrice > callLongStrike;

      firstStrikeBreach = putShortBreach || callShortBreach;
      secondStrikeBreach = putLongBreach || callLongBreach;

      if (putShortBreach) {
        direction = 'below';
        bufferToShort = putShortStrike - currentPrice;
        bufferToLong = putLongStrike - currentPrice;
      } else if (callShortBreach) {
        direction = 'above';
        bufferToShort = currentPrice - callShortStrike;
        bufferToLong = currentPrice - callLongStrike;
      } else {
        // No breach - calculate buffers
        bufferToShort = Math.min(currentPrice - putLongStrike, callShortStrike - currentPrice);
        bufferToLong = Math.min(currentPrice - putShortStrike, callLongStrike - currentPrice);
      }
    } else {
      // Regular credit spread
      if (isCall) {
        // Call spread: breached if price rises above strikes
        firstStrikeBreach = currentPrice > shortStrike;
        secondStrikeBreach = currentPrice > longStrike;
        direction = 'above';
        bufferToShort = Math.abs(currentPrice - shortStrike);
        bufferToLong = Math.abs(currentPrice - longStrike);
      } else {
        // Put spread: breached if price drops below strikes
        firstStrikeBreach = currentPrice < shortStrike;
        secondStrikeBreach = currentPrice < longStrike;
        direction = 'below';
        bufferToShort = Math.abs(shortStrike - currentPrice);
        bufferToLong = Math.abs(longStrike - currentPrice);
      }
    }

    const dte = this.getDTE(position.expiry);
    const recoveryPotential = dte > 30 && !secondStrikeBreach;

    return {
      firstStrikeBreach,
      secondStrikeBreach,
      shortStrike,
      longStrike,
      bufferToShort,
      bufferToLong,
      direction,
      firstStrikeDescription: firstStrikeBreach 
        ? `price moved ${direction} short strike` 
        : 'short strike safe',
      secondStrikeDescription: secondStrikeBreach
        ? `price moved ${direction} long strike`
        : 'long strike safe',
      recoveryPotential
    };
  }

  /**
   * Stock (long equity) ZenStatus — pure percentage-based, no DTE logic.
   */
  private calculateStockZenStatus(position: PositionWithPnL): ZenAnalysis {
    const pnlPercent = position.pnlPercent ?? 0;
    const currentPrice = position.currentPrice ?? 0;
    const entryPrice = (position.entryDebitCents ?? 0) / 100;

    // ACTION: < -10%
    if (pnlPercent < -10) {
      return {
        zenStatus: 'action',
        guidanceText: `Stock down ${pnlPercent.toFixed(1)}% from entry. Evaluate thesis — consider stop-loss or averaging down.`,
        guidanceDetails: {
          situation: `Bought at $${entryPrice.toFixed(2)}, currently $${currentPrice.toFixed(2)} (${pnlPercent.toFixed(1)}%).`,
          rule: 'Systematic Rule: Stocks down more than 10% warrant re-evaluating the investment thesis. Decide to cut losses or add to the position.',
          decisionPoints: [
            'Re-evaluate fundamental thesis — has anything changed?',
            'Consider setting a stop-loss to limit further downside',
            'If thesis intact, consider averaging down to lower cost basis',
          ]
        }
      };
    }

    // MONITOR: -10% to 0%
    if (pnlPercent < 0) {
      return {
        zenStatus: 'monitor',
        guidanceText: `Stock slightly underwater at ${pnlPercent.toFixed(1)}%. Monitor for recovery or deterioration.`,
        guidanceDetails: {
          situation: `Bought at $${entryPrice.toFixed(2)}, currently $${currentPrice.toFixed(2)} (${pnlPercent.toFixed(1)}%).`,
          rule: 'Systematic Rule: Small losses are normal. Monitor the position and be ready to act if losses exceed 10%.',
          decisionPoints: [
            'Hold if investment thesis remains intact',
            'Watch for support levels and reversal signals',
            'Consider selling covered calls to reduce cost basis',
          ]
        }
      };
    }

    // PROFIT: > +15%
    if (pnlPercent > 15) {
      return {
        zenStatus: 'profit',
        guidanceText: `Stock up +${pnlPercent.toFixed(1)}%. Consider taking partial profits or setting a trailing stop.`,
        guidanceDetails: {
          situation: `Bought at $${entryPrice.toFixed(2)}, currently $${currentPrice.toFixed(2)} (+${pnlPercent.toFixed(1)}%).`,
          rule: 'Systematic Rule: Gains above 15% are worth protecting. Consider trimming or using a trailing stop to lock in profits.',
          decisionPoints: [
            'Consider selling a portion (e.g., 25-50%) to lock in gains',
            'Set a trailing stop to protect remaining position',
            'Sell covered calls to generate income while holding',
          ]
        }
      };
    }

    // ZEN: 0% to +15%
    return {
      zenStatus: 'zen',
      guidanceText: `Stock position healthy at +${pnlPercent.toFixed(1)}%. Hold and let it work.`,
      guidanceDetails: {
        situation: `Bought at $${entryPrice.toFixed(2)}, currently $${currentPrice.toFixed(2)} (+${pnlPercent.toFixed(1)}%).`,
        rule: 'Systematic Rule: Positions in the 0-15% range are on track. No action needed — let winners run.',
        decisionPoints: [
          'Continue holding — position is performing as expected',
          'Consider selling covered calls for additional income',
          'Monitor for any fundamental changes to the thesis',
        ]
      }
    };
  }

  /**
   * Calculate days to expiration in Eastern Time
   */
  private getDTE(expiry: Date | string): number {
    const now = new Date();
    const expiryDate = new Date(expiry);
    const nyTime = toZonedTime(now, 'America/New_York');
    const expiryNy = toZonedTime(expiryDate, 'America/New_York');
    return differenceInCalendarDays(expiryNy, nyTime);
  }
}

export const zenStatusService = new ZenStatusService();
