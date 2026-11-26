/**
 * Python — Data (pandas) examples. Category: "Data (pandas)".
 * Every example builds its own data in memory (or writes then reads
 * its own CSV) — no external input files needed.
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {fn, mkExample, vr} from "./_helpers";

const CAT = "Data (pandas)";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_DATA_EXAMPLES: FileExample[] = [
    // ─── Load & inspect ──────────────────────────────────────────────
    py("py-ex-pandas", "Pandas analysis (CSV out)", "Builds a DataFrame from scratch, groups it, prints a table, writes CSV — no input files needed.", "Load & inspect", "pandas_analysis",
        (s) => `# -*- coding: utf-8 -*-
"""Group-and-aggregate analysis with pandas — writes its own CSV output."""
import pandas as pd

${applyNamingStyle(s.variables, "rows")} = [
    {"${applyNamingStyle(s.dictKeys, "region")}": "north", "${applyNamingStyle(s.dictKeys, "product")}": "alpha", "${applyNamingStyle(s.dictKeys, "amount")}": 120.0},
    {"${applyNamingStyle(s.dictKeys, "region")}": "north", "${applyNamingStyle(s.dictKeys, "product")}": "beta", "${applyNamingStyle(s.dictKeys, "amount")}": 80.5},
    {"${applyNamingStyle(s.dictKeys, "region")}": "south", "${applyNamingStyle(s.dictKeys, "product")}": "alpha", "${applyNamingStyle(s.dictKeys, "amount")}": 210.0},
    {"${applyNamingStyle(s.dictKeys, "region")}": "south", "${applyNamingStyle(s.dictKeys, "product")}": "beta", "${applyNamingStyle(s.dictKeys, "amount")}": 95.25},
    {"${applyNamingStyle(s.dictKeys, "region")}": "east", "${applyNamingStyle(s.dictKeys, "product")}": "alpha", "${applyNamingStyle(s.dictKeys, "amount")}": 150.0},
]

${applyNamingStyle(s.variables, "df")} = pd.DataFrame(${applyNamingStyle(s.variables, "rows")})
${applyNamingStyle(s.variables, "summary")} = (
    ${applyNamingStyle(s.variables, "df")}
    .groupby("${applyNamingStyle(s.dictKeys, "region")}")["${applyNamingStyle(s.dictKeys, "amount")}"]
    .agg(["sum", "mean", "count"])
    .round(2)
)

print(${applyNamingStyle(s.variables, "df")})
print()
print(${applyNamingStyle(s.variables, "summary")})

${applyNamingStyle(s.variables, "df")}.to_csv("${applyNamingStyle(s.functions, "sales_report")}.csv", index=False)
print(f'\\nWrote ${applyNamingStyle(s.functions, "sales_report")}.csv next to this script.')
`),
    py("py-ex-pandas-groupby", "Pandas groupby & pivot", "Aggregations, a pivot table, and a filtered report — all in-memory.", "Load & inspect", "pandas_groupby",
        (s) => `# -*- coding: utf-8 -*-
"""GroupBy aggregations + a pivot table, no input files needed."""
import pandas as pd

${applyNamingStyle(s.variables, "rows")} = [
    {"region": "north", "product": "alpha", "quarter": "Q1", "amount": 120.0},
    {"region": "north", "product": "beta", "quarter": "Q1", "amount": 80.5},
    {"region": "south", "product": "alpha", "quarter": "Q1", "amount": 210.0},
    {"region": "south", "product": "beta", "quarter": "Q2", "amount": 95.25},
    {"region": "east", "product": "alpha", "quarter": "Q2", "amount": 150.0},
    {"region": "east", "product": "beta", "quarter": "Q2", "amount": 60.0},
    {"region": "west", "product": "alpha", "quarter": "Q1", "amount": 175.5},
    {"region": "west", "product": "beta", "quarter": "Q2", "amount": 88.75},
]
${applyNamingStyle(s.variables, "df")} = pd.DataFrame(${applyNamingStyle(s.variables, "rows")})

print("== per-region totals ==")
print(${applyNamingStyle(s.variables, "df")}.groupby("region")["amount"].agg(["sum", "mean", "count"]).round(2))

print()
print("== pivot: region x quarter ==")
print(${applyNamingStyle(s.variables, "df")}.pivot_table(index="region", columns="quarter", values="amount", aggfunc="sum", fill_value=0))

print()
print("== best-selling product per region ==")
print(${applyNamingStyle(s.variables, "df")}.loc[${applyNamingStyle(s.variables, "df")}.groupby("region")["amount"].idxmax(), ["region", "product", "amount"]])
`),
    py("py-ex-csv-roundtrip-pandas", "CSV write → read", "Writes a CSV then reads it back with pandas — dtypes included.", "Load & inspect", "csv_roundtrip_pandas",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Round-trip a DataFrame through a CSV file."""
import pandas as pd

${v("rows")} = [
    {"city": "cairo", "temp_c": 28.4, "humidity": 41},
    {"city": "london", "temp_c": 14.2, "humidity": 78},
    {"city": "tokyo", "temp_c": 22.9, "humidity": 65},
]
${v("df")} = pd.DataFrame(${v("rows")})
${v("path")} = "${fn(s)("weather")}.csv"
${v("df")}.to_csv(${v("path")}, index=False)
print(f"wrote {${v("path")}}")

${v("loaded")} = pd.read_csv(${v("path")})
print(${v("loaded")})
print()
print(${v("loaded")}.dtypes.to_string())
print(f"\\nround-trip equal: {${v("loaded")}.equals(${v("df")})}")
`;
        }),
    py("py-ex-describe-report", "describe() report", "The one-call EDA: describe, info, memory, and dtypes.", "Load & inspect", "describe_report",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Exploratory report in five lines of pandas."""
import pandas as pd

${v("df")} = pd.DataFrame({
    "city": ["cairo", "london", "tokyo", "nyc", "sydney", "lima"],
    "temp_c": [28.4, 14.2, 22.9, 18.3, 21.7, 19.5],
    "humidity": [41, 78, 65, 72, 68, 83],
})

print(${v("df")}.describe().round(2))
print()
print(f"rows x cols   : {${v("df")}.shape}")
print(f"memory (bytes): {${v("df")}.memory_usage(deep=True).sum()}")
print(f"nulls per col : {${v("df")}.isna().sum().sum()}")
print(f"cities        : {', '.join(${v("df")}['city'])}")
print(f"correlation   : {${v("df")}['temp_c'].corr(${v("df")}['humidity']):.3f}")
`;
        }),
    py("py-ex-json-records", "JSON records → DataFrame", "pd.json_normalize flattens nested API-style records.", "Load & inspect", "json_records",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Nested JSON to a flat DataFrame with json_normalize."""
import pandas as pd

${v("records")} = [
    {"user": "alice", "score": {"math": 92, "science": 88}, "tags": ["a"]},
    {"user": "bob", "score": {"math": 78, "science": 95}, "tags": ["a", "b"]},
    {"user": "carol", "score": {"math": 85, "science": 91}, "tags": []},
]

${v("flat")} = pd.json_normalize(${v("records")})
print(${v("flat")})
print()

${v("df")} = pd.DataFrame(${v("records")})
${v("scores")} = pd.json_normalize(${v("df")}["score"])
${v("result")} = pd.concat([${v("df")}[["user"]].reset_index(drop=True), ${v("scores")}], axis=1)
print(${v("result")})
print(f"\\nbest at math: {${v("result")}.loc[${v("result")}['math'].idxmax(), 'user']}")
`;
        }),

    // ─── Clean & transform ───────────────────────────────────────────
    py("py-ex-missing-values", "Missing values", "isna / fillna / dropna / interpolate — the four moves.", "Clean & transform", "missing_values",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Handling NaN: detect, fill, drop, interpolate."""
import pandas as pd
import numpy as np

${v("df")} = pd.DataFrame({
    "day": range(1, 9),
    "temp": [21.4, np.nan, 22.1, np.nan, np.nan, 23.0, 23.4, 23.9],
})

print(${v("df")})
print(f"\\nmissing per column:\\n{${v("df")}.isna().sum()}")

print("\\nfilled forward:")
print(${v("df")}.assign(temp=${v("df")}["temp"].ffill()))

print("\\ninterpolated:")
print(${v("df")}.assign(temp=${v("df")}["temp"].interpolate()))

print("\\ndropped:")
print(${v("df")}.dropna(subset=["temp"]).reset_index(drop=True))
`;
        }),
    py("py-ex-dedupe", "Duplicates", "Find them, count them, keep first / last / none.", "Clean & transform", "duplicates",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Duplicate rows: detect and resolve."""
import pandas as pd

${v("df")} = pd.DataFrame({
    "order": [101, 102, 101, 103, 102, 101],
    "item": ["a", "b", "a", "c", "b", "a"],
    "qty": [1, 2, 1, 5, 2, 1],
})

print(${v("df")})
print(f"\\nduplicated rows:\\n{${v("df")}.duplicated()}")
print(f"\\nfull duplicates: {${v("df")}.duplicated().sum()}")
print(f"duplicate order ids: {${v("df")}['order'].duplicated().sum()}")

print("\\nkeep='first':")
print(${v("df")}.drop_duplicates())

print("\\nkeep=False (only offenders):")
print(${v("df")}[${v("df")}.duplicated(keep=False)])
`;
        }),
    py("py-ex-string-columns", ".str accessor", "Vectorized string ops: slice, contains, replace, extract.", "Clean & transform", "string_columns",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The .str accessor — vectorized string processing."""
import pandas as pd

${v("df")} = pd.DataFrame({
    "email": ["Alice@Example.com", "bob@example.COM", "carol@example.com"],
    "phone": ["+20 100 123 4567", "+44 20 7946 0958", "+1 (212) 555-0198"],
})

${v("df")}["domain"] = ${v("df")}["email"].str.split("@").str[1].str.lower()
${v("df")}["user"] = ${v("df")}["email"].str.split("@").str[0].str.lower()
${v("df")}["digits"] = ${v("df")}["phone"].str.replace(r"\\D", "", regex=True)
${v("df")}["country"] = ${v("df")}["phone"].str.extract(r"^\\+(\\d{1,2})")
${v("df")}["is_example"] = ${v("df")}["domain"].str.contains("example", case=False)

print(${v("df")})
print(f"\\nall on example.com? {${v("df")}['is_example'].all()}")
print(f"phone lengths: {${v("df")}['digits'].str.len().tolist()}")
`;
        }),
    py("py-ex-type-coercion", "Type coercion", "astype, to_numeric with errors=, and datetime parsing.", "Clean & transform", "type_coercion",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Fixing dtypes — where most pandas bugs live."""
import pandas as pd

${v("df")} = pd.DataFrame({
    "id": ["1", "2", "3", "4"],
    "amount": ["12.5", "n/a", "7.25", "oops"],
    "date": ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"],
})
print("before:")
print(${v("df")}.dtypes.to_string())

${v("df")}["id"] = ${v("df")}["id"].astype(int)
${v("df")}["amount"] = pd.to_numeric(${v("df")}["amount"], errors="coerce")
${v("df")}["date"] = pd.to_datetime(${v("df")}["date"])

print("\\nafter:")
print(${v("df")}.dtypes.to_string())
print()
print(${v("df")})
print(f"\\nunparseable amounts: {${v("df")}['amount'].isna().sum()}")
print(f"days span: {(${v("df")}['date'].max() - ${v("df")}['date'].min()).days}")
`;
        }),
    py("py-ex-outliers-iqr", "Outliers with IQR", "Tukey fences applied vectorized, then winsorized.", "Clean & transform", "outliers_iqr",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Find and tame outliers with the IQR rule."""
import pandas as pd
import numpy as np

np.random.seed(3)
${v("values")} = np.concatenate([np.random.normal(50, 8, 200), [180, 2, 195]])
${v("df")} = pd.DataFrame({"value": ${v("values")}})

${v("q1")} = ${v("df")}["value"].quantile(0.25)
${v("q3")} = ${v("df")}["value"].quantile(0.75)
${v("iqr")} = ${v("q3")} - ${v("q1")}
${v("low")} = ${v("q1")} - 1.5 * ${v("iqr")}
${v("high")} = ${v("q3")} + 1.5 * ${v("iqr")}
${v("mask")} = (${v("df")}["value"] < ${v("low")}) | (${v("df")}["value"] > ${v("high")})

print(f"Q1={${v("q1")}:.1f}  Q3={${v("q3")}:.1f}  IQR={${v("iqr")}:.1f}")
print(f"fences: [{${v("low")}:.1f}, {${v("high")}:.1f}]")
print(f"outliers found: {${v("mask")}.sum()} -> {sorted(${v("df")}.loc[${v("mask")}, 'value'].round(1))}")

${v("winsorized")} = ${v("df")}["value"].clip(${v("low")}, ${v("high")})
print(f"\\nmean raw={${v("df")}['value'].mean():.2f}  winsorized={${v("winsorized")}.mean():.2f}")
print(f"sd   raw={${v("df")}['value'].std():.2f}  winsorized={${v("winsorized")}.std():.2f}")
`;
        }),
    py("py-ex-binning", "Binning (cut & qcut)", "Equal-width vs equal-frequency buckets with labels.", "Clean & transform", "binning",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""cut vs qcut: two philosophies of bucketing."""
import pandas as pd
import numpy as np

np.random.seed(1)
${v("scores")} = pd.Series(np.random.normal(70, 12, 200).clip(0, 100))

${v("width_bins")} = pd.cut(${v("scores")}, bins=[0, 60, 70, 80, 90, 100], right=False)
${v("freq_bins")} = pd.qcut(${v("scores")}, q=4, labels=["D", "C", "B", "A"])

print("equal-width (cut):")
print(${v("width_bins")}.value_counts().sort_index().to_string())
print("\\nequal-frequency (qcut):")
print(${v("freq_bins")}.value_counts().sort_index().to_string())
print(f"\\nletter grades by mean score: {${v("freq_bins")}.groupby(level=0).size().to_dict()}")
`;
        }),
    py("py-ex-datetime-features", "Datetime features", "Dates become columns: dow, month, is_weekend, deltas.", "Clean & transform", "datetime_features",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Feature engineering from datetimes."""
import pandas as pd

${v("df")} = pd.DataFrame({
    "order_id": range(1001, 1013),
    "placed": pd.date_range("2026-03-01", periods=12, freq="42h"),
})
${v("shipped_offset")} = pd.to_timedelta([1, 2, 0, 3, 1, 2, 5, 0, 1, 4, 2, 1], unit="D")

${v("df")}["shipped"] = ${v("df")}["placed"] + ${v("shipped_offset")}
${v("df")}["dow"] = ${v("df")}["placed"].dt.day_name()
${v("df")}["month"] = ${v("df")}["placed"].dt.month
${v("df")}["is_weekend"] = ${v("df")}["placed"].dt.dayofweek >= 5
${v("df")}["lead_days"] = (${v("df")}["shipped"] - ${v("df")}["placed"]).dt.days

print(${v("df")})
print(f"\\nweekend share    : {${v("df")}['is_weekend'].mean():.0%}")
print(f"mean lead (days) : {${v("df")}['lead_days'].mean():.2f}")
print(f"slowest order    : {${v("df")}.loc[${v("df")}['lead_days'].idxmax(), 'order_id']}")
`;
        }),

    // ─── GroupBy & aggregate ─────────────────────────────────────────
    py("py-ex-multi-agg", "Named aggregations", "Multiple aggregations per column with clean column names.", "GroupBy & aggregate", "named_aggregations",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""agg() with named aggregations — no more MultiIndex columns."""
import pandas as pd
import numpy as np

np.random.seed(7)
${v("df")} = pd.DataFrame({
    "team": np.random.choice(["alpha", "beta", "gamma"], 60),
    "metric": np.random.choice(["latency", "throughput"], 60),
    "value": np.random.normal(100, 20, 60).round(2),
})

${v("report")} = ${v("df")}.groupby(["team", "metric"]).agg(
    mean_value=("value", "mean"),
    sd_value=("value", "std"),
    n_obs=("value", "count"),
    min_value=("value", "min"),
    max_value=("value", "max"),
).round(2)

print(${v("report")})
print(f"\\nteam with highest mean: {${v("report")}['mean_value'].idxmax()[0]}")
`;
        }),
    py("py-ex-transform-vs-apply", "transform vs apply", "Broadcast group stats back to rows — z-scores within groups.", "GroupBy & aggregate", "transform_apply",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""transform() broadcasts; apply() reduces. Know the difference."""
import pandas as pd
import numpy as np

np.random.seed(11)
${v("df")} = pd.DataFrame({
    "class": np.repeat(["A", "B", "C"], 8),
    "score": np.concatenate([
        np.random.normal(60, 5, 8),
        np.random.normal(75, 5, 8),
        np.random.normal(90, 5, 8),
    ]).round(1),
})

${v("df")}["class_mean"] = ${v("df")}.groupby("class")["score"].transform("mean").round(2)
${v("df")}["deviation"] = ${v("df")}["score"] - ${v("df")}["class_mean"]
${v("df")}["z_in_class"] = (${v("df")}.groupby("class")["score"].transform(lambda x: (x - x.mean()) / x.std())).round(2)

print(${v("df")}.head(12))
print(f"\\nraw score mean: {${v("df")}['score'].mean():.2f}")
print(f"z overall std  : {${v("df")}['z_in_class'].std():.3f}  (~1 within groups)")
`;
        }),
    py("py-ex-crosstab", "crosstab & value_counts", "Contingency tables with margins and normalized shares.", "GroupBy & aggregate", "crosstab_counts",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Cross-tabulation: two categoricals in one grid."""
import pandas as pd
import numpy as np

np.random.seed(5)
${v("df")} = pd.DataFrame({
    "device": np.random.choice(["mobile", "desktop", "tablet"], 400),
    "plan": np.random.choice(["free", "pro"], 400, p=[0.7, 0.3]),
})

print("counts with margins:")
print(pd.crosstab(${v("df")}["device"], ${v("df")}["plan"], margins=True))

print("\\nrow shares:")
print(pd.crosstab(${v("df")}["device"], ${v("df")}["plan"], normalize="index").round(3))

print("\\nvalue_counts (device):")
print(${v("df")}["device"].value_counts().to_string())
`;
        }),
    py("py-ex-rolling", "Rolling windows", "Moving averages, expanding means, and detrending.", "GroupBy & aggregate", "rolling_windows",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Rolling and expanding statistics over a time series."""
import pandas as pd
import numpy as np

np.random.seed(9)
${v("index")} = pd.date_range("2026-01-01", periods=60, freq="D")
${v("trend")} = np.linspace(50, 70, 60)
${v("series")} = pd.Series(${v("trend")} + np.random.normal(0, 4, 60), index=${v("index")}, name="value")

${v("report")} = pd.DataFrame({
    "value": ${v("series")}.round(2),
    "ma7": ${v("series")}.rolling(7).mean().round(2),
    "ma30": ${v("series")}.rolling(30).mean().round(2),
    "expanding_mean": ${v("series")}.expanding().mean().round(2),
    "volatility7": ${v("series")}.rolling(7).std().round(2),
})

print(${v("report")}.iloc[::10].to_string())
${v("detrended")} = ${v("series")} - ${v("series")}.rolling(7).mean()
print(f"\\ndetrended sd: {${v("detrended")}.std():.2f} (raw {${v("series")}.std():.2f})")
`;
        }),

    // ─── Join & reshape ──────────────────────────────────────────────
    py("py-ex-merge", "merge (SQL joins)", "inner/left/right/outer joins with indicator and validation.", "Join & reshape", "merge_joins",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""SQL-style joins between DataFrames."""
import pandas as pd

${v("orders")} = pd.DataFrame({
    "order_id": [1, 2, 3, 4, 5],
    "customer_id": [10, 12, 10, 99, 11],
    "amount": [120.0, 85.5, 40.0, 300.0, 66.25],
})
${v("customers")} = pd.DataFrame({
    "customer_id": [10, 11, 12],
    "name": ["alice", "bob", "carol"],
})

print("inner:")
print(${v("orders")}.merge(${v("customers")}, on="customer_id", how="inner"))

print("\\nleft with indicator:")
print(${v("orders")}.merge(${v("customers")}, on="customer_id", how="left", indicator=True))

${v("unmatched")} = ${v("orders")}.merge(${v("customers")}, on="customer_id", how="left", indicator=True)
print(f"\\norders with no customer: {(${v("unmatched")}['_merge'] == 'left_only').sum()} (customer_id 99)")
print(f"their value: {${v("unmatched")}.loc[${v("unmatched")}['_merge'] == 'left_only', 'amount'].sum()}")
`;
        }),
    py("py-ex-concat", "concat & stack", "Vertical/horizontal stacking with ignore_index and keys.", "Join & reshape", "concat_stack",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""concat: glue DataFrames vertically or horizontally."""
import pandas as pd

${v("q1")} = pd.DataFrame({"month": ["jan", "feb", "mar"], "sales": [100, 110, 125]})
${v("q2")} = pd.DataFrame({"month": ["apr", "may", "jun"], "sales": [130, 128, 140]})
${v("targets")} = pd.DataFrame({"target": [105, 115, 120, 128, 132, 138]})

${v("year")} = pd.concat([${v("q1")}, ${v("q2")}], ignore_index=True)
${v("full")} = pd.concat([${v("year")}.reset_index(drop=True), ${v("targets")}], axis=1)
${v("full")}["beat"] = ${v("full")}["sales"] >= ${v("full")}["target"]
${v("tagged")} = pd.concat([${v("q1")}, ${v("q2")}], keys=["Q1", "Q2"])

print(${v("full")})
print(f"\\nmonths beating target: {${v("full")}['beat'].sum()}/6")
print("\\nwith quarter keys:")
print(${v("tagged")})
`;
        }),
    py("py-ex-melt", "melt & pivot", "Wide to long and back — tidy-data round trip.", "Join & reshape", "melt_pivot",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Wide <-> long: melt and pivot are inverses."""
import pandas as pd

${v("wide")} = pd.DataFrame({
    "region": ["north", "south", "east"],
    "q1": [120, 210, 150],
    "q2": [135, 190, 160],
    "q3": [150, 205, 170],
})

${v("long")} = ${v("wide")}.melt(id_vars="region", var_name="quarter", value_name="sales")
print("long (tidy):")
print(${v("long")})

${v("back")} = ${v("long")}.pivot(index="region", columns="quarter", values="sales")
print("\\npivoted back:")
print(${v("back")})

print(f"\\nround-trip equal (values): {${v("back")}.values.tolist() == ${v("wide")}[['q1', 'q2', 'q3']].values.tolist()}")
print(f"best quarter per region:\\n{${v("long")}.loc[${v("long")}.groupby('region')['sales'].idxmax()].reset_index(drop=True)}")
`;
        }),
    py("py-ex-multiindex", "MultiIndex", "Two-level indexes: slice, aggregate across levels, flatten.", "Join & reshape", "multiindex",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Hierarchical indexing in three moves."""
import pandas as pd

${v("index")} = pd.MultiIndex.from_product(
    [["alpha", "beta"], ["latency", "errors"], ["v1", "v2"]],
    names=["system", "metric", "version"],
)
${v("values")} = [12.4, 11.8, 3.1, 2.9, 15.2, 14.6, 4.4, 4.1]
${v("df")} = pd.DataFrame(${v("values")}, index=${v("index")}, columns=["value"])

print(${v("df")})
print("\\ncross-section alpha (any level):")
print(${v("df")}.xs("alpha", level="system"))

print("\\nmean per system+metric (across versions):")
print(${v("df")}.groupby(level=["system", "metric"]).mean().round(2))

print("\\nflattened:")
print(${v("df")}.reset_index())
`;
        }),
];
