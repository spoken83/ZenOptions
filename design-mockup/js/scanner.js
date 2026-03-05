/**
 * ZenOptions - Scanner Page JavaScript
 * Interactive functionality for scan results, filtering, and detailed analysis
 */

// Store current analysis symbol for modal actions
let currentAnalysisSymbol = null;

// Scan logs database (in production, this would come from API)
const scanLogsDatabase = {
  'MSFT': `🔍 TECHNICAL ANALYSIS FOR MSFT
📊 Current Indicators:
• RSI(14): 34.20
• StochRSI K: 0.00
• StochRSI D: 0.18
• Current Price: $497.10
• Support Level: $492
• Resistance Level: Not set

📈 PUT SPREAD SETUP CHECK:
• RSI Oversold (<30)? ❌ NO (34.20)
• RSI Bounce (>30)? ✅ YES (34.20)
• StochRSI Oversold (<20)? ✅ YES (0.00)
• StochRSI Cross-Up (>20 & K>D)? ❌ NO (K:0.00, D:0.18)
• Price > Support: ✅ YES

🎯 PUT SIGNAL TRIGGERED!
📋 Reason: StochRSI oversold (<20) with RSI confirmation and price above support

📅 Found expiry for MSFT: 2025-12-19

🎯 OPTIONS ANALYSIS FOR MSFT
📅 Expiry: 2025-12-19 (41 DTE)
💰 Current Price: $497.10
📊 Option Chain: 232 strikes available
🔍 PUT Options: 116 strikes
🛡️ Support Level: $492 (short strikes must be BELOW this)
🔍 Support/Resistance + Delta Filter (0.20-0.35): 4 strikes

📋 CONSTRAINTS:
• Minimum Credit: $1.5+
• Risk:Reward Ratio: 1.5:1 to 2.9:1
• Max Loss: ≤$500.00 (Allow 25% bigger if RR maintained)

🔍 TESTING SPREAD COMBINATIONS:

📊 Testing short strike 470 (Delta: -0.232):
  📏 Testing 5-point spread 470/465:
    📊 Short 470: bid=$5.90 ask=$6.76 mid=$6.33
    📊 Long 465: bid=$4.58 ask=$5.56 mid=$5.07
    💰 Credit: $1.26 per share ($126.00 per contract)
    📈 Max Gain: $126.00
    📉 Max Loss: $374.00
    ⚖️ Risk:Reward: 2.97:1
    🔍 Constraints Check:
      • Credit: $1.26 ≥ $1.50 → ❌
      • R:R: 2.97 in [1.5, 2.9] → ❌
      • Max Loss: $374.00 ≤ $625.00 → ✅
    ❌ Failed constraints

📊 Testing short strike 485 (Delta: -0.348):
  📏 Testing 5-point spread 485/480:
    📊 Short 485: bid=$9.72 ask=$11.18 mid=$10.45
    📊 Long 480: bid=$8.24 ask=$9.66 mid=$8.95
    💰 Credit: $1.50 per share ($150.00 per contract)
    📈 Max Gain: $150.00
    📉 Max Loss: $350.00
    ⚖️ Risk:Reward: 2.33:1
    🔍 Constraints Check:
      • Credit: $1.50 ≥ $1.50 → ✅
      • R:R: 2.33 in [1.5, 2.9] → ✅
      • Max Loss: $350.00 ≤ $625.00 → ✅
    
    🎯 VALID SPREAD! Total Score: 68.88
    📊 Score Breakdown:
      • R:R (40%): 93.3/100 → 37.3 pts
      • Credit/Width (30%): 85.7/100 (0.30) → 25.7 pts
      • Delta (20%): 3.3/100 → 0.7 pts
      • Distance (10%): 51.7/100 (0.52 ATR) → 5.2 pts
    
    🏆 NEW BEST SPREAD!

📊 ANALYSIS SUMMARY:
• Total spreads tested: 8
• Valid spreads found: 1

🏆 BEST SPREAD FOUND:
• Strike: 485/480
• Width: 5 points
• Delta: 0.348
• Credit: $1.50
• Max Loss: $350.00
• Risk:Reward: 2.33:1
• Score: 68.88`,
  
  'IWM': `🔍 TECHNICAL ANALYSIS FOR IWM
📊 Current Indicators:
• RSI(14): 41.11
• StochRSI K: 13.57
• StochRSI D: 25.26
• Current Price: $227.08
• Support Level: $236
• Resistance Level: $237.45

📈 PUT SPREAD SETUP CHECK:
• RSI Oversold (<30)? ❌ NO (41.11)
• RSI Bounce (>30)? ✅ YES (41.11)
• StochRSI Oversold (<20)? ✅ YES (13.57)
• StochRSI Cross-Up (>20 & K>D)? ❌ NO (K:13.57, D:25.26)
• Price > Support: ❌ NO (Price below support)

🎯 PUT SIGNAL TRIGGERED!
📋 Reason: StochRSI very oversold (<20) - strong bounce probability

📅 Found expiry for IWM: 2024-12-31

🎯 OPTIONS ANALYSIS FOR IWM
📅 Expiry: 2024-12-31 (46 DTE)
💰 Current Price: $227.08
📊 Option Chain: 186 strikes available
🔍 PUT Options: 93 strikes
🛡️ Support Level: $236 (short strikes must be BELOW this)
🔍 Support/Resistance + Delta Filter (0.20-0.35): 6 strikes

📋 CONSTRAINTS:
• Minimum Credit: $1.5+
• Risk:Reward Ratio: 1.5:1 to 2.9:1
• Max Loss: ≤$800.00

🔍 TESTING SPREAD COMBINATIONS:

📊 Testing short strike 227 (Delta: -0.289):
  📏 Testing 8-point spread 227/219:
    📊 Short 227: bid=$6.00 ask=$6.29 mid=$6.15
    📊 Long 219: bid=$4.18 ask=$4.39 mid=$4.29
    💰 Credit: $1.86 per share ($186.00 per contract)
    📈 Max Gain: $186.00
    📉 Max Loss: $614.00
    ⚖️ Risk:Reward: 2.23:1
    🔍 Constraints Check:
      • Credit: $1.86 ≥ $1.50 → ✅
      • R:R: 2.23 in [1.5, 2.9] → ✅
      • Max Loss: $614.00 ≤ $800.00 → ✅
    
    🎯 VALID SPREAD! Total Score: 96.1
    📊 Score Breakdown:
      • R:R (40%): 96.2/100 → 38.5 pts
      • Credit/Width (30%): 93.0/100 (0.233) → 27.9 pts
      • Delta (20%): 87.4/100 → 17.5 pts
      • Distance (10%): 95.3/100 (1.02 ATR) → 9.5 pts
    
    🏆 NEW BEST SPREAD!

📊 ANALYSIS SUMMARY:
• Total spreads tested: 5
• Valid spreads found: 1

🏆 BEST SPREAD FOUND:
• Strike: 227/219
• Width: 8 points
• Delta: 0.289
• Credit: $1.86
• Max Loss: $614.00
• Risk:Reward: 2.23:1
• Score: 96.1
• PoP: 96.1%`,
  
  'AAPL': `🔍 TECHNICAL ANALYSIS FOR AAPL
📊 Current Indicators:
• RSI(14): 52.14
• StochRSI K: 48.32
• StochRSI D: 51.67
• Current Price: $229.85
• Support Level: $220
• Resistance Level: $240

📈 IRON CONDOR SETUP CHECK:
• RSI Neutral (40-60)? ✅ YES (52.14)
• Price in range? ✅ YES ($220-$240 channel)
• Low volatility? ✅ YES (3-week range-bound)

🎯 IRON CONDOR SIGNAL TRIGGERED!
📋 Reason: Neutral RSI in established trading range

📅 Found expiry for AAPL: 2024-12-27

🎯 OPTIONS ANALYSIS FOR AAPL
📅 Expiry: 2024-12-27 (42 DTE)
💰 Current Price: $229.85
📊 Option Chain: 204 strikes available

🔍 TESTING IRON CONDOR COMBINATIONS:

📊 Testing IC 220P/215P + 240C/245C:
  💰 Put Spread Credit: $1.80
  💰 Call Spread Credit: $1.60
  💰 Total Credit: $3.40 per contract
  📈 Max Gain: $340.00
  📉 Max Loss: $160.00
  ⚖️ Risk:Reward: 0.47:1
  🔍 Probability of Profit: 68.5%
  
  🎯 VALID IRON CONDOR!
  📊 Downside cushion: 4.3%
  📊 Upside cushion: 4.4%
  
  🏆 BEST IRON CONDOR FOUND!

📊 ANALYSIS SUMMARY:
• Total ICs tested: 3
• Valid ICs found: 1

🏆 BEST IRON CONDOR:
• Put Strikes: 220/215
• Call Strikes: 240/245
• Width: 5 points each side
• Total Credit: $3.40
• Max Loss: $160.00
• PoP: 68.5%`,
  
  'XLV': `🔍 TECHNICAL ANALYSIS FOR XLV
📊 Current Indicators:
• RSI(14): 61.25
• Current Price: $163.42
• Trend: Upward
• Sector Performance: +0.14% today

📈 LEAPS CALL SETUP CHECK:
• Trend: ✅ Upward
• Sector strength: ✅ Healthcare leader
• IV environment: ✅ Moderate

🎯 LEAPS CALL SIGNAL TRIGGERED!
📋 Reason: Healthcare sector strength with long-term uptrend

📅 Found expiry for XLV: 2026-01-16

🎯 OPTIONS ANALYSIS FOR XLV
📅 Expiry: 2026-01-16 (424 DTE)
💰 Current Price: $163.42
📊 Option Chain: 84 strikes available
🔍 CALL Options: 42 strikes

🔍 TESTING DEEP ITM CALLS:

📊 Testing strike 155 (Delta: 0.68):
  📊 Call 155: bid=$8.30 ask=$8.70 mid=$8.50
  💰 Cost: $850.00 per contract
  📊 In-the-money: $8.42
  📊 Time value: $0.08
  📊 Delta: 0.68
  📊 Breakeven: $163.50
  
  🎯 VALID LEAPS CALL!
  📊 Deep ITM provides downside protection
  📊 High delta (68%) captures stock movement
  📊 Excellent risk/reward for 424 DTE
  
  🏆 BEST LEAPS CALL FOUND!

📊 ANALYSIS SUMMARY:
• Strikes analyzed: 8
• Valid LEAPS found: 1

🏆 BEST LEAPS CALL:
• Strike: 155
• Cost: $850.00
• Delta: 0.68
• ITM amount: $8.42
• Breakeven: $163.50
• Target gain: +60% (12-18 months)`
};

