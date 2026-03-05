/**
 * Verify Migration Integrity
 * 
 * This script verifies that the multi-tenant migration was successful:
 * - All tables have user_id column
 * - No null user_id values
 * - Foreign keys exist
 * - Indexes created
 * - Row counts match pre-migration
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { users } from "../../shared/schema";

const TABLES_TO_VERIFY = [
  'watchlist',
  'tickers',
  'portfolios',
  'positions',
  'indicators',
  'scan_results',
  'alerts',
  'settings',
];

const EXPECTED_ROW_COUNTS = {
  watchlist: 17,
  tickers: 18,
  portfolios: 4,
  positions: 27,
  indicators: 1012,
  scan_results: 1049,
  alerts: 58,
  settings: 33,
};

interface VerificationResult {
  table: string;
  hasUserIdColumn: boolean;
  hasNullValues: boolean;
  nullCount: number;
  hasForeignKey: boolean;
  hasIndex: boolean;
  rowCount: number;
  expectedRowCount?: number;
  rowCountMatch: boolean;
}

export async function verifyMigration(): Promise<VerificationResult[]> {
  console.log("🔍 Starting migration verification...\n");

  const results: VerificationResult[] = [];

  for (const table of TABLES_TO_VERIFY) {
    console.log(`Checking ${table}...`);

    // Check if user_id column exists
    const columnCheck = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${table} 
      AND column_name = 'user_id'
    `);
    const hasUserIdColumn = columnCheck.rows.length > 0;

    // Check for null values
    const nullCheck = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ${sql.identifier(table)} 
      WHERE user_id IS NULL
    `);
    const nullCount = Number(nullCheck.rows[0].count);
    const hasNullValues = nullCount > 0;

    // Check foreign key
    const fkCheck = await db.execute(sql`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = ${table} 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%user_id%'
    `);
    const hasForeignKey = fkCheck.rows.length > 0;

    // Check index
    const indexCheck = await db.execute(sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = ${table} 
      AND indexname LIKE '%user_id%'
    `);
    const hasIndex = indexCheck.rows.length > 0;

    // Check row count
    const countCheck = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ${sql.identifier(table)}
    `);
    const rowCount = Number(countCheck.rows[0].count);
    const expectedRowCount = EXPECTED_ROW_COUNTS[table as keyof typeof EXPECTED_ROW_COUNTS];
    const rowCountMatch = rowCount === expectedRowCount;

    const result: VerificationResult = {
      table,
      hasUserIdColumn,
      hasNullValues,
      nullCount,
      hasForeignKey,
      hasIndex,
      rowCount,
      expectedRowCount,
      rowCountMatch,
    };

    results.push(result);

    // Print status
    if (hasUserIdColumn && !hasNullValues && hasForeignKey && hasIndex && rowCountMatch) {
      console.log(`  ✅ ${table}: OK (${rowCount} rows)`);
    } else {
      console.log(`  ⚠️  ${table}: Issues detected`);
      if (!hasUserIdColumn) console.log(`     - Missing user_id column`);
      if (hasNullValues) console.log(`     - Has ${nullCount} null user_id values`);
      if (!hasForeignKey) console.log(`     - Missing foreign key constraint`);
      if (!hasIndex) console.log(`     - Missing index on user_id`);
      if (!rowCountMatch) console.log(`     - Row count mismatch: expected ${expectedRowCount}, got ${rowCount}`);
    }
  }

  // Verify system owner
  console.log(`\nVerifying system owner...`);
  const systemOwner = await db.query.users.findFirst({
    where: eq(users.email, 'system@optionsmonitor.internal'),
  });

  if (!systemOwner) {
    console.log(`❌ System owner not found!`);
  } else {
    console.log(`✅ System owner: ${systemOwner.id}`);

    // Count records assigned to system owner
    for (const table of TABLES_TO_VERIFY) {
      const countCheck = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM ${sql.identifier(table)} 
        WHERE user_id = ${systemOwner.id}
      `);
      const count = Number(countCheck.rows[0].count);
      console.log(`   ${table}: ${count} records`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  const allPassed = results.every(r => 
    r.hasUserIdColumn && 
    !r.hasNullValues && 
    r.hasForeignKey && 
    r.hasIndex && 
    r.rowCountMatch
  );

  if (allPassed) {
    console.log(`✅ All verification checks passed!`);
  } else {
    console.log(`⚠️  Some verification checks failed. Review above.`);
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyMigration()
    .then((results) => {
      const failed = results.filter(r => 
        !r.hasUserIdColumn || 
        r.hasNullValues || 
        !r.hasForeignKey || 
        !r.hasIndex || 
        !r.rowCountMatch
      );

      if (failed.length > 0) {
        console.error(`\n❌ Verification failed for ${failed.length} table(s)`);
        process.exit(1);
      } else {
        console.log(`\n✅ All tables verified successfully!`);
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error("\n❌ Verification error:", error);
      process.exit(1);
    });
}
