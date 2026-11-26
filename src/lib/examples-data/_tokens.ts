/**
 * naming-token renderer for the generated example modules.
 *
 * The 1,400+ generated entries ("1000 py examples with more
 * sub cats … 50 in each cat other … + 5 more cats") are authored as
 * PLAIN template strings with lightweight tokens instead of the
 * `${applyNamingStyle(...)}` interpolations used by the hand-written
 * modules — a 1,000-entry module of nested interpolations
 * would be unreadable and slow to compile.
 *
 * Token syntax (⟦ ⟧ brackets never occur in real code):
 *   ⟦fn:name⟧  function name   → Settings → Editor → Naming style (functions)
 *   ⟦vr:name⟧  variable name   → … (variables)
 *   ⟦cl:name⟧  class name      → … (classes)
 *   ⟦ky:name⟧  dict/JSON key   → … (dict keys)
 *
 * `renderTokens` resolves them at creation time, so a camelCase user
 * gets `⟦vr:total_count⟧ → totalCount` while a snake_case user gets
 * `total_count`. After rendering, page.tsx reindent converts the
 * canonical 4-space indent to the configured indentation style.
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";

const TOKEN_RE = /⟦(fn|vr|cl|ky):([A-Za-z0-9_]+)⟧/g;

/** Resolve every naming token in a generated example body. */
export function renderTokens(body: string, s: NamingStyleSettings): string {
    if (!body.includes("⟦")) return body;
    return body.replace(TOKEN_RE, (_match, kind: string, name: string) => {
        switch (kind) {
            case "fn":
                return applyNamingStyle(s.functions, name);
            case "vr":
                return applyNamingStyle(s.variables, name);
            case "cl":
                return applyNamingStyle(s.classes, name);
            default:
                return applyNamingStyle(s.dictKeys, name);
        }
    });
}
