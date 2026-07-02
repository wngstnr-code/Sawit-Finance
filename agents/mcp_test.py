#!/usr/bin/env python3
"""Quick self-test for the Sawit Finance MCP server — calls each tool directly to verify the integration."""
import json

import mcp_server as m

def show(title, value):
    print(f"\n=== {title} ===")
    print(json.dumps(value, indent=2, default=str))

if __name__ == "__main__":
    ah = m._account_hash(
        "0202111d3b480feaea33ce6839d087d9f685a3348fba27008221f52dfe2034656adc"
    )
    expected = "e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe"
    print(f"account_hash check: {'OK' if ah == expected else 'MISMATCH'} ({ah})")

    show("get_protocol_state", m.get_protocol_state())
    show("get_oracle_reputation", m.get_oracle_reputation())
    show("get_contracts", m.get_contracts())
    show("get_economic_loop", m.get_economic_loop())
    show("get_palm_oil_price (live FRED)", m.get_palm_oil_price())

    print("\n✅ All MCP tools returned data.")
