import { db } from "../db";
import { portfolios, positions } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";

async function initPortfolios() {
  console.log("Initializing portfolios...");
  
  // Check if portfolios already exist
  const existing = await db.select().from(portfolios);
  
  let tigerAccountId: string;
  let demoAccountId: string;
  
  if (existing.length === 0) {
    console.log("Creating default portfolios...");
    
    // Create Tiger Account
    const [tigerAccount] = await db.insert(portfolios).values({
      name: "Tiger Account",
      description: "Main trading account",
    }).returning();
    tigerAccountId = tigerAccount.id;
    console.log(`✓ Created Tiger Account (${tigerAccountId})`);
    
    // Create Demo Account
    const [demoAccount] = await db.insert(portfolios).values({
      name: "Demo Account",
      description: "Demo/paper trading account",
    }).returning();
    demoAccountId = demoAccount.id;
    console.log(`✓ Created Demo Account (${demoAccountId})`);
  } else {
    console.log(`Found ${existing.length} existing portfolios`);
    
    // Find accounts by name
    const tigerAccount = existing.find(p => p.name === "Tiger Account");
    const demoAccount = existing.find(p => p.name === "Demo Account");
    
    if (!tigerAccount || !demoAccount) {
      throw new Error("Could not find Tiger Account or Demo Account");
    }
    
    tigerAccountId = tigerAccount.id;
    demoAccountId = demoAccount.id;
    console.log(`✓ Using existing Tiger Account (${tigerAccountId})`);
    console.log(`✓ Using existing Demo Account (${demoAccountId})`);
  }
  
  // Assign all positions without portfolioId to Demo Account
  const positionsWithoutPortfolio = await db.select().from(positions).where(isNull(positions.portfolioId));
  
  if (positionsWithoutPortfolio.length > 0) {
    console.log(`\nAssigning ${positionsWithoutPortfolio.length} positions to Demo Account...`);
    
    for (const position of positionsWithoutPortfolio) {
      await db.update(positions)
        .set({ portfolioId: demoAccountId })
        .where(eq(positions.id, position.id));
      console.log(`  ✓ ${position.symbol} (${position.type})`);
    }
    
    console.log(`\n✓ All positions assigned to Demo Account`);
  } else {
    console.log("\n✓ All positions already have portfolios assigned");
  }
  
  console.log("\n✓ Portfolio initialization complete!");
}

initPortfolios()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error initializing portfolios:", error);
    process.exit(1);
  });
