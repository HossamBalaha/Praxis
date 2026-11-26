/**
 * Python — Plotting examples. Category: "Plotting".
 * Every matplotlib example ends with plt.show — the Praxis run
 * wrapper captures it as a figure. All figures are deterministic
 * (seeded).
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {mkExample, vr} from "./_helpers";

const CAT = "Plotting";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_PLOTTING_EXAMPLES: FileExample[] = [
    // ─── Line & curve plots ──────────────────────────────────────────
    py("py-ex-sine-waves", "Sine waves (figure)", "Three phase-shifted sinusoids with a legend — the matplotlib hello.", "Line & curve", "sine_waves",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Plotting sinusoids with different phases."""
import math

import matplotlib.pyplot as plt

${v("xs")} = [0.02 * math.pi * i for i in range(101)]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4))
${v("ax")}.plot(${v("xs")}, [math.sin(x) for x in ${v("xs")}], label="sin(x)", color="#264653")
${v("ax")}.plot(${v("xs")}, [math.sin(x + math.pi / 3) for x in ${v("xs")}], label="sin(x + 60°)", color="#2a9d8f")
${v("ax")}.plot(${v("xs")}, [math.sin(x + 2 * math.pi / 3) for x in ${v("xs")}], label="sin(x + 120°)", color="#e76f51")
${v("ax")}.set_xlabel("x (radians)")
${v("ax")}.set_ylabel("amplitude")
${v("ax")}.set_title("Phase-shifted sine waves")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-multi-line-styles", "Line styles & markers", "Linewidths, dashes, markers and colors side by side.", "Line & curve", "line_styles",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Every line style knob on one figure."""
import matplotlib.pyplot as plt

${v("x")} = list(range(0, 10))

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("styles")} = [
    ("solid + circle", dict(color="#264653", linestyle="-", marker="o")),
    ("dashed + square", dict(color="#2a9d8f", linestyle="--", marker="s")),
    ("dotted + triangle", dict(color="#e9c46a", linestyle=":", marker="^")),
    ("dash-dot + diamond", dict(color="#e76f51", linestyle="-.", marker="D")),
]
for ${v("label")}, ${v("style")} in ${v("styles")}:
    ${v("y")} = [2 * ${v("xi")} + 3 + ${v("x")}.index(${v("xi")}) for ${v("xi")} in ${v("x")}]
    ${v("ax")}.plot(${v("x")}, ${v("y")}, linewidth=1.8, markersize=5, label=${v("label")}, **${v("style")})

${v("ax")}.set_title("Line styles, markers and colors")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-log-scales", "Log scales (figure)", "semilogx / loglog with exponential and power-law data.", "Line & curve", "log_scales",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Linear, semilog and log-log views of the same growth laws."""
import matplotlib.pyplot as plt

${v("x")} = [0.5 * i for i in range(1, 41)]
${v("exp_y")} = [2.0 ** (0.25 * xi) for xi in ${v("x")}]
${v("pow_y")} = [10.0 * xi ** -1.5 for xi in ${v("x")}]

${v("fig")}, ${v("axes")} = plt.subplots(1, 3, figsize=(12, 3.8))
${v("axes")}[0].plot(${v("x")}, ${v("exp_y")}, color="#264653")
${v("axes")}[0].set_title("linear — exponential explodes")
${v("axes")}[1].semilogy(${v("x")}, ${v("exp_y")}, color="#2a9d8f")
${v("axes")}[1].set_title("semilogy — a straight line")
${v("axes")}[2].loglog(${v("x")}, ${v("pow_y")}, color="#e76f51")
${v("axes")}[2].set_title("loglog — power law flattens")
for ${v("ax")} in ${v("axes")}:
    ${v("ax")}.set_xlabel("x")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-step-stem", "Step & stem plots", "Discrete signals as steps and stems — digital output style.", "Line & curve", "step_stem",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Step and stem plots for discrete data."""
import matplotlib.pyplot as plt

${v("t")} = list(range(12))
${v("signal")} = [0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0]

${v("fig")}, ${v("axes")} = plt.subplots(1, 2, figsize=(10, 3.8))
${v("axes")}[0].step(${v("t")}, ${v("signal")}, where="post", color="#264653", linewidth=2)
${v("axes")}[0].set_title("step(where='post')")
${v("axes")}[0].set_ylim(-0.2, 1.3)

${v("impulse")} = [(-1) ** n * (n + 1) for n in range(12)]
${v("axes")}[1].stem(${v("t")}, ${v("impulse")})
${v("axes")}[1].set_title("stem() — impulse train")

${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-area-fill", "Fill between curves", "Shaded regions between functions — confidence-band look.", "Line & curve", "fill_between",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""fill_between: bands, regions and shading."""
import math

import matplotlib.pyplot as plt

${v("xs")} = [0.05 * i for i in range(63)]
${v("mid")} = [math.sin(x) * math.exp(-0.1 * x) for x in ${v("xs")}]
${v("band")} = [0.25 * math.exp(-0.1 * x) for x in ${v("xs")}]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4))
${v("ax")}.plot(${v("xs")}, ${v("mid")}, color="#264653", linewidth=2, label="signal")
${v("ax")}.fill_between(${v("xs")}, [m - b for m, b in zip(${v("mid")}, ${v("band")})], [m + b for m, b in zip(${v("mid")}, ${v("band")})], color="#2a9d8f", alpha=0.3, label="+/- band")
${v("ax")}.axhline(0, color="#999999", linewidth=0.8)
${v("ax")}.fill_between(${v("xs")}, 0, ${v("mid")}, where=[m > 0 for m in ${v("mid")}], color="#e9c46a", alpha=0.25, label="positive part")
${v("ax")}.set_title("Damped oscillation with an uncertainty band")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-lissajous", "Lissajous curves (figure)", "Parametric pretty pictures from two sine frequencies.", "Line & curve", "lissajous",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Lissajous figures: x=sin(at), y=sin(bt+delta)."""
import math

import matplotlib.pyplot as plt

${v("t")} = [0.005 * math.pi * i for i in range(401)]
${v("combos")} = [(3, 2), (3, 4), (5, 4), (5, 6)]

${v("fig")}, ${v("axes")} = plt.subplots(1, 4, figsize=(12, 3))
for ${v("ax")}, (${v("a")}, ${v("b")}) in zip(${v("axes")}, ${v("combos")}):
    ${v("xs")} = [math.sin(${v("a")} * tt) for tt in ${v("t")}]
    ${v("ys")} = [math.sin(${v("b")} * tt + math.pi / 4) for tt in ${v("t")}]
    ${v("ax")}.plot(${v("xs")}, ${v("ys")}, color="#2a9d8f", linewidth=1)
    ${v("ax")}.set_title(f"a={${v("a")}}, b={${v("b")}}")
    ${v("ax")}.set_aspect("equal")

${v("fig")}.suptitle("Lissajous curves")
${v("fig")}.tight_layout()
plt.show()
`;
        }),

    // ─── Scatter plots ───────────────────────────────────────────────
    py("py-ex-scatter-basic", "Scatter + trend line", "Points with an overlaid least-squares trend.", "Scatter", "scatter_trend",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Scatter plot with a fitted trend line."""
import random

import matplotlib.pyplot as plt

random.seed(31)
${v("x")} = [random.uniform(0, 100) for _ in range(80)]
${v("y")} = [0.7 * xi + random.gauss(12, 9) for xi in ${v("x")}]

${v("n")} = len(${v("x")})
${v("mx")} = sum(${v("x")}) / ${v("n")}
${v("my")} = sum(${v("y")}) / ${v("n")}
${v("slope")} = sum((xi - ${v("mx")}) * (yi - ${v("my")}) for xi, yi in zip(${v("x")}, ${v("y")})) / sum((xi - ${v("mx")}) ** 2 for xi in ${v("x")})
${v("intercept")} = ${v("my")} - ${v("slope")} * ${v("mx")}

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("ax")}.scatter(${v("x")}, ${v("y")}, s=22, alpha=0.75, color="#264653", label="observations")
${v("x_sorted")} = sorted(${v("x")})
${v("ax")}.plot(${v("x_sorted")}, [${v("slope")} * xi + ${v("intercept")} for xi in ${v("x_sorted")}], color="#e76f51", linewidth=2, label=f"y = {${v("slope")}:.2f}x + {${v("intercept")}:.2f}")
${v("ax")}.set_xlabel("x")
${v("ax")}.set_ylabel("y")
${v("ax")}.set_title("Scatter with least-squares trend")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-bubble", "Bubble chart", "A scatter where size AND color encode extra variables.", "Scatter", "bubble_chart",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Bubble chart: x, y, size and color all carry data."""
import random

import matplotlib.pyplot as plt

random.seed(8)
${v("cities")} = ["A", "B", "C", "D", "E", "F", "G", "H"]
${v("population")} = [random.uniform(0.5, 8.0) for _ in ${v("cities")}]
${v("income")} = [random.uniform(20, 90) for _ in ${v("cities")}]
${v("area")} = [random.uniform(100, 900) for _ in ${v("cities")}]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.8))
${v("scatter")} = ${v("ax")}.scatter(${v("population")}, ${v("income")}, s=${v("area")}, c=${v("area")}, cmap="viridis", alpha=0.75, edgecolor="#264653")
${v("fig")}.colorbar(${v("scatter")}, label="area")
for ${v("name")}, ${v("px")}, ${v("py")} in zip(${v("cities")}, ${v("population")}, ${v("income")}):
    ${v("ax")}.annotate(${v("name")}, (${v("px")}, ${v("py")}), ha="center", va="center", fontsize=9)

${v("ax")}.set_xlabel("population (M)")
${v("ax")}.set_ylabel("income (k)")
${v("ax")}.set_title("Bubble chart — size and color both encode area")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-scatter-matrix", "Scatter matrix grid", "All pairs of variables in one grid — a manual pair plot.", "Scatter", "scatter_matrix",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A hand-rolled pairs plot: every variable against every other."""
import random

import matplotlib.pyplot as plt

random.seed(14)
${v("variables")} = {
    "height": [random.gauss(170, 8) for _ in range(120)],
    "weight": [random.gauss(70, 10) for _ in range(120)],
    "age": [random.uniform(18, 65) for _ in range(120)],
}
${v("names")} = list(${v("variables")})

${v("k")} = len(${v("names")})
${v("fig")}, ${v("axes")} = plt.subplots(${v("k")}, ${v("k")}, figsize=(8, 8))
for ${v("i")} in range(${v("k")}):
    for ${v("j")} in range(${v("k")}):
        ${v("ax")} = ${v("axes")}[${v("i")}][${v("j")}]
        if ${v("i")} == ${v("j")}:
            ${v("ax")}.hist(${v("variables")}[${v("names")}[${v("i")}]], bins=25, color="#2a9d8f", alpha=0.85)
        else:
            ${v("ax")}.scatter(${v("variables")}[${v("names")}[${v("j")}]], ${v("variables")}[${v("names")}[${v("i")}]], s=6, alpha=0.6, color="#264653")
        if ${v("i")} == ${v("k")} - 1:
            ${v("ax")}.set_xlabel(${v("names")}[${v("j")}])
        if ${v("j")} == 0:
            ${v("ax")}.set_ylabel(${v("names")}[${v("i")}])

${v("fig")}.suptitle("Pairs plot")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-scatter-colormap", "Color-mapped scatter", "A third dimension painted onto points with a colorbar.", "Scatter", "scatter_colormap",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Scatter where color = a third variable."""
import math
import random

import matplotlib.pyplot as plt

random.seed(2)
${v("x")} = [random.uniform(-3, 3) for _ in range(400)]
${v("y")} = [random.uniform(-3, 3) for _ in range(400)]
${v("z")} = [math.sin(xi) * math.cos(yi) for xi, yi in zip(${v("x")}, ${v("y")})]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7, 5.5))
${v("points")} = ${v("ax")}.scatter(${v("x")}, ${v("y")}, c=${v("z")}, cmap="coolwarm", s=18)
${v("fig")}.colorbar(${v("points")}, label="sin(x)*cos(y)")
${v("ax")}.set_xlabel("x")
${v("ax")}.set_ylabel("y")
${v("ax")}.set_title("Three variables, two axes")
${v("fig")}.tight_layout()
plt.show()
`;
        }),

    // ─── Bars & categorical ──────────────────────────────────────────
    py("py-ex-monte-carlo", "Monte Carlo π (figure)", "Random sampling estimates π and plots the hit/miss points — matplotlib figure included.", "Bars & categorical", "monte_carlo_pi",
        (s) => `# -*- coding: utf-8 -*-
"""Estimate π by Monte Carlo sampling and plot the result."""
import random

import matplotlib.pyplot as plt

${applyNamingStyle(s.variables, "samples")} = 5_000
${applyNamingStyle(s.variables, "inside_x")} = []
${applyNamingStyle(s.variables, "inside_y")} = []
${applyNamingStyle(s.variables, "outside_x")} = []
${applyNamingStyle(s.variables, "outside_y")} = []
${applyNamingStyle(s.variables, "hits")} = 0

random.seed(42)

for _ in range(${applyNamingStyle(s.variables, "samples")}):
    ${applyNamingStyle(s.variables, "x")} = random.uniform(-1.0, 1.0)
    ${applyNamingStyle(s.variables, "y")} = random.uniform(-1.0, 1.0)
    if ${applyNamingStyle(s.variables, "x")} ** 2 + ${applyNamingStyle(s.variables, "y")} ** 2 <= 1.0:
        ${applyNamingStyle(s.variables, "hits")} += 1
        ${applyNamingStyle(s.variables, "inside_x")}.append(${applyNamingStyle(s.variables, "x")})
        ${applyNamingStyle(s.variables, "inside_y")}.append(${applyNamingStyle(s.variables, "y")})
    else:
        ${applyNamingStyle(s.variables, "outside_x")}.append(${applyNamingStyle(s.variables, "x")})
        ${applyNamingStyle(s.variables, "outside_y")}.append(${applyNamingStyle(s.variables, "y")})

${applyNamingStyle(s.variables, "pi_estimate")} = 4.0 * ${applyNamingStyle(s.variables, "hits")} / ${applyNamingStyle(s.variables, "samples")}
print(f"π ≈ {${applyNamingStyle(s.variables, "pi_estimate")}:.4f}  (error {abs(${applyNamingStyle(s.variables, "pi_estimate")} - 3.14159):.4f})")

${applyNamingStyle(s.variables, "fig")}, ${applyNamingStyle(s.variables, "ax")} = plt.subplots(figsize=(6, 6))
${applyNamingStyle(s.variables, "ax")}.scatter(${applyNamingStyle(s.variables, "outside_x")}, ${applyNamingStyle(s.variables, "outside_y")}, s=2, color="#c8c8c8")
${applyNamingStyle(s.variables, "ax")}.scatter(${applyNamingStyle(s.variables, "inside_x")}, ${applyNamingStyle(s.variables, "inside_y")}, s=2, color="#2a9d8f")
${applyNamingStyle(s.variables, "ax")}.set_aspect("equal")
${applyNamingStyle(s.variables, "ax")}.set_title(f"Monte Carlo π ≈ {${applyNamingStyle(s.variables, "pi_estimate")}:.4f}")
plt.show()
`),
    py("py-ex-barchart-errors", "Bar chart + error bars (figure)", "Grouped bars with std-dev whiskers — the classic paper figure.", "Bars & categorical", "bar_error_bars",
        (s) => `# -*- coding: utf-8 -*-
"""Grouped bar chart with std-deviation error bars."""
import random

import matplotlib.pyplot as plt
import numpy as np

random.seed(9)
np.random.seed(9)

${applyNamingStyle(s.variables, "labels")} = ["control", "low", "medium", "high"]
${applyNamingStyle(s.variables, "x")} = np.arange(len(${applyNamingStyle(s.variables, "labels")}))
${applyNamingStyle(s.variables, "width")} = 0.35

${applyNamingStyle(s.variables, "method_a")} = np.array([5.2, 6.9, 9.4, 11.1])
${applyNamingStyle(s.variables, "method_b")} = np.array([4.8, 7.4, 8.1, 10.2])
${applyNamingStyle(s.variables, "err_a")} = np.array([0.4, 0.6, 0.9, 1.2])
${applyNamingStyle(s.variables, "err_b")} = np.array([0.5, 0.4, 0.8, 0.7])

${applyNamingStyle(s.variables, "fig")}, ${applyNamingStyle(s.variables, "ax")} = plt.subplots(figsize=(7.5, 4.5))
${applyNamingStyle(s.variables, "ax")}.bar(${applyNamingStyle(s.variables, "x")} - ${applyNamingStyle(s.variables, "width")} / 2, ${applyNamingStyle(s.variables, "method_a")}, ${applyNamingStyle(s.variables, "width")}, yerr=${applyNamingStyle(s.variables, "err_a")}, capsize=3, label="method A", color="#264653")
${applyNamingStyle(s.variables, "ax")}.bar(${applyNamingStyle(s.variables, "x")} + ${applyNamingStyle(s.variables, "width")} / 2, ${applyNamingStyle(s.variables, "method_b")}, ${applyNamingStyle(s.variables, "width")}, yerr=${applyNamingStyle(s.variables, "err_b")}, capsize=3, label="method B", color="#2a9d8f")
${applyNamingStyle(s.variables, "ax")}.set_xticks(${applyNamingStyle(s.variables, "x")}, ${applyNamingStyle(s.variables, "labels")})
${applyNamingStyle(s.variables, "ax")}.set_ylabel("score")
${applyNamingStyle(s.variables, "ax")}.set_title("Method comparison (mean +/- sd)")
${applyNamingStyle(s.variables, "ax")}.legend()
${applyNamingStyle(s.variables, "fig")}.tight_layout()
plt.show()
`),
    py("py-ex-stacked-bars", "Stacked bar chart", "Composition over time — segments stacked with totals labeled.", "Bars & categorical", "stacked_bars",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Stacked bars: market segments over four quarters."""
import matplotlib.pyplot as plt

${v("quarters")} = ["Q1", "Q2", "Q3", "Q4"]
${v("segments")} = {
    "enterprise": [40, 44, 51, 58],
    "pro": [25, 28, 30, 34],
    "free": [35, 38, 39, 38],
}

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("bottom")} = [0] * len(${v("quarters")})
for ${v("name")}, ${v("values")} in ${v("segments")}.items():
    ${v("ax")}.bar(${v("quarters")}, ${v("values")}, bottom=${v("bottom")}, label=${v("name")})
    ${v("bottom")} = [b + val for b, val in zip(${v("bottom")}, ${v("values")})]

for ${v("i")}, ${v("total")} in enumerate(${v("bottom")}):
    ${v("ax")}.annotate(str(${v("total")}), (${v("i")}, ${v("total")}), ha="center", va="bottom", fontweight="bold")

${v("ax")}.set_ylabel("users (thousands)")
${v("ax")}.set_title("User mix by quarter")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-horizontal-bars", "Horizontal bar chart", "Long labels read best sideways — sorted with value labels.", "Bars & categorical", "horizontal_bars",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Horizontal bars — the readable way to rank things."""
import matplotlib.pyplot as plt

${v("languages")} = ["Python", "R", "SQL", "Julia", "SPSS", "Excel"]
${v("users")} = [11.3, 4.1, 7.8, 0.9, 2.2, 12.0]

${v("pairs")} = sorted(zip(${v("languages")}, ${v("users")}), key=lambda ${v("pair")}: ${v("pair")}[1])
${v("names_sorted")}, ${v("values_sorted")} = [p[0] for p in ${v("pairs")}], [p[1] for p in ${v("pairs")}]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4))
${v("bars")} = ${v("ax")}.barh(${v("names_sorted")}, ${v("values_sorted")}, color="#2a9d8f")
${v("bars")}[len(${v("bars")}) - 1].set_color("#e76f51")
for ${v("bar")}, ${v("value")} in zip(${v("bars")}, ${v("values_sorted")}):
    ${v("width")} = ${v("bar")}.get_width()
    ${v("ax")}.annotate(f"{${v("value")}:.1f}", (${v("width")}, ${v("bar")}.get_y() + 0.25), ha="left", va="center", fontsize=9)

${v("ax")}.set_xlabel("users (millions)")
${v("ax")}.set_title("Data-tool popularity (top tool highlighted)")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-pie-donut", "Pie & donut charts", "Shares as a pie and as a donut with explicit percentages.", "Bars & categorical", "pie_donut",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Pie and donut variants of the same market share."""
import matplotlib.pyplot as plt

${v("labels")} = ["search", "direct", "social", "email", "other"]
${v("shares")} = [46, 24, 15, 9, 6]

${v("fig")}, ${v("axes")} = plt.subplots(1, 2, figsize=(10, 4.5))
${v("axes")}[0].pie(${v("shares")}, labels=${v("labels")}, autopct="%1.0f%%", startangle=90)
${v("axes")}[0].set_title("pie")

${v("axes")}[1].pie(${v("shares")}, labels=${v("labels")}, autopct="%1.0f%%", startangle=90, wedgeprops=dict(width=0.45), pctdistance=0.72)
${v("axes")}[1].set_title("donut")

${v("fig")}.tight_layout()
plt.show()
`;
        }),

    // ─── Distribution plots ──────────────────────────────────────────
    py("py-ex-histogram-styling", "Histogram styling", "Bins, density mode, and cumulative curves on one figure.", "Distributions", "histogram_styles",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Histogram variants: raw counts, density, and cumulative."""
import random

import matplotlib.pyplot as plt

random.seed(18)
${v("data")} = [random.gauss(100, 15) for _ in range(1000)]

${v("fig")}, ${v("axes")} = plt.subplots(1, 3, figsize=(12, 3.8))
${v("axes")}[0].hist(${v("data")}, bins=20, color="#264653", edgecolor="white")
${v("axes")}[0].set_title("counts, 20 bins")
${v("axes")}[1].hist(${v("data")}, bins=50, color="#2a9d8f", density=True, edgecolor="white")
${v("axes")}[1].set_title("density, 50 bins")
${v("axes")}[2].hist(${v("data")}, bins=50, color="#e9c46a", cumulative=True, edgecolor="white")
${v("axes")}[2].set_title("cumulative")

${v("fig")}.suptitle("One sample, three histogram views")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-boxplot-groups", "Box plot groups", "Distributions side by side — the quick lab-report classic.", "Distributions", "boxplot_groups",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Box plots comparing several groups."""
import random

import matplotlib.pyplot as plt

random.seed(22)
${v("groups")} = {
    "control": [random.gauss(50, 8) for _ in range(40)],
    "low": [random.gauss(54, 8) for _ in range(40)],
    "high": [random.gauss(62, 10) for _ in range(40)],
}

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7, 4.5))
${v("ax")}.boxplot(list(${v("groups")}.values()), tick_labels=list(${v("groups")}))
for ${v("i")}, (${v("name")}, ${v("values")}) in enumerate(${v("groups")}.items(), start=1):
    ${v("ax")}.annotate(f"med={sorted(${v("values")})[len(${v("values")}) // 2]:.0f}", (${v("i")}, sorted(${v("values")})[len(${v("values")}) // 2]), ha="center", va="bottom", fontsize=9, color="#e76f51")

${v("ax")}.set_ylabel("score")
${v("ax")}.set_title("Group medians annotated")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-violin", "Violin plot", "Box plot's smoother cousin — full density per group.", "Distributions", "violin_plot",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Violin plots show the shape box plots hide."""
import random

import matplotlib.pyplot as plt

random.seed(27)
${v("labels")} = ["unimodal", "bimodal", "skewed"]
${v("samples")} = [
    [random.gauss(0, 1) for _ in range(300)],
    [random.gauss(-2, 0.6) if i % 2 == 0 else random.gauss(2, 0.6) for i in range(300)],
    [random.expovariate(0.8) - 1.2 for _ in range(300)],
]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("parts")} = ${v("ax")}.violinplot(${v("samples")}, showmedians=True)
for ${v("pc")} in ${v("parts")}["bodies"]:
    ${v("pc")}.set_facecolor("#2a9d8f")
    ${v("pc")}.set_alpha(0.6)
${v("ax")}.set_xticks([1, 2, 3], ${v("labels")})
${v("ax")}.set_title("Three distribution shapes as violins")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-ecdf", "ECDF plot", "The empirical CDF — no bins, no bin-width debates.", "Distributions", "ecdf_plot",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Empirical CDF: sorted values vs their quantile positions."""
import random

import matplotlib.pyplot as plt

random.seed(5)
${v("data")} = sorted(random.gauss(100, 15) for _ in range(300))
${v("y")} = [(i + 1) / len(${v("data")}) for i in range(len(${v("data")}))]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("ax")}.step(${v("data")}, ${v("y")}, where="post", color="#264653", linewidth=1.8)
for ${v("p")} in (0.25, 0.5, 0.75):
    ${v("idx")} = int(${v("p")} * len(${v("data")}) - 1)
    ${v("ax")}.plot([${v("data")}[${v("idx")}], ${v("data")}[${v("idx")}]], [0, ${v("p")}], color="#e76f51", linestyle=":", linewidth=1)
    ${v("ax")}.annotate(f"p{int(${v("p")} * 100)}={${v("data")}[${v("idx")}]:.0f}", (${v("data")}[${v("idx")}], ${v("p")}), xytext=(6, -8), textcoords="offset points", fontsize=9, color="#e76f51")

${v("ax")}.set_xlabel("value")
${v("ax")}.set_ylabel("cumulative share")
${v("ax")}.set_title("ECDF with quartile markers")
${v("fig")}.tight_layout()
plt.show()
`;
        }),

    // ─── Statistical & scientific plots ──────────────────────────────
    py("py-ex-heatmap", "Heatmap (imshow)", "A matrix as color — correlation-style grid with annotations.", "Statistical plots", "heatmap",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Matrix heatmap with cell annotations."""
import random

import matplotlib.pyplot as plt

random.seed(3)
${v("variables")} = ["x1", "x2", "x3", "x4", "x5"]
${v("n")} = len(${v("variables")})

${v("matrix")} = [[1.0 if i == j else random.uniform(-1, 1) for j in range(${v("n")})] for i in range(${v("n")})]
for i in range(${v("n")}):
    for j in range(i + 1, ${v("n")}):
        ${v("matrix")}[j][i] = ${v("matrix")}[i][j]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(6, 5))
${v("im")} = ${v("ax")}.imshow(${v("matrix")}, cmap="RdBu_r", vmin=-1, vmax=1)
${v("fig")}.colorbar(${v("im")}, label="correlation")
for i in range(${v("n")}):
    for j in range(${v("n")}):
        ${v("ax")}.annotate(f"{${v("matrix")}[i][j]:.2f}", (j, i), ha="center", va="center", fontsize=9, color="white" if abs(${v("matrix")}[i][j]) > 0.6 else "black")

${v("ax")}.set_xticks(range(${v("n")}), ${v("variables")})
${v("ax")}.set_yticks(range(${v("n")}), ${v("variables")})
${v("ax")}.set_title("Symmetric correlation-style heatmap")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-contour", "Contour plot", "Level curves of a 2-D function with labels and a filled variant.", "Statistical plots", "contour_plot",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Contour lines and filled contours of a bumpy surface."""
import math

import matplotlib.pyplot as plt

${v("n")} = 120
${v("xs")} = [-3.0 + 6.0 * i / (${v("n")} - 1) for i in range(${v("n")})]
${v("ys")} = [-3.0 + 6.0 * j / (${v("n")} - 1) for j in range(${v("n")})]
${v("zs")} = [[math.sin(${v("x")} * 1.3) * math.cos(${v("y")} * 1.1) for ${v("x")} in ${v("xs")}] for ${v("y")} in ${v("ys")}]

${v("fig")}, ${v("axes")} = plt.subplots(1, 2, figsize=(11, 4.4))
${v("cs")} = ${v("axes")}[0].contour(${v("xs")}, ${v("ys")}, ${v("zs")}, levels=9, cmap="viridis")
${v("axes")}[0].clabel(${v("cs")}, fontsize=8)
${v("axes")}[0].set_title("line contours")
${v("axes")}[1].contourf(${v("xs")}, ${v("ys")}, ${v("zs")}, levels=21, cmap="viridis")
${v("axes")}[1].set_title("filled contours")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-quiver", "Quiver (vector field)", "Arrows for a vector field — direction and magnitude at a glance.", "Statistical plots", "quiver_field",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A vector field drawn with quiver()."""
import matplotlib.pyplot as plt

${v("n")} = 11
${v("xs")} = [i - 5 for i in range(${v("n")})]
${v("ys")} = [j - 5 for j in range(${v("n")})]
${v("us")} = [[-y * 0.3 for y in ${v("ys")}] for x in ${v("xs")}]
${v("vs")} = [[x * 0.3 for y in ${v("ys")}] for x in ${v("xs")}]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(6, 5.5))
${v("ax")}.quiver(${v("xs")}, ${v("ys")}, ${v("us")}, ${v("vs")}, color="#2a9d8f", pivot="mid")
${v("ax")}.set_title("Rotational field: u=-y, v=x")
${v("ax")}.set_aspect("equal")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-radar", "Radar / polar chart", "Spider charts for multi-metric comparisons on polar axes.", "Statistical plots", "radar_chart",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Radar chart: two models scored on five metrics."""
import math

import matplotlib.pyplot as plt

${v("metrics")} = ["speed", "accuracy", "memory", "ease", "cost"]
${v("model_a")} = [0.7, 0.9, 0.6, 0.8, 0.5]
${v("model_b")} = [0.9, 0.6, 0.8, 0.6, 0.7]

${v("angles")} = [2 * math.pi * i / len(${v("metrics")}) for i in range(len(${v("metrics")}))]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(6, 6), subplot_kw=dict(polar=True))
for ${v("values")}, ${v("label")}, ${v("color")} in [(${v("model_a")}, "model A", "#264653"), (${v("model_b")}, "model B", "#e76f51")]:
    ${v("closed_values")} = ${v("values")} + [${v("values")}[0]]
    ${v("closed_angles")} = ${v("angles")} + [${v("angles")}[0]]
    ${v("ax")}.plot(${v("closed_angles")}, ${v("closed_values")}, color=${v("color")}, linewidth=2, label=${v("label")})
    ${v("ax")}.fill(${v("closed_angles")}, ${v("closed_values")}, color=${v("color")}, alpha=0.2)

${v("ax")}.set_xticks(${v("angles")}, ${v("metrics")})
${v("ax")}.set_ylim(0, 1)
${v("ax")}.set_title("Model comparison")
${v("ax")}.legend(loc="upper right", bbox_to_anchor=(1.25, 1.1))
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-linear-regression", "Linear regression (figure)", "Least-squares fit of noisy data with numpy, plus a fitted-line plot.", "Statistical plots", "linear_regression",
        (s) => `# -*- coding: utf-8 -*-
"""Least-squares linear regression on noisy synthetic data."""
import random

import matplotlib.pyplot as plt
import numpy as np

random.seed(7)
np.random.seed(7)

${applyNamingStyle(s.variables, "x_values")} = np.linspace(0.0, 10.0, 60)
${applyNamingStyle(s.variables, "y_values")} = 2.5 * ${applyNamingStyle(s.variables, "x_values")} + 1.0 + np.random.normal(0.0, 2.0, ${applyNamingStyle(s.variables, "x_values")}.size)

${applyNamingStyle(s.variables, "slope")}, ${applyNamingStyle(s.variables, "intercept")} = np.polyfit(${applyNamingStyle(s.variables, "x_values")}, ${applyNamingStyle(s.variables, "y_values")}, 1)
${applyNamingStyle(s.variables, "fitted")} = ${applyNamingStyle(s.variables, "slope")} * ${applyNamingStyle(s.variables, "x_values")} + ${applyNamingStyle(s.variables, "intercept")}
${applyNamingStyle(s.variables, "residuals")} = ${applyNamingStyle(s.variables, "y_values")} - ${applyNamingStyle(s.variables, "fitted")}
${applyNamingStyle(s.variables, "r_squared")} = 1.0 - (${applyNamingStyle(s.variables, "residuals")} ** 2).sum() / ((${applyNamingStyle(s.variables, "y_values")} - ${applyNamingStyle(s.variables, "y_values")}.mean()) ** 2).sum()

print(f"slope     = {${applyNamingStyle(s.variables, "slope")}:.3f}   (true 2.5)")
print(f"intercept = {${applyNamingStyle(s.variables, "intercept")}:.3f}   (true 1.0)")
print(f"R²        = {${applyNamingStyle(s.variables, "r_squared")}:.4f}")

${applyNamingStyle(s.variables, "fig")}, ${applyNamingStyle(s.variables, "ax")} = plt.subplots(figsize=(7, 4.5))
${applyNamingStyle(s.variables, "ax")}.scatter(${applyNamingStyle(s.variables, "x_values")}, ${applyNamingStyle(s.variables, "y_values")}, s=18, alpha=0.7, label="data")
${applyNamingStyle(s.variables, "ax")}.plot(${applyNamingStyle(s.variables, "x_values")}, ${applyNamingStyle(s.variables, "fitted")}, color="#e76f51", linewidth=2, label="fit")
${applyNamingStyle(s.variables, "ax")}.set_xlabel("x")
${applyNamingStyle(s.variables, "ax")}.set_ylabel("y")
${applyNamingStyle(s.variables, "ax")}.set_title("Least-squares fit")
${applyNamingStyle(s.variables, "ax")}.legend()
${applyNamingStyle(s.variables, "fig")}.tight_layout()
plt.show()
`),

    // ─── Layouts & annotations ───────────────────────────────────────
    py("py-ex-random-walk", "Random walk plot", "Cumulative random steps plotted as a time series with min/max markers.", "Layouts & annotations", "random_walk",
        (s) => `# -*- coding: utf-8 -*-
"""A 1-D random walk with running statistics."""
import random

import matplotlib.pyplot as plt

random.seed(11)

${applyNamingStyle(s.variables, "steps")} = 400
${applyNamingStyle(s.variables, "walk")} = [0.0]
for _ in range(${applyNamingStyle(s.variables, "steps")}):
    ${applyNamingStyle(s.variables, "walk")}.append(${applyNamingStyle(s.variables, "walk")}[-1] + random.choice([-1, 1]) * random.uniform(0.5, 1.5))

print(f"final position = {${applyNamingStyle(s.variables, "walk")}[-1]:.2f}")
print(f"max excursion  = {max(${applyNamingStyle(s.variables, "walk")}):.2f}")
print(f"min excursion  = {min(${applyNamingStyle(s.variables, "walk")}):.2f}")

${applyNamingStyle(s.variables, "fig")}, ${applyNamingStyle(s.variables, "ax")} = plt.subplots(figsize=(7.5, 4))
${applyNamingStyle(s.variables, "ax")}.plot(${applyNamingStyle(s.variables, "walk")}, linewidth=1.2)
${applyNamingStyle(s.variables, "ax")}.axhline(0.0, color="#999999", linewidth=0.8)
${applyNamingStyle(s.variables, "ax")}.set_xlabel("step")
${applyNamingStyle(s.variables, "ax")}.set_ylabel("position")
${applyNamingStyle(s.variables, "ax")}.set_title("Random walk")
${applyNamingStyle(s.variables, "fig")}.tight_layout()
plt.show()
`),
    py("py-ex-subplots", "Subplots gallery (figure)", "A 2×2 grid: line, scatter, bar, and box plots in one figure.", "Layouts & annotations", "subplots_gallery",
        (s) => `# -*- coding: utf-8 -*-
"""Four plot types in one 2x2 subplot grid."""
import random

import matplotlib.pyplot as plt

random.seed(5)

${applyNamingStyle(s.variables, "x")} = list(range(1, 21))
${applyNamingStyle(s.variables, "y")} = [3 * ${applyNamingStyle(s.variables, "v")} + random.uniform(-4, 4) for ${applyNamingStyle(s.variables, "v")} in ${applyNamingStyle(s.variables, "x")}]
${applyNamingStyle(s.variables, "groups")} = ["a", "b", "c", "d"]
${applyNamingStyle(s.variables, "means")} = [4.1, 7.6, 3.2, 5.9]

${applyNamingStyle(s.variables, "fig")}, ${applyNamingStyle(s.variables, "axes")} = plt.subplots(2, 2, figsize=(9, 7))
${applyNamingStyle(s.variables, "axes")}[0, 0].plot(${applyNamingStyle(s.variables, "x")}, ${applyNamingStyle(s.variables, "y")}, color="#264653")
${applyNamingStyle(s.variables, "axes")}[0, 0].set_title("line")
${applyNamingStyle(s.variables, "axes")}[0, 1].scatter(${applyNamingStyle(s.variables, "x")}, ${applyNamingStyle(s.variables, "y")}, s=16, color="#2a9d8f")
${applyNamingStyle(s.variables, "axes")}[0, 1].set_title("scatter")
${applyNamingStyle(s.variables, "axes")}[1, 0].bar(${applyNamingStyle(s.variables, "groups")}, ${applyNamingStyle(s.variables, "means")}, color="#e9c46a")
${applyNamingStyle(s.variables, "axes")}[1, 0].set_title("bar")
${applyNamingStyle(s.variables, "axes")}[1, 1].boxplot([[random.gauss(${applyNamingStyle(s.variables, "m")}, 1.0) for _ in range(40)] for ${applyNamingStyle(s.variables, "m")} in ${applyNamingStyle(s.variables, "means")}], tick_labels=${applyNamingStyle(s.variables, "groups")})
${applyNamingStyle(s.variables, "axes")}[1, 1].set_title("box")
${applyNamingStyle(s.variables, "fig")}.tight_layout()
plt.show()
`),
    py("py-ex-dual-axis", "Dual-axis plot", "Two related series with different units on shared x-axes.", "Layouts & annotations", "dual_axis",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Twin axes: temperature and ice-cream sales share the x-axis."""
import matplotlib.pyplot as plt

${v("months")} = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]
${v("temp")} = [12, 16, 21, 26, 29, 28, 23]
${v("sales")} = [110, 180, 320, 540, 720, 690, 430]

${v("fig")}, ${v("ax1")} = plt.subplots(figsize=(7.5, 4.5))
${v("ax1")}.plot(${v("months")}, ${v("temp")}, color="#e76f51", marker="o", label="temperature (C)")
${v("ax1")}.set_ylabel("temperature (C)", color="#e76f51")
${v("ax1")}.tick_params(axis="y", labelcolor="#e76f51")

${v("ax2")} = ${v("ax1")}.twinx()
${v("ax2")}.bar(${v("months")}, ${v("sales")}, alpha=0.35, color="#2a9d8f", label="sales (units)")
${v("ax2")}.set_ylabel("sales (units)", color="#2a9d8f")
${v("ax2")}.tick_params(axis="y", labelcolor="#2a9d8f")

${v("ax1")}.set_title("Correlated series, different units")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-annotations", "Annotations & arrows", "Pointing at the interesting parts of a curve.", "Layouts & annotations", "annotations_arrows",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""annotate() with arrows: call out maxima and crossings."""
import math

import matplotlib.pyplot as plt

${v("xs")} = [0.02 * math.pi * i for i in range(201)]
${v("ys")} = [math.sin(x) * math.exp(-0.3 * x) for x in ${v("xs")}]

${v("peak_x")} = max(${v("xs")}, key=lambda x: math.sin(x) * math.exp(-0.3 * x))
${v("peak_y")} = math.sin(${v("peak_x")}) * math.exp(-0.3 * ${v("peak_x")})

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("ax")}.plot(${v("xs")}, ${v("ys")}, color="#264653", linewidth=2)
${v("ax")}.annotate("first peak", xy=(${v("peak_x")}, ${v("peak_y")}), xytext=(1.6, 0.7), arrowprops=dict(arrowstyle="->", color="#e76f51"), fontsize=10, color="#e76f51")
${v("ax")}.annotate("envelope decays", xy=(4.0, math.sin(4.0) * math.exp(-1.2)), xytext=(4.5, 0.35), arrowprops=dict(arrowstyle="->", color="#2a9d8f"), fontsize=10, color="#2a9d8f")
${v("ax")}.axhline(0, color="#999999", linewidth=0.8, linestyle=":")
${v("ax")}.set_title("Damped sine with annotations")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-inset-axes", "Inset zoom plot", "A magnified inset showing a detail of the main curve.", "Layouts & annotations", "inset_zoom",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Inset axes: zoom into a region of interest."""
import math

import matplotlib.pyplot as plt

${v("xs")} = [i / 100.0 for i in range(1200)]
${v("ys")} = [math.sin(8 * x) * math.exp(-x) + 0.15 * math.cos(31 * x) for x in ${v("xs")}]

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.8))
${v("ax")}.plot(${v("xs")}, ${v("ys")}, color="#264653", linewidth=1.2)
${v("ax")}.set_title("Detail magnified in the inset")

${v("inset")} = ${v("ax")}.inset_axes([0.55, 0.55, 0.4, 0.4])
${v("inset")}.plot(${v("xs")}, ${v("ys")}, color="#e76f51", linewidth=1.2)
${v("inset")}.set_xlim(0.9, 1.2)
${v("inset")}.set_title("zoom", fontsize=9)
${v("ax")}.indicate_inset_zoom(${v("inset")}, edgecolor="#2a9d8f")

${v("fig")}.tight_layout()
plt.show()
`;
        }),
];
