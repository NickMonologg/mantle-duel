"""Inject a synthetic EIP-1193 / EIP-6963 wallet into a Playwright page,
backed by a real private key signed in Python via web3/eth_account.

Usage:
    from injected_wallet import build_wallet_handler, INJECT_JS
    handler = build_wallet_handler(private_key, rpc_url, chain_id)
    await page.expose_function("__walletCall", handler)
    await page.add_init_script(INJECT_JS)
"""
import json
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct


def build_wallet_handler(private_key: str, rpc_url: str, chain_id: int):
    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 40}))
    acct = Account.from_key(private_key)
    addr = acct.address

    async def handler(method: str, params_json: str):
        params = json.loads(params_json) if params_json else []
        try:
            if method in ("eth_requestAccounts", "eth_accounts"):
                return [addr]
            if method == "eth_chainId":
                return hex(chain_id)
            if method == "net_version":
                return str(chain_id)
            if method in ("wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_watchAsset"):
                return None
            if method == "wallet_requestPermissions":
                return [{"parentCapability": "eth_accounts"}]
            if method == "personal_sign":
                # params: [message, address]
                msg = params[0]
                if isinstance(msg, str) and msg.startswith("0x"):
                    raw = bytes.fromhex(msg[2:])
                    signable = encode_defunct(primitive=raw)
                else:
                    signable = encode_defunct(text=msg)
                sig = Account.sign_message(signable, private_key)
                return sig.signature.hex()
            if method in ("eth_sign",):
                msg = params[1]
                raw = bytes.fromhex(msg[2:]) if msg.startswith("0x") else msg.encode()
                sig = Account.sign_message(encode_defunct(primitive=raw), private_key)
                return sig.signature.hex()
            if method in ("eth_signTypedData_v4", "eth_signTypedData"):
                from eth_account.messages import encode_typed_data
                data = params[1]
                if isinstance(data, str):
                    data = json.loads(data)
                signable = encode_typed_data(full_message=data)
                sig = Account.sign_message(signable, private_key)
                return sig.signature.hex()
            if method == "eth_sendTransaction":
                tx = params[0]
                txn = {
                    "from": addr,
                    "to": Web3.to_checksum_address(tx["to"]) if tx.get("to") else None,
                    "value": int(tx.get("value", "0x0"), 16) if isinstance(tx.get("value"), str) else int(tx.get("value", 0)),
                    "data": tx.get("data", "0x"),
                    "nonce": w3.eth.get_transaction_count(addr),
                    "chainId": chain_id,
                }
                if txn["to"] is None:
                    del txn["to"]
                try:
                    txn["gas"] = w3.eth.estimate_gas(txn)
                except Exception:
                    txn["gas"] = 2_000_000
                txn["gasPrice"] = w3.eth.gas_price
                signed = Account.sign_transaction(txn, private_key)
                h = w3.eth.send_raw_transaction(signed.raw_transaction)
                return h.hex()
            # default: proxy read calls to RPC
            res = w3.provider.make_request(method, params)
            return res.get("result")
        except Exception as e:
            return {"__error__": str(e)}

    return handler, addr


def build_inject_js(address: str, chain_id: int) -> str:
    return (
        INJECT_JS
        .replace("__ADDRESS__", address)
        .replace("__CHAINHEX__", hex(chain_id))
    )


INJECT_JS = r"""
(() => {
  const _id = '0x' + Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
  const CHAIN_HEX = '__CHAINHEX__';
  const ADDR = '__ADDRESS__';
  let _accounts = [];
  let _connected = false;
  const listeners = {};
  window.__calls = [];
  function emit(ev, payload){ if(listeners[ev]) listeners[ev].forEach(f=>{try{f(payload)}catch(e){}}); }
  async function call(method, params) {
    window.__calls.push(method);
    const r = await window.__walletCall(method, JSON.stringify(params||[]));
    if (r && typeof r === 'object' && r.__error__) throw new Error(r.__error__);
    return r;
  }
  const provider = {
    isMetaMask: true,
    isConnected: () => true,
    _metamask: { isUnlocked: async () => true },
    chainId: CHAIN_HEX,
    networkVersion: '5003',
    selectedAddress: undefined,
    async request(args) {
      const method = args.method, params = args.params;
      // Account & chain methods handled purely in JS (no Python binding needed).
      if (method === 'eth_accounts') {
        window.__calls.push(method);
        return _connected ? _accounts : [];
      }
      if (method === 'eth_requestAccounts') {
        window.__calls.push(method);
        _accounts = [ADDR]; _connected = true; provider.selectedAddress = ADDR;
        setTimeout(()=>{ emit('accountsChanged', _accounts); emit('connect', { chainId: CHAIN_HEX }); }, 0);
        return _accounts;
      }
      if (method === 'eth_chainId') { window.__calls.push(method); return CHAIN_HEX; }
      if (method === 'net_version') { return String(parseInt(CHAIN_HEX,16)); }
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_watchAsset') { return null; }
      if (method === 'wallet_requestPermissions') { return [{ parentCapability: 'eth_accounts' }]; }
      if (method === 'wallet_getPermissions') { return _connected ? [{ parentCapability: 'eth_accounts' }] : []; }
      // Everything else (signing, sendTransaction, reads) routes to Python.
      const res = await call(method, params);
      return res;
    },
    on(ev, cb){ (listeners[ev]=listeners[ev]||[]).push(cb);
      if(ev==='connect' && _accounts.length){ try{cb({chainId:CHAIN_HEX})}catch(e){} }
      return provider; },
    removeListener(ev, cb){ if(listeners[ev]) listeners[ev]=listeners[ev].filter(f=>f!==cb); return provider; },
    addListener(ev, cb){ return provider.on(ev, cb); },
    enable(){ return provider.request({method:'eth_requestAccounts'}); },
    send(m,p){ if(typeof m==='object') return provider.request(m); return provider.request({method:m, params:p}); },
    sendAsync(payload, cb){ provider.request(payload).then(r=>cb(null,{id:payload.id,jsonrpc:'2.0',result:r})).catch(e=>cb(e)); },
  };
  try { window.ethereum = provider; } catch(e){}
  // EIP-6963 announce
  const info = { uuid: _id, name: 'Injected Wallet', icon: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', rdns: 'io.viktor.injected' };
  function announce(){ window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) })); }
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();
"""
