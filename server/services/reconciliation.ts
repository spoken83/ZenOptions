import { execFile } from 'child_process';
import { promisify } from 'util';
import { db } from '../db';
import { positions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export interface StatementTrade {
  symbol: string;
  expiry: string; // YYYY-MM-DD
  type: 'PUT' | 'CALL';
  strike: number;
  activityType: 'Open' | 'OpenShort' | 'Close';
  quantity: number;
  tradePrice: number;
  amount: number;
  fees: number; // total fees for this leg (commission + platform + regulatory + clearing + GST)
  tradeTime: string;
  realizedPL: number;
}

export interface StatementPosition {
  symbol: string;
  expiry: string;
  type: 'PUT' | 'CALL';
  shortStrike: number;
  longStrike: number | null;
  callShortStrike?: number | null;
  callLongStrike?: number | null;
  strategyType: 'CREDIT_SPREAD' | 'IRON_CONDOR' | 'LEAPS' | 'COVERED_CALL';
  contracts: number;
  entryCredit: number; // dollars (gross, before fees)
  totalFees: number; // total fees for all legs of this position
  tradeTime: string;
  closedAt?: string;
  exitCredit?: number;
  realizedPL?: number;
}

export interface ReconciliationResult {
  statementPeriod: string;
  periodStart: string;
  periodEnd: string;
  accountName: string;
  accountNumber: string;
  extractedTrades: StatementTrade[];
  groupedPositions: StatementPosition[];
  matched: Array<{
    statement: StatementPosition;
    database: any;
    differences: string[];
  }>;
  missingFromDB: StatementPosition[];
  inDBNotInStatement: any[];
  potentialMatches: Array<{
    statement: StatementPosition;
    database: any;
    matchReason: string;
    differences: string[];
  }>;
  summary: {
    totalStatementPositions: number;
    totalDBPositionsInPeriod: number;
    matched: number;
    missingFromDB: number;
    inDBNotInStatement: number;
    potentialMatches: number;
  };
}

export class ReconciliationService {

  async extractTextFromPDF(filePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('pdftotext', ['-layout', filePath, '-']);
      return stdout;
    } catch (error: any) {
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  extractTrades(pdfText: string): {
    trades: StatementTrade[];
    accountName: string;
    accountNumber: string;
    statementPeriod: string;
  } {
    const lines = pdfText.split('\n');

    // Extract header info
    let accountName = '';
    let accountNumber = '';
    let statementPeriod = '';

    for (const line of lines) {
      const periodMatch = line.match(/Activity Statement\s*:\s*([\d.]+\s*-\s*[\d.]+)/);
      if (periodMatch) {
        statementPeriod = periodMatch[1].trim();
      }
      // Account name: line with all-caps name like "FROIS GORDON MATTHEW"
      if (!accountName && /^[A-Z]{2,}\s+[A-Z]{2,}/.test(line.trim()) && !line.includes('Tiger') && !line.includes('PTE')) {
        accountName = line.trim();
      }
      const acctMatch = line.match(/^\s*(\d{8})\s/);
      if (acctMatch && !accountNumber) {
        accountNumber = acctMatch[1];
      }
    }

    // Find the Trades section boundaries
    let tradesStart = -1;
    let tradesEnd = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*Trades\s*$/.test(lines[i]) && tradesStart === -1) {
        tradesStart = i;
      }
      // Stop at Holdings, Deposits & Withdrawals, or Financial Instrument sections
      if (tradesStart > -1 && i > tradesStart + 5 &&
        (/^\s*(Holdings|Deposits\s*&\s*Withdrawals|Financial Instrument)\s*$/.test(lines[i]) ||
         /^\s*Holdings\s*$/.test(lines[i]))) {
        tradesEnd = i;
        break;
      }
    }

    if (tradesStart === -1) tradesStart = 0;

    const tradeLines = lines.slice(tradesStart, tradesEnd);
    const trades: StatementTrade[] = [];
    const optionDescRegex = /\((\w+)\s+(\d{8})\s+(PUT|CALL)\s+([\d.]+)\)/;

    // First pass: find all option description line indices to establish trade boundaries
    const descIndices: number[] = [];
    for (let i = 0; i < tradeLines.length; i++) {
      if (optionDescRegex.test(tradeLines[i])) {
        descIndices.push(i);
      }
    }

    // For each option description, extract trade data.
    // Layout per trade in pdftotext -layout:
    //   [lines above]  Option Regulatory Fee: -0.01, Clearing Fee: -0.03 (on data line)
    //   [data line]    Activity  Qty  Price  Amount  ClearingFee  GST  RealizedPL  Time
    //   [desc line]    (SYMBOL YYYYMMDD PUT/CALL STRIKE)  Commission: -1.99
    //   [below desc]   /Eastern, Platform Fee: -1.00
    // Fees split: above desc (data line + 3 lines up) and desc line + 3 lines below.
    for (let di = 0; di < descIndices.length; di++) {
      const i = descIndices[di];
      const descMatch = tradeLines[i].match(optionDescRegex)!;

      const symbol = descMatch[1];
      const expiryRaw = descMatch[2];
      const type = descMatch[3] as 'PUT' | 'CALL';
      const strike = parseFloat(descMatch[4]);
      const expiry = `${expiryRaw.substring(0, 4)}-${expiryRaw.substring(4, 6)}-${expiryRaw.substring(6, 8)}`;

      let activityType: 'Open' | 'OpenShort' | 'Close' = 'Open';
      let quantity = 1;
      let tradePrice = 0;
      let amount = 0;
      let realizedPL = 0;
      let tradeTime = '';
      let fees = 0;

      // ABOVE desc: data line is 1-3 lines above the desc line, with fee/date context 1-2 lines above that
      const aboveStart = Math.max(0, i - 5);
      const aboveLines = tradeLines.slice(aboveStart, i); // lines above desc (exclusive of desc itself)

      // Find the data line in aboveLines (search from bottom up — it's closest to desc)
      for (let k = aboveLines.length - 1; k >= 0; k--) {
        const dataMatch = aboveLines[k].match(/(OpenShort|Open|Close)\s+(-?\d+)\s+([\d.]+)\s+(-?[\d,.]+)/);
        if (dataMatch) {
          activityType = dataMatch[1] as 'Open' | 'OpenShort' | 'Close';
          quantity = Math.abs(parseInt(dataMatch[2]));
          tradePrice = parseFloat(dataMatch[3]);
          amount = parseFloat(dataMatch[4].replace(/,/g, ''));

          // GST and Realized P/L are after the amount on the same line
          const afterAmount = aboveLines[k].substring(aboveLines[k].indexOf(dataMatch[4]) + dataMatch[4].length);
          const gstPlMatch = afterAmount.match(/(-\d+\.\d{2})\s+(-?[\d,.]+)/);
          if (gstPlMatch) {
            fees += Math.abs(parseFloat(gstPlMatch[1])); // GST
            realizedPL = parseFloat(gstPlMatch[2].replace(/,/g, ''));
          }

          // Fees on the data line itself and lines above it (up to data line - 2)
          // Search for all fee types — layout varies and page breaks shuffle positions
          const feeSearchLines = aboveLines.slice(Math.max(0, k - 2), k + 1);
          const feeBlock = feeSearchLines.join('\n');
          for (const pat of [
            /Option Regulatory Fee:\s*[\r\n\s]*(-?[\d.]+)/,
            /Clearing Fee:\s*(-?[\d.]+)/,
            /Trading Activity Fee:\s*(-?[\d.]+)/,
            /Consolidated Audit Trail Fee:\s*[\r\n\s]*(-?[\d.]+)/,
            /Commission:\s*(-?[\d.]+)/,
            /Platform Fee:\s*(-?[\d.]+)/,
          ]) {
            const m = feeBlock.match(pat);
            if (m) fees += Math.abs(parseFloat(m[1]));
          }
          break;
        }
      }

      // Extract date/time from above lines AND the desc line itself (time can be on desc line after page breaks)
      let foundDate = '';
      let foundTime = '';
      const dateTimeLines = [...aboveLines, tradeLines[i]]; // include desc line
      for (const bline of dateTimeLines) {
        const dateMatch = bline.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch && !foundDate) foundDate = dateMatch[1];
        const timeMatch = bline.match(/(\d{2}:\d{2}:\d{2}),?\s*US/);
        if (timeMatch && !foundTime) foundTime = timeMatch[1];
      }
      tradeTime = foundDate && foundTime ? `${foundDate}T${foundTime}` : foundDate ? `${foundDate}T00:00:00` : '';

      // BELOW desc (inclusive): Commission on desc line, Platform Fee 1-3 lines below
      // Also search for all fee types here — page breaks can push fees to unexpected positions
      const nextDescIdx = di < descIndices.length - 1 ? descIndices[di + 1] : tradeLines.length;
      const belowEnd = Math.min(nextDescIdx, i + 4);
      const belowLines = tradeLines.slice(i, belowEnd); // desc line + a few below
      const belowBlock = belowLines.join('\n');
      for (const pat of [
        /Commission:\s*(-?[\d.]+)/,
        /Platform Fee:\s*(-?[\d.]+)/,
        // These are normally found above, but check below too for page-break cases
        /Option Regulatory Fee:\s*[\r\n\s]*(-?[\d.]+)/,
        /Clearing Fee:\s*(-?[\d.]+)/,
        /Trading Activity Fee:\s*(-?[\d.]+)/,
      ]) {
        const m = belowBlock.match(pat);
        if (m) fees += Math.abs(parseFloat(m[1]));
      }

      trades.push({
        symbol,
        expiry,
        type,
        strike,
        activityType,
        quantity,
        tradePrice,
        amount,
        fees,
        tradeTime,
        realizedPL,
      });
    }

    console.log(`[Reconciliation] Parsed ${trades.length} trades from statement (${statementPeriod})`);
    for (const t of trades) {
      console.log(`[Reconciliation] Trade: ${t.symbol} ${t.type} ${t.strike} ${t.activityType} qty=${t.quantity} price=${t.tradePrice} amount=${t.amount} fees=${t.fees} time=${t.tradeTime}`);
    }

    return { trades, accountName, accountNumber, statementPeriod };
  }

  groupTradesIntoPositions(trades: StatementTrade[]): StatementPosition[] {
    const positions: StatementPosition[] = [];

    // Group trades by symbol and trade time (trades executed at the same time are legs of the same position)
    const tradesByTime: Record<string, StatementTrade[]> = {};

    for (const trade of trades) {
      // Round trade time to the minute for grouping
      const time = trade.tradeTime || '';
      const timeKey = `${trade.symbol}_${time.substring(0, 16)}_${trade.expiry}`;
      if (!tradesByTime[timeKey]) {
        tradesByTime[timeKey] = [];
      }
      tradesByTime[timeKey].push(trade);
    }

    for (const [, group] of Object.entries(tradesByTime)) {
      // Separate opens and closes
      const opens = group.filter(t => t.activityType === 'Open' || t.activityType === 'OpenShort');
      const closes = group.filter(t => t.activityType === 'Close');

      if (opens.length > 0) {
        // This is an opening trade group
        const shortLegs = opens.filter(t => t.activityType === 'OpenShort');
        const longLegs = opens.filter(t => t.activityType === 'Open');

        const groupFees = opens.reduce((sum, t) => sum + (t.fees || 0), 0);

        if (shortLegs.length === 0 && longLegs.length === 1) {
          // Single long option - likely a LEAPS
          const leg = longLegs[0];
          const isLeaps = this.isLikelyLeaps(leg.expiry, leg.tradeTime);

          positions.push({
            symbol: leg.symbol,
            expiry: leg.expiry,
            type: leg.type,
            shortStrike: leg.strike,
            longStrike: null,
            strategyType: isLeaps ? 'LEAPS' : 'CREDIT_SPREAD',
            contracts: leg.quantity,
            entryCredit: Math.abs(leg.amount) / leg.quantity / 100,
            totalFees: groupFees,
            tradeTime: leg.tradeTime,
          });
        } else {
          // Group by option type: match each short with its same-type long to form credit spreads.
          // This handles both 1-short/1-long (simple CS) and 2-short/2-long (two separate CS, e.g. PCS + CCS).
          // We pair by type (PUT shorts with PUT longs, CALL shorts with CALL longs).
          const types: Array<'PUT' | 'CALL'> = ['PUT', 'CALL'];
          for (const optType of types) {
            const typedShorts = shortLegs.filter(l => l.type === optType);
            const typedLongs = longLegs.filter(l => l.type === optType);

            if (typedShorts.length === 1 && typedLongs.length === 1) {
              const short = typedShorts[0];
              const long = typedLongs[0];
              const netCredit = Math.abs(short.amount) - Math.abs(long.amount);
              // Fees for this spread's legs only
              const spreadFees = (short.fees || 0) + (long.fees || 0);
              positions.push({
                symbol: short.symbol,
                expiry: short.expiry,
                type: optType,
                shortStrike: short.strike,
                longStrike: long.strike,
                strategyType: 'CREDIT_SPREAD',
                contracts: short.quantity,
                entryCredit: netCredit / short.quantity / 100,
                totalFees: spreadFees,
                tradeTime: short.tradeTime,
              });
            } else if (typedShorts.length === 1 && typedLongs.length === 0) {
              // Naked short — shouldn't normally happen, but handle gracefully
              const short = typedShorts[0];
              positions.push({
                symbol: short.symbol,
                expiry: short.expiry,
                type: optType,
                shortStrike: short.strike,
                longStrike: null,
                strategyType: 'CREDIT_SPREAD',
                contracts: short.quantity,
                entryCredit: Math.abs(short.amount) / short.quantity / 100,
                totalFees: short.fees || 0,
                tradeTime: short.tradeTime,
              });
            }
          }
        }
      }

      if (closes.length > 0) {
        // Find matching position and mark as closed
        for (const close of closes) {
          const matchingPos = positions.find(p =>
            p.symbol === close.symbol &&
            p.expiry === close.expiry &&
            !p.closedAt
          );
          if (matchingPos) {
            matchingPos.closedAt = close.tradeTime;
            // For closes, accumulate exit credits
            if (!matchingPos.exitCredit) matchingPos.exitCredit = 0;
            if (!matchingPos.realizedPL) matchingPos.realizedPL = 0;
            matchingPos.realizedPL += close.realizedPL;
          }
        }
      }
    }

    return positions;
  }

  private isLikelyLeaps(expiry: string, tradeTime: string): boolean {
    const expiryDate = new Date(expiry);
    const tradeDate = new Date(tradeTime);
    const daysToExpiry = Math.ceil((expiryDate.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysToExpiry > 180; // More than 6 months = LEAPS
  }

  async reconcile(
    statementPositions: StatementPosition[],
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    portfolioId?: string
  ): Promise<{
    matched: ReconciliationResult['matched'];
    missingFromDB: StatementPosition[];
    inDBNotInStatement: any[];
    potentialMatches: ReconciliationResult['potentialMatches'];
  }> {
    // Get all positions from the database for this user
    let dbPositions = await db
      .select()
      .from(positions)
      .where(eq(positions.userId, userId));

    // If a specific portfolio is selected, filter to it
    if (portfolioId) {
      dbPositions = dbPositions.filter(p => p.portfolioId === portfolioId);
    }

    // Filter DB positions to those OPENED during the statement period.
    // We only match opening trades — the statement's grouped positions represent opens.
    // Positions opened in a prior period but closed this period were already reconciled
    // when processing that earlier period's statement.
    const dbPositionsInPeriod = dbPositions.filter(dbPos => {
      const entryDate = new Date(dbPos.entryDt);
      return entryDate >= periodStart && entryDate <= periodEnd;
    });

    const matched: ReconciliationResult['matched'] = [];
    const missingFromDB: Array<{ pos: StatementPosition; idx: number }> = [];
    const matchedDBIds = new Set<string>();

    // Helper to compare a single statement position against a DB position
    const comparePosition = (stmtPos: StatementPosition, match: any, stmtTotalFees: number, stmtTotalCredit: number, contracts: number): string[] => {
      const differences: string[] = [];

      if (stmtPos.longStrike && match.longStrike !== stmtPos.longStrike) {
        differences.push(`Long strike: DB=${match.longStrike} vs Statement=${stmtPos.longStrike}`);
      }
      if (contracts !== (match.contracts || 1)) {
        differences.push(`Contracts: DB=${match.contracts} vs Statement=${contracts}`);
      }
      // Compare entry credit: DB stores net (after fees) per-share in cents.
      const stmtEntryCents = Math.round(stmtTotalCredit * 100);
      const feesPerShareCents = Math.round(stmtTotalFees / (contracts || 1));
      const stmtNetCents = stmtEntryCents - feesPerShareCents;
      console.log(`[Reconciliation] Compare ${stmtPos.symbol}: grossPerShare=$${stmtTotalCredit.toFixed(2)} totalFees=$${stmtTotalFees.toFixed(2)} contracts=${contracts} feesPerShareCents=${feesPerShareCents} stmtNetCents=${stmtNetCents} dbCents=${match.entryCreditCents}`);
      if (match.entryCreditCents != null) {
        const diffFromGross = Math.abs(stmtEntryCents - match.entryCreditCents);
        const diffFromNet = Math.abs(stmtNetCents - match.entryCreditCents);
        if (diffFromGross > 5 && diffFromNet > 5) {
          const netPerShare = (stmtTotalCredit - stmtTotalFees / (contracts || 1) / 100).toFixed(2);
          differences.push(`Entry credit: DB=$${(match.entryCreditCents / 100).toFixed(2)} vs Statement=$${stmtTotalCredit.toFixed(2)} (net after fees: $${netPerShare})`);
        }
      }
      if (stmtPos.closedAt && match.status !== 'closed') {
        differences.push(`Status: DB=${match.status} but Statement shows closed`);
      }
      return differences;
    };

    // Track which statement positions have been consumed (by IC matching etc.)
    const consumedStmtIndices = new Set<number>();

    for (let si = 0; si < statementPositions.length; si++) {
      if (consumedStmtIndices.has(si)) continue;
      const stmtPos = statementPositions[si];

      // Try direct match (CS→CS, LEAPS→LEAPS), also match CS against IC's call side
      const match = dbPositionsInPeriod.find(dbPos => {
        if (matchedDBIds.has(dbPos.id)) return false;
        const symbolMatch = this.normalizeSymbol(dbPos.symbol) === this.normalizeSymbol(stmtPos.symbol);
        const expiryMatch = this.datesMatch(new Date(dbPos.expiry), new Date(stmtPos.expiry));
        if (!symbolMatch || !expiryMatch) return false;

        // Direct type+strike match
        const typeMatch = dbPos.type?.toUpperCase() === stmtPos.type;
        const strikeMatch = dbPos.shortStrike === stmtPos.shortStrike;
        if (typeMatch && strikeMatch) return true;

        // IC call-side match: DB is IC, statement is a CALL CS matching the IC's call strikes
        if (dbPos.strategyType === 'IRON_CONDOR' && stmtPos.type === 'CALL' &&
            dbPos.callShortStrike === stmtPos.shortStrike) {
          return true;
        }

        return false;
      });

      if (match) {
        matchedDBIds.add(match.id);
        console.log(`[Reconciliation] Matched stmt ${stmtPos.symbol} ${stmtPos.type} ${stmtPos.shortStrike} → DB ${match.symbol} ${match.strategyType} ${match.shortStrike}/${match.longStrike} call=${match.callShortStrike}/${match.callLongStrike}`);

        // If DB position is an IC and statement is a CS (put side), find the call side CS too
        if (match.strategyType === 'IRON_CONDOR' && stmtPos.strategyType === 'CREDIT_SPREAD') {
          const otherType = stmtPos.type === 'PUT' ? 'CALL' : 'PUT';
          const otherStrike = stmtPos.type === 'PUT' ? match.callShortStrike : match.shortStrike;
          const complementIdx = statementPositions.findIndex((sp, idx) =>
            idx !== si && !consumedStmtIndices.has(idx) &&
            this.normalizeSymbol(sp.symbol) === this.normalizeSymbol(stmtPos.symbol) &&
            this.datesMatch(new Date(sp.expiry), new Date(stmtPos.expiry)) &&
            sp.type === otherType &&
            sp.shortStrike === otherStrike
          );

          if (complementIdx >= 0) {
            const complement = statementPositions[complementIdx];
            consumedStmtIndices.add(complementIdx);
            // Combine both CS halves for comparison against the IC
            const combinedCredit = stmtPos.entryCredit + complement.entryCredit;
            const combinedFees = stmtPos.totalFees + complement.totalFees;
            const differences = comparePosition(stmtPos, match, combinedFees, combinedCredit, stmtPos.contracts);

            // Check call-side strikes too
            const callSide = stmtPos.type === 'CALL' ? stmtPos : complement;
            const putSide = stmtPos.type === 'PUT' ? stmtPos : complement;
            if (match.callShortStrike && match.callShortStrike !== callSide.shortStrike) {
              differences.push(`Call short strike: DB=${match.callShortStrike} vs Statement=${callSide.shortStrike}`);
            }
            if (match.callLongStrike && match.callLongStrike !== callSide.longStrike) {
              differences.push(`Call long strike: DB=${match.callLongStrike} vs Statement=${callSide.longStrike}`);
            }

            // Build a merged statement view for display
            const mergedStatement = {
              ...putSide,
              callShortStrike: callSide.shortStrike,
              callLongStrike: callSide.longStrike,
              strategyType: 'IRON_CONDOR' as const,
              entryCredit: combinedCredit,
              totalFees: combinedFees,
            };

            matched.push({ statement: mergedStatement, database: match, differences });
            continue;
          }
        }

        // Regular non-IC match (or IC complement not found)
        const differences = comparePosition(stmtPos, match, stmtPos.totalFees, stmtPos.entryCredit, stmtPos.contracts);
        if (stmtPos.strategyType !== match.strategyType) {
          const isCCVariant = (match.strategyType === 'COVERED_CALL' || match.linkedPositionId) && stmtPos.strategyType === 'CREDIT_SPREAD';
          if (!isCCVariant) {
            differences.push(`Strategy: DB=${match.strategyType} vs Statement=${stmtPos.strategyType}`);
          }
        }
        matched.push({ statement: stmtPos, database: match, differences });
      } else {
        missingFromDB.push({ pos: stmtPos, idx: si });
      }
    }

    // Remove any missingFromDB entries that were consumed as IC complements
    const filteredMissing: StatementPosition[] = missingFromDB
      .filter(m => !consumedStmtIndices.has(m.idx))
      .map(m => m.pos);

    // DB positions in the period that weren't matched
    const unmatchedDB = dbPositionsInPeriod.filter(dbPos => !matchedDBIds.has(dbPos.id));

    // Try to find potential matches between unmatched statement and DB positions
    // These are positions that partially match (same symbol + expiry but different strikes, etc.)
    const potentialMatches: ReconciliationResult['potentialMatches'] = [];
    const potentialMatchedStmtIndices = new Set<number>();
    const potentialMatchedDBIds = new Set<string>();

    for (let i = 0; i < filteredMissing.length; i++) {
      const stmtPos = filteredMissing[i];
      for (const dbPos of unmatchedDB) {
        if (potentialMatchedDBIds.has(dbPos.id)) continue;

        const symbolMatch = this.normalizeSymbol(dbPos.symbol) === this.normalizeSymbol(stmtPos.symbol);
        const expiryMatch = this.datesMatch(new Date(dbPos.expiry), new Date(stmtPos.expiry));
        const typeMatch = dbPos.type?.toUpperCase() === stmtPos.type;

        // Fuzzy match: same symbol + expiry (strikes may differ due to entry error)
        if (symbolMatch && expiryMatch && typeMatch) {
          const differences: string[] = [];
          if (dbPos.shortStrike !== stmtPos.shortStrike) {
            differences.push(`Short strike: DB=${dbPos.shortStrike} vs Statement=${stmtPos.shortStrike}`);
          }
          if (stmtPos.longStrike && dbPos.longStrike !== stmtPos.longStrike) {
            differences.push(`Long strike: DB=${dbPos.longStrike} vs Statement=${stmtPos.longStrike}`);
          }
          if (stmtPos.contracts !== (dbPos.contracts || 1)) {
            differences.push(`Contracts: DB=${dbPos.contracts} vs Statement=${stmtPos.contracts}`);
          }
          if (stmtPos.strategyType !== dbPos.strategyType) {
            differences.push(`Strategy: DB=${dbPos.strategyType} vs Statement=${stmtPos.strategyType}`);
          }

          potentialMatches.push({
            statement: stmtPos,
            database: dbPos,
            matchReason: `Same symbol (${stmtPos.symbol}), expiry, and type - likely entered with incorrect parameters`,
            differences,
          });
          potentialMatchedStmtIndices.add(i);
          potentialMatchedDBIds.add(dbPos.id);
          break;
        }

        // Even fuzzier: same symbol only (different expiry could be a typo)
        if (symbolMatch && !expiryMatch && typeMatch) {
          const stmtExpiry = new Date(stmtPos.expiry);
          const dbExpiry = new Date(dbPos.expiry);
          const daysDiff = Math.abs(Math.ceil((stmtExpiry.getTime() - dbExpiry.getTime()) / (1000 * 60 * 60 * 24)));
          if (daysDiff <= 7) { // Within a week - could be wrong expiry selected
            const differences: string[] = [];
            differences.push(`Expiry: DB=${dbPos.expiry.toString().substring(0, 10)} vs Statement=${stmtPos.expiry}`);
            if (dbPos.shortStrike !== stmtPos.shortStrike) {
              differences.push(`Short strike: DB=${dbPos.shortStrike} vs Statement=${stmtPos.shortStrike}`);
            }
            if (stmtPos.longStrike && dbPos.longStrike !== stmtPos.longStrike) {
              differences.push(`Long strike: DB=${dbPos.longStrike} vs Statement=${stmtPos.longStrike}`);
            }

            potentialMatches.push({
              statement: stmtPos,
              database: dbPos,
              matchReason: `Same symbol (${stmtPos.symbol}) and type, expiry off by ${daysDiff} day(s) - possible data entry error`,
              differences,
            });
            potentialMatchedStmtIndices.add(i);
            potentialMatchedDBIds.add(dbPos.id);
            break;
          }
        }
      }
    }

    // Remove potential-matched items from filteredMissing
    const trulyMissing = filteredMissing.filter((_, i) => !potentialMatchedStmtIndices.has(i));
    // Remove potential-matched items from unmatchedDB
    const inDBNotInStatement = unmatchedDB.filter(dbPos => !potentialMatchedDBIds.has(dbPos.id));

    return { matched, missingFromDB: trulyMissing, inDBNotInStatement, potentialMatches };
  }

  private normalizeSymbol(symbol: string): string {
    // SPXW (weekly SPX options) should match SPX
    if (symbol === 'SPXW') return 'SPX';
    return symbol;
  }

  private datesMatch(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }

  private parsePeriod(statementPeriod: string): { start: Date; end: Date } {
    // Parse "2025.10.01 - 2025.10.31" format
    const parts = statementPeriod.split(' - ');
    const parseDate = (s: string) => {
      const [y, m, d] = s.trim().split('.');
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    };
    if (parts.length === 2) {
      return { start: parseDate(parts[0]), end: parseDate(parts[1]) };
    }
    // Fallback: use current month
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  async processStatement(
    filePath: string,
    userId: string,
    portfolioId?: string
  ): Promise<ReconciliationResult> {
    // 1. Extract text from PDF
    const pdfText = await this.extractTextFromPDF(filePath);

    // 2. Deterministic parsing of Tiger Brokers statement
    const { trades, accountName, accountNumber, statementPeriod } = this.extractTrades(pdfText);

    // 3. Group trades into positions
    const groupedPositions = this.groupTradesIntoPositions(trades);

    // 4. Parse statement period
    const { start: periodStart, end: periodEnd } = this.parsePeriod(statementPeriod);

    // 5. Reconcile with database
    const { matched, missingFromDB, inDBNotInStatement, potentialMatches } = await this.reconcile(
      groupedPositions,
      userId,
      periodStart,
      periodEnd,
      portfolioId
    );

    // Clean up uploaded file
    try { fs.unlinkSync(filePath); } catch {}

    return {
      statementPeriod,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      accountName,
      accountNumber,
      extractedTrades: trades,
      groupedPositions,
      matched,
      missingFromDB,
      inDBNotInStatement,
      potentialMatches,
      summary: {
        totalStatementPositions: groupedPositions.length,
        totalDBPositionsInPeriod: matched.length + inDBNotInStatement.length + potentialMatches.length,
        matched: matched.length,
        missingFromDB: missingFromDB.length,
        inDBNotInStatement: inDBNotInStatement.length,
        potentialMatches: potentialMatches.length,
      },
    };
  }
}

export const reconciliationService = new ReconciliationService();
