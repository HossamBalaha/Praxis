/**
 * Python — Statistics examples. Category: "Statistics".
 * Hypothesis tests are implemented from first principles (math +
 * numpy only) so every example runs with the bundled interpreter.
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {fn, mkExample, vr} from "./_helpers";

const CAT = "Statistics";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_STATISTICS_EXAMPLES: FileExample[] = [
    // ─── Descriptive statistics ──────────────────────────────────────
    py("py-ex-mean-variance", "Mean & variance", "Descriptive statistics with pure Python + a formatted report.", "Descriptive", "mean_variance",
        (s) => `# -*- coding: utf-8 -*-
"""Compute descriptive statistics for a sample of numbers."""

${applyNamingStyle(s.variables, "values")} = [12.4, 17.8, 9.6, 14.1, 19.3, 11.7]


def ${applyNamingStyle(s.functions, "mean")}(numbers: list[float]) -> float:
    return sum(numbers) / len(numbers)


def ${applyNamingStyle(s.functions, "variance")}(numbers: list[float]) -> float:
    ${applyNamingStyle(s.variables, "mu")} = ${applyNamingStyle(s.functions, "mean")}(numbers)
    return sum((${applyNamingStyle(s.variables, "x")} - ${applyNamingStyle(s.variables, "mu")}) ** 2 for ${applyNamingStyle(s.variables, "x")} in numbers) / len(numbers)


def main() -> None:
    print(f"n      = {len(${applyNamingStyle(s.variables, "values")})}")
    print(f"mean   = {${applyNamingStyle(s.functions, "mean")}(${applyNamingStyle(s.variables, "values")}):.3f}")
    print(f"var    = {${applyNamingStyle(s.functions, "variance")}(${applyNamingStyle(s.variables, "values")}):.3f}")
    print(f"std    = {${applyNamingStyle(s.functions, "variance")}(${applyNamingStyle(s.variables, "values")}) ** 0.5:.3f}")


if __name__ == "__main__":
    main()
`),
    py("py-ex-histogram", "Histogram & percentiles (figure)", "Draws a sample, prints a five-number summary, plots a histogram.", "Descriptive", "histogram_summary",
        (s) => `# -*- coding: utf-8 -*-
"""Sample statistics + histogram figure."""
import random

import matplotlib.pyplot as plt

random.seed(3)

${applyNamingStyle(s.variables, "sample")} = [random.gauss(50.0, 12.0) for _ in range(500)]
${applyNamingStyle(s.variables, "sample")}.sort()


def ${applyNamingStyle(s.functions, "percentile")}(${applyNamingStyle(s.variables, "data")}: list[float], ${applyNamingStyle(s.variables, "p")}: float) -> float:
    """Linear-interpolation percentile (like statistics.quantiles)."""
    ${applyNamingStyle(s.variables, "k")} = (${applyNamingStyle(s.variables, "p")} / 100) * (len(${applyNamingStyle(s.variables, "data")}) - 1)
    ${applyNamingStyle(s.variables, "f")} = int(${applyNamingStyle(s.variables, "k")})
    return ${applyNamingStyle(s.variables, "data")}[${applyNamingStyle(s.variables, "f")}] + (${applyNamingStyle(s.variables, "data")}[${applyNamingStyle(s.variables, "f")} + 1] - ${applyNamingStyle(s.variables, "data")}[${applyNamingStyle(s.variables, "f")}]) * (${applyNamingStyle(s.variables, "k")} - ${applyNamingStyle(s.variables, "f")})


print(f"n        = {len(${applyNamingStyle(s.variables, "sample")})}")
print(f"min      = {${applyNamingStyle(s.variables, "sample")}[0]:.2f}")
print(f"p25      = {${applyNamingStyle(s.functions, "percentile")}(${applyNamingStyle(s.variables, "sample")}, 25):.2f}")
print(f"median   = {${applyNamingStyle(s.functions, "percentile")}(${applyNamingStyle(s.variables, "sample")}, 50):.2f}")
print(f"p75      = {${applyNamingStyle(s.functions, "percentile")}(${applyNamingStyle(s.variables, "sample")}, 75):.2f}")
print(f"max      = {${applyNamingStyle(s.variables, "sample")}[-1]:.2f}")

${applyNamingStyle(s.variables, "fig")}, ${applyNamingStyle(s.variables, "ax")} = plt.subplots(figsize=(7, 4))
${applyNamingStyle(s.variables, "ax")}.hist(${applyNamingStyle(s.variables, "sample")}, bins=30, color="#2a9d8f", edgecolor="white")
${applyNamingStyle(s.variables, "ax")}.axvline(${applyNamingStyle(s.functions, "percentile")}(${applyNamingStyle(s.variables, "sample")}, 50), color="#e76f51", linewidth=2, label="median")
${applyNamingStyle(s.variables, "ax")}.set_xlabel("value")
${applyNamingStyle(s.variables, "ax")}.set_ylabel("count")
${applyNamingStyle(s.variables, "ax")}.set_title("Gaussian sample, n=500")
${applyNamingStyle(s.variables, "ax")}.legend()
${applyNamingStyle(s.variables, "fig")}.tight_layout()
plt.show()
`),
    py("py-ex-five-number", "Five-number summary", "min/Q1/median/Q3/max plus the IQR fence rule for outliers.", "Descriptive", "five_number_summary",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The five-number summary and Tukey's 1.5*IQR fences."""
import statistics as st

${v("data")} = [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 18, 21, 55]

${v("quartiles")} = st.quantiles(${v("data")}, n=4, method="inclusive")
${v("q1")}, ${v("q2")}, ${v("q3")} = ${v("quartiles")}
${v("iqr")} = ${v("q3")} - ${v("q1")}
${v("low_fence")} = ${v("q1")} - 1.5 * ${v("iqr")}
${v("high_fence")} = ${v("q3")} + 1.5 * ${v("iqr")}
${v("outliers")} = [${v("x")} for ${v("x")} in ${v("data")} if ${v("x")} < ${v("low_fence")} or ${v("x")} > ${v("high_fence")}]

print(f"n       : {len(${v("data")})}")
print(f"min     : {min(${v("data")})}")
print(f"Q1      : {${v("q1")}:.2f}")
print(f"median  : {${v("q2")}:.2f}")
print(f"Q3      : {${v("q3")}:.2f}")
print(f"max     : {max(${v("data")})}")
print(f"IQR     : {${v("iqr")}:.2f}")
print(f"fences  : [{${v("low_fence")}:.2f}, {${v("high_fence")}:.2f}]")
print(f"outliers: {${v("outliers")}}")
`;
        }),
    py("py-ex-mode-frequency", "Mode & frequency table", "statistics.multimode plus a formatted frequency table.", "Descriptive", "mode_frequency",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Mode(s) and a frequency table with running percentages."""
import statistics as st

${v("ratings")} = [5, 4, 5, 3, 5, 4, 4, 2, 5, 3, 4, 5, 1, 4, 3, 5, 5]

print(f"multimode : {st.multimode(${v("ratings")})}")
print(f"mean      : {st.mean(${v("ratings")}):.2f}")
print(f"median    : {st.median(${v("ratings")})}")

${v("counts")} = {}
for ${v("r")} in ${v("ratings")}:
    ${v("counts")}[${v("r")}] = ${v("counts")}.get(${v("r")}, 0) + 1

print(f"{'rating':>6} {'count':>6} {'share':>7}")
for ${v("rating")} in sorted(${v("counts")}):
    ${v("count")} = ${v("counts")}[${v("rating")}]
    print(f"{${v("rating")}:>6} {${v("count")}:>6} {100 * ${v("count")} / len(${v("ratings")}):>6.1f}%")
`;
        }),
    py("py-ex-skewness", "Skewness & kurtosis", "Moment-based skewness/kurtosis computed by hand on two samples.", "Descriptive", "skewness_kurtosis",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Skewness and excess kurtosis from raw moments."""
import statistics as st


def ${fn(s)("skewness")}(values: list[float]) -> float:
    ${v("mu")} = st.mean(values)
    ${v("sd")} = st.pstdev(values)
    return sum((${v("x")} - ${v("mu")}) ** 3 for ${v("x")} in values) / (len(values) * ${v("sd")} ** 3)


def ${fn(s)("kurtosis")}(values: list[float]) -> float:
    ${v("mu")} = st.mean(values)
    ${v("sd")} = st.pstdev(values)
    return sum((${v("x")} - ${v("mu")}) ** 4 for ${v("x")} in values) / (len(values) * ${v("sd")} ** 4) - 3.0


${v("right_skewed")} = [1, 2, 2, 3, 3, 4, 5, 12, 30]
${v("symmetric")} = [4, 4, 5, 5, 5, 6, 6, 7, 8]

for ${v("name")}, ${v("sample")} in [("right-skewed", ${v("right_skewed")}), ("symmetric", ${v("symmetric")})]:
    print(f"{${v("name")}:<13} skew={${fn(s)("skewness")}(${v("sample")}):+.3f}  kurtosis={${fn(s)("kurtosis")}(${v("sample")}):+.3f}")
`;
        }),
    py("py-ex-cv", "Coefficient of variation", "Scale-free spread comparison between two very different sensors.", "Descriptive", "coefficient_variation",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""CV = std / mean — comparing variability across units."""
import statistics as st

${v("temp_c")} = [21.4, 21.9, 22.6, 21.8, 22.1]
${v("pressure")} = [1009.2, 1011.8, 1010.4, 1012.1, 1010.9]

${v("cv_temp")} = st.stdev(${v("temp_c")}) / st.mean(${v("temp_c")})
${v("cv_pressure")} = st.stdev(${v("pressure")}) / st.mean(${v("pressure")})

print(f"temperature : mean={st.mean(${v("temp_c")}):.2f} C   sd={st.stdev(${v("temp_c")}):.3f}   CV={${v("cv_temp")}:.4f}")
print(f"pressure    : mean={st.mean(${v("pressure")}):.1f} hPa sd={st.stdev(${v("pressure")}):.2f}  CV={${v("cv_pressure")}:.4f}")
print(f"relatively noisier: {'temperature' if ${v("cv_temp")} > ${v("cv_pressure")} else 'pressure'}")
`;
        }),
    py("py-ex-robust-stats", "Robust statistics (MAD)", "Median, MAD and trimmed mean that resist outliers.", "Descriptive", "robust_stats",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Outlier-resistant alternatives to mean and standard deviation."""
import statistics as st
from collections import Counter

${v("income")} = [42, 45, 47, 49, 50, 52, 53, 55, 58, 950]

${v("median")} = st.median(${v("income")})
${v("mad")} = st.median([abs(${v("x")} - ${v("median")}) for ${v("x")} in ${v("income")}])
${v("trimmed")} = st.mean(sorted(${v("income")})[1:-1])

print(f"raw mean     : {st.mean(${v("income")}):.2f}   (dragged up by the outlier)")
print(f"median       : {${v("median")}:.2f}")
print(f"MAD          : {${v("mad")}:.2f}   (robust sd estimate: {1.4826 * ${v("mad")}:.2f})")
print(f"trimmed mean : {${v("trimmed")}:.2f}   (10% off each end)")

${v("counts")} = Counter(${v("income")})
${v("z_robust")} = [(${v("x")} - ${v("median")}) / (1.4826 * ${v("mad")}) for ${v("x")} in ${v("income")}]
print(f"robust z of max: {max(${v("z_robust")}):.2f}  -> clearly an outlier")
`;
        }),

    // ─── Distributions ───────────────────────────────────────────────
    py("py-ex-uniform", "Uniform distribution", "random.uniform vs triangular — means and a text histogram.", "Distributions", "uniform_sampler",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Uniform and triangular samplers with quick sanity checks."""
import random
import statistics as st

random.seed(1)
${v("u")} = [random.uniform(0.0, 10.0) for _ in range(20_000)]
${v("t")} = [random.triangular(0.0, 10.0, 3.0) for _ in range(20_000)]

print(f"uniform    : mean={st.mean(${v("u")}):.3f} (expect ~5.0)  sd={st.stdev(${v("u")}):.3f} (expect ~2.89)")
print(f"triangular : mean={st.mean(${v("t")}):.3f} (expect ~4.33) sd={st.stdev(${v("t")}):.3f}")

${v("bins")} = [0] * 10
for ${v("x")} in ${v("u")}:
    ${v("bins")}[min(int(${v("x")}), 9)] += 1
print("uniform histogram:")
for ${v("i")}, ${v("count")} in enumerate(${v("bins")}):
    ${v("lo")} = ${v("i")} * 10
    ${v("hi")} = ${v("lo")} + 10
    ${v("bar")} = "#" * (${v("count")} // 40)
    print(f"  {${v("lo")}:>2}-{${v("hi")}:<2} {${v("bar")}}")
`;
        }),
    py("py-ex-normal", "Normal distribution (figure)", "Gaussian pdf curve + sampled histogram overlay.", "Distributions", "normal_curve",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The normal distribution: pdf curve + sampled histogram."""
import math
import random

import matplotlib.pyplot as plt

random.seed(4)
${v("mu")} = 0.0
${v("sigma")} = 1.5
${v("sample")} = [random.gauss(${v("mu")}, ${v("sigma")}) for _ in range(4000)]

${v("xs")} = [${v("mu")} + 6 * ${v("sigma")} * (${v("i")} - 300) / 300 for ${v("i")} in range(601)]
${v("pdf")} = [math.exp(-((x - ${v("mu")}) ** 2) / (2 * ${v("sigma")} ** 2)) / (${v("sigma")} * math.sqrt(2 * math.pi)) for x in ${v("xs")}]

print(f"sample mean = {sum(${v("sample")}) / len(${v("sample")}):.3f}")
print(f"sample sd   = {math.sqrt(sum((x - ${v("mu")}) ** 2 for x in ${v("sample")}) / len(${v("sample")})):.3f}")

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("ax")}.hist(${v("sample")}, bins=60, density=True, color="#264653", alpha=0.55, label="sample")
${v("ax")}.plot(${v("xs")}, ${v("pdf")}, color="#e76f51", linewidth=2, label="pdf")
${v("ax")}.set_xlabel("x")
${v("ax")}.set_ylabel("density")
${v("ax")}.set_title(f"Normal(mu={${v("mu")}}, sigma={${v("sigma")}})")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-clt", "Central Limit Theorem (figure)", "Means of uniform samples converge to a Gaussian — the CLT live.", "Distributions", "clt_demo",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The Central Limit Theorem: averages of ANY noise become normal."""
import random
import statistics as st

import matplotlib.pyplot as plt

random.seed(8)

${v("sample_sizes")} = [1, 2, 5, 30]
${v("fig")}, ${v("axes")} = plt.subplots(1, 4, figsize=(12, 3.2), sharex=True, sharey=True)

for ${v("ax")}, ${v("size")} in zip(${v("axes")}, ${v("sample_sizes")}):
    ${v("means")} = []
    for _ in range(4000):
        ${v("draw")} = [random.uniform(0.0, 10.0) for _ in range(${v("size")})]
        ${v("means")}.append(st.mean(${v("draw")}))
    ${v("ax")}.hist(${v("means")}, bins=50, color="#2a9d8f", alpha=0.85)
    ${v("ax")}.set_title(f"n={${v("size")}}, sd={st.stdev(${v("means")}):.2f}")

${v("fig")}.suptitle("Means of uniform(0,10) draws — CLT in action")
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-binomial", "Binomial distribution", "Coin-flip counts: exact pmf vs simulated frequencies.", "Distributions", "binomial_coin",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Binomial(n, p): theory vs simulation."""
import math
import random
from collections import Counter

random.seed(12)
${v("n")} = 12
${v("p")} = 0.5
${v("trials")} = 20_000

${v("pmf")} = [math.comb(${v("n")}, ${v("k")}) * ${v("p")} ** ${v("k")} * (1 - ${v("p")}) ** (${v("n")} - ${v("k")}) for ${v("k")} in range(${v("n")} + 1)]

${v("counts")} = Counter(sum(random.random() < ${v("p")} for _ in range(${v("n")})) for _ in range(${v("trials")}))

print(f"{'heads':>5} {'theory':>8} {'simulated':>10}")
for ${v("k")} in range(${v("n")} + 1):
    ${v("sim")} = ${v("counts")}.get(${v("k")}, 0) / ${v("trials")}
    print(f"{${v("k")}:>5} {${v("pmf")}[${v("k")}]:>8.4f} {${v("sim")}:>10.4f}")

${v("mean_theory")} = ${v("n")} * ${v("p")}
${v("mean_sim")} = sum(${v("k")} * ${v("counts")}.get(${v("k")}, 0) for ${v("k")} in range(${v("n")} + 1)) / ${v("trials")}
print(f"mean: theory {${v("mean_theory")}:.2f}  simulated {${v("mean_sim")}:.2f}")
`;
        }),
    py("py-ex-poisson", "Poisson process", "Arrival counts from exponential waiting times.", "Distributions", "poisson_arrivals",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Poisson arrivals built from exponential gaps."""
import math
import random
from collections import Counter

random.seed(21)
${v("rate")} = 4.0
${v("hours")} = 3_000

${v("counts")} = []
for _ in range(${v("hours")}):
    ${v("total")} = 0.0
    ${v("events")} = -1
    while ${v("total")} < 1.0:
        ${v("total")} += random.expovariate(${v("rate")})
        ${v("events")} += 1
    ${v("counts")}.append(${v("events")})

${v("tally")} = Counter(${v("counts")})
print(f"{'k':>3} {'theory':>8} {'simulated':>10}")
for ${v("k")} in range(10):
    ${v("pmf")} = math.exp(-${v("rate")}) * ${v("rate")} ** ${v("k")} / math.factorial(${v("k")})
    print(f"{${v("k")}:>3} {${v("pmf")}:>8.4f} {${v("tally")}.get(${v("k")}, 0) / ${v("hours")}:>10.4f}")

${v("mean_sim")} = sum(${v("counts")}) / len(${v("counts")})
print(f"mean arrivals/hour: theory {${v("rate")}:.2f}  simulated {${v("mean_sim")}:.2f}")
`;
        }),
    py("py-ex-exponential", "Exponential & memorylessness", "Waiting times: P(X > s+t | X > s) == P(X > t), verified by simulation.", "Distributions", "exponential_memoryless",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The memoryless property of the exponential distribution."""
import random
import statistics as st

random.seed(7)
${v("rate")} = 0.5
${v("waits")} = [random.expovariate(${v("rate")}) for _ in range(50_000)]

${v("base")} = sum(1 for ${v("w")} in ${v("waits")} if ${v("w")} > 2.0) / len(${v("waits")})
${v("conditional")} = sum(1 for ${v("w")} in ${v("waits")} if ${v("w")} > 5.0) / sum(1 for ${v("w")} in ${v("waits")} if ${v("w")} > 3.0)

print(f"P(X > 2)            = {${v("base")}:.4f}   theory e^(-1.0) = {pow(2.718281828, -1.0):.4f}")
print(f"P(X > 5 | X > 3)    = {${v("conditional")}:.4f}   theory e^(-1.0) = {pow(2.718281828, -1.0):.4f}")
print(f"mean wait           = {st.mean(${v("waits")}):.3f}   theory 1/rate = {1 / ${v("rate")}:.3f}")
print(f"median wait         = {st.median(${v("waits")}):.3f}   theory ln2/rate = {0.6931 / ${v("rate")}:.3f}")
`;
        }),
    py("py-ex-lognormal", "Lognormal distribution", "Multiplicative noise: exp of Gaussians, fat right tail.", "Distributions", "lognormal_tail",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Lognormal: exp(normal) — skewed and heavy-tailed."""
import math
import random
import statistics as st

random.seed(33)
${v("mu")} = 0.0
${v("sigma")} = 0.8
${v("sample")} = [math.exp(random.gauss(${v("mu")}, ${v("sigma")})) for _ in range(30_000)]

${v("mean_theory")} = math.exp(${v("mu")} + ${v("sigma")} ** 2 / 2)
${v("median_theory")} = math.exp(${v("mu")})
${v("p99")} = sorted(${v("sample")})[int(0.99 * len(${v("sample")})) - 1]

print(f"mean   : simulated {st.mean(${v("sample")}):.3f}  theory {${v("mean_theory")}:.3f}")
print(f"median : simulated {st.median(${v("sample")}):.3f}  theory {${v("median_theory")}:.3f}")
${v("ratio_to_median")} = ${v("p99")} / st.median(${v("sample")})
print(f"99th pct: {${v("p99")}:.2f}  ({${v("ratio_to_median")}:.1f}x the median!)")
print(f"top 1% share of total: {sum(${v("x")} for ${v("x")} in ${v("sample")} if ${v("x")} >= ${v("p99")}) / sum(${v("sample")}):.3f}")
`;
        }),

    // ─── Inference ───────────────────────────────────────────────────
    py("py-ex-ttest-one", "One-sample t-test", "Manual t statistic, df, and the two-sided p-value via a t-table.", "Inference", "ttest_one_sample",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""One-sample t-test computed from first principles."""
import math
import statistics as st

# Critical two-sided t values (alpha=0.05) indexed by df.
${v("t_crit_95")} = {5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
                     11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 20: 2.086,
                     25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000}


def ${f("t_test")}(data: list[float], mu0: float) -> tuple[float, int, bool]:
    ${v("n")} = len(data)
    ${v("mean")} = st.mean(data)
    ${v("sd")} = st.stdev(data)
    ${v("se")} = ${v("sd")} / math.sqrt(${v("n")})
    ${v("t")} = (${v("mean")} - mu0) / ${v("se")}
    ${v("df")} = ${v("n")} - 1
    ${v("crit")} = ${v("t_crit_95")}.get(${v("df")}, 1.96)
    return ${v("t")}, ${v("df")}, abs(${v("t")}) > ${v("crit")}


${v("sample")} = [51.2, 48.8, 50.5, 49.9, 52.1, 47.6, 50.3, 49.1, 50.8, 48.4]
${v("t")}, ${v("df")}, ${v("reject")} = ${f("t_test")}(${v("sample")}, mu0=50.0)

print(f"sample mean = {st.mean(${v("sample")}):.3f} (H0: mu = 50.0)")
print(f"t = {${v("t")}:+.3f}   df = {${v("df")}}")
print(f"reject H0 at alpha=0.05? {${v("reject")}}")
`;
        }),
    py("py-ex-ttest-welch", "Welch's t-test", "Unequal-variance two-sample test with the Welch-Satterthwaite df.", "Inference", "ttest_welch",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Welch's t-test — the two-sample test that assumes nothing."""
import math
import statistics as st
import random

random.seed(2)
${v("group_a")} = [random.gauss(100.0, 15.0) for _ in range(30)]
${v("group_b")} = [random.gauss(108.0, 25.0) for _ in range(22)]

${v("ma")}, ${v("mb")} = st.mean(${v("group_a")}), st.mean(${v("group_b")})
${v("va")} = st.variance(${v("group_a")}) / len(${v("group_a")})
${v("vb")} = st.variance(${v("group_b")}) / len(${v("group_b")})

${v("t")} = (${v("mb")} - ${v("ma")}) / math.sqrt(${v("va")} + ${v("vb")})
${v("df")} = (${v("va")} + ${v("vb")}) ** 2 / (${v("va")} ** 2 / (len(${v("group_a")}) - 1) + ${v("vb")} ** 2 / (len(${v("group_b")}) - 1))

print(f"group A: n={len(${v("group_a")})} mean={${v("ma")}:.2f}")
print(f"group B: n={len(${v("group_b")})} mean={${v("mb")}:.2f}")
print(f"t = {${v("t")}:+.3f}   Welch df = {${v("df")}:.1f}")
print(f"mean difference = {${v("mb")} - ${v("ma")}:+.2f}")
`;
        }),
    py("py-ex-ttest-paired", "Paired t-test", "Before/after measurements — test the DIFFERENCES, not the groups.", "Inference", "ttest_paired",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Paired t-test: one sample test on the paired differences."""
import math
import statistics as st

${v("before")} = [72, 81, 65, 78, 80, 69, 75, 82, 70, 76]
${v("after")} = [75, 84, 67, 81, 82, 72, 76, 85, 74, 79]
${v("diffs")} = [${v("a")} - ${v("b")} for ${v("a")}, ${v("b")} in zip(${v("before")}, ${v("after")})]

${v("n")} = len(${v("diffs")})
${v("mean_d")} = st.mean(${v("diffs")})
${v("sd_d")} = st.stdev(${v("diffs")})
${v("t")} = ${v("mean_d")} / (${v("sd_d")} / math.sqrt(${v("n")}))
${v("crit")} = 2.262  # df=9, alpha=0.05, two-sided

print(f"mean improvement = {${v("mean_d")}:+.2f} (sd {${v("sd_d")}:.2f})")
print(f"t = {${v("t")}:+.3f}   df = {${v("n")} - 1}   critical ±{${v("crit")}}")
print(f"significant improvement? {abs(${v("t")}) > ${v("crit")}}")
print(f"every subject improved? {all(${v("d")} > 0 for ${v("d")} in ${v("diffs")})}")
`;
        }),
    py("py-ex-prop-test", "Proportion z-test", "Two-proportion z-test with pooled SE and a Wald CI.", "Inference", "proportion_ztest",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A/B test: is the new version's conversion really better?"""
import math

${v("conversions_a")}, ${v("n_a")} = 220, 2000
${v("conversions_b")}, ${v("n_b")} = 285, 2100

${v("p_a")} = ${v("conversions_a")} / ${v("n_a")}
${v("p_b")} = ${v("conversions_b")} / ${v("n_b")}
${v("p_pool")} = (${v("conversions_a")} + ${v("conversions_b")}) / (${v("n_a")} + ${v("n_b")})
${v("se")} = math.sqrt(${v("p_pool")} * (1 - ${v("p_pool")}) * (1 / ${v("n_a")} + 1 / ${v("n_b")}))

${v("z")} = (${v("p_b")} - ${v("p_a")}) / ${v("se")}
${v("ci_low")}, ${v("ci_high")} = (${v("p_b")} - ${v("p_a")}) - 1.96 * ${v("se")}, (${v("p_b")} - ${v("p_a")}) + 1.96 * ${v("se")}

print(f"control     : {${v("conversions_a")}/${v("n_a")}:.4f}  (${v("conversions_a")}/${v("n_a")})")
print(f"treatment   : {${v("conversions_b")}/${v("n_b")}:.4f}  (${v("conversions_b")}/${v("n_b")})")
print(f"lift        : {(${v("p_b")} - ${v("p_a")}) / ${v("p_a")}:.1%}")
print(f"z = {${v("z")}:+.3f}   (|z| > 1.96 => significant at 5%)")
print(f"95% CI of the difference: [{${v("ci_low")}:.4f}, {${v("ci_high")}:.4f}]")
print(f"significant? {abs(${v("z")}) > 1.96}")
`;
        }),
    py("py-ex-chi2", "Chi-square goodness of fit", "Are the die's six faces fair? Manual chi-square with df and p bound.", "Inference", "chi_square_die",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Chi-square goodness of fit on 600 die rolls."""
import math
import random
from collections import Counter

random.seed(6)
${v("rolls")} = [random.randint(1, 6) for _ in range(600)]
${v("observed")} = [Counter(${v("rolls")})[f] for f in range(1, 7)]
${v("expected")} = [100.0] * 6

${v("chi2")} = sum((o - e) ** 2 / e for o, e in zip(${v("observed")}, ${v("expected")}))
${v("df")} = 5
${v("crit_95")} = 11.070

print(f"observed : {${v("observed")}}")
print(f"expected : {${v("expected")}}")
print(f"chi2 = {${v("chi2")}:.3f}   df = {${v("df")}}   critical(0.05) = {${v("crit_95")}}")
print(f"die is unfair? {${v("chi2")} > ${v("crit_95")}}")

${v("chi2_loaded")} = sum((o - e) ** 2 / e for o, e in zip([80, 90, 100, 110, 120, 100], ${v("expected")}))
print(f"loaded-die example: chi2 = {${v("chi2_loaded")}:.3f} -> unfair? {${v("chi2_loaded")} > ${v("crit_95")}}")
`;
        }),
    py("py-ex-ci-figure", "Confidence intervals (figure)", "20 samples, their 95% CIs, and how many miss the true mean.", "Inference", "confidence_intervals",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Visualizing what '95% confidence' actually means."""
import random
import statistics as st

import matplotlib.pyplot as plt

random.seed(15)
${v("true_mean")} = 50.0
${v("sigma")} = 12.0

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4.5))
${v("misses")} = 0
for ${v("i")} in range(20):
    ${v("sample")} = [random.gauss(${v("true_mean")}, ${v("sigma")}) for _ in range(15)]
    ${v("m")} = st.mean(${v("sample")})
    ${v("se")} = st.stdev(${v("sample")}) / 15 ** 0.5
    ${v("low")}, ${v("high")} = ${v("m")} - 2.145 * ${v("se")}, ${v("m")} + 2.145 * ${v("se")}
    ${v("misses")} += not (${v("low")} <= ${v("true_mean")} <= ${v("high")})
    ${v("color")} = "#2a9d8f" if ${v("low")} <= ${v("true_mean")} <= ${v("high")} else "#e76f51"
    ${v("ax")}.plot([${v("i")}, ${v("i")}], [${v("low")}, ${v("high")}], color=${v("color")}, linewidth=2)
    ${v("ax")}.plot(${v("i")}, ${v("m")}, "o", color=${v("color")}, markersize=4)

${v("ax")}.axhline(${v("true_mean")}, color="#264653", linestyle="--", label="true mean")
${v("ax")}.set_xlabel("sample index")
${v("ax")}.set_ylabel("sample mean +/- 95% CI")
${v("ax")}.set_title(f"{20 - ${v("misses")}}/20 intervals cover the true mean")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-bootstrap", "Bootstrap CI (figure)", "Resample the sample: percentile bootstrap for the median.", "Inference", "bootstrap_median",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The bootstrap: the sample stands in for the population."""
import random
import statistics as st

import matplotlib.pyplot as plt

random.seed(9)
${v("sample")} = sorted(random.expovariate(0.2) for _ in range(80))

${v("boot_medians")} = []
for _ in range(5_000):
    ${v("resample")} = random.choices(${v("sample")}, k=len(${v("sample")}))
    ${v("boot_medians")}.append(st.median(${v("resample")}))

${v("boot_medians")}.sort()
${v("ci_low")} = ${v("boot_medians")}[int(0.025 * len(${v("boot_medians")})) - 1]
${v("ci_high")} = ${v("boot_medians")}[int(0.975 * len(${v("boot_medians")}))]

print(f"sample median      : {st.median(${v("sample")}):.3f}")
print(f"bootstrap 95% CI   : [{${v("ci_low")}:.3f}, {${v("ci_high")}:.3f}]")

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(7.5, 4))
${v("ax")}.hist(${v("boot_medians")}, bins=60, color="#264653", alpha=0.8)
${v("ax")}.axvline(${v("ci_low")}, color="#e76f51", linewidth=2, label="2.5%")
${v("ax")}.axvline(${v("ci_high")}, color="#e76f51", linewidth=2, label="97.5%")
${v("ax")}.set_xlabel("bootstrap median")
${v("ax")}.set_ylabel("count")
${v("ax")}.set_title("Bootstrap distribution of the median")
${v("ax")}.legend()
${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-permutation", "Permutation test", "Shuffle the labels 10,000 times — exact-ish p-value without formulas.", "Inference", "permutation_test",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Permutation test: no distributional assumptions at all."""
import random
import statistics as st

random.seed(17)
${v("control")} = [random.gauss(10.0, 3.0) for _ in range(18)]
${v("treatment")} = [random.gauss(11.5, 3.0) for _ in range(18)]
${v("observed_diff")} = st.mean(${v("treatment")}) - st.mean(${v("control")})

${v("pooled")} = ${v("control")} + ${v("treatment")}
${v("extreme")} = 0
${v("rounds")} = 10_000
for _ in range(${v("rounds")}):
    random.shuffle(${v("pooled")})
    ${v("diff")} = st.mean(${v("pooled")}[18:]) - st.mean(${v("pooled")}[:18])
    if abs(${v("diff")}) >= abs(${v("observed_diff")}):
        ${v("extreme")} += 1

${v("p_value")} = (${v("extreme")} + 1) / (${v("rounds")} + 1)
print(f"observed difference : {${v("observed_diff")}:+.3f}")
print(f"permutation p-value : {${v("p_value")}:.4f}")
print(f"significant at 5%?   {${v("p_value")} < 0.05}")
`;
        }),

    // ─── Correlation & regression ────────────────────────────────────
    py("py-ex-correlation", "Pearson & Spearman", "Linear vs rank correlation on linear, monotonic and noisy pairs.", "Correlation & regression", "correlation_coefficients",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Correlation: Pearson (linear) vs Spearman (any monotonic)."""
import math
import random
import statistics as st

random.seed(23)


def ${fn(s)("pearson")}(xs: list[float], ys: list[float]) -> float:
    ${v("mx")}, ${v("my")} = st.mean(xs), st.mean(ys)
    ${v("num")} = sum((x - ${v("mx")}) * (y - ${v("my")}) for x, y in zip(xs, ys))
    ${v("den")} = math.sqrt(sum((x - ${v("mx")}) ** 2 for x in xs) * sum((y - ${v("my")}) ** 2 for y in ys))
    return ${v("num")} / ${v("den")}


def ${fn(s)("spearman")}(xs: list[float], ys: list[float]) -> float:
    ${v("rank")} = lambda vals: [sorted(vals).index(val) + 1 for val in vals]
    return ${fn(s)("pearson")}(${v("rank")}(xs), ${v("rank")}(ys))


${v("linear")} = [(${v("x")}, 2 * ${v("x")} + 1) for ${v("x")} in range(1, 15)]
${v("x_vals")} = list(range(1, 15))
${v("monotonic_y")} = [math.log(${v("x")}) for ${v("x")} in ${v("x_vals")}]
${v("noisy_y")} = [${v("x")} + random.gauss(0, 5) for ${v("x")} in ${v("x_vals")}]

for ${v("name")}, ${v("ys")} in [("linear", [y for _, y in ${v("linear")}]), ("log (monotonic)", ${v("monotonic_y")}), ("noisy", ${v("noisy_y")})]:
    print(f"{${v("name")}:<16} pearson={${fn(s)("pearson")}(${v("x_vals")}, ${v("ys")}):+.3f}  spearman={${fn(s)("spearman")}(${v("x_vals")}, ${v("ys")}):+.3f}")
`;
        }),
    py("py-ex-multi-regression", "Multiple regression (lstsq)", "Two predictors fit with numpy.linalg.lstsq + R².", "Correlation & regression", "multiple_regression",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Ordinary least squares with several predictors."""
import numpy as np

np.random.seed(5)
${v("n")} = 120
${v("x1")} = np.random.uniform(0, 10, ${v("n")})
${v("x2")} = np.random.uniform(0, 5, ${v("n")})
${v("y")} = 3.0 + 1.8 * ${v("x1")} - 2.4 * ${v("x2")} + np.random.normal(0, 1.5, ${v("n")})

${v("design")} = np.column_stack([np.ones(${v("n")}), ${v("x1")}, ${v("x2")}])
${v("beta")}, *_ = np.linalg.lstsq(${v("design")}, ${v("y")}, rcond=None)

${v("predicted")} = ${v("design")} @ ${v("beta")}
${v("ss_res")} = ((${v("y")} - ${v("predicted")}) ** 2).sum()
${v("ss_tot")} = ((${v("y")} - ${v("y")}.mean()) ** 2).sum()
${v("r_squared")} = 1 - ${v("ss_res")} / ${v("ss_tot")}

print("true coefficients : [3.0, 1.8, -2.4]")
print(f"fitted coefficients: {np.round(${v("beta")}, 3)}")
print(f"R-squared          : {${v("r_squared")}:.4f}")

${v("residual_sd")} = float(np.sqrt(${v("ss_res")} / (${v("n")} - 3)))
print(f"residual sd        : {${v("residual_sd")}:.3f} (noise was 1.5)")
`;
        }),
    py("py-ex-residuals", "Residual analysis (figure)", "Fit a line, then read the residuals — curvature lives there.", "Correlation & regression", "residual_plot",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Residuals tell you what the fit missed."""
import random

import matplotlib.pyplot as plt
import numpy as np

random.seed(11)
np.random.seed(11)

${v("x")} = np.linspace(0, 10, 60)
${v("y")} = 2 + 0.5 * ${v("x")} + 0.09 * ${v("x")} ** 2 + np.random.normal(0, 0.6, 60)

${v("coef")} = np.polyfit(${v("x")}, ${v("y")}, 1)
${v("fit")} = np.polyval(${v("coef")}, ${v("x")})
${v("residuals")} = ${v("y")} - ${v("fit")}

${v("fig")}, (${v("ax1")}, ${v("ax2")}) = plt.subplots(1, 2, figsize=(11, 4))
${v("ax1")}.scatter(${v("x")}, ${v("y")}, s=16, color="#264653", label="data")
${v("ax1")}.plot(${v("x")}, ${v("fit")}, color="#e76f51", linewidth=2, label="linear fit")
${v("ax1")}.set_title("data + (wrong) linear fit")
${v("ax1")}.legend()

${v("ax2")}.scatter(${v("x")}, ${v("residuals")}, s=16, color="#2a9d8f")
${v("ax2")}.axhline(0, color="#999999", linewidth=0.8)
${v("ax2")}.set_title("residuals — the U-shape says: add x²")
${v("ax2")}.set_xlabel("x")
${v("ax2")}.set_ylabel("residual")

${v("fig")}.tight_layout()
plt.show()
`;
        }),
    py("py-ex-anova", "One-way ANOVA", "Between/within variance decomposition with the F ratio.", "Correlation & regression", "anova_one_way",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""One-way ANOVA by hand: F = MS_between / MS_within."""
import random
import statistics as st

random.seed(13)
${v("groups")} = {
    "placebo": [random.gauss(10.0, 2.0) for _ in range(12)],
    "low": [random.gauss(11.0, 2.0) for _ in range(12)],
    "high": [random.gauss(13.5, 2.0) for _ in range(12)],
}

${v("grand_mean")} = st.mean([x for g in ${v("groups")}.values() for x in g])
${v("k")} = len(${v("groups")})
${v("n_total")} = sum(len(g) for g in ${v("groups")}.values())

${v("ss_between")} = sum(len(g) * (st.mean(g) - ${v("grand_mean")}) ** 2 for g in ${v("groups")}.values())
${v("ss_within")} = sum(sum((x - st.mean(g)) ** 2 for x in g) for g in ${v("groups")}.values())

${v("ms_between")} = ${v("ss_between")} / (${v("k")} - 1)
${v("ms_within")} = ${v("ss_within")} / (${v("n_total")} - ${v("k")})
${v("f_stat")} = ${v("ms_between")} / ${v("ms_within")}

print(f"{'group':<8} {'n':>3} {'mean':>7} {'sd':>6}")
for ${v("name")}, ${v("g")} in ${v("groups")}.items():
    print(f"{${v("name")}:<8} {len(${v("g")}):>3} {st.mean(${v("g")}):>7.2f} {st.stdev(${v("g")}):>6.2f}")
print(f"F = {${v("f_stat")}:.3f}   df = ({${v("k")} - 1}, {${v("n_total")} - ${v("k")}})")
print(f"F > 3.28 (crit at 5%)? {${v("f_stat")} > 3.28}  -> means differ somewhere")
`;
        }),
    py("py-ex-qq-plot", "QQ plot (figure)", "Normal quantiles vs sample quantiles — the eyeball normality test.", "Correlation & regression", "qq_plot",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""QQ plot: sample quantiles against normal quantiles."""
import math
import random
import statistics as st

import matplotlib.pyplot as plt

random.seed(30)


def ${fn(s)("poly")}(coeffs: list[float], x: float) -> float:
    """Horner's rule: evaluate a polynomial without deep nesting."""
    ${v("total")} = 0.0
    for ${v("coeff")} in coeffs:
        ${v("total")} = ${v("total")} * x + ${v("coeff")}
    return ${v("total")}


def ${fn(s)("normal_quantile")}(p: float) -> float:
    """Inverse normal CDF — Acklam's rational approximation (~1e-9)."""
    ${v("a")} = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    ${v("b")} = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
    ${v("c")} = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    ${v("d")} = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    ${v("p_low")} = 0.02425
    if p < ${v("p_low")}:
        ${v("q")} = math.sqrt(-2 * math.log(p))
        return ${fn(s)("poly")}(${v("c")}, ${v("q")}) / (${fn(s)("poly")}(${v("d")}, ${v("q")}) * ${v("q")} + 1)
    if p <= 1 - ${v("p_low")}:
        ${v("q")} = p - 0.5
        ${v("r")} = ${v("q")} * ${v("q")}
        return ${fn(s)("poly")}(${v("a")}, ${v("r")}) * ${v("q")} / ${fn(s)("poly")}(${v("b")}, ${v("r")})
    ${v("q")} = math.sqrt(-2 * math.log(1 - p))
    return -${fn(s)("poly")}(${v("c")}, ${v("q")}) / (${fn(s)("poly")}(${v("d")}, ${v("q")}) * ${v("q")} + 1)


${v("normal_sample")} = sorted(random.gauss(0, 1) for _ in range(200))
${v("heavy_tail_sample")} = sorted(random.gauss(0, 1) + 0.35 * random.gauss(0, 4) for _ in range(200))

${v("theoretical")} = [${fn(s)("normal_quantile")}((i + 0.5) / 200) for i in range(200)]

${v("fig")}, ${v("axes")} = plt.subplots(1, 2, figsize=(11, 4.2))
for ${v("ax")}, ${v("sample")}, ${v("title")} in zip(
    ${v("axes")},
    [${v("normal_sample")}, ${v("heavy_tail_sample")}],
    ["normal sample — on the line", "heavy tails — S-curve at the ends"],
):
    ${v("sd")} = st.stdev(${v("sample")})
    ${v("scaled")} = [(x - st.mean(${v("sample")})) / ${v("sd")} for x in ${v("sample")}]
    ${v("ax")}.scatter(${v("theoretical")}, ${v("scaled")}, s=10, color="#2a9d8f", alpha=0.8)
    ${v("ax")}.plot([-3, 3], [-3, 3], color="#e76f51", linewidth=1.5)
    ${v("ax")}.set_xlabel("theoretical quantiles")
    ${v("ax")}.set_ylabel("sample quantiles")
    ${v("ax")}.set_title(${v("title")})

${v("fig")}.tight_layout()
plt.show()
`;
        }),

    // ─── Nonparametric tests ─────────────────────────────────────────
    py("py-ex-mann-whitney", "Mann-Whitney U", "Rank-based two-sample test — medians without normality.", "Nonparametric", "mann_whitney",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Mann-Whitney U: ranks instead of values."""
import random
import statistics as st

random.seed(19)
${v("group_a")} = sorted(random.gauss(50, 10) for _ in range(16))
${v("group_b")} = sorted(random.gauss(56, 12) for _ in range(14))

${v("pooled")} = sorted(${v("group_a")} + ${v("group_b")})
${v("ranks")} = {value: rank for rank, value in enumerate(${v("pooled")}, start=1)}
${v("rank_sum_a")} = sum(${v("ranks")}[x] for x in ${v("group_a")})

${v("n_a")}, ${v("n_b")} = len(${v("group_a")}), len(${v("group_b")})
${v("u_a")} = ${v("rank_sum_a")} - ${v("n_a")} * (${v("n_a")} + 1) / 2
${v("u_b")} = ${v("n_a")} * ${v("n_b")} - ${v("u_a")}
${v("u")} = min(${v("u_a")}, ${v("u_b")})

${v("mu_u")} = ${v("n_a")} * ${v("n_b")} / 2
${v("sd_u")} = ((${v("n_a")} * ${v("n_b")} * (${v("n_a")} + ${v("n_b")} + 1) / 12) ** 0.5)
${v("z")} = (${v("u")} - ${v("mu_u")}) / ${v("sd_u")}

print(f"group A median: {st.median(${v("group_a")}):.2f}   group B median: {st.median(${v("group_b")}):.2f}")
print(f"U = {${v("u")}:.0f}   (expected under H0: {${v("mu_u")}:.0f})")
print(f"normal approx z = {${v("z")}:+.3f}  -> {'significant' if abs(${v("z")}) > 1.96 else 'not significant'} at 5%")
`;
        }),
    py("py-ex-kruskal", "Kruskal-Wallis H", "ANOVA on ranks — comparing 3+ groups without normality.", "Nonparametric", "kruskal_wallis",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Kruskal-Wallis H test: one-way ANOVA on ranks."""
import random
import statistics as st

random.seed(25)
${v("groups")} = {
    "web": sorted(random.gauss(70, 12) for _ in range(14)),
    "mobile": sorted(random.gauss(64, 12) for _ in range(14)),
    "desktop": sorted(random.gauss(72, 12) for _ in range(14)),
}

${v("all_values")} = sorted(x for g in ${v("groups")}.values() for x in g)
${v("ranks")} = {value: rank for rank, value in enumerate(${v("all_values")}, start=1)}
${v("n")} = len(${v("all_values")})

${v("h_stat")} = 0.0
for ${v("name")}, ${v("g")} in ${v("groups")}.items():
    ${v("rank_sum")} = sum(${v("ranks")}[x] for x in ${v("g")})
    ${v("h_stat")} += ${v("rank_sum")} ** 2 / len(${v("g")})
${v("h_stat")} = 12 / (${v("n")} * (${v("n")} + 1)) * ${v("h_stat")} - 3 * (${v("n")} + 1)

print(f"{'channel':<9} {'n':>3} {'median':>7} {'mean rank':>9}")
for ${v("name")}, ${v("g")} in ${v("groups")}.items():
    ${v("mean_rank")} = sum(${v("ranks")}[x] for x in ${v("g")}) / len(${v("g")})
    print(f"{${v("name")}:<9} {len(${v("g")}):>3} {st.median(${v("g")}):>7.2f} {${v("mean_rank")}:>9.1f}")
print(f"H = {${v("h_stat")}:.3f}   df = {len(${v("groups")}) - 1}")
print(f"H > 5.991 (crit at 5%)? {${v("h_stat")} > 5.991}")
`;
        }),
    py("py-ex-sign-test", "Sign test", "The simplest test of all: count the wins.", "Nonparametric", "sign_test",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Sign test — binomial counting of plus/minus differences."""
import math

${v("before")} = [72, 81, 65, 78, 80, 69, 75, 82, 70, 76, 68, 79]
${v("after")} = [75, 79, 70, 80, 82, 72, 71, 85, 74, 73, 75, 81]

${v("pluses")} = sum(1 for b, a in zip(${v("before")}, ${v("after")}) if a > b)
${v("minuses")} = sum(1 for b, a in zip(${v("before")}, ${v("after")}) if a < b)
${v("ties")} = len(${v("before")}) - ${v("pluses")} - ${v("minuses")}
${v("n")} = ${v("pluses")} + ${v("minuses")}

${v("p_one_sided")} = sum(math.comb(${v("n")}, k) for k in range(${v("pluses")}, ${v("n")} + 1)) / 2 ** ${v("n")}

print(f"improved: {${v("pluses")}}   worsened: {${v("minuses")}}   ties (dropped): {${v("ties")}}")
print(f"sign test n = {${v("n")}}")
print(f"P(X >= pluses | fair coin) = {${v("p_one_sided")}:.4f}")
print(f"evidence of improvement at 5%? {${v("p_one_sided")} < 0.05}")
`;
        }),
];
