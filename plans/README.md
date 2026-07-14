# Animation improvement plans

Written by the `improve-animations` audit. Round 1 (001–007) was audited at
commit `d1147bf` on 2026-07-14; a large hand-written M6 pivot then landed most
of it, so round 2 (008–014) re-audited the working tree the same day. Each
plan is self-contained — an executor needs no context beyond the plan file.
Run with `improve-animations execute <plan>` or hand to any agent.

## Active plans (round 2)

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 008 | [Remove the duplicate .rota-panel](008-dedupe-rota-panel.md) | MEDIUM | DONE |
| 009 | [Press/hover transition conflict + option press feedback](009-press-transition-conflict.md) | MEDIUM | DONE |
| 010 | [Close the reduced-motion gaps](010-reduced-motion-gaps.md) | MEDIUM | DONE |
| 011 | [Shorten the changed-chip flash](011-shorten-chip-flash.md) | LOW | DONE |
| 012 | [Move the parse progress scanner off `left`](012-progress-bar-transform.md) | LOW | DONE |
| 013 | [Read the FLIP easing from the shared token](013-flip-easing-token.md) | LOW | DONE |
| 014 | [Fade the why-line in](014-why-line-fade.md) | LOW | DONE |
| 015 | [Sequence row expand when switching options](015-sequence-expand-swap.md) | MEDIUM | DONE |
| 016 | [Gate the FLIP to rank-order changes](016-gate-flip-to-reorders.md) | HIGH | DONE |
| 017 | [Crown the winner when its row lands](017-crown-on-landing.md) | LOW | DONE |

### Execution order and dependencies

1. **008 first** — it removes the conflicting `.rota-panel` block that
   defeats reduced-motion; 010's verification assumes the panel fades
   correctly under reduce.
2. **009–014 in any order**, with two same-file notes: 010, 011, and 012 all
   edit `search.css` (disjoint lines — run sequentially, not in parallel);
   013 and 014 both edit `results.tsx` (also disjoint, also sequential).
3. 010 and 012 are order-independent by design (010's reduce override sets
   `transform: none` on the scanner).

## Retired plans (round 1)

| # | Plan | Outcome |
| --- | --- | --- |
| 001 | [Motion easing tokens](001-motion-tokens.md) | DONE (executed) |
| 002 | [Chip popover entrance](002-chip-popover-entrance.md) | DONE (executed; leftover CSS removed by 008) |
| 003 | [Row expand/collapse](003-expandable-row-transition.md) | SUPERSEDED — implemented by hand (M6 pivot) |
| 004 | [Reduced motion](004-reduced-motion.md) | SUPERSEDED — landed by hand; gaps → 010 |
| 005 | [Row stagger](005-row-stagger.md) | SUPERSEDED — implemented by hand (M6 pivot) |
| 006 | [Shorten chip flash](006-shorten-chip-flash.md) | SUPERSEDED by 011 |
| 007 | [Press feedback](007-press-feedback.md) | SUPERSEDED — partially landed; remainder → 009 |

Not planned (deliberately skipped by the user in round 1): the FLIP-style
hero transition of the search box from centered to top-anchored on first
parse.
