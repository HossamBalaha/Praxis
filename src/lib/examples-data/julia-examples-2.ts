/**
 * the Julia top-up: 42 more reference templates on top of the
 * eight more ("at least 50 like others". Pure Julia stdlib.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Julia";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("julia", id, label, description, CAT, sub, baseName, ".jl", () => body);

export const JULIA_2_EXAMPLES: FileExample[] = [
    ex("julia2-ex-001", "Types and conversions", "Abstract vs concrete, convert, promote.", "Types", "types_basics",
        `# Everything has a type; types are (mostly) immutable.
x = 42
println(typeof(x), " ", typeof(3.14), " ", typeof("text"))

# convert vs constructor: convert keeps meaning, constructor may wrap.
println(convert(Float64, 1) / 3)
println(Int(3.0))

# promote finds the common type.
println(promote(1, 2.5))
println(promote(true, 1))

# Supertypes walk the tree.
println(supertype(Int))
println(supertype(Signed))
println(Int <: Signed, Int <: Integer)
`),
    ex("julia2-ex-002", "Structs", "mutable vs immutable, field access, parametric types.", "Types", "structs",
        `struct Point
    x::Float64
    y::Float64
end

mutable struct Molecule
    name::String
    atoms::Int
end

# Parametric struct - one compiled method per element type.
struct Vec2{T}
    x::T
    y::T
end

p = Point(3.0, 4.0)
println(hypot(p.x, p.y))

m = Molecule("water", 3)
m.atoms += 1
println(m)

v = Vec2(1, 2)                # Vec2{Int}
println(v, " ", typeof(v))
`),
    ex("julia2-ex-003", "Multiple dispatch", "Methods selected by ALL argument types.", "Functions", "dispatch",
        `# The heart of Julia: dispatch on the whole signature.
area(r::Float64) = pi * r^2
area(w::Number, h::Number) = w * h
area(pts::Vector{Tuple{Float64, Float64}}) = "polygon with $(length(pts)) corners"

println(area(1.0))
println(area(3, 4))
println(area([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]))

describe(x) = "something"
describe(x::Integer) = "integer $x"
println(describe("text"))
println(describe(42))
println(methods(describe) |> length, " describe methods")
`),
    ex("julia2-ex-004", "Closures and functors", "Captures, callable structs, do-blocks.", "Functions", "closures",
        `function make_counter()
    n = 0
    return () -> (n += 1; n)
end

c1 = make_counter()
c2 = make_counter()
println((c1(), c1(), c1()))     # (1, 2, 3)
println(c2())                   # 1 - independent

# Callable struct = functor.
struct Scaler
    k::Float64
end
(s::Scaler)(x) = x * s.k
double = Scaler(2.5)
println(double(10))

# do-block sugar passes a closure as the first argument.
println(map(1:3) do x
    x^2 + 1
end)
`),
    ex("julia2-ex-005", "Varargs and keyword args", "... splats, named tuples as kwargs.", "Functions", "signatures",
        `function report(name, values...; prefix="item", joiner=",")
    total = sum(values)
    return "$prefix $name: [$joiner$(join(values, joiner))] = $total"
end

println(report("nums", 1, 2, 3))
println(report("pair", 5, 6, prefix="sum", joiner="+"))

# Splat an existing collection into positional args.
vals = [4, 5, 6]
println(report("spread", vals...))

# kwargs are a named tuple on the receiving side.
kwargs(; kw...) = kw
println(kwargs(a=1, b="two"))
`),
    ex("julia2-ex-006", "Broadcasting", "The dot: element-wise everything.", "Arrays", "broadcasting",
        `# The dot broadcasts ANY function or operator over collections.
v = [1.0, 4.0, 9.0]
println(sqrt.(v))
println(v .^ 2)
println(v .+ [10, 20, 30])

# Automatic fused loops - no temporaries.
M = [1 2; 3 4]
println(sin.(M) .+ cos.(M))

# @. broadcasts everything in one expression.
println(@. 1 + v / 2)

# Assignment fusion: no extra allocation.
w = zeros(3)
w .= v .* 2
println(w)
`),
    ex("julia2-ex-007", "Array construction", "zeros/ones/fill, comprehensions, ranges.", "Arrays", "construction",
        `println(zeros(Int, 2, 3))
println(ones(3) .+ 0.5)
println(fill("x", 2, 2))

# Comprehensions with guards.
println([i^2 for i in 1:5])
println([i for i in 1:10 if i % 3 == 0])

# Nested comprehensions build matrices.
println([r * c for r in 1:3, c in 1:4])

# Ranges are lazy.
r = 1:2:9
println(collect(r), " ", length(r), " ", sum(r))
println(range(0, stop=1, length=5))
`),
    ex("julia2-ex-008", "Views and slicing", "SubArrays without copying.", "Arrays", "views",
        `M = [1 2 3; 4 5 6; 7 8 9]

# Plain slicing COPIES.
copy_of_row = M[2, :]          # a new array
copy_of_row[1] = 99
println(M)                     # untouched

# view() aliases the original.
v = @view M[2, :]
v[1] = 99
println(M[2, 1])               # 99 - the view wrote through

reset!(m) = nothing
M[2, 1] = 4

parent_v = parent(v)
println("parent ok: ", parent_v === M)
println(size(v), " stride: ", Base.stride(M, 1))
`),
    ex("julia2-ex-009", "reduce, map, filter", "The functional trio with typed folds.", "Arrays", "functional",
        `v = 1:10

println(sum(v), " ", prod(v))
println(reduce(*, v))
println(map(x -> x^2, collect(v)))

# filter keeps only passing elements.
println(filter(isodd, collect(1:10)))

# foldl keeps order; reduce can reorder.
println(foldl((acc, x) -> acc + x^2, v; init=0))

# mapreduce is the fused idiom.
println(mapreduce(x -> x * 2, +, v))

# collect into specific containers.
println(mapreduce(identity, push!, v; init=String[]))
`),
    ex("julia2-ex-010", "Dictionary operations", "Dict, get with default, delete!, iteration.", "Collections", "dicts",
        `counts = Dict{String, Int}()
for w in split("go go is fun go")
    counts[w] = get(counts, w, 0) + 1
end
println(counts)

println(get(counts, "missing", 0))
println(haskey(counts, "go"))
println(counts["go"])

# delete! + pop!.
delete!(counts, "is")
println(haskey(counts, "is"))
println(pop!(counts, "fun", -1))

# Pairs and iteration order (Dicts are unordered).
for (k, v) in counts
    println("  $k => $v")
end
println(sort(collect(keys(counts))))
`),
    ex("julia2-ex-011", "Sets and tuples", "Set algebra + tuple destructuring.", "Collections", "sets_tuples",
        `a = Set([1, 2, 3, 4])
b = Set([3, 4, 5, 6])

println(union(a, b))
println(intersect(a, b))
println(setdiff(a, b))

println(4 in a, 9 in a)
push!(a, 10)
println(length(a))

# Tuples: heterogeneous, fixed size, destructurable.
t = ("praxis", 45, 3.5)
name, round, score = t
println("$name r$round score $score")
println(t[1], " ", typeof(t))
`),
    ex("julia2-ex-012", "Sorting", "sort with by/rev, sort! in place, sortperm.", "Collections", "sorting",
        `v = [5, 2, 9, 1]

println(sort(v), " vs original ", v)
sort!(v)
println(v)

words = ["pear", "fig", "apple"]
println(sort(words, by=length, rev=true))
println(sort(words))

v2 = [3, 1, 4, 1, 5]
perm = sortperm(v2)
println("perm $perm sorts to ", v2[perm])

# sort a matrix by a column.
M = [3 "c"; 1 "a"; 2 "b"]
println(M[sortperm(M[:, 1]), :])
`),
    ex("julia2-ex-013", "Strings in depth", "Interpolation, repeat, split, strip, search.", "Strings", "strings_deep",
        `s = "Praxis IDE"

println("len: $(length(s)), chars: $(collect(s)[1:6])")
println(repeat("=", 10))
println(strip("   padded   "), "|")
println(split("a,b,c", ","))
println(replace(s, "IDE" => "PDE"))
println(occursin("rax", s))
println(findfirst("IDE", s))
println(uppercase(s[1:6]), " + ", lowercase(s[7:end]))

big = "unicode: ünïcode!"
println(length(big), " chars / ", ncodeunits(big), " bytes")
`),
    ex("julia2-ex-014", "String macros and regex", "Search, match, capture groups.", "Strings", "regex",
        `log = "2024-06-15 ERROR disk 91%"

m = match(r"(\d+)-(\d+)-(\d+) (\w+)", log)
if m !== nothing
    println("year: ", m[1])
    println("word: ", m[4])
end

println(match(r"ERROR", log).match)
println(eachmatch(r"\\d+", log) |> collect .|> x -> x.match)

println(replace("a1b22c333", r"(\\d)" => s"#\\1#"))
println(split("x1y22z333", r"\\d+"))
println(occursin(r"^\\d", log))
`),
    ex("julia2-ex-015", "Files read and write", "open, readline, eachline, write.", "IO & Files", "file_io",
        `path = tempname()

# Write a whole file in one call.
open(path, "w") do io
    println(io, "line one")
    println(io, "line two")
end

# Read it back, line streaming style.
for line in eachline(path)
    println("read: ", line)
end

# Or all at once.
content = read(path, String)
println(length(content), " chars")

println(isfile(path), " size: ", filesize(path))
append_file = open(path, "a")
write(append_file, "appended\\n")
close(append_file)
println("total lines: ", length(readlines(path)))
rm(path)
println("exists after rm: ", isfile(path))
`),
    ex("julia2-ex-016", "CSV by hand", "Delimited parsing without packages.", "IO & Files", "csv_manual",
        `path = tempname()

# Write a small CSV.
rows = [("name", "score"), ("ada", "92"), ("alan", "81")]
open(path, "w") do io
    for r in rows
        println(io, join(r, ","))
    end
end

# Parse: split on commas, convert where possible.
parsed = []
for (i, line) in enumerate(eachline(path))
    fields = split(line, ",")
    if i > 1
        push!(parsed, (name=fields[1], score=parse(Int, fields[2])))
    end
end

sort!(parsed, by = r -> -r.score)
for r in parsed
    println(r.name, " -> ", r.score)
end

mean() = sum(r.score for r in parsed) / length(parsed)
println("mean: ", round(mean(); digits=1))
rm(path)
`),
    ex("julia2-ex-017", "stdout formatting", "println vs print, lpad, printf-style.", "IO & Files", "formatting",
        `print("no newline: ")
println("now complete")

# Columnar output via lpad/rpad.
rows = [("ada", 92), ("alan", 81), ("grace", 96)]
for (name, score) in rows
    println(rpad(name, 10), lpad(score, 5))
end

# Printf from the standard library.
using Printf
@printf("%-10s %5.1f\\n", "mean", 89.67)
@printf("hex %X oct %o sci %.2e\\n", 255, 8, 12345.678)

# round/show keep numbers tidy.
println(round(pi; digits=3))
println(string(1.5, " and ", 2))
println(repr("has quotes"))
`),
    ex("julia2-ex-018", "Serialization with JSON-like output", "Print structures machine-readably.", "Data Formats", "light_serialize",
        `# A tiny JSON writer for simple types (no deps).
function to_json(v::Dict)
    pairs = ["$(repr(k)): $(to_json(val))" for (k, val) in v]
    return "{" * join(pairs, ", ") * "}"
end
to_json(v::Vector) = "[" * join(to_json.(v), ", ") * "]"
to_json(v::String) = repr(v)
to_json(v::Number) = string(v)

data = Dict(
    "app" => "praxis",
    "round" => 45,
    "langs" => ["julia", "powershell", "batch"],
)
println(to_json(data))

# Round-trip via Julia-native print.
println(repr(data))
println(data isa Dict{String, Any})
`),
    ex("julia2-ex-019", "Dates and durations", "Dates stdlib: periods, formatting.", "Dates & Time", "dates",
        `using Dates

today = Date(2024, 6, 15)
println(today, " ", dayname(today))
println(Dates.format(today, "U d, yyyy"))

release = DateTime(2024, 6, 15, 9, 30)
println(release + Hour(3))
println(release + Day(2) - Minute(30))

println(Date(2024, 1, 1):Month(3):Date(2024, 12, 31) |> collect)

start = now()
println(typeof(start), " since epoch ms: ", Dates.value(start))
sleep(0.01)
println("elapsed: ", now() - start)
`),
    ex("julia2-ex-020", "Random numbers", "rand ranges, shuffle, seeded RNG.", "Numbers", "random",
        `rng = MersenneTwister(42)

println(rand(rng, 1:6))
println(rand(rng, 1:6, 5))
println(round.(rand(rng, 3); digits=3))

deck = collect(1:9)
shuffle!(rng, deck)
println(deck)

# Reproducibility: same seed, same stream.
a = rand(MersenneTwister(7), 2)
b = rand(MersenneTwister(7), 2)
println(a == b)

# Normal samples via randn.
println(round.(randn(rng, 3); digits=3))
`),
    ex("julia2-ex-021", "Complex and rational math", "im literals, Rational arithmetic.", "Numbers", "complex_rational",
        `z = 3 + 4im
println(abs(z), " ", conj(z), " ", z^2)

# Impedance-style arithmetic works directly.
r, i = reim(z)
println(angle(z) ≈ atan(i, r))

q = 3//4 + 1//4
println(q, " = ", float(q))
println(6//9, " ", 1//3 + 1//6)

# Mixed promotion.
println(1 + 1//2, " ", (1//2)^2, " ", 0.5 + 1//4)

# isapprox saves float comparisons.
println(pi ≈ 355/113, " ", sqrt(2)^2 ≈ 2)
`),
    ex("julia2-ex-022", "Linear algebra", "Matrix ops from the stdlib.", "Mathematics", "linalg",
        `A = [1 2; 3 4]
b = [5, 6]

println(A * b)
println(A' * A)                       # transpose
println(det(A), " ", norm([3, 4]))

# Solve the linear system.
x = A \ b                             # backslash = solve
println(x, " check: ", A * x ≈ b)

eigs = eigen(A)
println(eigs.values)

println(inv(A))
println(rank(A), " trace ", tr(A))
`),
    ex("julia2-ex-023", "Statistics in base", "mean, std, quantile without packages.", "Mathematics", "stats",
        `data = [2, 4, 4, 4, 5, 5, 7, 9]

println(mean(data))
println(median(data))
println(std(data), " ", var(data))

println(minimum(data), " ", maximum(data))
println(sum(data) / length(data))

# Quick histogram via counts.
bins = Dict{Int, Int}()
for v in data
    bins[v ÷ 4] = get(bins, v ÷ 4, 0) + 1
end
for k in sort(collect(keys(bins)))
    println("bin $k: ", "█"^bins[k])
end
`),
    ex("julia2-ex-024", "Performance: types and barriers", "Type stability and @code_warntype-lite.", "Performance", "type_stability",
        `# A type-stable function: same result type for every input.
function stable_sum(v::Vector{Float64})
    s = 0.0
    for x in v
        s += x
    end
    return s
end

# An UNstable one: accumulator flips Float64/Int.
function unstable_sum(v)
    s = 0
    for x in v
        s += x
    end
    return s
end

v = rand(1000) .+ 0.5
println(stable_sum(v))
println(unstable_sum(v))

# @time shows the compilation cost on FIRST call.
@time stable_sum(v)
@time stable_sum(v)
println("second call skips compilation")
`),
    ex("julia2-ex-025", "Benchmark by hand", "Timing with time_ns over repetitions.", "Performance", "bench",
        `function work(n)
    total = 0
    for i in 1:n
        total += i % 7
    end
    return total
end

# Warm up (compile), then time.
work(100)
samples = Float64[]
for _ in 1:5
    t0 = time_ns()
    work(100_000)
    push!(samples, (time_ns() - t0) / 1e6)
end

println("ms per run: ", round.(samples; digits=3))
println("median: ", round(median(samples); digits=3))
`),
    ex("julia2-ex-026", "Tasks and channels", "Async producer/consumer.", "Concurrency", "tasks",
        `function producer()
    Channel() do ch
        for i in 1:5
            put!(ch, i^2)
        end
    end
end

results = []
for value in producer()
    push!(results, value)
end
println(results)

# @sync/@async gather concurrent work.
outputs = Int[]
@sync for i in 1:4
    @async push!(outputs, i * 10)
end
println(sort(outputs))
println(Threads.nthreads(), " threads available")
`),
    ex("julia2-ex-027", "Exception handling", "try/catch/finally + custom exceptions.", "Errors", "exceptions",
        `struct ConfigError <: Exception
    field::String
    reason::String
end

Base.showerror(io::IO, e::ConfigError) =
    print(io, "ConfigError: ", e.field, " ", e.reason)

function validate(port)
    port isa Integer || throw(ConfigError("port", "not an integer"))
    1 <= port <= 65535 || throw(ConfigError("port", "out of range"))
    return port
end

for attempt in ["8080", 99999, 9090]
    try
        println("ok: ", validate(attempt))
    catch e
        if e isa ConfigError
            println("rejected: ", e.field, " - ", e.reason)
        else
            println("other: ", sprint(showerror, e))
        end
    finally
        println("  (validated $(attempt))")
    end
end
`),
    ex("julia2-ex-028", "Custom show and printing", "Overload show for pretty types.", "Errors", "show_overload",
        `struct Range2
    lo::Float64
    hi::Float64
end

Base.show(io::IO, r::Range2) = print(io, "[", r.lo, "..", r.hi, "]")
Base.show(io::IO, ::MIME"text/plain", r::Range2) =
    print(io, "Range2(", r.lo, ", ", r.hi, ") with width ", r.hi - r.lo)

r = Range2(1.5, 4.0)
println(r)                    # compact show
display(r)                    # text/plain show
println(repr(r))
`),
    ex("julia2-ex-029", "Metaprogramming basics", "quote, symbols, macro-ish eval.", "Macros", "meta_basics",
        `expr = :(a + b * 2)
println(expr)
println(typeof(expr))

a, b = 10, 3
println(eval(expr))

# Expressions are mutable data.
expr2 = :(x * y)
println(expr2.args)

# @macroexpand shows what a macro builds.
struct_ex = :(struct Temp; x::Int; end)
println(struct_ex.head)

# Generated strings via string interpolation are the everyday meta tool.
for name in ["alpha", "beta"]
    println("function make_$(name)() return \"$(name)\" end")
end
`),
    ex("julia2-ex-030", "A custom macro", "@mymacro writes code for you.", "Macros", "custom_macro",
        `macro unless(cond, body)
    quote
        if !($(esc(cond)))
            $(esc(body))
        end
    end
end

x = 10
@unless x > 5 begin
    println("x is small")
end
println("macro expanded into an if ! block")

macro twice(ex)
    quote
        local v = $(esc(ex))
        v, v
    end
end

a, b = @twice rand(1:99)
println(a, " == ", b)
`),
    ex("julia2-ex-031", "Interfaces: iteration", "Define iterate() to join the for-loop world.", "Interfaces", "iteration",
        `struct Fibonacci
    n::Int
end

function Base.iterate(f::Fibonacci, state = (0, 1))
    a, b = state
    if b > f.n
        return nothing
    end
    return (b, (b, a + b))
end

for v in Fibonacci(50)
    print(v, " ")
end
println()

f = Fibonacci(100)
println(collect(f))
println(sum(Fibonacci(100)), " ", length(collect(Fibonacci(100))))
`),
    ex("julia2-ex-032", "Interfaces: indexing", "getindex/setindex! for collection types.", "Interfaces", "indexing",
        `struct LabeledVec
    labels::Vector{String}
    values::Vector{Float64}
end

Base.getindex(lv::LabeledVec, label::String) =
    lv.values[findfirst(==(label), lv.labels)]
Base.getindex(lv::LabeledVec, i::Int) = lv.values[i]
Base.length(lv::LabeledVec) = length(lv.values)

lv = LabeledVec(["alpha", "beta", "gamma"], [1.0, 2.0, 3.0])
println(lv["beta"])
println(lv[3])
println(length(lv))
println([lv[l] for l in lv.labels])
`),
    ex("julia2-ex-033", "Unit testing (Test stdlib)", "@test, @test_thrown, test sets.", "Testing", "unit_tests",
        `using Test

clampf(v, lo, hi) = max(lo, min(v, hi))

@testset "clamp" begin
    @test clampf(5, 0, 10) == 5
    @test clampf(-3, 0, 10) == 0
    @test clampf(99, 0, 10) == 10
    @test clampf(0, 0, 10) == 0
end

@testset "errors" begin
    @test_throws DomainError sqrt(-1)
end

@testset "approx" begin
    @test 0.1 + 0.2 ≈ 0.3 atol=1e-12
end

# Inside Praxis: the runner reports the summary line.
println("test sets ran to completion")
`),
    ex("julia2-ex-034", "Package environment awareness", "Pkg status without installing anything.", "Packaging", "pkg_env",
        `using Pkg

# The active project of this session.
println("project: ", Base.active_project())

# Activate a temp environment WITHOUT adding packages.
mktempdir() do dir
    Pkg.activate(dir; io=devnull)
    println("temp env active: ", isdir(dir))
end

println("load path entries: ", length(Base.load_path()))

# A dependency-free existence check.
println("stdlib Dates loaded: ", isdefined(Main, :Dates))
using Dates
println("after using: ", Dates.today() isa Date)
`),
    ex("julia2-ex-035", "A mini test harness by hand", "Table-driven checks without Test.", "Testing", "mini_harness",
        `checks = [
    ("add", 2 + 2, 4),
    ("mul", 3 * 5, 15),
    ("float", 0.1 + 0.2, 0.3),
    ("string", "prax" * "is", "praxis"),
]

passed = 0
for (name, got, want) in checks
    ok = isapprox(got, want; atol=1e-9) || got == want
    if ok
        passed += 1
        println("  ok   $name")
    else
        println("  FAIL $name: got $got want $want")
    end
end

println("$passed/", length(checks), " passed")
println(isapprox(0.1 + 0.2, 0.3) ? "float approx saved us" : "float mismatch")
`),
    ex("julia2-ex-036", "A mini logger", "Leveled, macro-free logging with levels.", "Projects", "logger",
        `module MiniLog
    LEVELS = Dict("DEBUG" => 0, "INFO" => 1, "WARN" => 2, "ERROR" => 3)
    const min_level = Ref(1)

    function log(level::String, msg::String)
        LEVELS[level] >= min_level[] || return
        stamp = Dates.format(Dates.now(), "HH:MM:SS")
        println("[$stamp] ", rpad(level, 5), " ", msg)
    end
end

using .MiniLog
using Dates

MiniLog.log("DEBUG", "suppressed")
MiniLog.log("INFO", "service started")
MiniLog.log("WARN", "disk at 91%")
MiniLog.log("ERROR", "mirror sync failed")

MiniLog.min_level[] = 0
MiniLog.log("DEBUG", "now visible too")
`),
    ex("julia2-ex-037", "A config loader", "KV file parse + defaults + validation.", "Projects", "config_loader",
        `DEFAULTS = Dict("host" => "0.0.0.0", "port" => 8080, "retries" => 1)

function load_config(text)
    merged = merge(DEFAULTS, Dict(split(line, "=") .=> nothing for line in split(text)))
    # Re-parse values with types.
    out = Dict{String, Any}()
    for (k, v) in merged
        v isa Nothing || (out[k] = v)
    end
    for line in filter(!isempty, split(text, "\\n"))
        k, v = split(line, "=")
        out[string(k)] = tryparse(Int, string(v)) !== nothing ? parse(Int, v) : string(v)
    end
    port = out["port"]
    port isa Integer && 1 <= port <= 65535 || throw(ArgumentError("port out of range: $port"))
    return out
end

cfg = load_config("host=127.0.0.1\\nport=9090")
println("host=", cfg["host"], " port=", cfg["port"], " retries=", cfg["retries"])
try
    load_config("port=99999\\n")
catch e
    println("rejected: ", e.msg)
end
`),
    ex("julia2-ex-038", "A table report tool", "Data + sort + format alignment.", "Projects", "table_report",
        `rows = [
    (city="Cairo", temp=34),
    (city="Oslo", temp=12),
    (city="Sydney", temp=26),
]

println(rpad("CITY", 10), lpad("TEMP", 5))
println("-"^15)
for r in sort(rows, by = r -> -r.temp)
    println(rpad(r.city, 10), lpad(r.temp, 5))
end

temps = [r.temp for r in rows]
println("mean: ", round(sum(temps) / length(temps); digits=1))
println("range: ", minimum(temps), " .. ", maximum(temps))

# NamedTuple field access stays compile-time friendly.
println(typeof(rows[1]), " with ", fieldnames(typeof(rows[1])))
`),
    ex("julia2-ex-039", "Word statistics tool", "Read, tally, rank - the classic pipeline.", "Projects", "wordstats",
        `text = "go go is fun go runs everywhere fun times"
words = split(lowercase(text))

counts = Dict{String, Int}()
for w in words
    counts[w] = get(counts, w, 0) + 1
end

ranked = sort(collect(counts); by = kv -> -kv[2], rev=false)
println("unique words: ", length(ranked))
for (word, n) in ranked[1:min(3, end)]
    println(rpad(word, 12), n, "x")
end

println("longest: ", maximum(words))
println("avg word len: ", round(sum(length, words) / length(words); digits=2))
`),
    ex("julia2-ex-040", "Markdown-ish output generator", "Build a small document programmatically.", "Projects", "md_report",
        `sections = [
    ("Overview", ["A tiny generator.", "It builds text from data."]),
    ("Usage", ["call generate(doc)", "print the result"]),
]

function heading(level, text)
    return "#"^level * " " * text * "\\n"
end

function generate(doc)
    out = "# Praxis Report\\n\\n"
    for (name, lines) in doc
        out *= heading(2, name)
        for l in lines
            out *= "- " * l * "\\n"
        end
        out *= "\\n"
    end
    return out
end

result = generate(sections)
print(result)
println(length(collect(eachsplit(result, "\\n"))), " lines generated")
`),
    ex("julia2-ex-041", "A stats sampler tool", "Random data + summary + histogram bars.", "Projects", "sampler",
        `rng = MersenneTwister(45)

data = randn(rng, 200) .* 10 .+ 50   # normal around 50

println("n = ", length(data))
println("mean = ", round(mean(data); digits=2))
println("std  = ", round(std(data); digits=2))
println("min  = ", round(minimum(data); digits=1),
        " max = ", round(maximum(data); digits=1))

# ASCII histogram over integer bins.
bins = Dict{Int, Int}()
for v in data
    b = floor(Int, v / 10)
    bins[b] = get(bins, b, 0) + 1
end
for b in sort(collect(keys(bins)))
    println(lpad(b * 10, 5), " ", "█"^bins[b])
end
println("bins used: ", length(bins))
`),
    ex("julia2-ex-042", "A prime toolkit", "isprime, nextprime, factorization-lite.", "Projects", "primes_tool",
        `isprime(n::Integer) = n > 1 && all(n % i != 0 for i in 2:isqrt(n))

function nextprime(n)
    candidate = n + 1
    while !isprime(candidate)
        candidate += 1
    end
    return candidate
end

function primefactors(n)
    fs = Int[]
    remaining = n
    p = 2
    while p <= isqrt(remaining)
        while remaining % p == 0
            push!(fs, p)
            remaining ÷= p
        end
        p += 1
    end
    remaining > 1 && push!(fs, remaining)
    return fs
end

println(filter(isprime, 1:30))
println("next after 13: ", nextprime(13))
println("factors of 360: ", primefactors(360))
println(prod(primefactors(360)) == 360)
`),
];
