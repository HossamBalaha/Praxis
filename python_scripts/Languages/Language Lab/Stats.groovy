// Stats.groovy — runs through `groovy` (the runtime registry's Groovy entry).
// Closures + a map fold: everything a polyglot lab sample needs.
def readings = [12.5, 8.0, 20.3, 15.0, 9.8]

def summarize = { List<Double> values ->
    def sorted = values.sort(false)
    def total = values.sum()
    def mean = total / values.size()
    def median = sorted[(int) (values.size() / 2)]
    [total: total, mean: mean, median: median, spread: sorted.last() - sorted.first()]
}

def stats = summarize(readings)
println "Hello from Groovy — ${values.size(readings)} readings"
stats.each { key, value -> printf "%-8s %.2f%n", key, value }