// Open analysis modal
function openAnalysisModal(symbol) {
  currentAnalysisSymbol = symbol;
  const modal = document.getElementById('analysisModal');
  const title = document.getElementById('modalTitle');
  
  // Get opportunity details
  const card = document.querySelector(`.opportunity-card[data-symbol="${symbol}"]`);
  if (!card) return;
  
  const strategy = card.querySelector('.contract-label').textContent;
  
  // Update modal title
  title.innerHTML = `<i class="fas fa-chart-line"></i> Full Analysis - ${symbol} ${strategy}`;
  
  // Load scan logs
  loadScanLogs(symbol);
  
  // Show modal
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Prevent background scroll
}

// Close analysis modal
function closeAnalysisModal(event) {
  // If event exists and clicked on overlay background, close
  if (event && event.target.id !== 'analysisModal') {
    return;
  }
  
  const modal = document.getElementById('analysisModal');
  modal.style.display = 'none';
  document.body.style.overflow = ''; // Restore scroll
  currentAnalysisSymbol = null;
  
  // Reset to analysis tab
  switchTab('analysis');
}

// Switch between tabs
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.closest('.tab-button').classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  
  const activeTab = document.getElementById(`tab-${tabName}`);
  activeTab.classList.add('active');
  activeTab.style.display = 'block';
}

