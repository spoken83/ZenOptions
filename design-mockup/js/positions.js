/**
 * ZenOptions - Position Management JavaScript
 * Implements ZenGuidance System with systematic position status calculation
 */

// Toggle guidance panel visibility
function toggleGuidance(symbol) {
  const panel = document.getElementById(`guidance-${symbol}`);
  const button = event.currentTarget;
  const icon = button.querySelector('i');
  
  if (panel.style.display === 'none' || panel.style.display === '') {
    // Show panel
    panel.style.display = 'table-row';
    icon.classList.remove('fa-book-open');
    icon.classList.add('fa-times');
    button.innerHTML = '<i class="fas fa-times"></i> Close';
    
    // Smooth scroll to panel
    setTimeout(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  } else {
    // Hide panel
    panel.style.display = 'none';
    icon.classList.remove('fa-times');
    icon.classList.add('fa-book-open');
    button.innerHTML = '<i class="fas fa-book-open"></i> Why?';
  }
}

// Calculate ZenStatus based on systematic rules
function calculateZenStatus(position) {
  const { 
    dte, 
    currentPnL, 
    currentPnLPercent, 
    maxProfit, 
    maxLoss, 
    shortStrike, 
    currentPrice, 
    strategy,
    entryCredit 
  } = position;
  
  // PROFIT STATUS - 50% of max profit reached
  if (strategy.includes('IC') && (currentPnL / maxProfit) >= 0.50 && dte > 21) {
    return {
      status: 'profit',
      message: 'Profit target reached - systematic exit recommended',
      action: 'Consider taking profits per IC management rule',
      priority: 'high',
      icon: '🎯'
    };
  }
  
  // ACTION STATUS - Short strike breached
  const isShortBreached = strategy.includes('PUT') 
    ? currentPrice < shortStrike 
    : currentPrice > shortStrike;
    
  if (isShortBreached && dte <= 28 && dte >= 21) {
    return {
      status: 'action',
      message: 'Short strike breached - systematic closure recommended',
      action: 'Close position per breach management rule',
      priority: 'urgent',
      icon: '⚠️'
    };
  }
  
  // MONITOR STATUS - Large loss but short intact
  if (Math.abs(currentPnLPercent) > 50 && !isShortBreached && dte > 21) {
    return {
      status: 'monitor',
      message: 'Large loss but short strike intact - hold per rule',
      action: 'Monitor for breach or 21 DTE exit',
      priority: 'medium',
      icon: '👁️'
    };
  }
  
  // MONITOR STATUS - Approaching 21 DTE
  if (dte <= 25 && dte > 21) {
    return {
      status: 'monitor',
      message: 'Approaching systematic exit window',
      action: 'Prepare for 21 DTE exit',
      priority: 'medium',
      icon: '👁️'
    };
  }
  
  // ZEN STATUS - All systems normal
  return {
    status: 'zen',
    message: 'Position performing within systematic parameters',
    action: 'Continue systematic approach - no action needed',
    priority: 'low',
    icon: '✅'
  };
}

// Update position row with calculated ZenStatus
function updatePositionStatus(rowElement, position) {
  const zenStatus = calculateZenStatus(position);
  
  // Update status badge
  const statusBadge = rowElement.querySelector('.status-badge');
  statusBadge.className = `status-badge ${zenStatus.status}`;
  statusBadge.innerHTML = `
    <span class="status-icon">${zenStatus.icon}</span>
    <span class="status-text">${zenStatus.status.toUpperCase()}</span>
  `;
  
  // Update guidance text
  const guidanceText = rowElement.querySelector('.guidance-text');
  guidanceText.textContent = zenStatus.message;
  
  // Update row background class
  rowElement.className = `position-row ${zenStatus.status}-status`;
}

// Initialize portfolio dashboard counts
function updatePortfolioDashboard() {
  const positions = document.querySelectorAll('.position-row');
  const counts = {
    zen: 0,
    monitor: 0,
    action: 0,
    profit: 0
  };
  
  positions.forEach(row => {
    const statusBadge = row.querySelector('.status-badge');
    if (statusBadge) {
      const status = statusBadge.querySelector('.status-text').textContent.toLowerCase();
      if (counts.hasOwnProperty(status)) {
        counts[status]++;
      }
    }
  });
  
  // Update dashboard cards - check if elements exist before updating
  const zenCard = document.querySelector('.status-pill.zen .pill-count');
  const monitorCard = document.querySelector('.status-pill.monitor .pill-count');
  const profitCard = document.querySelector('.status-pill.profit .pill-count');
  const actionCard = document.querySelector('.status-pill.action .pill-count');
  
  if (zenCard) zenCard.textContent = counts.zen;
  if (monitorCard) monitorCard.textContent = counts.monitor;
  if (profitCard) profitCard.textContent = counts.profit;
  if (actionCard) actionCard.textContent = counts.action;
}

// Filter positions by status
function filterPositions(status) {
  const positions = document.querySelectorAll('.position-row');
  const guidancePanels = document.querySelectorAll('.guidance-panel');
  
  if (status === 'all') {
    positions.forEach(row => row.style.display = 'table-row');
    guidancePanels.forEach(panel => panel.style.display = 'none');
    return;
  }
  
  positions.forEach(row => {
    const statusBadge = row.querySelector('.status-badge');
    const rowStatus = statusBadge.querySelector('.status-text').textContent.toLowerCase();
    
    if (rowStatus === status) {
      row.style.display = 'table-row';
    } else {
      row.style.display = 'none';
    }
  });
  
  // Hide all guidance panels when filtering
  guidancePanels.forEach(panel => panel.style.display = 'none');
}

// Sort positions by column
function sortPositions(column, direction = 'asc') {
  const table = document.querySelector('.positions-table tbody');
  const rows = Array.from(table.querySelectorAll('.position-row'));
  
  const sortedRows = rows.sort((a, b) => {
    let aValue, bValue;
    
    switch(column) {
      case 'symbol':
        aValue = a.querySelector('.symbol-cell strong').textContent;
        bValue = b.querySelector('.symbol-cell strong').textContent;
        break;
      case 'dte':
        aValue = parseInt(a.cells[4].textContent);
        bValue = parseInt(b.cells[4].textContent);
        break;
      case 'pnl':
        aValue = parseFloat(a.cells[9].textContent.replace(/[$,]/g, ''));
        bValue = parseFloat(b.cells[9].textContent.replace(/[$,]/g, ''));
        break;
      case 'status':
        aValue = a.querySelector('.status-text').textContent;
        bValue = b.querySelector('.status-text').textContent;
        break;
      default:
        return 0;
    }
    
    if (direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });
  
  // Clear table and re-append sorted rows with their guidance panels
  sortedRows.forEach(row => {
    const symbol = row.dataset.symbol;
    const guidancePanel = document.getElementById(`guidance-${symbol}`);
    
    table.appendChild(row);
    if (guidancePanel) {
      table.appendChild(guidancePanel);
    }
  });
}

// Close all guidance panels
function closeAllGuidance() {
  const panels = document.querySelectorAll('.guidance-panel');
  const buttons = document.querySelectorAll('.guidance-expand');
  
  panels.forEach(panel => {
    panel.style.display = 'none';
  });
  
  buttons.forEach(button => {
    const icon = button.querySelector('i');
    icon.classList.remove('fa-times');
    icon.classList.add('fa-book-open');
    button.innerHTML = '<i class="fas fa-book-open"></i> Why?';
  });
}

// Export position data to CSV
function exportToCSV() {
  const positions = document.querySelectorAll('.position-row');
  const headers = [
    'Symbol', 'Status', 'Strategy', 'Entry Date', 'DTE', 'Qty',
    'Short Strike', 'Long Strike', 'Entry Credit', 'Current Value',
    'Current P/L', 'P/L %', 'Max Profit', 'Max Loss', 'Current Price', 'Delta'
  ];
  
  let csv = headers.join(',') + '\n';
  
  positions.forEach(row => {
    const cells = Array.from(row.cells);
    const rowData = cells.map(cell => {
      let text = cell.textContent.trim();
      // Handle symbol cell specially
      if (cell.classList.contains('symbol-cell')) {
        text = cell.querySelector('strong').textContent;
      }
      // Handle status badge
      if (cell.querySelector('.status-badge')) {
        text = cell.querySelector('.status-text').textContent;
      }
      // Escape commas and quotes
      if (text.includes(',') || text.includes('"')) {
        text = `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    });
    csv += rowData.join(',') + '\n';
  });
  
  // Create download link
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zenoptions-positions-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // ESC to close all guidance panels
  if (e.key === 'Escape') {
    closeAllGuidance();
  }
  
  // Ctrl/Cmd + E to export CSV
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    exportToCSV();
  }
});

// Add click handlers to dashboard cards for filtering
document.addEventListener('DOMContentLoaded', () => {
  // Update dashboard counts on load
  updatePortfolioDashboard();
  
  // Add filter functionality to dashboard cards
  const zenCard = document.querySelector('.status-pill.zen');
  const monitorCard = document.querySelector('.status-pill.monitor');
  const profitCard = document.querySelector('.status-pill.profit');
  const actionCard = document.querySelector('.status-pill.action');
  
  if (zenCard) {
    zenCard.style.cursor = 'pointer';
    zenCard.addEventListener('click', () => filterPositions('zen'));
  }
  
  if (monitorCard) {
    monitorCard.style.cursor = 'pointer';
    monitorCard.addEventListener('click', () => filterPositions('monitor'));
  }
  
  if (profitCard) {
    profitCard.style.cursor = 'pointer';
    profitCard.addEventListener('click', () => filterPositions('profit'));
  }
  
  if (actionCard) {
    actionCard.style.cursor = 'pointer';
    actionCard.addEventListener('click', () => filterPositions('action'));
  }
  
  // Add double-click to reset filter
  const dashboard = document.querySelector('.zen-portfolio-dashboard-compact');
  if (dashboard) {
    dashboard.addEventListener('dblclick', () => {
      filterPositions('all');
    });
  }
});

// Auto-refresh position data every 60 seconds (placeholder for future API integration)
// setInterval(() => {
//   console.log('Auto-refresh positions data...');
//   // Future: Fetch updated position data from API
//   // updatePortfolioDashboard();
// }, 60000);

console.log('ZenOptions Position Management initialized ✅');
