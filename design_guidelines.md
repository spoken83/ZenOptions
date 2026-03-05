# Options Trading Monitoring System - Design Guidelines

## Design Approach
**System**: Custom data-dense dashboard inspired by Bloomberg Terminal and Robinhood, prioritizing information clarity and rapid decision-making. This is an application interface focused on real-time monitoring, not a marketing page.

## Typography System
- **Primary Font**: Inter (via Google Fonts CDN)
- **Monospace Font**: JetBrains Mono (for numerical data, prices, percentages)
- **Hierarchy**:
  - H1 (Page titles): 2xl, semi-bold
  - H2 (Section headers): xl, medium
  - H3 (Card headers): lg, medium
  - Body (Descriptions): base, normal
  - Data values: base/lg, monospace, medium
  - Labels: sm, medium, uppercase tracking

## Layout System
**Spacing Primitives**: Use Tailwind units 2, 4, 6, 8, 12, 16, 24 exclusively
- Tight spacing: 2, 4 (table cells, compact data)
- Standard spacing: 6, 8 (cards, component padding)
- Section spacing: 12, 16, 24 (major layout divisions)

**Grid Structure**:
- Dashboard: 12-column grid with 6-unit gaps
- Sidebar: Fixed 64-unit width (navigation)
- Main content: Fluid with max-width constraint
- Cards: Responsive grid (1-col mobile, 2-3 cols desktop)

## Core Layout Structure

### Application Shell
**Top Navigation Bar** (h-16):
- Logo/brand (left)
- Quick stats ticker (center): Total P&L, Win Rate, Active Positions
- User profile + settings (right)
- Notification bell with count badge

**Left Sidebar** (w-64, collapsible on mobile):
- Dashboard (home icon)
- Active Positions (chart icon)
- Closed Positions (archive icon)
- Analytics (graph icon)
- Watchlist (star icon)
- Settings (gear icon)
Each item: icon + label, hover state with subtle background shift

**Main Content Area**:
- Page header with title + action buttons (Add Position, Filter, Export)
- Primary metrics cards row (4 cards: Total Portfolio Value, Today's P&L, Open Positions Count, Avg Win Rate)
- Data table section for positions
- Secondary charts/analytics section

## Component Library

### Metrics Cards
- Compact cards (p-6) with clear hierarchy
- Large numerical value (text-3xl, monospace)
- Label above (text-sm, muted)
- Trend indicator: small percentage with up/down arrow
- Subtle border on dark background

### Position Data Table
**Columns**: Symbol | Type | Strike Prices | Expiry | Days to Expiry | Entry Price | Current Price | P&L | P&L % | Status | Actions
- **Header row**: Sticky, semi-bold, text-sm uppercase
- **Data rows**: Monospace for numbers, alternating subtle background
- **Interactive rows**: Hover state reveals action buttons
- **Expandable rows**: Click to show detailed Greeks, break-even points, position legs
- **Status badges**: Pill-shaped with profit/loss indication
- **Actions column**: View Details, Edit, Close Position buttons (icon-only, tooltip on hover)

### Position Type Indicators
- Credit Spread: Distinct badge with spread icon
- Iron Condor: Different badge with IC icon
- Visual distinction through iconography, not just text

### Charts Section
- **P&L Timeline**: Line chart showing daily/weekly/monthly performance
- **Position Distribution**: Donut chart showing allocation by strategy type
- **Win/Loss Rate**: Bar chart comparing profitable vs unprofitable trades
- Use Chart.js or Recharts library (specify in implementation)

### Forms (Add/Edit Position)
- **Multi-step wizard** for complex position entry:
  - Step 1: Select strategy type
  - Step 2: Enter strike prices and quantities
  - Step 3: Set entry price and expiry
  - Step 4: Review and confirm
- **Input fields**: Dark background with lighter border, focus state with accent glow
- **Date pickers**: Calendar overlay with month navigation
- **Number inputs**: Increment/decrement controls for precise entry

### Status Indicators
- **Profit threshold badges**: Green intensity scales with profitability
- **Loss warning badges**: Red intensity scales with loss severity
- **Days to expiry**: Color-coded (green >30 days, yellow 15-30, red <15)
- **Real-time pulse**: Subtle animation on live price updates

### Action Buttons
- **Primary actions**: Solid background, medium emphasis (Add Position, Save, Confirm)
- **Secondary actions**: Outlined style (Cancel, Reset)
- **Danger actions**: Red accent (Close All, Delete)
- **Icon buttons**: For compact actions (Edit, Delete, Expand) - use Heroicons via CDN

## Data Visualization Principles
- **Numbers**: Always monospace for alignment
- **Percentages**: Include + sign for positive, parentheses convention optional
- **Currency**: $ prefix, 2 decimal precision
- **Large numbers**: Thousand separators (commas)
- **Trend arrows**: ↑ green for up, ↓ red for down
- **Greeks display**: Tooltip on hover for Delta, Gamma, Theta, Vega values

## Responsive Behavior
- **Desktop (lg+)**: Full sidebar visible, 3-column metrics, expanded table
- **Tablet (md)**: Collapsible sidebar, 2-column metrics, scrollable table
- **Mobile (sm)**: Bottom navigation, stacked metrics cards, vertical card list instead of table

## Icons
**Library**: Heroicons (via CDN)
- Outline style for navigation, toolbar icons
- Solid style for status indicators, badges
- Consistent 24px size for standard icons, 16px for inline icons

## Animations
**Minimal, purposeful only**:
- Smooth transitions on sidebar collapse (200ms)
- Fade-in for new positions added (300ms)
- Number counter animation for P&L changes (500ms ease-out)
- Pulse effect on real-time updates (subtle, 1s duration)
- NO scroll animations, NO decorative effects

## Accessibility
- High contrast ratios maintained throughout (dark bg with light text)
- Focus indicators visible on all interactive elements (2px accent outline)
- ARIA labels on all icon buttons
- Keyboard navigation for tables (arrow keys to navigate cells)
- Screen reader announcements for P&L changes

## Images
**No hero image** - this is a data application, not a marketing site. All visual communication through data visualization, charts, and interface elements.