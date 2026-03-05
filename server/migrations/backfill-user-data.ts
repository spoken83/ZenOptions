/**
 * Backfill Existing Data with System Owner
 * 
 * This script assigns all existing data to the system owner user.
 * This is a critical migration step - all data must be preserved.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { users, watchlist, tickers, portfolios, positions, indicators, scanResults, alerts, settings } from "../../shared/schema";

const TABLES_TO_BACKFILL = [
  { name: 'portfolios', table: portfolios, expectedCount: 4 },
  { name: 'watchlist', table: watchlist, expectedCount: 17 },
  { name: 'tickers', table: tickers, expectedCount: 18 },
  { name: 'positions', table: positions, expectedCount: 27 },
  { name: 'scan_results', table: scanResults, expectedCount: 1049 },
  { name: 'alerts', table: alerts, expectedCount: 58 },
  { name: 'indicators', table: indicators, expectedCount: 1012 },
  { name: 'settings', table: settings, expectedCount: 33 },
];

export async function backfillUserData() {
  console.log("🔄 Starting data backfill to system owner...\n");

  // Get system owner
  const systemOwner = await db.query.users.findFirst({
    where: eq(users.email, "system@optionsmonitor.internal"),
  });

  if (!systemOwner) {
    throw new Error("❌ System owner not found! Run create-system-owner.ts first.");
  }

  console.log(`✅ Found system owner: ${systemOwner.id}`);
  console.log(`   Email: ${systemOwner.email}`);
  console.log(`   Tier: ${systemOwner.subscriptionTier}\n`);

  let totalProcessed = 0;
  let totalErrors = 0;

  for (const { name, table, expectedCount } of TABLES_TO_BACKFILL) {
    console.log(`Processing ${name}...`);

    try {
      // Count total records
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(table);
      const totalCount = Number(totalResult[0].count);

      // Count null user_id records
      const nullResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(sql`${table.userId} IS NULL`);
      const nullCount = Number(nullResult[0].count);

      console.log(`  Total records: ${totalCount}`);
      console.log(`  Null user_id: ${nullCount}`);

      if (expectedCount !== undefined && totalCount !== expectedCount) {
        console.warn(`  ⚠️  Warning: Expected ${expectedCount} records, found ${totalCount}`);
      }

      if (nullCount === 0) {
        console.log(`  ✅ No backfill needed (all records already have user_id)`);
        continue;
      }

      // Backfill null records with system owner
      await db
        .update(table)
        .set({ userId: systemOwner.id })
        .where(sql`${table.userId} IS NULL`);

      // Verify no nulls remain
      const verifyResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(sql`${table.userId} IS NULL`);
      const remainingNulls = Number(verifyResult[0].count);

      if (remainingNulls > 0) {
        throw new Error(`${name} still has ${remainingNulls} null user_id records!`);
      }

      // Verify all assigned to system owner
      const ownerResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(eq(table.userId, systemOwner.id));
      const ownerCount = Number(ownerResult[0].count);

      console.log(`  ✅ Backfilled ${nullCount} records`);
      console.log(`  ✅ System owner now has ${ownerCount} records\n`);

      totalProcessed += nullCount;
    } catch (error) {
      console.error(`  ❌ Error processing ${name}:`, error);
      totalErrors++;
    }
  }

  console.log("=".repeat(60));
  console.log(`✅ Backfill complete!`);
  console.log(`   Total records processed: ${totalProcessed}`);
  console.log(`   Errors: ${totalErrors}`);

  if (totalErrors > 0) {
    throw new Error(`Backfill completed with ${totalErrors} errors`);
  }

  // Final verification
  console.log("\nFinal verification:");
  for (const { name, table } of TABLES_TO_BACKFILL) {
    const nullResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(sql`${table.userId} IS NULL`);
    const nullCount = Number(nullResult[0].count);

    if (nullCount > 0) {
      throw new Error(`❌ Verification failed: ${name} has ${nullCount} null user_id records`);
    } else {
      console.log(`  ✅ ${name}: No null user_id values`);
    }
  }

  console.log("\n✅ All data successfully backfilled to system owner!");
  return { totalProcessed, systemOwnerId: systemOwner.id };
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillUserData()
    .then(({ totalProcessed, systemOwnerId }) => {
      console.log(`\n🎉 SUCCESS: ${totalProcessed} records assigned to system owner ${systemOwnerId}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ BACKFILL FAILED:", error);
      process.exit(1);
    });
}
