# tags: r, statistics
# analyze.R — runs through Rscript (the hint tells you to install R
# from cran.r-project.org when it is missing). Small enough to read
# in one glance; right-click ▸ Auto-indent R fixes the braces.

series <- c(2.4, 3.1, 2.8, 4.0, 3.6, 5.2, 4.8, 6.1)

report <- function(name, xs) {
  m <- mean(xs)
  s <- sd(xs)
  cat(sprintf("%s: n=%d mean=%.2f sd=%.2f min=%.2f max=%.2f\n",
              name, length(xs), m, s, min(xs), max(xs)))
}

report("series", series)

for (threshold in c(3, 4, 5)) {
  above <- series[series > threshold]
  cat(sprintf("above %.0f: n=%d\n", threshold, length(above)))
}

cat("R run complete.\n")
