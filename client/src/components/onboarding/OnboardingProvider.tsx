import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { driver, DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import WelcomeModal from "./WelcomeModal";
import QuickStartWizard from "./QuickStartWizard";

interface OnboardingContextType {
  isOnboardingActive: boolean;
  currentStep: number;
  totalSteps: number;
  startTutorial: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  nextStep: () => void;
  isCompleted: boolean;
  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}

const TUTORIAL_STEPS: DriveStep[] = [
  {
    element: '[data-onboarding="add-ticker-button"]',
    popover: {
      title: "Watchlist · Step 1: Add Ticker",
      description: "Start by adding stocks to monitor. Search by symbol (AAPL) or company name (Apple).",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-onboarding="refresh-sr-button"]',
    popover: {
      title: "Watchlist · Step 2: Auto S/R Detection",
      description: "Support and Resistance levels are auto-detected using AI. Click here to refresh levels for all tickers.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-onboarding="scanner-subnav"]',
    popover: {
      title: "Scanner · Step 3: Select Strategy",
      description: "You're now on the Scanner page! Choose your strategy:\n\n• CS & IC - Credit Spreads & Iron Condors\n• LEAPS - Long-term equity options\n• Market Context - AI market analysis",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-onboarding="scan-button"]',
    popover: {
      title: "Scanner · Step 4: Run a Scan",
      description: "Scan your watchlist for trading opportunities. The scanner finds optimal setups based on your selected strategy.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-onboarding="scan-results"]',
    popover: {
      title: "Scanner · Step 5: Scan Results",
      description: "Your scan results appear here. 'Ready to Trade' shows opportunities that meet all criteria. Click any card to add it as a position!",
      side: "top",
      align: "center",
    },
  },
  {
    element: '[data-onboarding="positions-subnav"]',
    popover: {
      title: "Positions · Step 6: Manage Positions",
      description: "You're now on the Positions page! Navigate between:\n\n• Open - Active positions being monitored\n• Pending - Orders waiting to be filled\n• Closed - Historical trades and P/L",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-onboarding="add-position-button"]',
    popover: {
      title: "Positions · Step 7: Add Position",
      description: "Add positions manually here, or click directly on scan results to capture trades.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-onboarding="zenstatus"]',
    popover: {
      title: "Positions · Step 8: Portfolio Status",
      description: "ZenStatus tells you exactly what to do:\n\n• On Track - Position healthy\n• Take Profit - Consider closing\n• Monitor - Keep watching\n• Action - Review now",
      side: "top",
      align: "center",
    },
  },
  {
    popover: {
      title: "You're All Set!",
      description: "You've completed the Quickstart!\n\nYour Zen Options workflow:\n1. Add tickers to your Watchlist\n2. Scan for opportunities\n3. Track positions with ZenStatus guidance\n\nNeed help later? Find 'Quickstart' in your profile menu.\n\nHappy trading!",
      align: "center",
    },
  },
];

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export default function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const currentStepRef = useRef(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [driverInstance, setDriverInstance] = useState<ReturnType<typeof driver> | null>(null);
  const hasBeenDismissedRef = useRef(false);

  const { data: settings } = useQuery<{ key: string; value: string }[]>({
    queryKey: ["/api/settings"],
    enabled: isAuthenticated,
  });

  const onboardingCompleted = settings?.find(s => s.key === "onboarding_completed")?.value === "true";
  const savedStep = parseInt(settings?.find(s => s.key === "onboarding_step")?.value || "0", 10);

  useEffect(() => {
    if (isAuthenticated && settings && !onboardingCompleted && !showWelcome && !isOnboardingActive && !hasBeenDismissedRef.current) {
      setShowWelcome(true);
    }
  }, [isAuthenticated, settings, onboardingCompleted, showWelcome, isOnboardingActive]);

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("POST", "/api/settings", { key, value });
      if (!response.ok) throw new Error("Failed to update setting");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const startTutorial = useCallback(() => {
    setShowWelcome(false);
    setIsOnboardingActive(true);
    
    if (location !== "/watchlist") {
      setLocation("/watchlist");
    }
    
    setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        steps: TUTORIAL_STEPS,
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Let's Go! 🚀",
        progressText: "{{current}} of {{total}}",
        popoverClass: "onboarding-popover",
        allowClose: true,
        overlayOpacity: 0.25,
        stagePadding: 15,
        stageRadius: 8,
        onHighlightStarted: (element, step) => {
          const stepIndex = TUTORIAL_STEPS.findIndex(s => s === step);
          setCurrentStep(stepIndex);
          currentStepRef.current = stepIndex;
          updateSettingMutation.mutate({ key: "onboarding_step", value: String(stepIndex) });
        },
        onNextClick: (element, step, opts) => {
          const rawActiveIndex = driverObj.getActiveIndex();
          const activeIndex = rawActiveIndex ?? -1;
          console.log("[Onboarding] Next clicked, activeIndex:", activeIndex);
          
          if (activeIndex === 1) {
            // After step 2 (Auto S/R) → navigate to Scanner for step 3 (Select Strategy)
            console.log("[Onboarding] Navigating to /scanner/cs-ic");
            window.history.pushState({}, "", "/scanner/cs-ic");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const subnav = document.querySelector('[data-onboarding="scanner-subnav"]');
              if (subnav) {
                driverObj.moveNext();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              } else {
                driverObj.moveNext();
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else if (activeIndex === 4) {
            // After step 5 (Scan Results, index 4) → navigate to Positions for step 6 (Manage Positions)
            console.log("[Onboarding] Navigating to /positions");
            window.history.pushState({}, "", "/positions");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const subnav = document.querySelector('[data-onboarding="positions-subnav"]');
              if (subnav) {
                driverObj.moveNext();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              } else {
                driverObj.moveNext();
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else {
            driverObj.moveNext();
          }
        },
        onPrevClick: (element, step, opts) => {
          const activeIndex = driverObj.getActiveIndex() ?? 0;
          console.log("[Onboarding] Prev clicked, activeIndex:", activeIndex);
          
          if (activeIndex === 2) {
            // Going back from step 3 (Scanner subnav) → go to Watchlist for step 2
            console.log("[Onboarding] Going back to /watchlist");
            window.history.pushState({}, "", "/watchlist");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const srButton = document.querySelector('[data-onboarding="refresh-sr-button"]');
              if (srButton) {
                driverObj.movePrevious();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else if (activeIndex === 5) {
            // Going back from step 6 (Positions subnav, index 5) → go to Scanner for step 5
            console.log("[Onboarding] Going back to /scanner/cs-ic");
            window.history.pushState({}, "", "/scanner/cs-ic");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const scanResults = document.querySelector('[data-onboarding="scan-results"]');
              if (scanResults) {
                driverObj.movePrevious();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else {
            driverObj.movePrevious();
          }
        },
        onDestroyStarted: () => {
          hasBeenDismissedRef.current = true;
          setIsOnboardingActive(false);
          updateSettingMutation.mutate({ key: "onboarding_completed", value: "true" });
          driverObj.destroy();
        },
      });
      
      setDriverInstance(driverObj);
      driverObj.drive();
    }, 500);
  }, [location, setLocation, updateSettingMutation]);

  const skipTutorial = useCallback(() => {
    hasBeenDismissedRef.current = true;
    setShowWelcome(false);
    setIsOnboardingActive(false);
    updateSettingMutation.mutate({ key: "onboarding_completed", value: "true" });
    if (driverInstance) {
      driverInstance.destroy();
    }
  }, [updateSettingMutation, driverInstance]);

  const completeTutorial = useCallback(() => {
    hasBeenDismissedRef.current = true;
    setIsOnboardingActive(false);
    updateSettingMutation.mutate({ key: "onboarding_completed", value: "true" });
    if (driverInstance) {
      driverInstance.destroy();
    }
  }, [updateSettingMutation, driverInstance]);

  const nextStep = useCallback(() => {
    if (driverInstance) {
      driverInstance.moveNext();
    }
  }, [driverInstance]);

  const restartTutorial = useCallback(() => {
    hasBeenDismissedRef.current = false;
    updateSettingMutation.mutate({ key: "onboarding_completed", value: "false" });
    updateSettingMutation.mutate({ key: "onboarding_step", value: "0" });
    setCurrentStep(0);
    setShowWelcome(true);
  }, [updateSettingMutation]);

  const resumeTutorial = useCallback(() => {
    setShowWelcome(false);
    setIsOnboardingActive(true);
    
    // Determine the correct starting page based on savedStep
    const stepToPage: Record<number, string> = {
      0: "/watchlist",
      1: "/watchlist",
      2: "/scanner/cs-ic",
      3: "/scanner/cs-ic",
      4: "/scanner/cs-ic",
      5: "/positions",
      6: "/positions",
      7: "/positions",
      8: "/positions",
    };
    
    const targetPage = stepToPage[savedStep] || "/watchlist";
    if (location !== targetPage) {
      window.history.pushState({}, "", targetPage);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    
    setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        steps: TUTORIAL_STEPS,
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Let's Go! 🚀",
        progressText: "{{current}} of {{total}}",
        popoverClass: "onboarding-popover",
        allowClose: true,
        overlayOpacity: 0.25,
        stagePadding: 15,
        stageRadius: 8,
        onHighlightStarted: (element, step) => {
          const stepIndex = TUTORIAL_STEPS.findIndex(s => s === step);
          setCurrentStep(stepIndex);
          currentStepRef.current = stepIndex;
          updateSettingMutation.mutate({ key: "onboarding_step", value: String(stepIndex) });
        },
        onNextClick: (element, step, opts) => {
          const rawActiveIndex = driverObj.getActiveIndex();
          const activeIndex = rawActiveIndex ?? -1;
          
          if (activeIndex === 1) {
            window.history.pushState({}, "", "/scanner/cs-ic");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const subnav = document.querySelector('[data-onboarding="scanner-subnav"]');
              if (subnav) {
                driverObj.moveNext();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              } else {
                driverObj.moveNext();
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else if (activeIndex === 4) {
            window.history.pushState({}, "", "/positions");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const subnav = document.querySelector('[data-onboarding="positions-subnav"]');
              if (subnav) {
                driverObj.moveNext();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              } else {
                driverObj.moveNext();
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else {
            driverObj.moveNext();
          }
        },
        onPrevClick: (element, step, opts) => {
          const activeIndex = driverObj.getActiveIndex() ?? 0;
          
          if (activeIndex === 2) {
            window.history.pushState({}, "", "/watchlist");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const srButton = document.querySelector('[data-onboarding="refresh-sr-button"]');
              if (srButton) {
                driverObj.movePrevious();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else if (activeIndex === 5) {
            window.history.pushState({}, "", "/scanner/cs-ic");
            window.dispatchEvent(new PopStateEvent("popstate"));
            const waitForElement = (attempts = 0) => {
              const scanResults = document.querySelector('[data-onboarding="scan-results"]');
              if (scanResults) {
                driverObj.movePrevious();
              } else if (attempts < 50) {
                setTimeout(() => waitForElement(attempts + 1), 100);
              }
            };
            setTimeout(() => waitForElement(), 500);
          } else {
            driverObj.movePrevious();
          }
        },
        onDestroyStarted: () => {
          hasBeenDismissedRef.current = true;
          setIsOnboardingActive(false);
          updateSettingMutation.mutate({ key: "onboarding_completed", value: "true" });
          driverObj.destroy();
        },
      });
      
      setDriverInstance(driverObj);
      // Resume from saved step
      driverObj.drive(savedStep);
    }, 500);
  }, [location, savedStep, updateSettingMutation]);

  const value: OnboardingContextType = {
    isOnboardingActive,
    currentStep,
    totalSteps: TUTORIAL_STEPS.length,
    startTutorial: restartTutorial,
    skipTutorial,
    completeTutorial,
    nextStep,
    isCompleted: onboardingCompleted || false,
    showWelcome,
    setShowWelcome,
  };

  const startQuickStart = useCallback(() => {
    setShowWelcome(false);
    setShowQuickStart(true);
  }, []);

  const completeQuickStart = useCallback(() => {
    hasBeenDismissedRef.current = true;
    setShowQuickStart(false);
    updateSettingMutation.mutate({ key: "onboarding_completed", value: "true" });
  }, [updateSettingMutation]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <WelcomeModal
        open={showWelcome}
        onOpenChange={setShowWelcome}
        onStartTutorial={startQuickStart}
        onResumeTutorial={startQuickStart}
        onSkip={skipTutorial}
        savedStep={savedStep}
      />
      <QuickStartWizard
        open={showQuickStart}
        onOpenChange={setShowQuickStart}
        onComplete={completeQuickStart}
      />
    </OnboardingContext.Provider>
  );
}
