# Network Pyramid dashboard

## What you'll see
- **Collapsed (default):** a small pyramid icon beside the Network tool buttons, showing only the five totals. Nothing heavy loads until you open it.
- **Expanded:** clicking the icon or the expand arrow grows it to fill the top half of the Network page:
  - **Left:** the pyramid, from bottom to top: Prospects, Network Cold, Warm, Hot, Council. Each tier shows its total and a row of volume dots. A large dot is 50 people, then 10, 5, and 1, so 189 is drawn as 3 large, 3 medium, 1 small and 4 single dots.
  - **Right:** a grid lined up with the tiers. Three tabs switch the columns: **KPIs / Domain / Geo**. Each cell shows a count and dots. Clicking a cell filters the contact list below to those people.
  - **Bottom right:** **My Network / Our Network**. My Network counts only people whose primary relationship is you.

## The three views
- **Domain:** one column per area of interest: Security, AI & Data, Logistics, and the rest of the approved list. An **Unknown / Other** column holds people with no area or an area that doesn't match, so you can clean them up. Clicking it opens those contacts so you can retag them.
- **Geo:** Austin, New York, Boston, San Francisco, Other US, Europe, Other International, Unknown. Cities include their metro areas, reusing the San Francisco / New York grouping we already have for Campaign Builder.
- **KPIs:** for each tier: the target, the current count and the gap. Then movement in that tier for the last 30 days, 6 months and 12 months: people added, removed, promoted in and demoted out.

## Data: what exists today vs. what's missing
| Need | Today | Change |
|---|---|---|
| Tier | Prospecting list + Cold/Warm/Hot rating | Add **Council** as a fifth rating above Hot. You set it by hand, like Warm and Hot, and the same promote/demote steps apply. |
| Domain | "Areas of interest" (free text, several allowed) | Create one approved domain list. Old values are mapped onto it, and anything that doesn't fit goes to Unknown. A person with two domains counts in both columns, but only once in the tier total. |
| Geography | Free-text location/address | Add a **Market** field, filled in automatically from the location and editable by hand. |
| My Network | "Prime" (relationship owner) | Match it against the team list, so "Chris", "Chris F" and your email all count as you. |
| Movement | **Not tracked.** Only the date added and the current rating are stored. | Add a **Network Movements** log with one row per change: date, person, from-tier, to-tier, type (added / removed / promoted / demoted), who made it. Every add, delete, bulk promote/demote and move to Prospecting writes a row. |
| Objectives | Not stored | Add a **Network Targets** tab with a target per tier, and optionally per domain or market. You edit targets right in the KPI view. |

**Important limit:** movement history only begins once the log is turned on. For earlier periods we can rebuild "added" from the date each person was added. We can't rebuild past promotions and demotions, so the 6- and 12-month numbers will fill in over time.

## Naming (consistent with CRM)
Tiers: Prospect, Cold, Warm, Hot, Council. "Network" means Cold + Warm + Hot + Council.
Movement types: Added, Removed, Promoted, Demoted.
Scope: My Network (primary relationship = me), Our Network (all of DTC).

## Questions to confirm
1. Do Council members stay in Network, with Council as the rating above Hot? (This plan assumes yes.)
2. Please share the final domain list. The mock has Security twice, which looks like a placeholder.
3. Are the Geo columns Austin / NYC / Boston / SF / Other US / Europe / Other Intl OK? Should Texas outside Austin go in Other US?
4. Should targets be per tier only, or also per domain and market?

## Technical details
- A new read-only aggregate server function returns tier × column counts and movement totals, cached about 5 minutes. It is fetched only when you expand the pyramid.
- Pure helpers (with tests): dot breakdown (50/10/5/1), market classifier (reusing metro-areas), domain normalizer, movement window counts, owner scope via teamMemberFor.
- "Council" is added to the Temperature type and the manual-rating policy, and it is allowed in bulk promote.
- The movement log is append-only, written from the existing contact create/delete, relationship-level and transfer paths.
- New sheet tabs: "Network Movements" and "Network Targets". The Market column on Contacts is optional, so a blank value means the market is worked out from the location.
