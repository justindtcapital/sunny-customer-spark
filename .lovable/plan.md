# PortCo page: Partners-style list + detail layout

## What changes
Replace the card grid on the Portfolio page with the same two-column layout the Partners page uses.

```text
[ Portfolio Companies                         Show PortCo contacts | Add company ]
[ All 107 | Cloud 12 | AI 18 | Security 9 | ...        Priority: NM BB NU  [Search] ]
+-------------------------------+-----------------------------------------------+
| DOMAIN NAME                   |                                               |
| [logo] Hyperbolic  NM  3  5   |   Selected PortCo detail                      |
| [logo] Pecan       BB  1  2   |   (same info as today's slide-out panel)      |
|        Streams Actions        |                                               |
+-------------------------------+-----------------------------------------------+
```

- **Filter bar above**: Domain chips with counts (like Partner categories), a compact DTC Priority toggle (Needle Mover, Nurture, Back Burner, etc.), and search. Existing sidebar filters keep working alongside them.
- **Left list**: companies grouped under domain headings, alphabetical. Each row shows logo, name, a small abbreviated priority badge (e.g. "NM" with full name on hover), and mini counts for active Workstreams and open Actions. Selection checkboxes and bulk Asana Sync / Web Sync / Delete stay.
- **Right pane**: the PortCo detail that opens today in the slide-out now displays inline, with the same content and actions (edit, sync, key people, workstreams, events, emails, Action with V.I.C., delete), restyled as clean sections with a header, link chips, and a stat row like the Partner pane.
- First company is selected automatically; on phones the list and detail stack and the slide-out remains.
- "Show PortCo contacts" still shows people grouped by sector.

## Not changing
Company data, sync to both PortCo sheets, filters' meaning, and where workstream/action data comes from.

## Technical details
- `src/routes/portfolio.tsx`: replace the grid with the `lg:grid-cols-[minmax(360px,440px)_1fr]` list and pane; add domain/priority chip state combined with `usePortfolioFilters`; compute per-company active workstream count (`useWorkstreams`, excluding completed, matched by company) and open follow-up count from the existing actions query.
- `src/components/portfolio/PortfolioDetail.tsx`: pull the body into an exported `PortfolioDetailBody` and render it inline (`variant="inline"`) or in the existing Sheet (`variant="sheet"`, mobile).
- Priority abbreviations come from `portco-matrix` labels; this is presentation-only.
- Add a test for the priority abbreviation and domain/priority filter helper.
