# btc-race-tideturn

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/labixiaoge/btc-race-tideturn/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/labixiaoge/btc-race-tideturn/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

TideTurn is a patient dip-buying bot for the make.fun BTC race. It trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute bars, buys only deep washed-out dips, and lets winners run on a wide trailing stop instead of snatching small bounces.

## Run it

Grade it locally on the dev window with the kit's CLI (from the kit directory):

```sh
node cli/makefun.mjs grade-local --kit . --bot <path-to-this-repo> --driver process --worktree
```

The bot runs as `node main.ts` under Node 22; it only needs the vendored SDK shim in `vendor/`.

Made for the make.fun BTC race — [make.fun](https://make.fun/?ref=j11gmnzr)

---

Entered on [make.fun](https://make.fun/?ref=j11gmnzr&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards
