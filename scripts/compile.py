import json, os, solcx
HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "..", "contracts", "MantleDuel.sol")
OUT = os.path.join(HERE, "..", "build")
os.makedirs(OUT, exist_ok=True)
VER = "0.8.24"
try:
    solcx.set_solc_version(VER)
except Exception:
    solcx.install_solc(VER)
    solcx.set_solc_version(VER)
src = open(SRC).read()
compiled = solcx.compile_standard({
    "language": "Solidity",
    "sources": {"MantleDuel.sol": {"content": src}},
    "settings": {
        "optimizer": {"enabled": True, "runs": 200},
        "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object", "metadata"]}},
    },
}, solc_version=VER)
c = compiled["contracts"]["MantleDuel.sol"]["MantleDuel"]
abi = c["abi"]
bytecode = c["evm"]["bytecode"]["object"]
json.dump(abi, open(os.path.join(OUT, "MantleDuel.abi.json"), "w"), indent=2)
open(os.path.join(OUT, "MantleDuel.bin"), "w").write(bytecode)
open(os.path.join(OUT, "MantleDuel.metadata.json"), "w").write(c["metadata"])
print("Compiled OK. solc", VER)
print("ABI entries:", len(abi), "| bytecode bytes:", len(bytecode)//2)
