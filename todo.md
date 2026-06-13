# Mantle Duel — todo

## Done
- [x] Concept approved: Mantle Duel (Human vs AI prediction duel)
- [x] Contract MantleDuel.sol (clean head-to-head scoreboard)
- [x] Deployed Mantle Sepolia: 0x982e310De4EF2F509a5fa246CF35e991f0E98271
- [x] AI agent commits prediction + reasoning on-chain (verified working)
- [x] Frontend dapp (Viktor Space), public preview deployed
- [x] Seeded scoreboard: Humans 2 - 1 Machines (1 tie), 5 settled duels
- [x] Live 2h round open (#7) for visitors
- [x] keeper.py `tick` (idempotent: resolve due + keep one live round)
- [x] README + SUBMISSION.md + X_POST.md
- [x] Clean git repo (no secrets; wallets.json gitignored)

## In progress / blocked
- [ ] Verify contract on Blockscout — explorer was 503/down; RETRY
- [x] GitHub push DONE: https://github.com/NickMonologg/mantle-duel (full tree)
- [ ] Demo video >=2min
- [ ] DoraHacks register + Submit BUIDL (Nick) — copy ready in SUBMISSION.md
- [ ] X post (Nick) — drafts in X_POST.md
- [ ] Production deploy (after Nick approval)
- [ ] Maybe keeper cron to keep live rounds fresh during judging

## Notes
- Wallets in wallets.json (throwaway). deployer funded by Nick (2 MNT).
- Use UV_PROJECT_ENVIRONMENT=.venv for python scripts.
- Frontend: ethers v6 loaded at runtime from esm.sh (node_modules read-only).
