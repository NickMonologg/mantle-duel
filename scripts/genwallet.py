from eth_account import Account
import secrets, json, os
Account.enable_unaudited_hdwallet_features()
# Deployer/keeper wallet
pk1 = "0x" + secrets.token_hex(32)
a1 = Account.from_key(pk1)
# AI agent wallet (separate identity for "AI" on-chain)
pk2 = "0x" + secrets.token_hex(32)
a2 = Account.from_key(pk2)
data = {"deployer": {"address": a1.address, "pk": pk1},
        "agent": {"address": a2.address, "pk": pk2}}
path = os.path.join(os.path.dirname(__file__), "..", "wallets.json")
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("Deployer:", a1.address)
print("Agent:   ", a2.address)
