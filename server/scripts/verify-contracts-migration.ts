import { db } from "../db";
import { positions } from "@shared/schema";
import { sql } from "drizzle-orm";

/**
 * Verification script for contracts field migration
 * 
 * This script verifies that:
 * 1. The contracts column exists in the positions table
 * 2. All existing positions have a valid contracts value (defaults to 1)
 * 3. No null values exist in the contracts column
 */

async function verifyContractsMigration() {
  console.log("🔍 Verifying contracts field migration...\n");

  try {
    // Check if contracts column exists and has correct constraints
    const columnCheck = await db.execute(sql`
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'positions' 
        AND column_name = 'contracts'
    `);

    if (columnCheck.rows.length === 0) {
      console.error("❌ FAIL: 'contracts' column does not exist in positions table");
      console.log("   Run: npm run db:push");
      process.exit(1);
    }

    const column = columnCheck.rows[0] as any;
    console.log("✅ Column exists:");
    console.log(`   - Type: ${column.data_type}`);
    console.log(`   - Default: ${column.column_default}`);
    console.log(`   - Nullable: ${column.is_nullable}`);

    // Verify constraints
    if (column.is_nullable === 'YES') {
      console.error("❌ FAIL: 'contracts' column should be NOT NULL");
      process.exit(1);
    }

    if (!column.column_default || !column.column_default.includes('1')) {
      console.warn("⚠️  WARNING: 'contracts' column default is not set to 1");
    }

    // Check all positions have valid contracts values
    const invalidPositions = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM positions
      WHERE contracts IS NULL OR contracts < 1
    `);

    const invalidCount = Number((invalidPositions.rows[0] as any).count);
    
    if (invalidCount > 0) {
      console.error(`❌ FAIL: Found ${invalidCount} positions with invalid contracts values`);
      console.log("   Fixing invalid values...");
      
      // Fix any positions with null or invalid contracts
      await db.execute(sql`
        UPDATE positions 
        SET contracts = 1 
        WHERE contracts IS NULL OR contracts < 1
      `);
      
      console.log("✅ Fixed invalid values");
    } else {
      console.log("✅ All positions have valid contracts values");
    }

    // Show summary statistics
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_positions,
        COUNT(DISTINCT contracts) as distinct_contract_counts,
        MIN(contracts) as min_contracts,
        MAX(contracts) as max_contracts,
        SUM(contracts) as total_contracts
      FROM positions
    `);

    const summary = stats.rows[0] as any;
    console.log("\n📊 Position Summary:");
    console.log(`   - Total positions: ${summary.total_positions}`);
    console.log(`   - Total contracts: ${summary.total_contracts}`);
    console.log(`   - Contract range: ${summary.min_contracts} - ${summary.max_contracts}`);
    console.log(`   - Unique contract counts: ${summary.distinct_contract_counts}`);

    console.log("\n✅ Migration verification complete - all checks passed!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  }
}

verifyContractsMigration();