// Load scan logs for a symbol
function loadScanLogs(symbol) {
  const logContent = document.getElementById('scanLogContent');
  const logs = scanLogsDatabase[symbol];
  
  if (logs) {
    logContent.textContent = logs;
  } else {
    logContent.textContent = `🔍 Scan logs for ${symbol} not available.\n\nIn production, this would show the complete technical analysis and options scanning process, including:\n\n• RSI and StochRSI calculations\n• Support/resistance detection\n• Signal trigger logic\n• Option chain analysis\n• Spread combination testing\n• Constraint validation\n• Scoring breakdown\n\nThe logs provide full transparency into why this trade qualified.`;
  }
}

// Add to positions from modal
function addToPositionsFromModal() {
  if (currentAnalysisSymbol) {
    addToPositions(currentAnalysisSymbol);
    closeAnalysisModal();
  }
}

// Add position to position manager
function addToPositions(symbol) {
  // In production, this would:
  // 1. Collect trade details from the card
  // 2. Send to backend API
  // 3. Redirect to position manager or show success message
  
  const card = document.querySelector(`.opportunity-card[data-symbol="${symbol}"]`);
  if (!card) return;
  
  // For demo: show confirmation
  if (confirm(`Add ${symbol} position to your Position Manager?\n\nThis will track the position with systematic guidance and alerts.`)) {
    // Simulate success
    alert(`✅ ${symbol} position added successfully!\n\nVisit the Positions page to view your ZenGuidance tracking.`);
    
    // In production: redirect to positions page
    // window.location.href = 'positions.html';
  }
}

