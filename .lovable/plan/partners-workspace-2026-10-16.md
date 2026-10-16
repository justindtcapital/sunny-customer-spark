# Partners workspace

## What you'll get
- A new **Partners** menu item directly below PortCo, with a Partners page grouped into four categories:
  - **Dell** (strategic partner)
  - **Resellers & Integrators** — Trace3, Redesign Group, Arctic, WWT
  - **Tech Partners** — NVIDIA, Intel, AWS
  - **Vendors** — Vation, GetProven, GBI Impact
- Category chips/filters at the top, search by name, and an **Add partner** button (name, category, website, notes).
- A partner side pane, laid out like the PortCo pane: Key Contacts first, then collapsible BD/GTM Activity, Notes, and Campaigns.

## How contacts connect
- Network and Prospecting contacts stay where they are. Nobody gets moved into Partners.
- A partner contact appears in both places. For example, a Trace3 contact in Network still shows on the Network page and also under Trace3 on the Partners page. The same goes for Prospecting.
- When a CSV upload, paste, or new contact has a company that matches a partner (case-insensitive, same matching we use for PortCo names), the contact is auto-tagged to that partner. It then appears in that partner's Key Contacts.
- Contact records get a **Partner** tag, shown as its own chip, separate from PortCo, Network, and Prospect. Network and Prospecting search get a "Partner" filter in Detailed search.
- Existing contacts get a one-time backfill that adds partner tags by company match. It only adds the tag and changes nothing else on the contact (rating, stage, and owner stay the same).

## Tagging activity
- Notes review (Granola notes, uploads, Drive meeting files), Activity review (Gmail BD/GTM emails), and Tell Venture Pulse each get a **Partners** multi-select next to PortCos. It works the same way but is stored separately.
- Partner names mentioned in notes are suggested as well. Each next step can be tagged to a partner, just like it can be tagged to a PortCo.
- Partners can be tagged on BD and GTM activity. Partner names in email subjects or bodies are suggested the same way PortCo names are.
- Confirmed activity shows on the partner's pane and on the tagged contacts' trails.

## Out of scope for now
- Partner workstreams in Asana and partner Drive folders. These can come later if you want them.

## Technical details
- New "Partners" sheet tab (Name, Category, Website, Notes, Logo), seeded with the companies above. A partner-canonical helper mirrors portco-canonical.
- Contacts get a "Partner Tags" column, written on import/add through a shared matcher. The backfill only adds to that column.
- Knowledge records and harvested activities get a separate `partners` field next to PortCo tags. Review saves it, and dashboards/home momentum ignore it unless asked.
- New route `/partners` and sidebar entry, plus a head() entry.
- Tests: partner name matching and auto-tagging for each category, and a check that a backfill never changes other contact fields.
- Add an AGENTS.md rule: partners are a separate entity from PortCos with their own tag fields, and contacts are only tagged, never moved.
