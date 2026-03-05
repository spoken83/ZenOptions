#!/usr/bin/env python3
"""
Tiger QuoteClient Market Data Test
Fetches all available market data types from Tiger's QuoteClient and returns
a structured JSON so it can be compared with Polygon data side-by-side.

Usage:
  python3 test_market_data.py AAPL
  Called by the Node.js backend via child_process.exec
"""

import os
import sys
import json
from datetime import datetime, timedelta, timezone

def get_config():
    """Initialize Tiger API configuration from environment variables."""
    from tigeropen.tiger_open_config import TigerOpenClientConfig
    from tigeropen.common.consts import Language

    tiger_id = os.getenv('TIGER_ID', '')
    private_key_content = os.getenv('TIGER_PRIVATE_KEY', '')

    if not tiger_id or not private_key_content:
        raise ValueError("Missing TIGER_ID or TIGER_PRIVATE_KEY")

    config = TigerOpenClientConfig(sandbox_debug=False)
    config.private_key = private_key_content
    config.tiger_id = tiger_id
    config.language = Language.en_US
    return config


def test_stock_quote(quote_client, symbol):
    """
    Test: Stock quote via get_briefs()
    Polygon equivalent: GET /v2/snapshot/locale/us/markets/stocks/tickers/{symbol}
    Fields we need: price, volume, bid, ask, change%, open, close
    """
    result = {
        'available': False,
        'fields': {},
        'raw_field_names': [],
        'error': None
    }
    try:
        briefs = quote_client.get_briefs([symbol], include_ask_bid=True, include_hour_trading=False)
        if not briefs:
            result['error'] = 'Empty response from get_briefs'
            return result

        b = briefs[0]
        raw = vars(b) if hasattr(b, '__dict__') else {}
        result['raw_field_names'] = list(raw.keys())

        def get(attr):
            v = getattr(b, attr, None)
            return v if v is not None and v != '' else None

        result['fields'] = {
            'price':        get('latest_price') or get('close'),
            'open':         get('open'),
            'close':        get('close') or get('pre_close'),
            'high':         get('high'),
            'low':          get('low'),
            'volume':       get('volume'),
            'bid':          get('bid_price'),
            'ask':          get('ask_price'),
            'change':       get('change'),
            'changePct':    get('change_ratio'),
            'marketCap':    get('market_cap'),
        }
        result['available'] = result['fields']['price'] is not None
    except Exception as e:
        result['error'] = str(e)
    return result


def test_historical_data(quote_client, symbol, days=252):
    """
    Test: Historical daily OHLCV via get_bars()
    Polygon equivalent: GET /v2/aggs/ticker/{symbol}/range/1/day/{from}/{to}
    Fields we need: date, open, high, low, close, volume
    Need 252 days for SMA200 + HV21 calculation.
    Note: get_bars() returns a pandas DataFrame.
    """
    result = {
        'available': False,
        'daysRequested': days,
        'daysReturned': 0,
        'sampleBar': None,
        'raw_field_names': [],
        'error': None
    }
    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        begin_date = (datetime.now() - timedelta(days=days + 60)).strftime('%Y-%m-%d')

        df = quote_client.get_bars(
            symbols=[symbol],
            begin_time=begin_date,
            end_time=end_date,
            period='day',
            right='br',       # adjusted for splits/dividends (like Polygon's adjusted=true)
            limit=days + 10
        )

        if df is None or (hasattr(df, 'empty') and df.empty):
            result['error'] = f'No bars returned for {symbol}'
            return result

        # DataFrame has columns: symbol, time, open, high, low, close, volume, ...
        symbol_df = df[df['symbol'] == symbol] if 'symbol' in df.columns else df
        result['daysReturned'] = len(symbol_df)
        result['available'] = len(symbol_df) > 0
        result['raw_field_names'] = list(symbol_df.columns)

        if len(symbol_df) > 0:
            last = symbol_df.iloc[-1]
            result['sampleBar'] = {
                'time':   str(last.get('time', None)),
                'open':   float(last.get('open', 0)) if last.get('open') is not None else None,
                'high':   float(last.get('high', 0)) if last.get('high') is not None else None,
                'low':    float(last.get('low', 0)) if last.get('low') is not None else None,
                'close':  float(last.get('close', 0)) if last.get('close') is not None else None,
                'volume': float(last.get('volume', 0)) if last.get('volume') is not None else None,
            }
    except Exception as e:
        result['error'] = str(e)
    return result


