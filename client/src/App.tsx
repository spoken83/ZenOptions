import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import OnboardingProvider from "@/components/onboarding/OnboardingProvider";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import HomeV2 from "@/pages/home-v2";
import Insights from "@/pages/insights";
import Dashboard from "@/pages/dashboard";
import Watchlist from "@/pages/watchlist";
import Scanner from "@/pages/scanner";
import PositionsOpen from "@/pages/positions-open";
import PositionsPending from "@/pages/positions-pending";
import PositionsClosed from "@/pages/positions-closed";
import Alerts from "@/pages/alerts";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import Subscription from "@/pages/subscription";
import Pricing from "@/pages/pricing";
import Contact from "@/pages/contact";
import HowItWorks from "@/pages/how-it-works";
import Legal from "@/pages/legal";
import Resources from "@/pages/resources";
import Admin from "@/pages/admin";
import TigerTest from "@/pages/tiger-test";
import MarketTicker from "@/components/layout/market-ticker";
import MainNavigation from "@/components/layout/main-navigation";
import Footer from "@/components/layout/footer";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { isPreLoginMode } = useAuth();
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MarketTicker />
      <MainNavigation />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={HomeV2} />
          <Route path="/landing-old" component={Home} />
          <Route path="/insights" component={Insights} />
          <Route path="/account" component={Dashboard} />
          <Route path="/watchlist" component={Watchlist} />
          <Route path="/scanner/market-context" component={Scanner} />
          <Route path="/scanner/cs-ic" component={Scanner} />
          <Route path="/scanner/leaps" component={Scanner} />
          <Route path="/scanner">
            {() => <Redirect to="/scanner/cs-ic" />}
          </Route>
          <Route path="/positions/open" component={PositionsOpen} />
          <Route path="/positions/pending" component={PositionsPending} />
          <Route path="/positions/closed" component={PositionsClosed} />
          <Route path="/positions">
            {() => <Redirect to="/positions/open" />}
          </Route>
          <Route path="/alerts" component={Alerts} />
          <Route path="/contact" component={Contact} />
          <Route path="/how-it-works" component={HowItWorks} />
          <Route path="/legal" component={Legal} />
          <Route path="/resources" component={Resources} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/profile">
            {() => (
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            )}
          </Route>
          <Route path="/settings">
            {() => (
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            )}
          </Route>
          <Route path="/subscription">
            {() => (
              <ProtectedRoute>
                <Subscription />
              </ProtectedRoute>
            )}
          </Route>
          <Route path="/admin" component={Admin} />
          <Route path="/dev/tiger-test" component={TigerTest} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <AuthModalProvider>
          <OnboardingProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </OnboardingProvider>
        </AuthModalProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
