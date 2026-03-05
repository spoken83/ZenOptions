import { useQuery } from "@tanstack/react-query";

interface MarketTickerData {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

function TickerContent({ marketData, getChangeColor }: { 
  marketData: MarketTickerData[] | undefined; 
  getChangeColor: (changePercent: number | null) => string;
}) {
  if (!marketData) {
    return <div className="text-gray-400">Loading market data...</div>;
  }

  return (
    <>
      {marketData.map((ticker, index) => (
        <div key={ticker.symbol} className="flex items-center gap-6 shrink-0">
          <div
            className={`flex items-center gap-2 ${ticker.symbol === 'VIX' ? 'text-white' : getChangeColor(ticker.changePercent)}`}
            data-testid={`ticker-${ticker.symbol}`}
          >
            <span className="font-normal">
              {ticker.symbol}
            </span>
            {ticker.symbol === 'VIX' ? (
              <span className="font-bold">
                {ticker.price ? ticker.price.toFixed(2) : "—"}
              </span>
            ) : (
              <span className="font-bold">
                {ticker.price ? `$${ticker.price.toFixed(2)}` : "—"}
                {ticker.changePercent !== null && (
                  <span className="ml-1 text-xs">
                    ({ticker.changePercent >= 0 ? "+" : ""}{ticker.changePercent.toFixed(2)}%)
                  </span>
                )}
              </span>
            )}
          </div>
          {index < (marketData?.length || 0) - 1 && (
            <div className="h-4 w-px bg-gray-700" />
          )}
        </div>
      ))}
    </>
  );
}

export default function MarketTicker() {
  const { data: marketData } = useQuery<MarketTickerData[]>({
    queryKey: ["/api/market-ticker"],
    refetchInterval: 60000,
  });

  const getChangeColor = (changePercent: number | null) => {
    if (changePercent === null) return "text-gray-400";
    if (changePercent > 0) return "text-green-500";
    if (changePercent < 0) return "text-red-500";
    return "text-gray-400";
  };

  return (
    <div className="bg-[#1e293b] h-12 sticky top-0 z-50 flex items-center border-b border-border/30 overflow-hidden">
      {/* Desktop: Static display */}
      <div className="hidden md:flex items-center gap-6 text-sm px-6">
        <TickerContent marketData={marketData} getChangeColor={getChangeColor} />
      </div>
      
      {/* Mobile: Scrolling ticker */}
      <div className="md:hidden flex items-center w-full overflow-hidden">
        <div className="flex items-center gap-6 text-sm animate-ticker whitespace-nowrap">
          <TickerContent marketData={marketData} getChangeColor={getChangeColor} />
          {/* Duplicate for seamless loop */}
          <div className="h-4 w-px bg-gray-700 shrink-0" />
          <TickerContent marketData={marketData} getChangeColor={getChangeColor} />
        </div>
      </div>
    </div>
  );
}
