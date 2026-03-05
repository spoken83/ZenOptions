#!/usr/bin/env python3
"""
Tiger Brokers Position Fetcher
Fetches open and closed positions from Tiger Brokers API and outputs as JSON
"""

import os
import sys
import json
from datetime import datetime
from tigeropen.common.consts import Language, Market, Currency
from tigeropen.quote.quote_client import QuoteClient
from tigeropen.trade.trade_client import TradeClient
from tigeropen.tiger_open_config import TigerOpenClientConfig
from tigeropen.common.util.signature_utils import read_private_key

def get_config():
    """Initialize Tiger API configuration from environment variables"""
    try:
        tiger_id = os.getenv('TIGER_ID', '')
        account = os.getenv('TIGER_ACCOUNT', '')
        private_key_content = os.getenv('TIGER_PRIVATE_KEY', '')
        
        if not tiger_id or not account or not private_key_content:
            raise ValueError("Missing required Tiger API credentials: TIGER_ID, TIGER_ACCOUNT, TIGER_PRIVATE_KEY")
        
        # Create config
        config = TigerOpenClientConfig(sandbox_debug=False)
        config.private_key = private_key_content
        config.tiger_id = tiger_id
        config.account = account
        config.language = Language.en_US
        
        return config
    except Exception as e:
        return {"error": f"Configuration error: {str(e)}"}

