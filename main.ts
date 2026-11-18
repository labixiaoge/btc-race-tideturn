// TideTurn: a patient dip buyer for the make.fun BTC race (CBBTC/USDC, 1-minute bars).
//
// The dev window is a falling, choppy market: every house baseline loses money on
// it, and so does any bot that buys every dip or chases every bounce. A round trip
// costs about 32 bps in fees, slippage and price impact, so a trade has to catch a
// move well over that to be worth taking. TideTurn therefore trades rarely and only
// on deep, washed-out dips, then lets the position run with a wide trailing stop
// instead of snatching small bounces.
//
// Rules, in plain words:
//  - Warm-up: no trading before 120 bars of history exist. The first two hours of
//    the window hold the sharpest waterfall; the bot watches them, it does not trade
//    them. No new entries after bar 1200 either: a position opened that late has no
//    room to mature before the window ends.
//  - Entry (flat only): the last 60 closes give a z-score of -2.0 or below, the
//    latest close sits within 0.3% of the 60-bar low, and the 60-bar high-to-low
//    range is at least 0.8% (a real dip, not a shallow drift). Buy with 100% of cash.
//  - Exit (holding): a ratchet trailing stop — the stop is the higher of entry
//    x 0.988 (hard stop, 1.2% below entry) and the highest close since entry
//    x 0.99 (1.0% trail). While the position is still underwater the trail is the
//    hard stop alone, so a dip that keeps dipping cannot drag the stop down with it.
//    Also exit on a +2.5% profit target, or after 600 bars held, whichever comes
//    first. The whole position is sold in one order.
//  - Long only, at most one open position, fully deterministic: every decision is a
//    pure function of the bars seen so far. No clock, no environment, no randomness.
//
// Note on prices: entry and exit levels are anchored to the close of the bar the
// decision is made on. The fill itself happens at the next bar's open, a minute
// later; the thresholds (1.2% stop, 1.0% trail, 2.5% target) are wide enough that
// one bar of drift, typically under 0.1%, does not change any decision.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// How many closes the z-score and the dip range are computed over.
const WINDOW = 60;
// Bars of history required before the first trade, and the last bar on which a
// new position may be opened.
const MIN_HISTORY = 120;
const LAST_ENTRY_BAR = 1200;
// Entry: z-score at or below this, close within AT_LOW of the window low, and the
// window high-to-low range at least MIN_DIP.
const ENTRY_Z = -2.0;
const MIN_DIP = 0.008; // 0.8%
const AT_LOW = 0.003; // 0.3%
// Exit: hard stop below entry, trailing stop below the peak since entry, profit
// target above entry, and the longest a position is held.
const HARD_STOP = 0.012; // 1.2%
const TRAIL = 0.01; // 1.0%
const TARGET = 0.025; // 2.5%
const TIME_STOP = 600;
const MAX_SLIPPAGE_BPS = 200;

// Closes seen so far, oldest first (raw price units, as numbers; ratios are what
// matter, and raw units are far below 2^53). Only the last 240 are kept.
const closes: number[] = [];
// Batches answered so far, counted from 0.
let barIndex = 0;
// Close at which the current position was opened (null when flat), the bar it was
// opened on, and the highest close since it was opened.
let entryClose: number | null = null;
let entryBar = -1;
let peakSinceEntry = 0;

// Mean and population standard deviation of the last WINDOW closes, and the
// z-score of the latest close. Null until WINDOW closes exist.
function zScore(): number | null {
  if (closes.length < WINDOW) return null;
  const win = closes.slice(closes.length - WINDOW);
  let sum = 0;
  for (const c of win) sum += c;
  const mean = sum / WINDOW;
  let sq = 0;
  for (const c of win) {
    const d = c - mean;
    sq += d * d;
  }
  const stddev = Math.sqrt(sq / WINDOW);
  if (stddev === 0) return 0;
  return (closes[closes.length - 1] - mean) / stddev;
}

// Lowest and highest close of the last WINDOW closes.
function windowRange(): { lo: number; hi: number } | null {
  if (closes.length < WINDOW) return null;
  const win = closes.slice(closes.length - WINDOW);
  let lo = win[0];
  let hi = win[0];
  for (const c of win) {
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  return { lo, hi };
}

// The price at which the open position must be sold: the higher of the hard stop
// below entry and the trailing stop below the peak since entry. While the
// position is underwater the trailing leg cannot apply, so the hard stop rules.
function stopPrice(): number {
  const entry = entryClose as number;
  if (peakSinceEntry < entry) return entry * (1 - HARD_STOP);
  return Math.max(entry * (1 - HARD_STOP), peakSinceEntry * (1 - TRAIL));
}

await runBars({
  onBatch(state: BarsState, _batch: Batch): OrderInput[] {
    const closeRaw = state.close(SYMBOL);
    if (closeRaw === null) {
      barIndex += 1;
      return [];
    }
    const close = Number(closeRaw);
    closes.push(close);
    if (closes.length > 240) closes.shift();

    const orders: OrderInput[] = [];
    const position = state.positions.get(SYMBOL);
    const holding = position !== undefined && position.qty > 0n;

    if (holding) {
      // Anchor the exit levels if the entry close was somehow lost.
      if (entryClose === null) entryClose = close;
      if (entryBar < 0) entryBar = barIndex;
      if (close > peakSinceEntry) peakSinceEntry = close;
      const entry = entryClose as number;
      if (
        close <= stopPrice() ||
        close >= entry * (1 + TARGET) ||
        barIndex - entryBar >= TIME_STOP
      ) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: position.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        entryClose = null;
        entryBar = -1;
        peakSinceEntry = 0;
      }
    } else {
      // Flat: forget any stale entry, then look for a deep dip.
      entryClose = null;
      entryBar = -1;
      peakSinceEntry = 0;
      if (barIndex >= MIN_HISTORY && barIndex <= LAST_ENTRY_BAR) {
        const z = zScore();
        const range = windowRange();
        if (z !== null && range !== null && z <= ENTRY_Z) {
          const dipDepth = range.hi / range.lo - 1;
          if (close <= range.lo * (1 + AT_LOW) && dipDepth >= MIN_DIP) {
            orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
            entryClose = close;
            entryBar = barIndex;
            peakSinceEntry = close;
          }
        }
      }
    }

    barIndex += 1;
    return orders;
  },
});
