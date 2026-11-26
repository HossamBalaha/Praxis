/**
 * 8 Swift reference templates (one of the six NEW runtime
 * languages added alongside). Bodies are script-style Swift
 * (top-level code allowed in a main file), created as .swift files
 * and runnable through the `swift` interpreter the moment it is
 * installed (Xcode on macOS / swift.org builds elsewhere).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Swift";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("swift", id, label, description, CAT, sub, baseName, ".swift", () => body);

export const SWIFT_EXAMPLES: FileExample[] = [
    ex("swift-ex-001", "Hello, Swift", "print, string interpolation and the type-inference feel.", "Basics", "hello_swift",
        `// Hello, Swift — print + \\(...) interpolation.
print("Hello from Swift!")

let name = "Praxis"                    // let = constant
print("Hello, \\(name)!")              // \\(expr) interpolation

var count = 42                        // var = variable
count += 1
print("count: \\(count), double: \\(Double(count) / 8)")

// Multi-line strings keep their newlines literally.
let banner = """
    +——————+
    |  \\(name) IDE  |
    +——————+
    """
print(banner)

// String repetition + concatenation.
print(String(repeating: "-", count: 20))
print("swift" + " " + "praxis")
`),

    ex("swift-ex-002", "Optionals", "Optionals: ? vs !, if-let, ??, guard-let and optional chaining.", "Core concepts", "optionals_tour",
        `// Optionals — nil handling without null-pointer crashes.
var nickname: String? = nil

// Optional chaining with ? short-circuits to nil.
print("upper: \\(nickname?.uppercased() as Any)")

// Nil-coalescing ?? supplies a default.
print("shown: \\(nickname ?? "no nickname")")

// if-let UNWRAPS into a fresh constant inside the block.
if let bound = nickname {
    print("never printed: \\(bound)")
} else {
    print("nickname was nil")
}

// guard-let unwraps and bails EARLY — the pyramid killer.
func greet(name: String?) -> String {
    guard let name = name else { return "hello stranger" }
    return "hello \\(name)"
}
print(greet(name: "Ada"))
print(greet(name: nil))

// Force unwrap ! asserts non-nil (panics when wrong).
let forced: String? = "definitely"
print("forced: \\(forced!)")
`),

    ex("swift-ex-003", "Control flow", "if/else, switch with ranges + tuples, for-in over ranges and strides.", "Control flow", "control_flow",
        `// Control flow — switch is an expression-grade pattern matcher.
let score = 87

if score >= 90 {
    print("grade A")
} else if score >= 80 {
    print("grade B")
} else {
    print("keep going")
}

// switch: no fall-through, ranges + tuples + bindings.
let day = 6
switch day {
case 1, 7:
    print("weekend")
case 2...6:
    print("weekday")
default:
    print("unknown")
}

let point = (2, 3)
switch point {
case (0, 0):
    print("origin")
case (let x, 0):
    print("on the x axis at \\(x)")
case (0, let y):
    print("on the y axis at \\(y)")
case let (x, y) where x == y:
    print("diagonal \\(x),\\(y)")
case let (x, y):
    print("point \\(x),\\(y)")
}

// for-in over ranges, strides, and sequences.
for i in 1...5 { print(i, terminator: " ") }
print()
for i in stride(from: 10, through: 1, by: -3) { print(i, terminator: " ") }
print()

// while + repeat-while (the do-while twin).
var power = 1
while power < 100 { power *= 3 }
print("past 100: \\(power)")
var tries = 0
repeat { tries += 1 } while false
print("repeat ran \\(tries) time")
`),

    ex("swift-ex-004", "Functions", "External + internal param names, defaults, variadics and closures.", "Functions", "functions_tour",
        `// Functions — argument labels are part of Swift's readability rule.
func volume(ofRadius radius: Double, height: Double = 1.0) -> Double {
    Double.pi * radius * radius * height
}

func sum(of values: Int...) -> Int {       // variadic
    values.reduce(0, +)
}

print(volume(ofRadius: 1.0))
print(volume(ofRadius: 2.0, height: 3.0))  // named default
print("sum() = \\(sum(of:))")
print("sum(1,2,3) = \\(sum(of: 1, 2, 3))")

// Closures: compact forms + trailing closure syntax.
let doubled = [1, 2, 3].map { $0 * 2 }      // $0 = first param
print("doubled: \\(doubled)")
let big = [1, 2, 3, 4].filter { $0 >= 3 }
print("big: \\(big)")
let folded = (1...5).reduce(0) { acc, n in acc + n }
print("folded: \\(folded)")

// guard + a function that throws — the Swift error convention.
enum ValidationError: Error { case negative, notAnInt(String) }

func parseAge(_ text: String) throws -> Int {
    guard let age = Int(text) else { throw ValidationError.notAnInt(text) }
    guard age >= 0 else { throw ValidationError.negative }
    return age
}

do {
    print("parsed:", try parseAge("31"))
    print(try parseAge("thirty-one"))
} catch let ValidationError.notAnInt(text) {
    print("not an int: \\(text)")
} catch ValidationError.negative {
    print("negative age")
}
`),

    ex("swift-ex-005", "Structs and classes", "struct value semantics vs class reference semantics + mutating methods.", "Core concepts", "structs_classes",
        `// Struct vs class — the value/reference split in one page.
struct Counter {
    var value = 0
    mutating func bump(by amount: Int = 1) -> Int {   // mutating opt-IN
        value += amount
        return value
    }
}
var a = Counter()
_ = a.bump()
_ = a.bump(by: 3)
var copy = a          // structs COPY on assignment
_ = copy.bump()        // mutates the COPY only
print("a: \\(a.value), copy: \\(copy.value)")    // 4 vs 5: independent

class CounterRef {     // classes SHARE references.
    var value = 0
    func bump(by amount: Int = 1) -> Int {   // no 'mutating' needed
        value += amount
        return value
    }
}
let r = CounterRef()
let alias = r
_ = alias.bump(by: 9)
print("r: \\(r.value) alias: \\(alias.value)")  // both 9: SAME object

// Computed properties + observers on a struct.
struct Thermometer {
    var celsius: Double {
        didSet { print("temperature moved to \\(celsius)°C") }
    }
    var fahrenheit: Double {                       // computed
        get { celsius * 9 / 5 + 32 }
        set { celsius = (newValue - 32) * 5 / 9 }
    }
}
var t = Thermometer(celsius: 20)
print("f: \\(t.fahrenheit)")
t.fahrenheit = 212
print("c: \\(t.celsius)")
`),

    ex("swift-ex-006", "Arrays and dictionaries", "Array/Dictionary/Set literals, subscript access, map/filter and the nil-default.", "Collections", "collections_tour",
        `// Collections — the literal-first trio.
var nums = [5, 1, 4, 2, 3]
print("count: \\(nums.count) first: \\(nums.first ?? -1)")
nums.append(9)                        // push
let last = nums.removeLast()          // pop
print("popped: \\(last), now: \\(nums)")

// sort + map + filter + compactMap (drops nils).
print("sorted: \\(nums.sorted())")
print("doubled: \\(nums.map { $0 * 2 })")
print("big: \\(nums.filter { $0 > 2 })")
let maybe: [Int?] = [1, nil, 3]
print("compact: \\(maybe.compactMap { $0 })")

// Dictionary — [] returns an optional (nil when missing).
var freq: [String: Int] = [:]
for word in "to be or not to be".split(separator: " ") {
    let key = String(word)
    freq[key, default: 0] += 1
}
print("freq: \\(freq)")
print("'to' -> \\(freq["to"] ?? 0)")
freq["zeta"] = nil                    // remove a key
print("keys: \\(freq.keys.sorted())")

// Set + the algebra.
let a: Set = [1, 2, 3, 4]
let b: Set = [3, 4, 5, 6]
print("union: \\(a.union(b).sorted())")
print("intersect: \\(a.intersection(b).sorted())")
print("difference: \\(a.subtracting(b).sorted())")
print("2 in a? \\(a.contains(2))")
`),

    ex("swift-ex-007", "Protocols and extensions", "Protocol with a default implementation via extension — Swift's interface layer.", "Advanced", "protocols_extensions",
        `// Protocols + extensions — the polymorphism without classes.
protocol Describable {
    var summary: String { get }
    func shout() -> String
}

// Extensions supply DEFAULT implementations.
extension Describable {
    func shout() -> String { summary.uppercased() + "!" }
    var loud: Bool { summary.count > 6 }
}

struct Planet: Describable {
    let name: String
    let orbitDays: Double
    var summary: String { "\\(name) orbits every \\(String(format: "%.1f", orbitDays)) days" }
}

struct Moon: Describable {
    let name: String
    var summary: String { "\\(name) is a moon" }
}

let bodies: [Describable] = [
    Planet(name: "Earth", orbitDays: 365.26),
    Moon(name: "Luna"),
]
for body in bodies {
    print(body.summary)
    print("  shouts: \\(body.shout())  loud: \\(body.loud)")
}

// Extensions can bolt methods onto ANY type, even stdlib ones.
extension Int {
    var squared: Int { self * self }
    func times(_ action: () -> Void) {
        for _ in 0..<self { action() }
    }
}
print("6 squared: \\(6.squared)")
3.times { print("tick", terminator: " ") }
print()
`),

    ex("swift-ex-008", "Errors and files", "throws + Result, defer, and writing/reading a file with String(contentsOf:).", "Practical", "errors_files",
        `import Foundation

enum ValidationError: Error {
    case negative
    case notAnInt(String)
}

func parseAge(_ text: String) throws -> Int {
    guard let age = Int(text) else { throw ValidationError.notAnInt(text) }
    guard age >= 0 else { throw ValidationError.negative }
    return age
}

// Result: the error as a VALUE — no try at the call site.
let outcomes = ["31", "-1", "thirty"].map { text -> Result<Int, ValidationError> in
    do { return .success(try parseAge(text)) }
    catch { return .failure(error as! ValidationError) }
}
for outcome in outcomes {
    switch outcome {
    case .success(let value): print("parsed: \\(value)")
    case .failure(.negative): print("negative age")
    case .failure(.notAnInt(let text)): print("not an int: \\(text)")
    @unknown default: print("unknown")
    }
}

// defer: runs at scope exit, in reverse order.
func scoped() -> String {
    defer { print("deferred cleanup") }
    let path = NSTemporaryDirectory() + "praxis_swift.txt"
    try? "alpha\\nbeta\\ngamma\\n".write(toFile: path, atomically: true, encoding: .utf8)
    if let content = try? String(contentsOfFile: path, encoding: .utf8) {
        let lines = content.split(separator: "\\n")
        print("read \\(lines.count) lines")
        lines.forEach { print("  line: \\($0)") }
    }
    try? FileManager.default.removeItem(atPath: path)
    return "done"
}
print(scoped())
`),
];
