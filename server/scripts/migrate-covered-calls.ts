import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Migration script: Update covered call positions to use COVERED_CALL strategyType.
 *
 * Previously, covered calls were stored as CREDIT_SPREAD with linkedPositionId set.
 * This updates them to the new COVERED_CALL strategyType.
 */

async function migrateCoveredCalls() {
  console.log("Migrating covered call positions...\n");

  try {
    // Preview what will be updated
    const preview = await db.execute(sql`
      SELECT id, symbol, strategy_type, type, linked_position_id, status
      FROM positions
      WHERE linked_position_id IS NOT NULL
        AND strategy_type = 'CREDIT_SPREAD'
        AND type = 'CALL'
    `);

    console.log(`Found ${preview.rows.length} covered call positions to migrate:\n`);
    for (const row of preview.rows) {
      console.log(`  ${row.id} | ${row.symbol} | ${row.strategy_type} -> COVERED_CALL | ${row.status}`);
    }

    if (preview.rows.length === 0) {
      console.log("Nothing to migrate.");
      process.exit(0);
    }

    // Perform the update
    const result = await db.execute(sql`
      UPDATE positions
      SET strategy_type = 'COVERED_CALL'
      WHERE linked_position_id IS NOT NULL
        AND strategy_type = 'CREDIT_SPREAD'
        AND type = 'CALL'
    `);

    console.log(`\nUpdated ${result.rowCount} positions to COVERED_CALL.`);

    // Verify
    const verify = await db.execute(sql`
      SELECT strategy_type, count(*) as count
      FROM positions
      WHERE linked_position_id IS NOT NULL
      GROUP BY strategy_type
    `);

    console.log("\nVerification (positions with linkedPositionId):");
    for (const row of verify.rows) {
      console.log(`  ${row.strategy_type}: ${row.count}`);
    }

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

migrateCoveredCalls();