def test_option_expiries(quote_client, symbol):
    """
    Test: Option expiry dates via get_option_expirations()
    Polygon equivalent: GET /v3/reference/options/contracts?underlying_ticker={symbol}
    Fields we need: list of expiry date strings, including dates 365+ DTE (for LEAPS scanner)
    Note: get_option_expirations() returns a pandas DataFrame with columns:
          symbol, option_symbol, date (YYYY-MM-DD), timestamp, period_tag (m/w)
    """
    result = {
        'available': False,
        'totalExpiries': 0,
        'nearestExpiry': None,
        'farthestExpiry': None,
        'hasLeapsExpiries': False,  # >= 365 DTE
        'sampleExpiries': [],
        'error': None
    }
    try:
        df = quote_client.get_option_expirations([symbol])

        if df is None or (hasattr(df, 'empty') and df.empty):
            result['error'] = f'No expiries returned for {symbol}'
            return result

        # Filter by symbol and get unique dates
        sym_df = df[df['symbol'] == symbol] if 'symbol' in df.columns else df
        date_strs = sorted(sym_df['date'].astype(str).unique().tolist())
        today_str = datetime.now().strftime('%Y-%m-%d')
        future_dates = [d for d in date_strs if d >= today_str]

        if not future_dates:
            result['error'] = 'No future expiry dates found'
            return result

        result['totalExpiries'] = len(future_dates)
        result['available'] = True
        result['nearestExpiry'] = future_dates[0]
        result['farthestExpiry'] = future_dates[-1]
        result['sampleExpiries'] = future_dates[:5]

        # Check if any expiry is 365+ days out
        one_year_out = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
        result['hasLeapsExpiries'] = any(d >= one_year_out for d in future_dates)

    except Exception as e:
        result['error'] = str(e)
    return result


def test_option_chain(quote_client, symbol, expiry_date=None):
    """
    Test: Option chain via get_option_chain()
    Polygon equivalent: GET /v3/snapshot/options/{symbol}?expiration_date={date}
    Critical fields: strike, put_call, bid_price, ask_price, volume, open_interest,
                     implied_vol, delta — last 2 are critical for scanner.
    Note: get_option_chain() returns a pandas DataFrame. Column names in SDK v3.5.4:
          identifier, symbol, expiry, strike, put_call, multiplier, ask_price, ask_size,
          volume, latest_price, pre_close, open_interest, last_timestamp,
          implied_vol, delta, gamma, theta, vega, rho, bid_price, bid_size
    """
    result = {
        'available': False,
        'expiryUsed': expiry_date,
        'totalContracts': 0,
        'callCount': 0,
        'putCount': 0,
        'greeksAvailable': False,
        'ivAvailable': False,
        'bidAskAvailable': False,
        'deltaAvailable': False,
        'sampleCall': None,
        'samplePut': None,
        'raw_field_names': [],
        'error': None
    }
    try:
        # Use provided expiry or find the nearest ~35 DTE expiry
        if not expiry_date:
            exp_df = quote_client.get_option_expirations([symbol])
            if exp_df is not None and not exp_df.empty:
                sym_df = exp_df[exp_df['symbol'] == symbol] if 'symbol' in exp_df.columns else exp_df
                today_str = datetime.now().strftime('%Y-%m-%d')
                future = sorted([d for d in sym_df['date'].astype(str).unique() if d > today_str])
                if future:
                    expiry_date = min(future, key=lambda d: abs(
                        (datetime.strptime(d, '%Y-%m-%d') - datetime.now()).days - 35
                    ))

        if not expiry_date:
            result['error'] = 'Could not determine expiry date'
            return result

        result['expiryUsed'] = expiry_date

        # return_greek_value=True ensures IV/delta/gamma/theta/vega are populated
        df = quote_client.get_option_chain(symbol, expiry=expiry_date, return_greek_value=True)

        if df is None or (hasattr(df, 'empty') and df.empty):
            result['error'] = f'Empty option chain for {symbol} {expiry_date}'
            return result

        result['raw_field_names'] = list(df.columns)
        result['totalContracts'] = len(df)
        result['available'] = len(df) > 0

        # put_call column values: 'CALL' or 'PUT'
        calls_df = df[df['put_call'].str.upper() == 'CALL'] if 'put_call' in df.columns else df.iloc[0:0]
        puts_df  = df[df['put_call'].str.upper() == 'PUT']  if 'put_call' in df.columns else df.iloc[0:0]
        result['callCount'] = len(calls_df)
        result['putCount']  = len(puts_df)

        def row_to_contract(row):
            def val(col):
                v = row.get(col)
                import math
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    return None
                return float(v) if isinstance(v, (int, float)) else str(v)
            return {
                'strike':            val('strike'),
                'right':             val('put_call'),
                'bid':               val('bid_price'),
                'ask':               val('ask_price'),
                'lastPrice':         val('latest_price'),
                'volume':            val('volume'),
                'openInterest':      val('open_interest'),
                'impliedVolatility': val('implied_vol'),
                'delta':             val('delta'),
                'gamma':             val('gamma'),
                'theta':             val('theta'),
                'vega':              val('vega'),
            }

        if len(calls_df) > 0:
            mid_idx = len(calls_df) // 2
            result['sampleCall'] = row_to_contract(calls_df.iloc[mid_idx])
        if len(puts_df) > 0:
            mid_idx = len(puts_df) // 2
            result['samplePut'] = row_to_contract(puts_df.iloc[mid_idx])

        # Assess field coverage across all contracts
        import math
        def is_populated(series):
            return series.apply(lambda v: v is not None and not (isinstance(v, float) and math.isnan(v)) and v != 0.0)

        total = len(df) or 1
        iv_populated    = is_populated(df['implied_vol']).sum()    if 'implied_vol' in df.columns else 0
        delta_populated = is_populated(df['delta']).sum()           if 'delta' in df.columns else 0
        bid_populated   = is_populated(df['bid_price']).sum()       if 'bid_price' in df.columns else 0

        result['ivAvailable']     = iv_populated / total > 0.5
        result['deltaAvailable']  = delta_populated / total > 0.5
        result['bidAskAvailable'] = bid_populated / total > 0.5
        result['greeksAvailable'] = result['ivAvailable'] and result['deltaAvailable']

        result['ivCoverage']    = round(iv_populated / total * 100)
        result['deltaCoverage'] = round(delta_populated / total * 100)
        result['bidCoverage']   = round(bid_populated / total * 100)

    except Exception as e:
        result['error'] = str(e)
    return result


