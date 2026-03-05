import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function ScannerSubnav() {
  const [location] = useLocation();

  const tabs = [
    { label: "CS & IC", fullLabel: "Credit Spread & Iron Condor", path: "/scanner/cs-ic" },
    { label: "LEAPS", fullLabel: "LEAPS", path: "/scanner/leaps" },
    { label: "Market", fullLabel: "Market Context", path: "/scanner/market-context" },
  ];

  return (
    <div className="border-b border-border bg-background sticky top-[7.5rem] z-30 overflow-x-auto">
      <div className="flex min-w-max px-4 md:px-8 gap-4 md:gap-8" data-onboarding="scanner-subnav">
        {tabs.map((tab) => {
          const isActive = location === tab.path;
          return (
            <Link key={tab.path} href={tab.path}>
              <button
                data-testid={`tab-${tab.fullLabel.toLowerCase().replace(/\s+/g, '-')}`}
                className={cn(
                  "py-2 px-1 border-b-2 text-sm transition-colors whitespace-nowrap",
                  isActive
                    ? "border-border text-foreground font-bold"
                    : "border-transparent text-muted-foreground font-medium hover:text-foreground hover:border-border"
                )}
              >
                <span className="md:hidden">{tab.label}</span>
                <span className="hidden md:inline">{tab.fullLabel}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
