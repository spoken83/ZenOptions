type Currency = 'USD' | 'SGD' | 'HKD';

interface CurrencyPricing {
  currency: Currency;
  symbol: string;
  regularPrice: number;
  promoPrice: number;
  discountPercent: number;
}

const CURRENCY_PRICING: Record<Currency, CurrencyPricing> = {
  USD: {
    currency: 'USD',
    symbol: '$',
    regularPrice: 20,
    promoPrice: 9,
    discountPercent: 55,
  },
  SGD: {
    currency: 'SGD',
    symbol: 'S$',
    regularPrice: 20,
    promoPrice: 9,
    discountPercent: 55,
  },
  HKD: {
    currency: 'HKD',
    symbol: 'HK$',
    regularPrice: 150,
    promoPrice: 70,
    discountPercent: 53,
  },
};

function detectUserCurrency(): Currency {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const language = navigator.language || '';
    
    if (timezone === 'Asia/Singapore' || language.includes('SG')) {
      return 'SGD';
    }
    
    if (timezone === 'Asia/Hong_Kong' || language.includes('HK')) {
      return 'HKD';
    }
    
    return 'USD';
  } catch {
    return 'USD';
  }
}

export function getPricing() {
  const currency = detectUserCurrency();
  const pricing = CURRENCY_PRICING[currency];
  
  return {
    currency: pricing.currency,
    free: {
      price: `${pricing.symbol}0`,
      period: 'forever',
    },
    pro: {
      regularPrice: `${pricing.symbol}${pricing.regularPrice}`,
      promoPrice: `${pricing.symbol}${pricing.promoPrice}`,
      period: '/month',
      discountPercent: pricing.discountPercent,
    },
  };
}

export function usePricing() {
  return getPricing();
}