def fetch_positions():
    """Fetch all positions (open and closed) from Tiger Brokers"""
    try:
        config = get_config()
        
        # Check if config is an error dict
        if isinstance(config, dict) and 'error' in config:
            return config
        
        print("=" * 80, file=sys.stderr)
        print("TIGER API DEBUG LOG", file=sys.stderr)
        print("=" * 80, file=sys.stderr)
        print(f"Account: {config.account}", file=sys.stderr)
        print(f"Tiger ID: {config.tiger_id}", file=sys.stderr)
        print("=" * 80, file=sys.stderr)
        
        # Initialize trade client
        trade_client = TradeClient(config)
        
        # Fetch OPTION positions (OPT)
        print("\n📞 Calling: trade_client.get_positions(sec_type='OPT')", file=sys.stderr)
        options_response = trade_client.get_positions(account=config.account, sec_type='OPT')
        print(f"✅ Options response: {len(options_response) if options_response else 0} positions", file=sys.stderr)
        if options_response and len(options_response) > 0:
            print(f"   First option position: {options_response[0]}", file=sys.stderr)
        
        # Fetch STOCK positions (STK)
        print("\n📞 Calling: trade_client.get_positions(sec_type='STK')", file=sys.stderr)
        stocks_response = trade_client.get_positions(account=config.account, sec_type='STK')
        print(f"✅ Stocks response: {len(stocks_response) if stocks_response else 0} positions", file=sys.stderr)
        if stocks_response and len(stocks_response) > 0:
            print(f"   First stock position: {stocks_response[0]}", file=sys.stderr)
        
        # Combine both
        positions_response = (options_response or []) + (stocks_response or [])
        print(f"\n✅ Total positions: {len(positions_response)}", file=sys.stderr)
        
        print(f"\n📞 Calling: trade_client.get_assets()", file=sys.stderr)
        # Fetch assets for account info
        assets_response = trade_client.get_assets(account=config.account)
        print(f"✅ Assets response: {assets_response}", file=sys.stderr)
        if hasattr(assets_response, 'summary'):
            print(f"   Net liquidation: {assets_response.summary.net_liquidation}", file=sys.stderr)
        
        # Process positions
        positions = []
        if positions_response and isinstance(positions_response, list):
            for pos in positions_response:
                position_data = {
                    'symbol': pos.contract.symbol if hasattr(pos, 'contract') else '',
                    'secType': pos.contract.sec_type if hasattr(pos, 'contract') else '',
                    'quantity': pos.quantity if hasattr(pos, 'quantity') else 0,
                    'averageCost': pos.average_cost if hasattr(pos, 'average_cost') else 0,
                    'marketValue': pos.market_value if hasattr(pos, 'market_value') else 0,
                    'unrealizedPL': pos.unrealized_pnl if hasattr(pos, 'unrealized_pnl') else 0,
                    'realizedPL': pos.realized_pnl if hasattr(pos, 'realized_pnl') else 0,
                }
                
                # Add option-specific fields if it's an option
                if hasattr(pos, 'contract') and hasattr(pos.contract, 'strike'):
                    position_data['strike'] = pos.contract.strike
                    position_data['expiry'] = pos.contract.expiry if hasattr(pos.contract, 'expiry') else ''
                    position_data['right'] = pos.contract.right if hasattr(pos.contract, 'right') else ''
                
                positions.append(position_data)
        
        # Get filled orders for closed positions
        # Note: Tiger API doesn't have a direct "closed positions" endpoint
        # We get this from filled orders history
        filled_orders = []
        try:
            orders_response = trade_client.get_filled_orders(account=config.account, start_time=0)
            if orders_response and hasattr(orders_response, 'items'):
                for order in orders_response.items:
                    order_data = {
                        'orderId': order.id if hasattr(order, 'id') else '',
                        'symbol': order.contract.symbol if hasattr(order, 'contract') else '',
                        'secType': order.contract.sec_type if hasattr(order, 'contract') else '',
                        'action': order.action if hasattr(order, 'action') else '',
                        'quantity': order.quantity if hasattr(order, 'quantity') else 0,
                        'filledQuantity': order.filled if hasattr(order, 'filled') else 0,
                        'avgFillPrice': order.avg_fill_price if hasattr(order, 'avg_fill_price') else 0,
                        'orderTime': order.order_time if hasattr(order, 'order_time') else 0,
                        'filledTime': order.trade_time if hasattr(order, 'trade_time') else 0,
                    }
                    
                    # Add option-specific fields
                    if hasattr(order, 'contract') and hasattr(order.contract, 'strike'):
                        order_data['strike'] = order.contract.strike
                        order_data['expiry'] = order.contract.expiry if hasattr(order.contract, 'expiry') else ''
                        order_data['right'] = order.contract.right if hasattr(order.contract, 'right') else ''
                    
                    filled_orders.append(order_data)
        except Exception as e:
            # If we can't fetch orders, continue with just positions
            pass
        
        # Extract account information
        account_info = {}
        if assets_response:
            # assets_response is a list of PortfolioAccount objects, get the first one
            account_data = assets_response[0] if isinstance(assets_response, list) and len(assets_response) > 0 else assets_response
            if hasattr(account_data, 'summary'):
                summary = account_data.summary
                account_info = {
                    'cashBalance': summary.cash if hasattr(summary, 'cash') else 0,
                    'totalValue': summary.net_liquidation if hasattr(summary, 'net_liquidation') else 0,
                    'buyingPower': summary.buying_power if hasattr(summary, 'buying_power') else 0,
                    'accountType': 'Margin' if hasattr(summary, 'margin_loan') and summary.margin_loan else 'Cash'
                }
        
        # Build result
        # Extract accountValue from the first account in the list
        account_value = 0
        if assets_response:
            account_data = assets_response[0] if isinstance(assets_response, list) and len(assets_response) > 0 else assets_response
            if hasattr(account_data, 'summary') and hasattr(account_data.summary, 'net_liquidation'):
                account_value = account_data.summary.net_liquidation
        
        result = {
            'success': True,
            'timestamp': datetime.utcnow().isoformat(),
            'account': config.account,
            'positions': positions,
            'filledOrders': filled_orders,
            'accountValue': account_value,
            'accountInfo': account_info
        }
        
        return result
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }

if __name__ == '__main__':
    result = fetch_positions()
    print(json.dumps(result, indent=2))
    
    # Exit with error code if failed
    if isinstance(result, dict) and not result.get('success', False):
        sys.exit(1)
