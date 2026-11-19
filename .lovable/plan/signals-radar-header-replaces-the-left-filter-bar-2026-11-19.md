# Signals radar header (replaces the left filter bar)

## What you'll see
The top of the Signals page gets the same layout as the Network page header: a diagram on the left, a grid of counts to its right, a view switch top right, and search + quick filters underneath. The left-hand filter bar goes away and the signal tiles use the full width.

```text
                                   [By Source] [By Industry] [By Domain]
   .-------.            AI     Security   Data   Logistics  ...
  /  Market |  ......   12        8        5        2
 /  .-----. |
|  / Netwk| |  ......    6        9        3        1
| |  .--. | |
| | |Port| |   ......    4        7        2        0
```

- **Quarter-circle "signal" diagram**: three nested quarter rings drawn like the signal icon — PortCo in the centre (darkest), Network in the middle, Market on the outside (lightest). Same flat, thin-outline look and tier-color treatment as the Network pyramid, using the app's existing blues.
- **Bands to the right**: each ring continues as a horizontal band; columns change with the switch:
  - By Domain: AI, Security, Data, Logistics, etc.
  - By Industry: the existing industry list
  - By Source: news@, scan, blog, hand-added, etc.
- **Each cell** shows the signal count (with the same small dot marks as the pyramid). Click a cell to filter the list to that ring + column; click a ring to filter to the whole ring; click again to clear. The active selection is highlighted, like the Network pyramid.
- **Under the diagram**: one row with search, date pills (7d / 30d / 90d / All time), a PortCo picker, and a Clear button — the same compact strip the Network page uses.
- On phones the diagram shrinks and the grid becomes a compact list, as the pyramid does.

## How signals land in a ring
- PortCo: the story is about one of your PortCos.
- Network: the story is about a company where your Council/Hot/Warm people work (the enterprise watch list).
- Market: everything else (industry/macro news).

## Technical details
- New pure helper `src/lib/signal-radar.ts`: `ringFor(signal, portcoKeys, watchKeys)`, column functions per view, `radarCounts()`; unit tests for ring assignment and counts.
- New `src/components/signals/SignalRadar.tsx` (SVG quarter rings + CSS grid bands, tokens only, new `--ring-portco/network/market` tokens in styles.css) and `SignalRadarSwitch` mirroring `PyramidViewSwitch`.
- Selection stored in URL search (`ring`, `view`, `col`) alongside existing params so deep links keep working; `filterSignals` gains ring/column matching.
- Enterprise watch keys come from the existing `enterpriseWatchList()` over contacts, loaded with the feed.
- `SignalFilters.tsx` sidebar removed from `src/routes/signals.tsx`; segment/source/industry checkboxes are replaced by the diagram.