// Filter opportunities by strategy
function filterByStrategy(strategy) {
  const cards = document.querySelectorAll('.opportunity-card');
  
  cards.forEach(card => {
    const cardStrategy = card.getAttribute('data-strategy');
    
    if (strategy === 'all' || cardStrategy === strategy) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
  
  updateVisibleCount();
}

// Filter opportunities by rating
function filterByRating(rating) {
  const cards = document.querySelectorAll('.opportunity-card');
  
  cards.forEach(card => {
    const cardRating = card.getAttribute('data-rating');
    
    if (rating === 'all') {
      card.style.display = 'flex';
    } else if (rating === 'excellent' && cardRating === 'excellent') {
      card.style.display = 'flex';
    } else if (rating === 'good' && (cardRating === 'excellent' || cardRating === 'good')) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
  
  updateVisibleCount();
}

// Update visible opportunity count
function updateVisibleCount() {
  const cards = document.querySelectorAll('.opportunity-card');
  const visibleCards = Array.from(cards).filter(card => card.style.display !== 'none');
  const count = visibleCards.length;
  
  // Update the heading
  const heading = document.querySelector('.qualified-opportunities h2');
  if (heading) {
    heading.innerHTML = `<i class="fas fa-check-circle"></i> Ready to Trade - Setup + Spread (${count})`;
  }
}

// Toggle batch timestamp dropdown
function toggleBatchDropdown() {
  const dropdown = document.getElementById('batchDropdown');
  if (dropdown.style.display === 'none' || dropdown.style.display === '') {
    dropdown.style.display = 'block';
  } else {
    dropdown.style.display = 'none';
  }
}

// Close batch dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('batchDropdown');
  const button = document.querySelector('.btn-timestamp-dropdown');
  
  if (dropdown && button && !dropdown.contains(e.target) && !button.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// Run new scan
function runScan() {
  // In production, this would:
  // 1. Show loading indicator
  // 2. Call backend API to run scan
  // 3. Update page with new results
  
  // For demo: show dialog
  alert('🔍 Running new scan...\n\nThis would scan your watchlist for:\n• Technical setups (RSI, support/resistance)\n• Available option spreads\n• Systematic criteria validation\n\nResults would update in real-time.');
  
  // Simulate scan completion
  console.log('Scan initiated. In production, this would call the backend API.');
}

// Open scan settings
function openScanSettings() {
  // In production, this would open a modal or navigate to settings page
  
  alert('⚙️ Scan Settings\n\nCustomize your scan criteria:\n\n• DTE range (default: 40-50 days)\n• Min IV Rank (default: 30)\n• Max position size\n• Strategies to include\n• Technical indicator thresholds\n• Risk/reward minimums\n\nSettings coming soon!');
}

// Export scan results to CSV
function exportScanResults() {
  const cards = document.querySelectorAll('.opportunity-card');
  const visibleCards = Array.from(cards).filter(card => card.style.display !== 'none');
  
  if (visibleCards.length === 0) {
    alert('No opportunities to export. Adjust your filters or run a new scan.');
    return;
  }
  
  // Prepare CSV data
  const headers = [
    'Symbol', 'Strategy', 'Rating', 'Credit/Debit', 'Strikes', 
    'DTE', 'Expiry', 'Max Profit', 'Max Loss', 'R:R Ratio', 'PoP'
  ];
  
  let csv = headers.join(',') + '\n';
  
  visibleCards.forEach(card => {
    const symbol = card.getAttribute('data-symbol');
    const strategy = card.querySelector('.contract-label').textContent;
    const rating = card.querySelector('.rating-badge').textContent;
    const credit = card.querySelector('.strategy-badge').textContent;
    
    // Extract metrics from card
    const metrics = card.querySelectorAll('.metric-value');
    const row = [
      symbol,
      `"${strategy}"`,
      rating,
      `"${credit}"`,
      // Add more fields as needed from metrics
    ];
    
    // Note: Full implementation would parse all metrics
    csv += row.join(',') + '\n';
  });
  
  // Create download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zenoptions-scan-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  
  console.log(`Exported ${visibleCards.length} opportunities to CSV`);
}

// Sort opportunities
function sortOpportunities(criteria) {
  const grid = document.querySelector('.opportunities-grid');
  const cards = Array.from(document.querySelectorAll('.opportunity-card'));
  
  cards.sort((a, b) => {
    switch(criteria) {
      case 'rating':
        const ratingOrder = { 'excellent': 1, 'good': 2, 'fair': 3 };
        return ratingOrder[a.getAttribute('data-rating')] - ratingOrder[b.getAttribute('data-rating')];
      
      case 'symbol':
        return a.getAttribute('data-symbol').localeCompare(b.getAttribute('data-symbol'));
      
      case 'dte':
        // Would parse DTE from metrics
        return 0;
      
      default:
        return 0;
    }
  });
  
  // Re-append sorted cards
  cards.forEach(card => grid.appendChild(card));
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // ESC to close modal
  if (e.key === 'Escape') {
    const modal = document.getElementById('analysisModal');
    if (modal && modal.style.display === 'flex') {
      closeAnalysisModal();
    }
  }
  
  // Ctrl/Cmd + E to export
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    exportScanResults();
  }
  
  // Ctrl/Cmd + R to run new scan
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    runScan();
  }
});

// Initialize candidate badge interactions
document.addEventListener('DOMContentLoaded', () => {
  const candidateBadges = document.querySelectorAll('.candidate-badge');
  
  candidateBadges.forEach(badge => {
    badge.addEventListener('click', function() {
      const symbol = this.querySelector('strong').textContent;
      const setupType = this.querySelector('.badge-label').textContent;
      
      alert(`📊 ${symbol} - Setup Only\n\n✅ Technical Setup: ${setupType}\n❌ No Qualified Spread Found\n\nThis ticker shows the right technical signals, but no option spreads currently meet our systematic criteria (delta, R:R, DTE, premium).\n\nIt will move to "Ready to Trade" when a qualified spread becomes available.`);
    });
  });
  
  // Add hover effect to opportunity cards
  const opportunityCards = document.querySelectorAll('.opportunity-card');
  opportunityCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
      this.style.borderColor = 'var(--accent-primary)';
    });
    
    card.addEventListener('mouseleave', function() {
      this.style.borderColor = '#e2e8f0';
    });
  });
  
  // Initialize tooltips (if any)
  initializeTooltips();
  
  console.log('ZenOptions Scanner initialized ✅');
  console.log('Keyboard shortcuts:');
  console.log('  - ESC: Close analysis panels');
  console.log('  - Ctrl+E: Export scan results');
  console.log('  - Ctrl+R: Run new scan');
});

