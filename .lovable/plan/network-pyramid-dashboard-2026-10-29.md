# Network Pyramid dashboard

## What you'll see
- **Collapsed (default):** a small pyramid icon beside the Network tool buttons, showing only the five totals. Nothing heavy loads until you open it.
- **Expanded:** clicking the icon or the expand arrow grows it to fill the top half of the Network page:
  - **Left:** the pyramid, from bottom to top: Prospects, Network Cold, Warm, Hot, Council. Each tier shows its total and a row of volume dots. A large dot is 50 people, then 10, 5, and 1.
  - **Right:** a grid lined up with the tiers. Three tabs switch the columns: **KPIs / Domain / Geo**. Each cell shows a count and dots. Clicking a cell filters the contact list below to those people.
  - **Bottom right:** **My Network / Our Network**. My Network counts only people whose relationship prime is you.

## The three views
- **Domain:** each person is counted once, under their **primary area of interest**. Columns are Security, AI & Data, Logistics and **Other / Unknown**. Clicking Other / Unknown opens those people so you can tag them.
- **Geo:** New York, Boston, San Francisco, Austin, Other US, Europe, Other International, Unknown. Markets are worked out automatically from each person's location. Variations roll up: NY, New York State, NYC area and New Jersey count as New York, and San Jose, Palo Alto and Menlo Park count as San Francisco. The rest of Texas goes to Other US. No new field is added to contacts.
- **KPIs:** for each tier: the target, the current count and the gap. Then movement for the last 30 days, 6 months and 12 months: people added, removed, promoted and demoted.

## Data: what exists today vs. what's missing
| Need | Today | Change |
|---|---|---|
| Tier | Prospecting list + Cold/Warm/Hot rating | Add **Council** as a rating above Hot. Council members stay in Network. You set it by hand, like Warm and Hot. |
| Domain | "Areas of interest" (free text, several allowed) | Add one **Primary area of interest**, chosen from the approved list: Security, AI & Data, Logistics, Other. It starts out filled from each person's first matching area, and you can edit it on the contact. |
| Geography | Free-text location/address | Market rules only, with no new field. |
| My Network | Existing relationship prime | Reuse it, matched against the team list so every name or email you go by counts as you. |
| Movement | **Not tracked.** Only the date added and the current rating are stored. | Add a **Network Movements** log with one row per add, delete, promote, demote or move to Prospecting. |
| Objectives | Not stored | Add a **Network Targets** tab with one target per tier, editable in the KPI view. |

**Limit:** movement history only begins once the log is turned on. Past additions can be rebuilt from each person's date added. Past promotions and demotions can't be rebuilt, so the 6- and 12-month numbers will fill in over time.

## Naming (consistent with CRM)
Tiers: Prospect, Cold, Warm, Hot, Council. "Network" means Cold + Warm + Hot + Council.
Movement types: Added, Removed, Promoted, Demoted.
Scope: My Network (prime = me), Our Network (all of DTC).

## Technical details
- A read-only aggregate server function returns tier × column counts and movement totals, cached about 5 minutes. It is fetched only when you expand the pyramid.
- Pure helpers, each with tests: dot breakdown (50/10/5/1), market roll-up classifier (reusing metro-areas), primary-domain picker, movement window counts, owner scope via teamMemberFor.
- "Council" is added to the Temperature type, the manual-rating policy and bulk promote/demote.
- The movement log is append-only. It is written from the existing contact create/delete, relationship-level and transfer paths.
- New sheet tabs: "Network Movements" and "Network Targets". New Contacts column "Primary Area of Interest"; when it is blank, the value is worked out from areas of interest.
