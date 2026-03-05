/**
 * Create System Owner User
 * 
 * This script creates the "system owner" user who will own all existing data
 * during the migration to multi-tenant architecture. This ensures zero data loss.
 */

import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";

const SYSTEM_OWNER = {
  email: "system@optionsmonitor.internal",
  name: "System Owner",
  replitUserId: "system-owner-migration-account",
  subscriptionTier: "pro" as const,
  isActive: true,
};

export async function createSystemOwner() {
  console.log("🔧 Creating system owner user...\n");

  // Check if system owner already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, SYSTEM_OWNER.email),
  });

  if (existing) {
    console.log(`✅ System owner already exists`);
    console.log(`   ID: ${existing.id}`);
    console.log(`   Email: ${existing.email}`);
    console.log(`   Tier: ${existing.subscriptionTier}`);
    return existing;
  }

  // Create system owner
  const [systemOwner] = await db.insert(users).values({
    email: SYSTEM_OWNER.email,
    name: SYSTEM_OWNER.name,
    replitUserId: SYSTEM_OWNER.replitUserId,
    subscriptionTier: SYSTEM_OWNER.subscriptionTier,
    isActive: SYSTEM_OWNER.isActive,
  }).returning();

  console.log(`✅ System owner created successfully!`);
  console.log(`   ID: ${systemOwner.id}`);
  console.log(`   Email: ${systemOwner.email}`);
  console.log(`   Tier: ${systemOwner.subscriptionTier}`);
  console.log(`   Created: ${systemOwner.createdAt}`);

  return systemOwner;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createSystemOwner()
    .then(() => {
      console.log("\n✅ System owner migration complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Failed to create system owner:", error);
      process.exit(1);
    });
}
