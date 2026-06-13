import json, os, time, sys
from web3 import Web3
from eth_account import Account

RPC = "https://rpc.sepolia.mantle.xyz"
CHAIN_ID = 5003
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
wallets = json.load(open(os.path.join(ROOT, "wallets.json")))
DEPLOYER_PK = wallets["deployer"]["pk"]
DEPLOYER = wallets["deployer"]["address"]
AGENT = wallets["agent"]["address"]

abi = json.load(open(os.path.join(ROOT, "build", "MantleDuel.abi.json")))
bytecode = open(os.path.join(ROOT, "build", "MantleDuel.bin")).read().strip()

w3 = Web3(Web3.HTTPProvider(RPC))
acct = Account.from_key(DEPLOYER_PK)


def wait_for_funds(min_wei):
    while True:
        bal = w3.eth.get_balance(DEPLOYER)
        print("balance:", w3.from_wei(bal, "ether"), "MNT")
        if bal >= min_wei:
            return bal
        time.sleep(10)


def main():
    print("Deployer:", DEPLOYER, "| Agent:", AGENT)
    bal = w3.eth.get_balance(DEPLOYER)
    print("Start balance:", w3.from_wei(bal, "ether"), "MNT")
    if bal == 0:
        print("Waiting for funds...")
        wait_for_funds(w3.to_wei(0.05, "ether"))

    C = w3.eth.contract(abi=abi, bytecode=bytecode)
    tx = C.constructor(Web3.to_checksum_address(AGENT)).build_transaction({
        "from": DEPLOYER,
        "nonce": w3.eth.get_transaction_count(DEPLOYER),
        "chainId": CHAIN_ID,
        "gasPrice": w3.eth.gas_price,
    })
    try:
        tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.2)
    except Exception as e:
        print("estimate failed, using 3M:", e)
        tx["gas"] = 3_000_000
    signed = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    print("deploy tx:", h.hex())
    rcpt = w3.eth.wait_for_transaction_receipt(h, timeout=180)
    addr = rcpt.contractAddress
    print("CONTRACT:", addr, "| status:", rcpt.status, "| gasUsed:", rcpt.gasUsed)

    dep = {
        "address": addr,
        "deployer": DEPLOYER,
        "agent": AGENT,
        "chainId": CHAIN_ID,
        "rpc": RPC,
        "explorer": f"https://explorer.sepolia.mantle.xyz/address/{addr}",
        "txHash": h.hex(),
        "block": rcpt.blockNumber,
    }
    json.dump(dep, open(os.path.join(ROOT, "deployment.json"), "w"), indent=2)
    print("saved deployment.json")


if __name__ == "__main__":
    main()
