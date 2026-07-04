# Product

## Register

product

## Users

Fleet managers and logistics planners at businesses running Milk Run distribution (single truck, multiple delivery stops, return to depot). They upload a CSV manifest of delivery stops, review computed routes, and use the output to plan dispatch and report on cost/carbon impact. Sessions happen at a desk, likely before a shift or during route planning, comparing multiple algorithm outputs side by side to pick the best plan for that day's specific customer set.

## Product Purpose

RouteWay Intelligence computes optimized delivery routes from an uploaded CSV of customer stops, running 8 VRP (Vehicle Routing Problem) algorithm variants in parallel and surfacing distance, cost, CO2, and truck-count comparisons so the user can pick the best result for that day's data rather than trusting one fixed algorithm. It also tracks and reports carbon footprint reduction versus a traditional (non-optimized) baseline, with transparent, cited formulas suitable for ESG reporting. Success looks like: the user uploads a file, sees a clear winning route within seconds, and can justify the cost/carbon numbers to their own stakeholders.

## Brand Personality

Trustworthy, professional, credible. Not flashy or trend-chasing — this is a tool people use to justify real operational and environmental numbers, so the UI should read as precise and dependable rather than exciting. Reference direction: Linear-style (restrained color, clear spacing, sharp data/table presentation).

## Anti-references

Generic SaaS/AI-slop patterns: gradient text, hero-metric-with-gradient-accent cards, identical icon+heading+text card grids, glassmorphism-as-decoration, modal-as-first-instinct. Nothing that reads as a templated dashboard-generator output.

## Design Principles

- Numbers must be scannable and citable — every cost/CO2 figure should read clearly enough to screenshot into a report without further explanation.
- Comparison is the core interaction — the UI's job is to make 8-9 rows of algorithm output easy to compare at a glance (color-coded best-per-column), not to hide complexity behind a single "optimize" button.
- Restrained color, deliberate use — green/status color should mean something (best value, on-time, active) rather than being decorative.
- Respect the user's real data — no placeholder/demo content bleeding into a real session; every number on screen must trace to the uploaded CSV and configured fleet.

## Accessibility & Inclusion

WCAG AA. Standard business-tool bar: sufficient contrast on data/status colors (especially the green "best value" highlighting and red/amber delay states), keyboard navigability for tab/nav switching, no color-only encoding of route status (pair with icons/text like the existing On-Time/Delayed labels).
