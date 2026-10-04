---
name: dashboard-standards
description: House rules for building, redesigning, or reviewing data dashboards, KPI pages, reports, and financial/lending metrics views (portfolio books, syndication, funding, collections, pipeline, call grading). Use this skill whenever the task touches a dashboard, chart, table of metrics, or any screen whose job is to show numbers, even if the user doesn't say "dashboard." Apply it alongside ui-ux-pro-max: that skill covers general visual quality; this one covers how data is organized and read.
---

# Dashboard Standards

A dashboard exists to answer questions fast. Every element must earn its place by answering one.

## 1. Plan before you draw
Before writing code, list in a comment at the top of the file:
- The 3–5 questions the viewer asks every time they open it (e.g. "How much is outstanding?", "What's late?", "What changed this week?").
- The one number that matters most.
If an element doesn't serve one of those questions, cut it or move it to a detail view.

## 2. Layout: overview → trend → detail
1. **Top row: KPI cards (max 4–6).** Big value, label, and change vs. prior period (▲/▼ with absolute and %). The most important metric goes top-left.
2. **Middle: trends and breakdowns.** Time series and comparisons that explain the KPIs.
3. **Bottom: detail tables.** Sortable, filterable, with totals.
Group related metrics together (e.g. all collections metrics in one block). Use whitespace to separate groups instead of borders and boxes.

## 3. Pick the right chart
| Question | Use | Avoid |
|---|---|---|
| Change over time | Line (area only for one series) | Bar for 20+ periods |
| Compare categories | Horizontal bar, sorted desc | Pie with 5+ slices |
| Part of whole | Stacked bar or single donut with ≤4 parts | 3D anything |
| Status of many items | Table with conditional color | A chart per item |
| Actual vs target | Bullet chart or bar + target line | Gauges/speedometers |
Bar charts start at zero. Label lines directly at the end instead of a distant legend when ≤4 series.

## 4. Numbers
- Right-align numbers in tables; use tabular (monospaced) figures.
- Currency: `$1.24M`, `$84.5K` in cards; full `$1,240,512.00` in tables and exports.
- Percentages: one decimal (`12.4%`). Ratios/factor rates: two decimals (`1.35`).
- Negative values: minus sign plus color, never color alone.
- Always show the as-of date/time and data source somewhere visible.
- Totals and subtotals in tables, visually distinct (bold, top border).

## 5. Color carries meaning, not decoration
- One neutral palette for normal data; one accent for the primary series.
- Red = bad/needs action, amber = watch, green = good. Use them only for status, never for decoration.
- Same entity = same color everywhere (e.g. each funder or book keeps its color across every chart).
- Pair every status color with an icon, label, or sign so it reads in grayscale.
- Support dark mode via CSS variables; check contrast ≥ 4.5:1.

## 6. Interaction
- Global filters (date range, entity/funder, status) sit at the top and affect everything; show which filters are active.
- Tooltips show the exact value, date, and label.
- Click a KPI or chart segment → drill into the matching filtered table.
- Empty, loading, and error states are designed, not blank.

## 7. Data integrity checks (do these before declaring done)
- KPI cards reconcile with the sum of the detail table under current filters.
- No double counting across categories; write-offs, refunds, and adjustments flow through every derived metric.
- Edge cases render cleanly: zero rows, a single row, very large values, negative values.

## 8. Final review checklist
- [ ] Can a viewer answer the top 3 questions in under 10 seconds?
- [ ] Most important number is the most visually prominent thing on the page.
- [ ] No chart type from the "Avoid" column.
- [ ] Formatting rules in §4 applied consistently.
- [ ] Color used only for meaning; consistent entity colors.
- [ ] Totals reconcile; as-of date shown.
- [ ] Works at laptop width and on a phone.
