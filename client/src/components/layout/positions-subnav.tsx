import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function PositionsSubnav() {
  const [location] = useLocation();

  const tabs = [
    { label: "Open", fullLabel: "Open Positions", path: "/positions/open" },
    { label: "Pending", fullLabel: "Pending Orders", path: "/positions/pending" },
    { label: "Closed", fullLabel: "Closed Positions", path: "/positions/closed" },
  ];

  return (
    <div className="border-b border-border bg-background sticky top-[7.5rem] z-30 overflow-x-auto">
      <div className="flex min-w-max px-4 md:px-8 gap-4 md:gap-8" data-onboarding="positions-subnav">
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
