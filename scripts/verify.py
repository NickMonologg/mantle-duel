import json, os, sys, time
import requests

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
dep = json.load(open(os.path.join(ROOT, "deployment.json")))
ADDR = dep["address"]
BASE = "https://explorer.sepolia.mantle.xyz"
COMPILER = "v0.8.24+commit.e11b9ed9"
SRC = open(os.path.join(ROOT, "contracts", "MantleDuel.sol")).read()

standard_input = {
    "language": "Solidity",
    "sources": {"MantleDuel.sol": {"content": SRC}},
    "settings": {
        "optimizer": {"enabled": True, "runs": 200},
        "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object", "metadata"]}},
    },
}


def via_v2():
    url = f"{BASE}/api/v2/smart-contracts/{ADDR}/verification/via/standard-input"
    files = {"files[0]": ("standard.json", json.dumps(standard_input), "application/json")}
    data = {
        "compiler_version": COMPILER,
        "license_type": "mit",
        "autodetect_constructor_args": "true",
    }
    r = requests.post(url, data=data, files=files, timeout=60)
    print("v2 status", r.status_code, r.text[:300])
    return r.status_code in (200, 201, 202)


def check():
    url = f"{BASE}/api/v2/smart-contracts/{ADDR}"
    for _ in range(20):
        time.sleep(8)
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            j = r.json()
            verified = j.get("is_verified") or j.get("is_fully_verified")
            print("verified?", verified, "name:", j.get("name"))
            if verified:
                return True
    return False


if __name__ == "__main__":
    print("Verifying", ADDR)
    via_v2()
    ok = check()
    print("RESULT:", "VERIFIED" if ok else "not yet")
