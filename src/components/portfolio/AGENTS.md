# Portfolio component rules

- Edit tables filter and sort from their column headers (table/ColumnHeaderMenu + pure src/lib/table-filter.ts): pick-list columns tick values (multi-select cells match any value, blanks filterable), free-text columns use "contains", and each column's value list reflects the other active filters — no separate filter dropdowns above the table.
