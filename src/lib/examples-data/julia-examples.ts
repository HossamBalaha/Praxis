/**
 * 8 Julia reference templates (one of the six NEW runtime
 * languages added alongside). Bodies are pure-stdlib Julia, created
 * as .jl files and runnable through the `julia` interpreter the
 * moment it is installed.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Julia";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("julia", id, label, description, CAT, sub, baseName, ".jl", () => body);

export const JULIA_EXAMPLES: FileExample[] = [
    ex("julia-ex-001", "Hello, Julia", "println, @sprintf and the REPL-style everything-is-an-expression feel.", "Basics", "hello_julia",
        `# Hello, Julia — println, @printf and interpolation.
println("Hello from Julia!")

name = "Praxis"
println("Hello, ", name, "!")          # println joins with commas

# $ interpolates inside double-quoted strings.
count, pi_value = 42, 3.14159
println("int=$count and pi≈$(round(pi_value, digits = 4))")  # $(expr)

# @sprintf builds strings (the Printf stdlib).
using Printf
line = @sprintf("formatted %04d | %.4f", 7, 2.71828)
println(line)

# ' is the transpose/adjoint operator, NOT a string quote.
v = [1, 2, 3]
println("vector: $v  row vector: $(v')")
`),

    ex("julia-ex-002", "Types and conversions", "Concrete types, typeof, promotions, Int vs Float division.", "Basics", "types_conversions",
        `# Types — dynamic but strict about staying consistent.
x = 42
println("typeof(x) = ", typeof(x))       # Int64

y = 3.14
println("typeof(y) = ", typeof(y))       # Float64

# Integer division: ÷ (or div) vs the / that always promotes.
println("7 / 2 = ", 7 / 2)               # 3.5 — Float, ALWAYS
println("7 ÷ 2 = ", 7 ÷ 2)               # 3 — truncated
println("rem(7, 2) = ", rem(7, 2))       # remainder

# Explicit conversion over auto-coercion.
f = float(7)
i = trunc(Int, 3.99)
println("float(7) = $f  trunc(3.99) = $i")

# Rational literals: // keeps exact fractions.
println("1//3 + 1//6 = ", 1//3 + 1//6)   # 1//2

# Strings are immutable; concatenation is * (or string()).
a = "Hello"
b = "Julia"
println(a * ", " * b)
println(string(a, " and ", b))
`),

    ex("julia-ex-003", "Control flow", "if/elseif, ternary chains, for over ranges, while and compound expressions.", "Control flow", "control_flow",
        `# Control flow — blocks are expressions too.
score = 87

grade = if score >= 90
    "A"
elseif score >= 80
    "B"
else
    "C"
end
println("score $score -> $grade")

# Ternary + chained comparisons.
println(score > 50 ? "passed" : "failed")
println("in range: ", 80 <= score <= 90)   # chained, like math

# for over ranges and collections (1-based indexing!).
for i in 1:2:10                          # start:step:stop
    print(i, " ")
println()
for word in ["to", "be", "or"]
    print(word, " ")
println()

# while + break/continue.
power = 1
while power < 100
    global power *= 3                    # global needed at top level
end
println("past 100: $power")

for n in 1:10
    n % 2 == 0 && continue               # condition && action idiom
    n > 7 && break
    println("odd: $n")
end
`),

    ex("julia-ex-004", "Functions", "def forms, multiple dispatch on argument types, varargs and keyword args.", "Functions", "functions_tour",
        `# Functions — and MULTIPLE DISPATCH (Julia's heart).
area(radius::Float64) = pi * radius^2          # compact one-liner form
area(width::Float64, height::Float64) = width * height  # same NAME, different arity

# Full form + dispatch on TYPE (not on value).
function describe(value::Int)
    "an integer: $value"
end
function describe(value::String)
    "a string of length $(length(value))"
end

println(area(2.0))
println(area(2.0, 3.0))
println(describe(42))          # calls the Int method
println(describe("word"))      # calls the String method

# Varargs + keyword arguments.
function sum_all(values...)
    total = 0
    for v in values
        total += v
    end
    total
end
function greet(name; punctuation = "!")
    "Hello, $name$punctuation"
end

println("sum() = ", sum_all())
println("sum(1,2,3) = ", sum_all(1, 2, 3))
println(greet("Ada"))
println(greet("Grace", punctuation = "?"))

# Anonymous functions + map/filter/reduce.
doubled = map(x -> x * 2, [1, 2, 3])
println("doubled: $doubled")
println("big: ", filter(x -> x >= 2, [1, 2, 3, 4]))
println("reduce: ", reduce(+, 1:5))
`),

    ex("julia-ex-005", "Arrays", "1-based indexing, slices, push!/pop!, comprehensions and broadcasting dots.", "Data structures", "arrays_tour",
        `# Arrays — 1-based and broadcast-happy.
nums = [5, 1, 4, 2, 3]
println("first: $(nums[1])  last: $(nums[end])")   # 1-based + end

# Slices keep the range semantics.
println("middle: $(nums[2:4])")

# Mutators end in ! — the convention for "this modifies".
push!(nums, 9)
pop!(nums)
sort!(nums)
println("sorted: $nums")

# Comprehensions build new arrays.
squares = [n^2 for n in 1:5]
println("squares: $squares")

# Broadcasting: the DOT applies any function elementwise.
println("doubled: ", 2 .* nums)
println("squared: ", nums .^ 2)
println("halved:  ", nums ./ 2)

# Matrices: [row; row] stacks rows, spaces join columns.
matrix = [1 2 3; 4 5 6]
println("matrix: $matrix")
println("shape: $(size(matrix))  element [2,3]: $(matrix[2, 3])")
println("row 2: $(matrix[2, :])")
println("transpose: $(matrix')")
println("matrix * vector: ", matrix * [1, 1, 1])
`),

    ex("julia-ex-006", "Dictionaries and sets", "Dict literals, get-with-default, iteration pairs and Set operations.", "Data structures", "dicts_sets",
        `# Dict + Set — the hashed collections.
freq = Dict{String, Int}()             # typed dict
for word in split("to be or not to be")
    freq[word] = get(freq, word, 0) + 1
end
println("freq: $freq")

# get with a default NEVER inserts (unlike []).
println("missing reads as: ", get(freq, "zeta", 0))

# Iteration yields key => value pairs.
for (word, count) in freq
    println("  $word -> $count")
end
println("keys: ", sort(collect(keys(freq))))

person = Dict("name" => "Ada", "year" => 1815)
person["lang"] = "Analytical Engine"
println("name: $(person["name"])")

# Sets + the algebra.
a = Set([1, 2, 3, 4])
b = Set([3, 4, 5, 6])
println("union:        ", union(a, b))
println("intersect:    ", intersect(a, b))
println("difference:   ", setdiff(a, b))
println("2 in a? ", 2 in a)
`),

    ex("julia-ex-007", "Structs", "mutable vs immutable structs, constructors, inner methods on types.", "Types", "structs_tour",
        `# struct — immutable by default, like a named tuple.
struct Point
    x::Float64
    y::Float64
end

# Inner constructor + one convenience outer constructor.
struct Circle
    center::Point
    radius::Float64
    function Circle(center::Point, radius::Float64)
        radius < 0 && throw(ArgumentError("radius must be non-negative"))
        new(center, radius)
    end
end
Circle(x, y, r) = Circle(Point(x, y), r)     # convenience form

# Methods live OUTSIDE the struct — dispatch on the types.
distance(p::Point) = hypot(p.x, p.y)
area(c::Circle) = pi * c.radius^2
function Base.show(io::IO, p::Point)        # the printing overload
    print(io, "Point($(p.x), $(p.y))")
end

# mutable struct: fields CAN be reassigned.
mutable struct Counter
    value::Int
end
bump(c::Counter) = (c.value += 1; c)

p = Point(3.0, 4.0)
println(p)
println("distance = $(distance(p))")

c = Circle(1.0, 2.0, 3.0)
println("area = $(round(area(c), digits = 3))")

counter = Counter(0)
bump(counter); bump(counter)
println("counter: $(counter.value)")
`),

    ex("julia-ex-008", "Files and exceptions", "try/catch, reading lines, writing with open + do and eachline.", "Practical", "files_exceptions",
        `# Exceptions + file I/O the Julia way.
path = tempname() * ".txt"

# try / catch / finally exist like you expect.
try
    parse(Int, "thirty-one")
catch err
    println("caught: ", typeof(err))          # ArgumentError-ish family
end

# do-block syntax: the handle closes at the end.
open(path, "w") do handle
    println(handle, "alpha 1")
    println(handle, "beta 2")
    println(handle, "gamma 3")
end

# eachline streams lines without loading the file.
count = 0
for line in eachline(path)
    global count += 1
    print("read: ", rstrip(line), "\\n")
end
println("$count lines read")

# read + write (whole-file shortcuts).
write(path, "overwritten\\n")
println("slurped: ", rstrip(read(path, String)))

# Reading into typed numbers per line (split + parse).
open(path, "w") do handle
    println(handle, "score 87.5")
    println(handle, "score 95.0")
end
values = Float64[]
for line in eachline(path)
    parts = split(rstrip(line))
    push!(values, parse(Float64, parts[2]))
end
println("parsed values: $values  mean = $(sum(values) / length(values))")

rm(path)
println("cleaned up")
`),
];
