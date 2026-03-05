/**
 * Feature Flags for SaaS Transformation
 * 
 * These flags control the rollout of multi-user features during migration.
 * They can be toggled via environment variables for safe, gradual deployment.
 */

export interface FeatureFlags {
  // Enable multi-user database queries (Phase 1 complete)
  multiUserEnabled: boolean;
  
  // Enforce authentication on write operations (Phase 2 complete)
  enforceAuth: boolean;
  
  // Enable subscription tier limits and gating (Phase 3 complete)
  subscriptionGating: boolean;
  
  // Enable Stripe subscription billing (Phase 4 - future)
  stripeBilling: boolean;
}

/**
 * Get current feature flag configuration from environment variables
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    multiUserEnabled: process.env.MULTI_USER_ENABLED === 'true',
    enforceAuth: process.env.ENFORCE_AUTH === 'true',
    subscriptionGating: process.env.SUBSCRIPTION_GATING === 'true',
    stripeBilling: process.env.STRIPE_BILLING === 'true',
  };
}

/**
 * Default flags for development (all features disabled during migration)
 */
export const DEFAULT_FLAGS: FeatureFlags = {
  multiUserEnabled: false,
  enforceAuth: false,
  subscriptionGating: false,
  stripeBilling: false,
};

// Export singleton instance
export const featureFlags = getFeatureFlags();

/**
 * Helper to check if we're in legacy single-user mode
 */
export function isLegacyMode(): boolean {
  return !featureFlags.multiUserEnabled;
}

/**
 * Helper to check if authentication is required
 */
export function isAuthRequired(): boolean {
  return featureFlags.enforceAuth;
}

/**
 * Helper to check if subscription limits should be enforced
 */
export function isSubscriptionGatingEnabled(): boolean {
  return featureFlags.subscriptionGating;
}

/**
 * Log current feature flag status (useful for debugging)
 */
export function logFeatureFlags(): void {
  console.log('🚩 Feature Flags Status:');
  console.log(`  - Multi-User Enabled: ${featureFlags.multiUserEnabled ? '✅' : '❌'}`);
  console.log(`  - Enforce Auth: ${featureFlags.enforceAuth ? '✅' : '❌'}`);
  console.log(`  - Subscription Gating: ${featureFlags.subscriptionGating ? '✅' : '❌'}`);
  console.log(`  - Stripe Billing: ${featureFlags.stripeBilling ? '✅' : '❌'}`);
}
