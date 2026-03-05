import { Link, useLocation } from "wouter";
import { Home, List, Radar, Briefcase, Bell, Settings as SettingsIcon, User, Sun, Moon, ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";

// Custom Scanner Icon Component
const ScannerIcon = ({ size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Square outline */}
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    {/* Horizontal line in center */}
    <line x1="3" y1="12" x2="21" y2="12" />
    {/* Corner brackets */}
    <path d="M3 3h6v6" />
    <path d="M21 3h-6v6" />
    <path d="M3 21h6v-6" />
    <path d="M21 21h-6v-6" />
  </svg>
);

// Custom Positions Icon Component - Trading Market Trendlines
const PositionsIcon = ({ size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Chart area background */}
    <rect x="2" y="4" width="20" height="16" rx="1" fill="none" />
    {/* Trendline 1 - upward trend */}
    <path d="M4 16 L8 12 L12 14 L16 8 L20 10" stroke="currentColor" strokeWidth="1.5" />
    {/* Trendline 2 - downward trend */}
    <path d="M4 8 L8 10 L12 6 L16 12 L20 8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,2" />
    {/* Data points */}
    <circle cx="8" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="14" r="1.5" fill="currentColor" />
    <circle cx="16" cy="8" r="1.5" fill="currentColor" />
  </svg>
);
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { useSidebar } from "@/contexts/sidebar-context";
import { useAuth } from "@/hooks/useAuth";
import type { Stats } from "@/lib/types";
import type { Alert } from "@shared/schema";

export default function Sidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { user } = useAuth();
  
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
  });

  const navItems = [
    { path: "/", icon: Home, label: "ZenOptions" },
    { path: "/watchlist", icon: List, label: "Watchlist" },
    { path: "/scanner", icon: ScannerIcon, label: "Scanner" },
    { path: "/positions", icon: PositionsIcon, label: "Positions" },
    { path: "/settings", icon: SettingsIcon, label: "Account" },
    { path: "/insights", icon: Lightbulb, label: "Insights" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-card border-r border-border fixed left-0 top-0 h-screen overflow-y-auto transition-all duration-300 ease-in-out z-[100]`}>
      <div className="p-6 relative">
        {/* Logo/Brand */}
        <div className={`flex items-center gap-3 mb-8 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Radar className="text-primary-foreground" size={24} />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">Zen Options</h1>
              <p className="text-xs text-muted-foreground">Credit Spread Trading</p>
            </div>
          )}
        </div>
        
        {/* Toggle Button on Right Edge */}
        <button
          onClick={toggleSidebar}
          className="fixed top-6 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center hover:bg-secondary transition-colors z-[9999]"
          style={{ left: isCollapsed ? '54px' : '246px' }}
          data-testid="sidebar-toggle"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
        
        {/* Navigation */}
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.path} href={item.path}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors relative cursor-pointer ${
                  isActive(item.path)
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                } ${isCollapsed ? 'justify-center' : ''}`}
                data-testid={`nav-${item.label.toLowerCase()}`}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon size={20} className="flex-shrink-0" />
                {!isCollapsed && <span className="text-sm">{item.label}</span>}
              </div>
            </Link>
          ))}
        </nav>
      </div>
      
      {/* User Profile & Theme Toggle */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card">
        {!isCollapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
              <User className="text-muted-foreground" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || user?.email?.split('@')[0] || 'Trader'}</p>
              <p className="text-xs text-muted-foreground truncate">SGT Timezone</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="flex justify-center mb-3">
            <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
              <User className="text-muted-foreground" size={20} />
            </div>
          </div>
        )}
        <button
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
          data-testid="button-theme-toggle"
          title={isCollapsed ? (theme === "light" ? "Dark Mode" : "Light Mode") : undefined}
        >
          {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          {!isCollapsed && <span className="text-sm">{theme === "light" ? "Dark Mode" : "Light Mode"}</span>}
        </button>
      </div>
    </aside>
  );
}