// Initialize tooltips
function initializeTooltips() {
  // Add tooltips for technical terms
  const tooltips = {
    'RSI': 'Relative Strength Index - measures overbought/oversold conditions (0-100)',
    'PoP': 'Probability of Profit - statistical likelihood of closing profitable',
    'DTE': 'Days To Expiration - time remaining until option expiry',
    'R:R': 'Risk:Reward Ratio - relationship between max loss and max profit',
    'IV Rank': 'Implied Volatility Rank - current IV relative to 52-week range'
  };
  
  // In production, would add actual tooltip elements
  console.log('Tooltips available for:', Object.keys(tooltips).join(', '));
}

// Auto-refresh scan results (disabled by default)
let autoRefreshInterval = null;

function enableAutoRefresh(intervalMinutes = 15) {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  autoRefreshInterval = setInterval(() => {
    console.log('Auto-refreshing scan results...');
    // In production: fetch updated data from API
    // runScan();
  }, intervalMinutes * 60 * 1000);
  
  console.log(`Auto-refresh enabled: every ${intervalMinutes} minutes`);
}

function disableAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    console.log('Auto-refresh disabled');
  }
}

// Comparison mode - compare multiple opportunities
let comparisonMode = false;
let selectedForComparison = new Set();

function toggleComparisonMode() {
  comparisonMode = !comparisonMode;
  
  if (comparisonMode) {
    console.log('Comparison mode enabled - click cards to select');
    // Add visual indicator
    document.querySelectorAll('.opportunity-card').forEach(card => {
      card.style.cursor = 'pointer';
    });
  } else {
    console.log('Comparison mode disabled');
    selectedForComparison.clear();
    document.querySelectorAll('.opportunity-card').forEach(card => {
      card.style.cursor = 'default';
      card.classList.remove('selected-for-comparison');
    });
  }
}

