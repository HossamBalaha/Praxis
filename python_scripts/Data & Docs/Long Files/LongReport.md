---
title: "Long Sensor Report"
author: "Praxis Example Suite"
date: "2026-01-01"
output: html_document
---

# Long Sensor Report

A deliberately long markdown document: many sections, tables,
code fences and lists, so the classic view, the Studio mode, the
outline rail and the autoformat-table command all have real
material to work with.

## Section 01 — measurements

Narrative paragraph for section 01. The telemetry fleet gathered 137 samples across 3 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-011` | 11      | 3.14  | 0.618 | ok    |
| `ST-012` | 22      | 6.28  | 1.236 | watch |
| `ST-013` | 33      | 9.42  | 1.854 | ok    |
| `ST-014` | 44      | 12.56 | 2.472 | watch |
| `ST-015` | 55      | 15.70 | 3.090 | ok    |

```python
def summarize_01(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 1
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 02 — measurements

Narrative paragraph for section 02. The telemetry fleet gathered 274 samples across 4 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-021` | 22      | 3.14  | 0.618 | ok    |
| `ST-022` | 44      | 6.28  | 1.236 | watch |
| `ST-023` | 66      | 9.42  | 1.854 | ok    |
| `ST-024` | 88      | 12.56 | 2.472 | watch |
| `ST-025` | 110     | 15.70 | 3.090 | ok    |

```python
def summarize_02(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 2
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 03 — measurements

Narrative paragraph for section 03. The telemetry fleet gathered 411 samples across 5 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-031` | 33      | 3.14  | 0.618 | ok    |
| `ST-032` | 66      | 6.28  | 1.236 | watch |
| `ST-033` | 99      | 9.42  | 1.854 | ok    |
| `ST-034` | 132     | 12.56 | 2.472 | watch |
| `ST-035` | 165     | 15.70 | 3.090 | ok    |

```python
def summarize_03(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 3
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 04 — measurements

Narrative paragraph for section 04. The telemetry fleet gathered 548 samples across 6 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-041` | 44      | 3.14  | 0.618 | ok    |
| `ST-042` | 88      | 6.28  | 1.236 | watch |
| `ST-043` | 132     | 9.42  | 1.854 | ok    |
| `ST-044` | 176     | 12.56 | 2.472 | watch |
| `ST-045` | 220     | 15.70 | 3.090 | ok    |

```python
def summarize_04(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 4
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 05 — measurements

Narrative paragraph for section 05. The telemetry fleet gathered 685 samples across 7 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-051` | 55      | 3.14  | 0.618 | ok    |
| `ST-052` | 110     | 6.28  | 1.236 | watch |
| `ST-053` | 165     | 9.42  | 1.854 | ok    |
| `ST-054` | 220     | 12.56 | 2.472 | watch |
| `ST-055` | 275     | 15.70 | 3.090 | ok    |

```python
def summarize_05(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 5
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 06 — measurements

Narrative paragraph for section 06. The telemetry fleet gathered 822 samples across 8 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-061` | 66      | 3.14  | 0.618 | ok    |
| `ST-062` | 132     | 6.28  | 1.236 | watch |
| `ST-063` | 198     | 9.42  | 1.854 | ok    |
| `ST-064` | 264     | 12.56 | 2.472 | watch |
| `ST-065` | 330     | 15.70 | 3.090 | ok    |

```python
def summarize_06(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 6
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 07 — measurements

Narrative paragraph for section 07. The telemetry fleet gathered 959 samples across 2 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-071` | 77      | 3.14  | 0.618 | ok    |
| `ST-072` | 154     | 6.28  | 1.236 | watch |
| `ST-073` | 231     | 9.42  | 1.854 | ok    |
| `ST-074` | 308     | 12.56 | 2.472 | watch |
| `ST-075` | 385     | 15.70 | 3.090 | ok    |

```python
def summarize_07(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 7
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 08 — measurements

Narrative paragraph for section 08. The telemetry fleet gathered 1096 samples across 3 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-081` | 88      | 3.14  | 0.618 | ok    |
| `ST-082` | 176     | 6.28  | 1.236 | watch |
| `ST-083` | 264     | 9.42  | 1.854 | ok    |
| `ST-084` | 352     | 12.56 | 2.472 | watch |
| `ST-085` | 440     | 15.70 | 3.090 | ok    |

```python
def summarize_08(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 8
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 09 — measurements

Narrative paragraph for section 09. The telemetry fleet gathered 1233 samples across 4 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-091` | 99      | 3.14  | 0.618 | ok    |
| `ST-092` | 198     | 6.28  | 1.236 | watch |
| `ST-093` | 297     | 9.42  | 1.854 | ok    |
| `ST-094` | 396     | 12.56 | 2.472 | watch |
| `ST-095` | 495     | 15.70 | 3.090 | ok    |

```python
def summarize_09(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 9
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 10 — measurements

Narrative paragraph for section 10. The telemetry fleet gathered 1370 samples across 5 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-101` | 110     | 3.14  | 0.618 | ok    |
| `ST-102` | 220     | 6.28  | 1.236 | watch |
| `ST-103` | 330     | 9.42  | 1.854 | ok    |
| `ST-104` | 440     | 12.56 | 2.472 | watch |
| `ST-105` | 550     | 15.70 | 3.090 | ok    |

```python
def summarize_10(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 10
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 11 — measurements

Narrative paragraph for section 11. The telemetry fleet gathered 1507 samples across 6 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-111` | 121     | 3.14  | 0.618 | ok    |
| `ST-112` | 242     | 6.28  | 1.236 | watch |
| `ST-113` | 363     | 9.42  | 1.854 | ok    |
| `ST-114` | 484     | 12.56 | 2.472 | watch |
| `ST-115` | 605     | 15.70 | 3.090 | ok    |

```python
def summarize_11(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 11
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 12 — measurements

Narrative paragraph for section 12. The telemetry fleet gathered 1644 samples across 7 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-121` | 132     | 3.14  | 0.618 | ok    |
| `ST-122` | 264     | 6.28  | 1.236 | watch |
| `ST-123` | 396     | 9.42  | 1.854 | ok    |
| `ST-124` | 528     | 12.56 | 2.472 | watch |
| `ST-125` | 660     | 15.70 | 3.090 | ok    |

```python
def summarize_12(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 12
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 13 — measurements

Narrative paragraph for section 13. The telemetry fleet gathered 1781 samples across 8 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-131` | 143     | 3.14  | 0.618 | ok    |
| `ST-132` | 286     | 6.28  | 1.236 | watch |
| `ST-133` | 429     | 9.42  | 1.854 | ok    |
| `ST-134` | 572     | 12.56 | 2.472 | watch |
| `ST-135` | 715     | 15.70 | 3.090 | ok    |

```python
def summarize_13(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 13
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 14 — measurements

Narrative paragraph for section 14. The telemetry fleet gathered 1918 samples across 2 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-141` | 154     | 3.14  | 0.618 | ok    |
| `ST-142` | 308     | 6.28  | 1.236 | watch |
| `ST-143` | 462     | 9.42  | 1.854 | ok    |
| `ST-144` | 616     | 12.56 | 2.472 | watch |
| `ST-145` | 770     | 15.70 | 3.090 | ok    |

```python
def summarize_14(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 14
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 15 — measurements

Narrative paragraph for section 15. The telemetry fleet gathered 2055 samples across 3 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-151` | 165     | 3.14  | 0.618 | ok    |
| `ST-152` | 330     | 6.28  | 1.236 | watch |
| `ST-153` | 495     | 9.42  | 1.854 | ok    |
| `ST-154` | 660     | 12.56 | 2.472 | watch |
| `ST-155` | 825     | 15.70 | 3.090 | ok    |

```python
def summarize_15(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 15
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 16 — measurements

Narrative paragraph for section 16. The telemetry fleet gathered 2192 samples across 4 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-161` | 176     | 3.14  | 0.618 | ok    |
| `ST-162` | 352     | 6.28  | 1.236 | watch |
| `ST-163` | 528     | 9.42  | 1.854 | ok    |
| `ST-164` | 704     | 12.56 | 2.472 | watch |
| `ST-165` | 880     | 15.70 | 3.090 | ok    |

```python
def summarize_16(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 16
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 17 — measurements

Narrative paragraph for section 17. The telemetry fleet gathered 2329 samples across 5 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-171` | 187     | 3.14  | 0.618 | ok    |
| `ST-172` | 374     | 6.28  | 1.236 | watch |
| `ST-173` | 561     | 9.42  | 1.854 | ok    |
| `ST-174` | 748     | 12.56 | 2.472 | watch |
| `ST-175` | 935     | 15.70 | 3.090 | ok    |

```python
def summarize_17(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 17
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 18 — measurements

Narrative paragraph for section 18. The telemetry fleet gathered 2466 samples across 6 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-181` | 198     | 3.14  | 0.618 | ok    |
| `ST-182` | 396     | 6.28  | 1.236 | watch |
| `ST-183` | 594     | 9.42  | 1.854 | ok    |
| `ST-184` | 792     | 12.56 | 2.472 | watch |
| `ST-185` | 990     | 15.70 | 3.090 | ok    |

```python
def summarize_18(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 18
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 19 — measurements

Narrative paragraph for section 19. The telemetry fleet gathered 2603 samples across 7 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-191` | 209     | 3.14  | 0.618 | ok    |
| `ST-192` | 418     | 6.28  | 1.236 | watch |
| `ST-193` | 627     | 9.42  | 1.854 | ok    |
| `ST-194` | 836     | 12.56 | 2.472 | watch |
| `ST-195` | 1045    | 15.70 | 3.090 | ok    |

```python
def summarize_19(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 19
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 20 — measurements

Narrative paragraph for section 20. The telemetry fleet gathered 2740 samples across 8 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-201` | 220     | 3.14  | 0.618 | ok    |
| `ST-202` | 440     | 6.28  | 1.236 | watch |
| `ST-203` | 660     | 9.42  | 1.854 | ok    |
| `ST-204` | 880     | 12.56 | 2.472 | watch |
| `ST-205` | 1100    | 15.70 | 3.090 | ok    |

```python
def summarize_20(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 20
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 21 — measurements

Narrative paragraph for section 21. The telemetry fleet gathered 2877 samples across 2 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-211` | 231     | 3.14  | 0.618 | ok    |
| `ST-212` | 462     | 6.28  | 1.236 | watch |
| `ST-213` | 693     | 9.42  | 1.854 | ok    |
| `ST-214` | 924     | 12.56 | 2.472 | watch |
| `ST-215` | 1155    | 15.70 | 3.090 | ok    |

```python
def summarize_21(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 21
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 22 — measurements

Narrative paragraph for section 22. The telemetry fleet gathered 3014 samples across 3 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-221` | 242     | 3.14  | 0.618 | ok    |
| `ST-222` | 484     | 6.28  | 1.236 | watch |
| `ST-223` | 726     | 9.42  | 1.854 | ok    |
| `ST-224` | 968     | 12.56 | 2.472 | watch |
| `ST-225` | 1210    | 15.70 | 3.090 | ok    |

```python
def summarize_22(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 22
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 23 — measurements

Narrative paragraph for section 23. The telemetry fleet gathered 3151 samples across 4 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-231` | 253     | 3.14  | 0.618 | ok    |
| `ST-232` | 506     | 6.28  | 1.236 | watch |
| `ST-233` | 759     | 9.42  | 1.854 | ok    |
| `ST-234` | 1012    | 12.56 | 2.472 | watch |
| `ST-235` | 1265    | 15.70 | 3.090 | ok    |

```python
def summarize_23(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 23
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 24 — measurements

Narrative paragraph for section 24. The telemetry fleet gathered 3288 samples across 5 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-241` | 264     | 3.14  | 0.618 | ok    |
| `ST-242` | 528     | 6.28  | 1.236 | watch |
| `ST-243` | 792     | 9.42  | 1.854 | ok    |
| `ST-244` | 1056    | 12.56 | 2.472 | watch |
| `ST-245` | 1320    | 15.70 | 3.090 | ok    |

```python
def summarize_24(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 24
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 25 — measurements

Narrative paragraph for section 25. The telemetry fleet gathered 3425 samples across 6 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-251` | 275     | 3.14  | 0.618 | ok    |
| `ST-252` | 550     | 6.28  | 1.236 | watch |
| `ST-253` | 825     | 9.42  | 1.854 | ok    |
| `ST-254` | 1100    | 12.56 | 2.472 | watch |
| `ST-255` | 1375    | 15.70 | 3.090 | ok    |

```python
def summarize_25(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 25
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 26 — measurements

Narrative paragraph for section 26. The telemetry fleet gathered 3562 samples across 7 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-261` | 286     | 3.14  | 0.618 | ok    |
| `ST-262` | 572     | 6.28  | 1.236 | watch |
| `ST-263` | 858     | 9.42  | 1.854 | ok    |
| `ST-264` | 1144    | 12.56 | 2.472 | watch |
| `ST-265` | 1430    | 15.70 | 3.090 | ok    |

```python
def summarize_26(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 26
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 27 — measurements

Narrative paragraph for section 27. The telemetry fleet gathered 3699 samples across 8 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-271` | 297     | 3.14  | 0.618 | ok    |
| `ST-272` | 594     | 6.28  | 1.236 | watch |
| `ST-273` | 891     | 9.42  | 1.854 | ok    |
| `ST-274` | 1188    | 12.56 | 2.472 | watch |
| `ST-275` | 1485    | 15.70 | 3.090 | ok    |

```python
def summarize_27(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 27
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Section 28 — measurements

Narrative paragraph for section 28. The telemetry fleet gathered 3836 samples across 2 stations; the derived indices are
summarised below and revisited in the appendix.

### Station summary

| Station  | Samples | Mean  | Std   | Flag  |
|----------|---------|-------|-------|-------|
| `ST-281` | 308     | 3.14  | 0.618 | ok    |
| `ST-282` | 616     | 6.28  | 1.236 | watch |
| `ST-283` | 924     | 9.42  | 1.854 | ok    |
| `ST-284` | 1232    | 12.56 | 2.472 | watch |
| `ST-285` | 1540    | 15.70 | 3.090 | ok    |

```python
def summarize_28(samples):
    """Section helper."""
    return sum(samples) / max(1, len(samples)) * 28
```

> Note: the tables above are intentionally unaligned so the
> right-click **Auto-format Markdown** (table alignment) has
> something meaningful to fix.

## Appendix

1. every section above is self-similar by design;
2. the frontmatter exercises the classic-view card;
3. spell-check underlines will show on the made-up words (telemetrywise, recalibratable).