def run_test(symbol):
    config = get_config()

    from tigeropen.quote.quote_client import QuoteClient
    quote_client = QuoteClient(config)

    print(f"Testing Tiger QuoteClient for symbol: {symbol}", file=sys.stderr)

    # Run all tests (continue even if one fails)
    print("  1/4 Stock quote...", file=sys.stderr)
    stock_quote = test_stock_quote(quote_client, symbol)

    print("  2/4 Historical data (252 days)...", file=sys.stderr)
    historical = test_historical_data(quote_client, symbol, days=252)

    print("  3/4 Option expiries...", file=sys.stderr)
    expiries = test_option_expiries(quote_client, symbol)

    print("  4/4 Option chain (nearest ~35 DTE)...", file=sys.stderr)
    option_chain = test_option_chain(quote_client, symbol)

    # Summary: can Tiger replace Polygon?
    can_replace_quotes    = stock_quote['available']
    can_replace_history   = historical['available'] and historical['daysReturned'] >= 220
    can_replace_expiries  = expiries['available']
    can_replace_chain     = option_chain['available'] and option_chain['bidAskAvailable']
    can_replace_greeks    = option_chain['greeksAvailable']
    has_leaps_range       = expiries.get('hasLeapsExpiries', False)

    summary = {
        'canReplaceStockQuotes':      can_replace_quotes,
        'canReplaceHistoricalData':   can_replace_history,
        'canReplaceOptionExpiries':   can_replace_expiries,
        'canReplaceOptionChain':      can_replace_chain,
        'canReplaceGreeks':           can_replace_greeks,
        'hasLeapsExpiries':           has_leaps_range,
        'canFullyReplacePolygon':     all([can_replace_quotes, can_replace_history, can_replace_expiries, can_replace_chain, can_replace_greeks, has_leaps_range]),
        'canReplaceForScannerOnly':   can_replace_chain and can_replace_greeks,
        'verdict': (
            'FULL REPLACEMENT POSSIBLE' if all([can_replace_quotes, can_replace_history, can_replace_chain, can_replace_greeks]) else
            'PARTIAL: quotes+history only (keep Polygon for options)' if (can_replace_quotes and can_replace_history and not can_replace_greeks) else
            'MINIMAL: too many gaps'
        )
    }

    return {
        'success': True,
        'symbol': symbol,
        'testedAt': datetime.now(timezone.utc).isoformat(),
        'summary': summary,
        'tests': {
            'stockQuote': stock_quote,
            'historicalData': historical,
            'optionExpiries': expiries,
            'optionChain': option_chain,
        }
    }


if __name__ == '__main__':
    symbol = sys.argv[1].upper() if len(sys.argv) > 1 else 'AAPL'
    try:
        result = run_test(symbol)
        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'symbol': symbol,
            'testedAt': datetime.now(timezone.utc).isoformat()
        }))
        sys.exit(1)
