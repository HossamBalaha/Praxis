import {describe, expect, it} from "vitest";
import {formatHtml, reindentHtml} from "@/lib/html-format";

describe("html-format — toolbar Format button", () => {
    it("block tags each get their own line, contents indent one level", () => {
        expect(formatHtml("<div><p>hi</p></div>")).toBe(
            "<div>\n" +
            "  <p>hi</p>\n" +
            "</div>\n"
        );
    });

    it("inline elements and text merge onto the current line", () => {
        expect(formatHtml("<p><b>a</b> and <i>b</i></p>")).toBe(
            "<p><b>a</b> and <i>b</i></p>\n"
        );
        expect(formatHtml("<a title=\"x\">t</a>")).toBe('<a title="x">t</a>\n');
    });

    it("does not re-indent the contents of <pre> (raw region)", () => {
        const src = "<body><pre>  keep\n    me</pre></body>";
        expect(formatHtml(src)).toBe(
            "<body>\n" +
            "  <pre>  keep\n    me</pre>\n" +
            "</body>\n"
        );
    });

    it("script bodies survive verbatim — a > and a literal </div> inside", () => {
        const src = '<div><script>if (a > b) { x = "</div>"; }</script></div>';
        expect(formatHtml(src)).toBe(
            '<div>\n' +
            '  <script>if (a > b) { x = "</div>"; }</script>\n' +
            '</div>\n'
        );
    });

    it("a quoted > inside an attribute never ends the tag", () => {
        const src = '<a title="a > b">t</a>';
        expect(formatHtml(src)).toBe('<a title="a > b">t</a>\n');
    });

    it("void and self-closing tags do not raise the depth", () => {
        expect(formatHtml("<div><img src='x'><hr/><span>s</span></div>")).toBe(
            "<div>\n" +
            "  <img src='x'>\n" +
            "  <hr/>\n" +
            "  <span>s</span>\n" +
            "</div>\n"
        );
    });

    it("collapses inter-tag whitespace and always ends with a newline", () => {
        expect(formatHtml("<html>  \n <body>\t</body>\n </html>  ")).toBe(
            "<html>\n" +
            "  <body></body>\n" +
            "</html>\n"
        );
    });

    it("comments get their own line; a stray < that starts no tag stays text", () => {
        expect(formatHtml("<!-- hi --><div>a < b</div>")).toBe(
            "<!-- hi -->\n" +
            "<div>a < b</div>\n"
        );
    });

    it("DOCTYPE passes through; empty input returns unchanged", () => {
        expect(formatHtml("<!DOCTYPE html>")).toBe("<!DOCTYPE html>\n");
        expect(formatHtml("   ")).toBe("   ");
        expect(formatHtml("")).toBe("");
    });

    it("multi-line body with attributes indents every level", () => {
        const src = `<!DOCTYPE html><html><head><title>T</title></head><body><ul><li>one</li><li>two</li></ul></body></html>`;
        expect(formatHtml(src)).toBe(
            "<!DOCTYPE html>\n" +
            "<html>\n" +
            "  <head>\n" +
            "    <title>T</title>\n" +
            "  </head>\n" +
            "  <body>\n" +
            "    <ul>\n" +
            "      <li>one</li>\n" +
            "      <li>two</li>\n" +
            "    </ul>\n" +
            "  </body>\n" +
            "</html>\n"
        );
    });
});

describe("reindentHtml — Auto-indent HTML", () => {
    it("normalizes leading whitespace without moving or joining lines", () => {
        const src = "<div>\n<p>hi</p>\n          <span>x</span>\n   </div>";
        expect(reindentHtml(src)).toBe(
            "<div>\n" +
            "  <p>hi</p>\n" +
            "  <span>x</span>\n" +
            "</div>"
        );
    });

    it("respects the configured indent unit (tabs / 4 spaces)", () => {
        const src = "<div>\n<p>a</p>\n</div>";
        expect(reindentHtml(src, "\t")).toBe("<div>\n\t<p>a</p>\n</div>");
        expect(reindentHtml(src, "    ")).toBe("<div>\n    <p>a</p>\n</div>");
    });

    it("inline and void tags do not open levels; single-line blocks stay put", () => {
        const src = "<p><b>a</b> and <i>b</i></p>\n<br>\n<li><span>x</span></li>";
        expect(reindentHtml(src)).toBe(
            "<p><b>a</b> and <i>b</i></p>\n" +
            "<br>\n" +
            "<li><span>x</span></li>"
        );
    });

    it("raw regions (pre / script / style) keep their inner lines verbatim", () => {
        const src = "<body>\n<pre>\n    keep  me\n  </pre>\n<script>\n  if (a>b) { x=1; }\n</script>\n</body>";
        expect(reindentHtml(src)).toBe(
            "<body>\n" +
            "  <pre>\n" +
            "    keep  me\n" +
            "  </pre>\n" +
            "  <script>\n" +
            "  if (a>b) { x=1; }\n" +
            "</script>\n" +
            "</body>"
        );
    });

    it("blank lines and comments survive untouched", () => {
        const src = "<div>\n\n<!-- note -->\n<p>ok</p>\n</div>";
        expect(reindentHtml(src)).toBe(
            "<div>\n" +
            "\n" +
            "  <!-- note -->\n" +
            "  <p>ok</p>\n" +
            "</div>"
        );
    });

    it("never outdents below zero on stray closers", () => {
        expect(reindentHtml("</div>\n<p>x</p>")).toBe("</div>\n<p>x</p>");
    });
});
