/**
 * KaTeX stylesheet carrier — imported ON DEMAND by lazy-katex (the
 * JS plugin and this CSS land in the same async chunk load, so there
 * is no flash-of-unstyled-math: by the time rehype-katex typesets,
 * the stylesheet link is already in the document). This keeps the
 * ~25 KB CSS (+ font URLs) OUT of the initial bundle.
 */
import "katex/dist/katex.min.css";

export {};
