import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Wallet, List, TrendingUp, Search, Bell, User, Sun, Moon, LogOut, LogIn, CreditCard, Lightbulb, Menu, X, GraduationCap, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth/AuthModal";
import logoWhiteBg from "@assets/logo-whitebg__1__1763214067805.png";
import logoBlackBg from "@assets/logo-blackbg__1__1763214067805.png";

interface Alert {
  id: string;
  positionId: string;
  symbol: string;
  type: string;
  message: string;
  createdAt: string;
}

export default function MainNavigation() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const { startTutorial } = useOnboarding();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "signup">("signup");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const unreadAlerts = alerts?.length || 0;

  const navItems = [
    { path: "/watchlist", label: "Watchlist", icon: List },
    { path: "/scanner", label: "Scanner", icon: Search },
    { path: "/positions", label: "Positions", icon: TrendingUp },
    { path: "/account", label: "Account", icon: Wallet },
    { path: "/insights", label: "Insights", icon: Lightbulb },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    if (path === "/account") return location === "/account" || location.startsWith("/account/");
    return location.startsWith(path);
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-[#1e293b] sticky top-12 z-40 border-t border-border/30">
      <div className="px-4 md:px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Logo and hamburger */}
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded text-white hover:bg-white/20 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            
            {/* Logo */}
            <Link href="/">
              <button
                className="px-2 md:px-3 py-1.5 rounded transition-colors hover:bg-white/20"
                data-testid="nav-home-logo"
                onClick={handleNavClick}
              >
                <img 
                  src={logoBlackBg}
                  alt="ZenOptions" 
                  className="h-5 md:h-6 w-auto"
                  style={{ mixBlendMode: 'lighten' }}
                />
              </button>
            </Link>
            
            {/* Desktop nav items */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                
                return (
                  <Link key={item.path} href={item.path}>
                    <button
                      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded transition-colors ${
                        active 
                          ? 'bg-[rgba(16,185,129,0.15)] text-white' 
                          : 'text-white hover:bg-white/20 hover:text-white'
                      }`}
                      data-testid={`nav-${item.label.toLowerCase()}`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs">{item.label}</span>
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right side - Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Show alerts only when authenticated */}
            {isAuthenticated && (
              <Link href="/alerts">
                <button
                  className={`p-2 rounded relative transition-colors ${
                    location === "/alerts"
                      ? 'bg-[rgba(16,185,129,0.15)] text-white'
                      : 'text-white hover:bg-white/20 hover:text-white'
                  }`}
                  data-testid="nav-alerts"
                  onClick={handleNavClick}
                >
                  <Bell className="h-5 w-5" />
                  {unreadAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-semibold">
                      {unreadAlerts > 9 ? "9+" : unreadAlerts}
                    </span>
                  )}
                </button>
              </Link>
            )}

            {/* Show Sign In and Join buttons for unauthenticated users */}
            {!isAuthenticated && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-white hover:bg-white/20 shrink-0 hidden sm:flex"
                  onClick={() => {
                    setAuthModalTab("login");
                    setAuthModalOpen(true);
                  }}
                  data-testid="button-signin"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  <span>LOG IN</span>
                </Button>
                <Button 
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 text-xs sm:text-sm"
                  onClick={() => {
                    setAuthModalTab("signup");
                    setAuthModalOpen(true);
                  }}
                  data-testid="button-join-free"
                >
                  <span className="hidden sm:inline">JOIN FOR FREE</span>
                  <span className="sm:hidden">JOIN</span>
                </Button>
              </>
            )}

            {/* Show Profile dropdown for authenticated users */}
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 px-3 md:px-4 py-2 rounded bg-success text-success-foreground hover:bg-success/90 transition-colors"
                    data-testid="nav-profile"
                  >
                    <User className="h-5 w-5" />
                    <span className="text-sm font-medium hidden sm:inline">{user?.name || user?.email?.split('@')[0] || 'Profile'}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <div className="flex items-center w-full cursor-pointer" onClick={handleNavClick}>
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <div className="flex items-center w-full cursor-pointer" onClick={handleNavClick} data-testid="nav-settings">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/subscription">
                      <div className="flex items-center w-full cursor-pointer" onClick={handleNavClick}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Subscription
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={startTutorial} data-testid="button-quickstart">
                    <GraduationCap className="mr-2 h-4 w-4" />
                    Quickstart
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                    {theme === "light" ? (
                      <>
                        <Moon className="mr-2 h-4 w-4" />
                        Dark Mode
                      </>
                    ) : (
                      <>
                        <Sun className="mr-2 h-4 w-4" />
                        Light Mode
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/30 bg-[#1e293b]">
          <div className="px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              
              return (
                <Link key={item.path} href={item.path}>
                  <button
                    className={`flex items-center gap-3 w-full px-3 py-3 rounded transition-colors ${
                      active 
                        ? 'bg-[rgba(16,185,129,0.15)] text-white' 
                        : 'text-white hover:bg-white/20 hover:text-white'
                    }`}
                    data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                    onClick={handleNavClick}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                </Link>
              );
            })}
            
            {/* Mobile-only login button for unauthenticated */}
            {!isAuthenticated && (
              <button
                className="flex items-center gap-3 w-full px-3 py-3 rounded text-white hover:bg-white/20 transition-colors"
                onClick={() => {
                  setAuthModalTab("login");
                  setAuthModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                data-testid="mobile-button-signin"
              >
                <LogIn className="h-5 w-5" />
                <span className="text-sm font-medium">Log In</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      <AuthModal 
        open={authModalOpen} 
        onOpenChange={setAuthModalOpen}
        defaultTab={authModalTab}
      />
    </nav>
  );
}
