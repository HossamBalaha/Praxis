// tags: typescript, formatting
/** Parser.ts — deliberately MESSY formatting: right-click ▸
 *  Auto-format TypeScript (Settings → Formatting) snaps the braces and
 *  the operator spacing back into shape. Nothing here can run — it is
 *  the formatter's playground.
 */
export interface Token {
    kind: string;
    text: string;
    line: number
}

const OPS = new Set(["=", "==", "===", "!=", "!==", "<=", ">=", "&&", "||", "=>", "+", "-", "*", "/"]);

export function tokenize(src: string): Token[] {
    const out: Token[] = [];
    let i = 0, line = 1;
    while (i < src.length) {
        const ch = src[i];
        if (ch === "\n") {
            line++;
            i++;
            continue
        }
        if (ch === " " || ch === "\t") {
            i++;
            continue
        }
        if (ch === "{" || ch === "}") {
            out.push({kind: "brace", text: ch, line});
            i++;
            continue
        }
        let j = i;
        while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
        if (j > i) {
            out.push({kind: OPS.has(src.slice(i, j)) ? "op" : "word", text: src.slice(i, j), line});
            i = j;
            continue
        }
        out.push({kind: "punct", text: ch, line});
        i++;
    }
    return out;
}

console.log("this file is for the Auto-format demo only");
