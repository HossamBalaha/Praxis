import {describe, expect, it} from "vitest";
import {detectMissingDataFiles, suggestPipInstalls} from "../run-output-hints";

/**
 * run-output-hints tests — the EXACT shapes the field reports hit:
 *   ▸ a pre-flight script printing "missing: SensorReadings.csv" (one
 *     per format — csv / tsv / xlsx / parquet / feather);
 *   ▸ a degraded run printing "pip install pandas openpyxl pyarrow to
 *     enable full reading." (trailing prose must NOT become packages);
 *   ▸ Python FileNotFoundError lines naming the data file.
 */

describe("detectMissingDataFiles", () => {
    it("collects every 'missing: X.ext' line", () => {
        const out = detectMissingDataFiles(
            [
                "checking for sensor data…",
                "missing: SensorReadings.csv",
                "missing: SensorReadings.tsv",
                "missing: SensorReadings.xlsx",
                "missing: SensorReadings.parquet",
                "missing: SensorReadings.feather",
            ].join("\n")
        );
        expect(out).toEqual([
            "SensorReadings.csv",
            "SensorReadings.tsv",
            "SensorReadings.xlsx",
            "SensorReadings.parquet",
            "SensorReadings.feather",
        ]);
    });

    it("dedupes and keeps source order", () => {
        const out = detectMissingDataFiles("missing: a.csv\nok line\nmissing: a.csv\nmissing: b.json");
        expect(out).toEqual(["a.csv", "b.json"]);
    });

    it("reads FileNotFoundError paths", () => {
        const out = detectMissingDataFiles(
            "Traceback (most recent call last):\n  File \"read.py\", line 3, in <module>\nFileNotFoundError: [Errno 2] No such file or directory: 'data/SensorReadings.csv'"
        );
        expect(out).toEqual(["SensorReadings.csv"]);
    });

    it("ignores prose and non-data files", () => {
        expect(detectMissingDataFiles("missing: love\nmissing: config.py\nall good")).toEqual([]);
    });

    it("caps a runaway list", () => {
        const lines = Array.from({length: 50}, (_, i) => `missing: f${i}.csv`);
        expect(detectMissingDataFiles(lines.join("\n")).length).toBeLessThanOrEqual(12);
    });
});

describe("suggestPipInstalls", () => {
    it("extracts the packages and drops the trailing prose", () => {
        const out = suggestPipInstalls(
            "pandas is not installed — this script only prints the file list.\npip install pandas openpyxl pyarrow  to enable full reading."
        );
        expect(out).toEqual([{
            packages: "pandas openpyxl pyarrow",
            raw: "pip install pandas openpyxl pyarrow  to enable full reading."
        }]);
    });

    it("handles pip3 and options without eating them as packages", () => {
        const out = suggestPipInstalls("pip3 install --upgrade numpy");
        expect(out).toEqual([{packages: "numpy", raw: "pip3 install --upgrade numpy"}]);
    });

    it("stops at the first prose word", () => {
        const out = suggestPipInstalls("pip install requests to fetch the feed");
        expect(out[0]?.packages).toBe("requests");
    });

    it("returns nothing for ordinary output", () => {
        expect(suggestPipInstalls("hello world\n42\nno pip here")).toEqual([]);
    });

    it("dedupes identical suggestions", () => {
        const out = suggestPipInstalls("pip install pandas\npip install pandas");
        expect(out).toHaveLength(1);
    });
});
