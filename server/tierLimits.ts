// Tier enforcement and limits

export const TIER_LIMITS = {
  free: {
    maxWatchlist: 20,        // Limited time promo (normally 3)
    maxPositions: 20,        // Limited time promo (normally 3)
    maxScansPerDay: 20,      // Limited time promo (normally 2)
    scheduledScansPerDay: 4, // Limited time promo (normally 1)
    hasScheduledScans: true,
    hasTelegramAlerts: false,
    hasTigerIntegration: false,
    hasMoomooIntegration: false,
    zenStatusUpdateInterval: 'daily',
  },
  pro: {
    maxWatchlist: Infinity,
    maxPositions: Infinity,
    maxScansPerDay: Infinity,
    scheduledScansPerDay: 4,
    hasScheduledScans: true,
    hasTelegramAlerts: true,
    hasTigerIntegration: true,
    hasMoomooIntegration: true,
    zenStatusUpdateInterval: 'realtime',
  },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;

export interface TierCheckResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
}

export function checkWatchlistLimit(tier: SubscriptionTier, currentCount: number): TierCheckResult {
  const limit = TIER_LIMITS[tier].maxWatchlist;
  if (limit === Infinity) {
    return { allowed: true };
  }
  
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Free tier limited to ${limit} watchlist tickers. Upgrade to Pro for unlimited.`,
      limit,
      current: currentCount,
    };
  }
  
  return { allowed: true, limit, current: currentCount };
}

export function checkPositionLimit(tier: SubscriptionTier, currentCount: number): TierCheckResult {
  const limit = TIER_LIMITS[tier].maxPositions;
  if (limit === Infinity) {
    return { allowed: true };
  }
  
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Free tier limited to ${limit} positions. Upgrade to Pro for unlimited.`,
      limit,
      current: currentCount,
    };
  }
  
  return { allowed: true, limit, current: currentCount };
}

export function checkScanQuota(
  tier: SubscriptionTier,
  dailyScanCount: number,
  lastScanDate: Date | null
): TierCheckResult {
  const limit = TIER_LIMITS[tier].maxScansPerDay;
  if (limit === Infinity) {
    return { allowed: true };
  }
  
  // This case is for if limit is ever set to 0 (currently free tier has 2 per day)
  if (limit === 0) {
    return {
      allowed: false,
      reason: 'Manual scans are a Pro feature. Upgrade to Pro for unlimited manual scans.',
      limit: 0,
      current: dailyScanCount,
    };
  }
  
  // Reset quota if last scan was on a different day
  const today = new Date().toDateString();
  const lastScan = lastScanDate ? new Date(lastScanDate).toDateString() : null;
  
  if (lastScan !== today) {
    // New day, quota resets
    return { allowed: true, limit, current: 0 };
  }
  
  if (dailyScanCount >= limit) {
    return {
      allowed: false,
      reason: `Free tier limited to ${limit} scans per day. Upgrade to Pro for unlimited.`,
      limit,
      current: dailyScanCount,
    };
  }
  
  return { allowed: true, limit, current: dailyScanCount };
}

export function canAccessScheduledScans(tier: SubscriptionTier): TierCheckResult {
  if (TIER_LIMITS[tier].hasScheduledScans) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    reason: 'Scheduled scans are a Pro feature. Upgrade to enable automatic scanning.',
  };
}

export function canAccessTelegramAlerts(tier: SubscriptionTier): TierCheckResult {
  if (TIER_LIMITS[tier].hasTelegramAlerts) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    reason: 'Telegram alerts are a Pro feature. Upgrade to receive position alerts.',
  };
}

export function canAccessTigerIntegration(tier: SubscriptionTier): TierCheckResult {
  if (TIER_LIMITS[tier].hasTigerIntegration) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    reason: 'Tiger Brokers integration is a Pro feature. Upgrade to sync your positions.',
  };
}

export function canAccessMoomooIntegration(tier: SubscriptionTier): TierCheckResult {
  if (TIER_LIMITS[tier].hasMoomooIntegration) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    reason: 'MooMoo integration is a Pro feature. Upgrade to sync your positions.',
  };
}
