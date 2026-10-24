# 0017. Overview and findings read in two levels

- Status: accepted
- Date: 2026-10-24

## Decision

The analysis already held the facts a newcomer needs; the screens did not explain them. So:

- **An overview on the map** while nothing is selected: source files by kind (specs apart), parts of the app and which are lazy-loaded, injections and where injectables are provided, the three most used files, the findings worth a look, and what static analysis cannot see. It can be hidden; the choice is kept per browser (`orrery.overview`). "What these count" explains each line on demand.
- **Findings grouped by rule**, each with a title that names the file, facts drawn from its evidence (who uses it, by kind and by part of the app), "Why it could matter", "What to check", and a "Show in the map" link. The rule, threshold, limits, the analyser's own explanation and every evidence path are folded under "Evidence and rule". Rules that ran and found nothing say so.
- **Severity in words**: `warning` reads "Worth checking", `info` reads "Observation", each with what it means. The contract keeps its values.
- **Links both ways**: the inspector and the overview link to one finding (`findings#<finding id>`), which scrolls into view, takes focus and opens its evidence.

## Why

- A reader should learn what was found and why it could matter before reading thresholds and paths; an expert can still open the evidence in one click.
- Everything shown is read from the analysis result or written per rule from it. No new rule, no score: a health score would need a method we cannot defend.
- Interpretation ("why it could matter", "what to check") lives in the web app (`findings/finding-text.ts`), apart from the analyser's facts, so it can be reworded without changing results or the sample JSON.

## Consequences

- The overview counts users without specs, like findings; the inspector's "Used directly by" still counts specs, so the two can differ by the number of specs.
- The advice is per rule and conditional on the evidence (for example, the injection error is mentioned only when every step of a loop is an injection). It does not know the code's intent, and says "check", not "fix".