function addToComparison(symbol) {
  if (!comparisonMode) return;
  
  if (selectedForComparison.has(symbol)) {
    selectedForComparison.delete(symbol);
  } else {
    selectedForComparison.add(symbol);
  }
  
  const card = document.querySelector(`.opportunity-card[data-symbol="${symbol}"]`);
  if (card) {
    card.classList.toggle('selected-for-comparison');
  }
  
  console.log('Selected for comparison:', Array.from(selectedForComparison));
  
  if (selectedForComparison.size >= 2) {
    console.log('Ready to compare - implement comparison view');
    // Would show side-by-side comparison modal
  }
}

// Filter by multiple criteria
function applyAdvancedFilter(filters) {
  const cards = document.querySelectorAll('.opportunity-card');
  
  cards.forEach(card => {
    let show = true;
    
    // Strategy filter
    if (filters.strategy && filters.strategy !== 'all') {
      show = show && (card.getAttribute('data-strategy') === filters.strategy);
    }
    
    // Rating filter
    if (filters.rating && filters.rating !== 'all') {
      const cardRating = card.getAttribute('data-rating');
      if (filters.rating === 'excellent') {
        show = show && (cardRating === 'excellent');
      } else if (filters.rating === 'good') {
        show = show && (cardRating === 'excellent' || cardRating === 'good');
      }
    }
    
    // DTE range filter (would need to parse from card)
    if (filters.dteMin || filters.dteMax) {
      // Implementation would parse DTE from card metrics
    }
    
    card.style.display = show ? 'flex' : 'none';
  });
  
  updateVisibleCount();
}

// Save scan settings to localStorage
function saveScanSettings(settings) {
  try {
    localStorage.setItem('zenoptionsScanSettings', JSON.stringify(settings));
    console.log('Scan settings saved');
  } catch (e) {
    console.error('Failed to save scan settings:', e);
  }
}

function loadScanSettings() {
  try {
    const settings = localStorage.getItem('zenoptionsScanSettings');
    return settings ? JSON.parse(settings) : null;
  } catch (e) {
    console.error('Failed to load scan settings:', e);
    return null;
  }
}

// Export functions for external use
window.ZenScanner = {
  openAnalysisModal,
  closeAnalysisModal,
  switchTab,
  addToPositions,
  filterByStrategy,
  filterByRating,
  runScan,
  openScanSettings,
  exportScanResults,
  sortOpportunities,
  enableAutoRefresh,
  disableAutoRefresh,
  toggleComparisonMode,
  applyAdvancedFilter,
  saveScanSettings,
  loadScanSettings
};

console.log('ZenOptions Scanner module loaded ✅');
