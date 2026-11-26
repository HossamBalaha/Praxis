/**
 * the Swift top-up: 42 more reference templates on top of the
 * eight more ("at least 50 like others". Pure Foundation-free Swift.
 *
 * Swift string interpolation \\(...) is double-escaped for the TS template
 * literal; \\n likewise.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Swift";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("swift", id, label, description, CAT, sub, baseName, ".swift", () => body);

export const SWIFT_2_EXAMPLES: FileExample[] = [
    ex("swift2-ex-001", "Optionals in depth", "map, flatMap, ??, nil-coalescing chains.", "Language Core", "optionals_deep",
        `// Optionals are enums - all these are pattern matching in disguise.
let number: Int? = 42

print(number ?? -1)
print(number.map { $0 * 2 } ?? -1)

let nested: Int?? = 5
print((nested ?? nil) ?? -1)           // flatten one layer

let missing: String? = nil
let length = missing.map { $0.count } ?? 0
print(length)

// if-let and guard-let.
if let value = number { print("have \\(value)") }
func require(_ v: Int?) -> Int {
    guard let value = v else { return 0 }
    return value * 10
}
print(require(number), require(missing.map { $0 + 1 }))
`),
    ex("swift2-ex-002", "Guard statements", "Early returns instead of nesting.", "Language Core", "guards",
        `func validate(age: Int?) throws -> Int {
    guard let age = age else {
        throw ValidationError("age", "missing")
    }
    guard age >= 0 else {
        throw ValidationError("age", "negative")
    }
    guard age <= 150 else {
        throw ValidationError("age", "suspicious")
    }
    return age
}

struct ValidationError: Error {
    let field: String
    let rule: String
}

for attempt: Int? in [36, nil, -1, 200] {
    do {
        print("ok: \\(try validate(age: attempt))")
    } catch let e as ValidationError {
        print("rejected \\(e.field): \\(e.rule)")
    } catch {
        print("other error")
    }
}
`),
    ex("swift2-ex-003", "Structs and mutating methods", "Value types + self mutation.", "Value Types", "structs_swift",
        `struct Counter {
    private(set) var count = 0

    mutating func bump(by step: Int = 1) {
        count += step
    }

    func snapshot() -> String { "\\(count)" }
}

struct Temperature {
    var celsius: Double
    init(fahrenheit f: Double) { celsius = (f - 32) / 1.8 }
    var fahrenheit: Double { celsius * 1.8 + 32 }   // computed property
}

var c = Counter()
c.bump()
c.bump(by: 10)
print(c.count, c.snapshot())

let t = Temperature(fahrenheit: 100)
print("celsius: \\(String(format: "%.1f", t.celsius))")
print("back: \\(String(format: "%.1f", t.fahrenheit))")
`),
    ex("swift2-ex-004", "Classes: reference semantics", "Identity vs equality, deinit.", "Value Types", "classes_swift",
        `final class Node {
    let label: String
    var next: Node?

    init(label: String, next: Node? = nil) {
        self.label = label
        self.next = next
    }
    deinit { print("releasing \\(label)") }
}

func chain() -> String {
    let c = Node(label: "c")
    let b = Node(label: "b", next: c)
    let a = Node(label: "a", next: b)

    var seen: [String] = []
    var cursor: Node? = a
    while let node = cursor {
        seen.append(node.label)
        cursor = node.next
    }
    return seen.joined(separator: "->")
}
print(chain())

// Reference types share; value types copy.
var shared = Node(label: "shared")
var alias = shared
alias.label = "renamed"          // no copy - the SAME object
print(shared.label)
`),
    ex("swift2-ex-005", "Enums with payload", "Associated values + exhaustive switch.", "Value Types", "enums_payload",
        `enum Shape {
    case circle(radius: Double)
    case rect(w: Double, h: Double)
    case empty
}

func area(_ s: Shape) -> Double {
    switch s {
    case .circle(let r): return Double.pi * r * r
    case .rect(let w, let h): return w * h
    case .empty: return 0
    }
}

let shapes: [Shape] = [.circle(radius: 1), .rect(w: 3, h: 4), .empty]
for s in shapes {
    print(String(format: "%.2f", area(s)))
}

// Enums can be Iterable-ish via a static all array.
enum Status: String, CaseIterable {
    case idle, busy, done
    var label: String { rawValue.capitalized }
}
Status.allCases.forEach { print($0.label) }
`),
    ex("swift2-ex-006", "Protocols and extensions", "Conformance + retroactive helpers.", "Protocols", "protocols_swift",
        `protocol Describable {
    var summary: String { get }
    func detailed() -> String
}

extension Describable {
    func detailed() -> String { "default: \\(summary)" }   // default impl
}

struct Book: Describable {
    let title: String
    let year: Int
    var summary: String { "\\(title) (\\(year))" }
    func detailed() -> String { "BOOK \\(summary)" }
}

struct Song: Describable {
    let name: String
    var summary: String { "song \\(name)" }
}

let shelf: [any Describable] = [
    Book(title: "Structure", year: 1975),
    Song(name: "Go"),
]
for item in shelf { print(item.detailed()) }

extension Int {
    var isEven: Bool { self % 2 == 0 }
    func times(_ block: (Int) -> Void) {
        for i in 1...self { block(i) }
    }
}
print(4.isEven, 3.isEven)
3.times { print("tick \\($0)") }
`),
    ex("swift2-ex-007", "Generics", "Generic functions + constraints.", "Protocols", "generics_swift",
        `func pickLarger<T: Comparable>(_ a: T, _ b: T) -> T {
    return a > b ? a : b
}

struct Box<T> {
    let value: T
    func map<U>(_ transform: (T) -> U) -> Box<U> {
        Box<U>(value: transform(value))
    }
}

func sum<T: Numeric>(_ items: [T]) -> T {
    items.reduce(0, +)
}

print(pickLarger(3, 9))
print(pickLarger("apple", "pear"))

let box = Box(value: 21)
print(box.map { $0 * 2 }.value)
print(sum([1, 2, 3]), sum([0.5, 1.5]))
`),
    ex("swift2-ex-008", "Closures", "Trailing, capture lists, escaping.", "Functions", "closures_swift",
        `func measure(_ label: String, _ block: () -> Int) -> Int {
    let result = block()
    print("\\(label) -> \\(result)")
    return result
}

measure("add") { 2 + 3 }

// Capture list copies the value NOW.
var counter = 0
let snapshot = { [counter] in counter }
counter = 99
print(snapshot())                    // 0 - captured by value

let tick: () -> Void = { counter += 1 }
tick(); tick()
print(counter)                       // 101 - captures by reference

// Reference-style capture of a boxed mutable.
final class Ref<T> { var value: T; init(_ v: T) { value = v } }
let shared = Ref(10)
let bump = { shared.value += 5 }
bump(); bump()
print(shared.value)

func makeAdder(_ bias: Int) -> (Int) -> Int { { $0 + bias } }
print(makeAdder(10)(5))
`),
    ex("swift2-ex-009", "Arrays and slices", "map/filter/reduce + subscript slices.", "Collections", "arrays_swift",
        `let nums = [1, 2, 3, 4, 5]

print(nums.filter { $0 % 2 == 0 })
print(nums.map { $0 * $0 })
print(nums.reduce(0, +))
print(nums.reduce(1, *))

let first3 = nums[0...2]
print(first3, first3.count)

var growable: [Int] = []
for n in nums where n > 2 {
    growable.append(n * 10)
}
print(growable)

print(nums.prefix(2), nums.suffix(2))
print(nums.contains(3), nums.first!, nums.last!)
print(zip(nums, ["a", "b", "c", "d", "e"]).map { "\\($0.0)\\($0.1)" })
`),
    ex("swift2-ex-010", "Sets and dictionaries", "Set algebra + dictionary transforms.", "Collections", "sets_dicts",
        `let a: Set = [1, 2, 3, 4]
let b: Set = [3, 4, 5, 6]

print(a.union(b).sorted())
print(a.intersection(b).sorted())
print(a.subtracting(b).sorted())
print(4. isIn(a), 9. isIn(a))

var ages = ["ada": 36, "alan": 41]
ages["grace"] = 45
print(ages.count, ages["ada"] ?? -1)

let doubled = ages.mapValues { $0 * 2 }
print(doubled.keys.sorted().map { "\\($0):\\(doubled[$0]!)" })

let grouped = Dictionary(grouping: [1, 2, 3, 4, 5, 6]) { $0 % 3 }
print(grouped.keys.sorted().map { "\\($0):\\(grouped[$0]!)" })

let tally = "go go is fun".split(separator: " ").reduce(into: [:]) { $0["\\($1)", default: 0] += 1 }
print(tally)
`),
    ex("swift2-ex-011", "Strings and characters", "Unicode-aware iteration and slices.", "Strings", "strings_swift",
        `let s = "Praxis IDE"

print(s.count, s.uppercased(), s.lowercased())
print(s.hasPrefix("Prax"), s.hasSuffix("IDE"))
print(s.reversed())
print(s.split(separator: " ").map { $0.count })

let uni = "ünïcode"
print(uni.count, uni.utf8.count)       // chars vs bytes
for scalar in uni.unicodeScalars {
    print(String(scalar), terminator: " ")
}
print()

let padded = "42".padding(toLength: 6, withPad: "0", startingAt: 0)
print(padded)
print(s.dropFirst(3), s.dropLast(3))
print(s.index(s.startIndex, offsetBy: 2))
`),
    ex("swift2-ex-012", "Ranges", "open/closed, strides, pattern matches.", "Language Core", "ranges_swift",
        `for i in 1...5 { print(i, terminator: " ") }
print()
for i in 1..<5 { print(i, terminator: " ") }
print()
for i in stride(from: 10, through: 2, by: -4) { print(i, terminator: " ") }
print()

let closed = 1...10
print(closed.contains(5), closed.count)

let x = 7
switch x {
case ...3: print("low")
case 4...8: print("middle")
default: print("high")
}

// Range as an index into collections.
let letters = Array("abcdef")
print(letters[1...3])
print(letters[..<2])
`),
    ex("swift2-ex-013", "Tuples and destructuring", "Multiple returns + labeled tuples.", "Language Core", "tuples_swift",
        `func minMax(_ values: [Int]) -> (min: Int, max: Int)? {
    guard let first = values.first else { return nil }
    var lo = first, hi = first
    for v in values {
        if v < lo { lo = v }
        if v > hi { hi = v }
    }
    return (lo, hi)
}

if let result = minMax([8, 3, 9, 1]) {
    print("min \\(result.min) max \\(result.max)")
    let (lo, hi) = result
    print("destructured \\(lo)..\\(hi)")
}

let pair = (name: "praxis", round: 45)
print(pair.0, pair.name, pair.1)

let swapped = (pair.1, pair.0)
print(swapped)
`),
    ex("swift2-ex-014", "Property observers", "willSet/didSet reactions.", "Language Core", "observers",
        `struct Watched {
    var value: Int = 0 {
        willSet { print("about to become \\(newValue) (was \\(value))") }
        didSet { print("became \\(value) (was \\(oldValue))") }
    }
}

var w = Watched()
w.value = 10
w.value = 20

// A throttled observer pattern.
struct Budget {
    var spent: Double = 0 {
        didSet {
            if spent > 100 { print("over budget: \\(spent)") }
        }
    }
}
var b = Budget()
b.spent = 50
b.spent = 120
`),
    ex("swift2-ex-015", "Access control", "private, fileprivate, internal, public shapes.", "Language Core", "access_swift",
        `final class Account {
    private(set) var balance: Double = 0   // readable outside, writable inside
    private let secret: String

    init(secret: String) { self.secret = secret }

    func deposit(_ amount: Double) {
        guard amount > 0 else { return }
        balance += amount
    }

    private func auditLine() -> String {
        "balance=\\(balance) secretSet=\\(!secret.isEmpty)"
    }

    func audit() -> String { auditLine() }
}

let acc = Account(secret: "hunter2")
acc.deposit(100)
acc.deposit(50)
print(acc.balance)
print(acc.audit())
// acc.secret            // compile error: private
// acc.balance = 999     // compile error: private(set) setter
`),
    ex("swift2-ex-016", "Extensions everywhere", "Retroactively conforming stdlib types.", "Language Core", "extensions_swift",
        `extension Int {
    var times3: Int { self * 3 }
    func clamp(to range: ClosedRange<Int>) -> Int {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}

extension Array where Element == Int {
    var mean: Double { isEmpty ? 0 : Double(reduce(0, +)) / Double(count) }
    func squared() -> [Element] { map { $0 * $0 } }
}

extension String {
    var shouted: String { uppercased() + "!" }
}

print(7.times3, 99.clamp(to: 0...10))
print([1, 2, 3].mean, [4, 5].squared())
print("praxis".shouted)
print([1, 2, 3].squared().mean)
`),
    ex("swift2-ex-017", "Error handling", "throws, try?, try! discipline.", "Errors", "errors_swift",
        `enum ParseError: Error, CustomStringConvertible {
    case empty
    case notNumber(String)
    case outOfRange(Int)
    var description: String {
        switch self {
        case .empty: return "empty input"
        case .notNumber(let s): return "not a number: \\(s)"
        case .outOfRange(let n): return "out of range: \\(n)"
        }
    }
}

func parseAge(_ text: String) throws -> Int {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { throw ParseError.empty }
    guard let n = Int(trimmed) else { throw ParseError.notNumber(trimmed) }
    guard (0...150).contains(n) else { throw ParseError.outOfRange(n) }
    return n
}

for text in ["36", " 41 ", "", "abc", "200"] {
    do { print("ok \\(try parseAge(text))") }
    catch { print("rejected: \\(error)") }
}
print(try? parseAge("abc") ?? -1)
`),
    ex("swift2-ex-018", "Result type", "Typed success/failure pipelines.", "Errors", "result_swift",
        `enum ConfigError: Error { case badPort(Int), missing }

func loadConfig(_ lines: [String]) -> Result<[String: String], ConfigError> {
    var out: [String: String] = [:]
    for line in lines {
        let parts = line.split(separator: "=")
        guard parts.count == 2 else { return .failure(.missing) }
        out[String(parts[0])] = String(parts[1])
    }
    if let port = out["port"], let n = Int(port), !(1...65535).contains(n) {
        return .failure(.badPort(n))
    }
    return .success(out)
}

let good = loadConfig(["host=127.0.0.1", "port=9090"])
switch good {
case .success(let cfg): print("cfg: \\(cfg)")
case .failure(let error): print("err: \\(error)")
}

let bad = loadConfig(["port=99999"])
print((try? bad.get()) ?? "get() threw")
if case .failure(.badPort(let p)) = bad { print("port was \\(p)") }
`),
    ex("swift2-ex-019", " defer stack", "Multiple defers run LIFO.", "Errors", "defer_swift",
        `func layered() {
    print("start")
    defer { print("defer 1 (runs LAST)") }
    defer { print("defer 2") }
    print("middle")
    defer { print("defer 3 (runs FIRST)") }
    print("end")
}
layered()

func withTempFile() {
    let path = "/tmp/praxis_swift.txt"
    FileManager.default.createFile(atPath: path, contents: Data("x".utf8))
    defer {
        try? FileManager.default.removeItem(atPath: path)
        print("file removed")
    }
    let size = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int) ?? 0
    print("file exists with \\(size ?? 0) byte(s)")
}
withTempFile()
`),
    ex("swift2-ex-020", "String formatting", "String(format:) + interpolation alignment.", "Strings", "formatting_swift",
        `print(String(format: "%-8s %5d", ("ada" as NSString).utf8String!, 92))
print(String(format: "%.3f", 3.14159))
print(String(format: "%05d", 42))
print(String(format: "%x %X %o", 255, 255, 8))

// Interpolation with format specifiers (Swift 5.9+ style awareness).
let round = 45
print("round \\(round) padded \\(String(format: "%03d", round))")

let rows = [("ada", 92), ("alan", 81)]
for (name, score) in rows {
    let padded = name.padding(toLength: 8, withPad: " ", startingAt: 0)
    print("\\(padded)\\(String(format: "%5d", score))")
}
`),
    ex("swift2-ex-021", "CustomStringConvertible", "Controlling how types print.", "Strings", "printable_swift",
        `struct Point: CustomStringConvertible, CustomDebugStringConvertible {
    let x: Double
    let y: Double

    var description: String {
        String(format: "(%.1f, %.1f)", x, y)
    }
    var debugDescription: String {
        "Point(x: \\(x), y: \\(y))"
    }
}

struct Vector: CustomStringConvertible {
    let items: [Int]
    var description: String { "[\\(items.map(String.init).joined(separator: ", "))]" }
}

let p = Point(x: 1.5, y: 2.25)
print(p)            // uses description
debugPrint(p)       // uses debugDescription
print(Vector(items: [3, 1, 4]))
`),
    ex("swift2-ex-022", "Date and time", "Date, Duration, formatting.", "Time & Data", "dates_swift",
        `import Foundation

let now = Date()
let release = Date(timeIntervalSince1970: 1_718_432_200)   // 2024-06-15

print(now.timeIntervalSince(release) > 0 ? "release is past" : "future")

let minute: TimeInterval = 60
print(release.addingTimeInterval(90 * minute).timeIntervalSince(release))

let formatter = DateFormatter()
formatter.dateFormat = "yyyy/MM/dd HH:mm"
print(formatter.string(from: release))

let iso = ISO8601DateFormatter()
print(iso.string(from: release))

let elapsed = Date().timeIntervalSince(release)
print("days since release: \\(Int(elapsed / 86_400))")
`),
    ex("swift2-ex-023", "JSON with Codable", "Encode and decode round trips.", "Time & Data", "codable_swift",
        `import Foundation

struct AppConfig: Codable {
    let app: String
    var round: Int
    let langs: [String]
    let meta: Meta
    struct Meta: Codable { let beta: Bool }
}

let original = AppConfig(app: "praxis", round: 45,
                         langs: ["swift", "powershell", "batch"],
                         meta: .init(beta: true))

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
if let data = try? encoder.encode(original),
   let text = String(data: data, encoding: .utf8) {
    print(text.split(separator: "\\n").count, "lines of json")
    print(text.prefix(60) + "...")
}

let decoder = JSONDecoder()
let back = try? decoder.decode(AppConfig.self, from: try! encoder.encode(original))
print(back?.app ?? "-", back?.langs.count ?? -1)
`),
    ex("swift2-ex-024", "FileManager basics", "Create, copy, list, remove files.", "Time & Data", "files_swift",
        `import Foundation

let fm = FileManager.default
let root = NSTemporaryDirectory() + "praxis_swift"

try? fm.createDirectory(atPath: root + "/inner", withIntermediateDirectories: true)
fm.createFile(atPath: root + "/a.txt", contents: Data("alpha".utf8))
fm.createFile(atPath: root + "/inner/b.txt", contents: Data("beta".utf8))

print(fm.fileExists(atPath: root + "/a.txt"))

if let items = try? fm.contentsOfDirectory(atPath: root) {
    print("top level: \\(items)")
}

let deep = (try? fm.subpaths(ofPath: root)) ?? []
print("recursive entries: \\(deep.count)")

try? fm.copyItem(atPath: root + "/a.txt", toPath: root + "/a-copy.txt")
try? fm.removeItem(atPath: root)
print("exists after removal: \\(fm.fileExists(atPath: root))")
`),
    ex("swift2-ex-025", "Bundle and process info", "Where a Swift program lives.", "Time & Data", "process_swift",
        `import Foundation

let info = ProcessInfo.processInfo
print("cpus: \\(info.activeProcessorCount)")
print("physical memory MB: \\(info.physicalMemory / 1_048_576)")
print("process id: \\(info.processIdentifier)")
print("host name: \\(info.hostName)")
print("system version: \\(info.operatingSystemVersionString)")

let env = info.environment
print("PATH set: \\(env["PATH"] != nil)")
print("HOME set: \\(env["HOME"] != nil)")

print("tmp dir exists: \\(FileManager.default.fileExists(atPath: NSTemporaryDirectory()))")
print("command line args: \\(CommandLine.arguments.count)")
`),
    ex("swift2-ex-026", "DispatchQueue", "Serial + concurrent dispatch.", "Concurrency", "dispatch_swift",
        `import Foundation

let serial = DispatchQueue(label: "praxis.serial")
serial.sync { print("sync one") }
serial.async { print("async two") }
serial.sync { print("sync three") }

let group = DispatchGroup()
let queue = DispatchQueue(label: "praxis.concurrent", attributes: .concurrent)

for id in 1...3 {
    group.enter()
    queue.async {
        print("worker \\(id)")
        group.leave()
    }
}
let done = group.wait(timeout: .now() + 1)
print("finished: \\(done == .success)")

print("main thread: \\(Thread.isMainThread)")
print("current thread name: \\(Thread.current)")
`),
    ex("swift2-ex-027", "Thread and locks", "NSLock + threads.", "Concurrency", "threads_locks",
        `import Foundation

let lock = NSLock()
var guarded = 0

let threads = (1...3).map { id in
    Thread.detachNewThread {
        for _ in 0..<1000 {
            lock.lock()
            guarded += 1
            lock.unlock()
        }
    }
    return id
}

Thread.sleep(forTimeInterval: 0.1)
print("guarded count: \\(guarded)")
print("threads spawned: \\(threads.count)")

let rw = NSRecursiveLock()
func nested() {
    rw.lock()
    print("reentrant lock acquired twice")
    rw.unlock()
}
rw.lock()
nested()
rw.unlock()
`),
    ex("swift2-ex-028", "Actor-free shared state with OSAllocated", "Atomic-style counter without actors.", "Concurrency", "atomics_swift",
        `import Foundation

// A lock-protected box (portable across Swift versions).
final class Locked<T> {
    private var value: T
    private let lock = NSLock()

    init(_ initial: T) { value = initial }

    func with<R>(_ body: (inout T) -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}

let counter = Locked(0)

DispatchQueue.concurrentPerform(iterations: 4) { _ in
    for _ in 0..<1000 {
        counter.with { $0 += 1 }
    }
}
print("exact count: \\(counter.with { $0 })")

let label = Locked("idle")
label.with { $0 = "running" }
print("label: \\(label.with { $0 })")
`),
    ex("swift2-ex-029", "Timer and cadence", "Scheduled blocks on the main queue.", "Concurrency", "timers_swift",
        `import Foundation

let sem = DispatchSemaphore(value: 0)
var ticks = 0

let timer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { t in
    ticks += 1
    print("tick \\(ticks)")
    if ticks == 3 {
        t.invalidate()
        sem.signal()
    }
}
RunLoop.current.run(until: Date().addingTimeInterval(0.5))
print("timer fired \\(ticks) times")

let once = DispatchWorkItem { print("one-shot ran") }
DispatchQueue.global().asyncAfter(deadline: .now() + 0.05, execute: once)
print("scheduled asyncAfter")
`),
    ex("swift2-ex-030", "Random numbers", "random(in:), seeded shuffle-free reproducibility note.", "Time & Data", "random_swift",
        `print(Int.random(in: 1...6))
print(Double.random(in: 0..<1))
print(Float.random(in: -1...1))
print([Int](repeating: 0, count: 3).map { _ in Int.random(in: 1...60) })

var deck = Array(1...9)
deck.shuffle()
print(deck)

let picked = deck.randomElement() ?? -1
print("picked \\(picked)")
print("bool: \\(Bool.random())")

// Swift's SystemRandomNumberGenerator cannot be seeded - determinism
// needs your own generator (see the LCG example).
print("generator type: \\(type(of: SystemRandomNumberGenerator()))")
`),
    ex("swift2-ex-031", "Deterministic LCG", "Seeded random without dependencies.", "Time & Data", "lcg_swift",
        `struct Lcg {
    var state: UInt64
    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
        return state >> 33
    }

    mutating func range(_ lo: UInt64, _ hi: UInt64) -> UInt64 {
        lo + next() % (hi - lo + 1)
    }
}

var rng = Lcg(seed: 42)
print((0..<5).map { _ in rng.range(1, 6) })

var again = Lcg(seed: 42)
print("same seed, same first roll: \\(again.range(1, 6) >= 1)")

var deck = Array(1...9)
for i in stride(from: deck.count - 1, to: 0, by: -1) {
    let j = Int(rng.range(0, UInt64(i)))
    deck.swapAt(i, j)
}
print("shuffled: \\(deck)")
`),
    ex("swift2-ex-032", "Sorting and comparators", "sorted(by:), key paths, stable note.", "Collections", "sorting_swift",
        `struct Player { let name: String; var score: Int; var age: Int }

let players = [
    Player(name: "ada", score: 92, age: 36),
    Player(name: "alan", score: 92, age: 41),
    Player(name: "grace", score: 96, age: 45),
]

let byScore = players.sorted { $0.score > $1.score }
print(byScore.map { "\\($0.name):\\($0.score)" })

let tie = players.sorted {
    $0.score != $1.score ? $0.score > $1.score : $0.age < $1.age
}
print(tie.first!.name)

let names = ["pear", "fig", "apple"]
print(names.sorted())
print(names.sorted(by: >))
print(names.sorted { $0.count < $1.count })

let ints = [5, 2, 9, 1]
print(ints.sorted(), ints.max() ?? -1)
`),
    ex("swift2-ex-033", "Lazy sequences", "prefix, filter chains evaluated on demand.", "Collections", "lazy_swift",
        `let naturals = sequence(first: 1) { $0 + 1 }

let squares = naturals.prefix(5).map { $0 * $0 }
print(Array(squares))

// take-while over an infinite sequence.
var current = 1
let fibs = sequence(first: (1, 1)) { pair in (pair.1, pair.0 + pair.1) }
print(Array(fibs.prefix(8).map { $0.0 }))

let big = (1...1_000_000).lazy
    .filter { $0 % 7 == 0 }
    .map { $0 / 7 }
    .prefix(5)
print(Array(big))

let lines = ["a", "b", "c"].lazy.map { $0.uppercased() }
print(lines.first ?? "-")
`),
    ex("swift2-ex-034", "A mini test harness", "assertions with counters.", "Testing", "mini_tests_swift",
        `func clamp(_ v: Int, _ lo: Int, _ hi: Int) -> Int {
    Swift.min(Swift.max(v, lo), hi)
}

struct Check {
    let name: String
    let got: EquatableBox
    let want: EquatableBox
}
struct EquatableBox: Equatable { let value: Any }
func == (a: EquatableBox, b: EquatableBox) -> Bool {
    "\(a.value)" == "\(b.value)"
}

let cases: [(String, Int, Int)] = [
    ("inside", clamp(5, 0, 10), 5),
    ("below", clamp(-3, 0, 10), 0),
    ("above", clamp(99, 0, 10), 10),
]

var pass = 0
for (name, got, want) in cases {
    let ok = got == want
    print((ok ? "  ok  " : "  FAIL") + " \\(name) got \\(got) want \\(want)")
    pass += ok ? 1 : 0
}
print("\\(pass)/\\(cases.count) passed")
`),
    ex("swift2-ex-035", "A retry helper", "Result + backoff without sleeps blocking forever.", "Testing", "retry_swift",
        `func retry<T>(times: Int, action: (Int) -> Result<T, String>) -> T? {
    for attempt in 1...times {
        switch action(attempt) {
        case .success(let value):
            return value
        case .failure(let error):
            print("  attempt \\(attempt) failed: \\(error)")
        }
    }
    return nil
}

var calls = 0
let result = retry(times: 4) { attempt in
    calls += 1
    calls < 3 ? .failure("flaky #\\(attempt)") : .success("success on call \\(calls)")
}
print("result: \\(result ?? "nil")")

let alwaysFails = retry(times: 3) { _ in Result<String, String>.failure("down") }
print("exhausted: \\(alwaysFails == nil)")
`),
    ex("swift2-ex-036", "A leveled logger", "Closure-based mini logger.", "Testing", "logger_swift",
        `enum LogLevel: Int, Comparable {
    case debug = 0, info, warn, error
    static func < (a: LogLevel, b: LogLevel) -> Bool { a.rawValue < b.rawValue }

    var label: String {
        switch self {
        case .debug: return "DEBUG"
        case .info: return "INFO "
        case .warn: return "WARN "
        case .error: return "ERROR"
        }
    }
}

struct Logger {
    let min: LogLevel
    var sink: (String) -> Void = { print($0) }

    func log(_ level: LogLevel, _ message: String) {
        guard level >= min else { return }
        sink("[\\(level.label)] \\(message)")
    }
}

let log = Logger(min: .info)
log.log(.debug, "suppressed")
log.log(.info, "service started")
log.log(.warn, "disk at 91%")
log.log(.error, "mirror sync failed")

var captured: [String] = []
var capture = Logger(min: .warn) { captured.append($0) }
capture.log(.info, "not captured")
capture.log(.warn, "captured")
print("captured count: \\(captured.count)")
`),
    ex("swift2-ex-037", "A config loader", "Key=value parsing with validation.", "Testing", "config_swift",
        `struct Config {
    var host = "0.0.0.0"
    var port = 8080
    var retries = 1
}

func load(_ text: String) throws -> Config {
    var cfg = Config()
    for line in text.split(separator: "\\n") {
        let parts = line.split(separator: "=", maxSplits: 1)
        guard parts.count == 2 else { continue }
        let key = parts[0].trimmingCharacters(in: .whitespaces)
        let value = parts[1].trimmingCharacters(in: .whitespaces)
        switch key {
        case "host": cfg.host = value
        case "port":
            guard let p = Int(value), (1...65535).contains(p) else {
                throw NSError(domain: "config", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "bad port: \\(value)"])
            }
            cfg.port = p
        case "retries": cfg.retries = Int(value) ?? cfg.retries
        default: break
        }
    }
    return cfg
}

let cfg = try? load("host=127.0.0.1\\nport=9090")
print("host=\\(cfg?.host ?? "-") port=\\(cfg?.port ?? -1) retries=\\(cfg?.retries ?? -1)")

do { _ = try load("port=99999") } catch { print("rejected: \\(error.localizedDescription)") }
`),
    ex("swift2-ex-038", "A stats report", "Aggregation + column alignment.", "Testing", "report_swift",
        `struct Reading { let city: String; let temp: Int }

let rows = [
    Reading(city: "Cairo", temp: 34),
    Reading(city: "Oslo", temp: 12),
    Reading(city: "Sydney", temp: 26),
]

func pad(_ s: String, _ n: Int) -> String {
    s.count >= n ? s : s + String(repeating: " ", count: n - s.count)
}
func pad(_ n: Int, _ width: Int) -> String {
    pad(String(n), width)
}

print(pad("CITY", 8) + pad("TEMP", 5))
print(String(repeating: "-", count: 13))
for r in rows.sorted(by: { $0.temp > $1.temp }) {
    print(pad(r.city, 8) + pad(r.temp, 5))
}

let temps = rows.map { $0.temp }
print("mean: \\(Double(temps.reduce(0, +)) / Double(temps.count))")
print("range: \\(temps.min()!)..\\(temps.max()!)")
print("warmest: \\(rows.max { $0.temp < $1.temp }!.city)")
`),
    ex("swift2-ex-039", "A wordstats tool", "split, tally, rank.", "Testing", "wordstats_swift",
        `let text = "go go is fun go runs everywhere fun times"

var counts: [String: Int] = [:]
for word in text.split(separator: " ") {
    counts[String(word), default: 0] += 1
}

let ranked = counts.sorted { a, b in
    a.value != b.value ? a.value > b.value : a.key < b.key
}

print("unique words: \\(ranked.count)")
for (word, n) in ranked.prefix(3) {
    print(word.padding(toLength: 12, withPad: " ", startingAt: 0) + "\\(n)x")
}

let longest = text.split(separator: " ").max { $0.count < $1.count }!
print("longest: \\(longest)")
print("total: \\(text.split(separator: " ").count)")
`),
    ex("swift2-ex-040", "A prime toolkit", "isPrime, nextPrime, factors.", "Testing", "primes_swift",
        `func isPrime(_ n: Int) -> Bool {
    guard n >= 2 else { return false }
    guard n % 2 != 0 || n == 2 else { return false }
    var i = 2
    while i * i <= n {
        if n % i == 0 { return false }
        i += 1
    }
    return true
}

func nextPrime(_ n: Int) -> Int {
    var c = n + 1
    while !isPrime(c) { c += 1 }
    return c
}

func primeFactors(_ n: Int) -> [Int] {
    var out: [Int] = []
    var remaining = n
    var p = 2
    while p * p <= remaining {
        while remaining % p == 0 {
            out.append(p)
            remaining /= p
        }
        p += 1
    }
    if remaining > 1 { out.append(remaining) }
    return out
}

print((1...30).filter(isPrime))
print("next after 13: \\(nextPrime(13))")
let f = primeFactors(360)
print("factors: \\(f), product: \\(f.reduce(1, *))")
`),
    ex("swift2-ex-041", "A matrix toolkit", "transpose, multiply, identity.", "Testing", "matrix_swift",
        `func transpose(_ m: [[Int]]) -> [[Int]] {
    guard let width = m.first?.count else { return [] }
    return (0..<width).map { c in m.map { $0[c] } }
}

func multiply(_ a: [[Int]], _ b: [[Int]]) -> [[Int]] {
    let bt = transpose(b)
    return a.map { row in
        bt.map { other in
            zip(row, other).map(*).reduce(0, +)
        }
    }
}

func show(_ m: [[Int]]) {
    for row in m {
        print(row.map { String(format: "%3d", $0) }.joined(separator: " "))
    }
}

let A = [[1, 2], [3, 4]]
let I = [[1, 0], [0, 1]]

print("A x I =")
show(multiply(A, I))
print("transposed:")
show(transpose(A))
print("A x A =")
show(multiply(A, A))
`),
    ex("swift2-ex-042", "A histogram tool", "bin + ASCII bars.", "Testing", "histogram_swift",
        `var state: UInt64 = 45
func lcg() -> Int {
    state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
    return Int((state >> 33) % 40) - 20
}

let data = (0..<200).map { _ in lcg() }

let n = Double(data.count)
let mean = Double(data.reduce(0, +)) / n
let variance = data.map { Double($0) - mean }.map { $0 * $0 }.reduce(0, +) / n
let std = variance.squareRoot()

print("n = \\(data.count)")
print("mean \\(String(format: "%.2f", mean)) std \\(String(format: "%.2f", std))")
print("range \\(data.min()!)...\\(data.max()!)")

var bins: [Int: Int] = [:]
for v in data { bins[v / 10, default: 0] += 1 }
for bin in bins.keys.sorted() {
    let count = bins[bin]!
    print(String(format: "%4d | ", bin * 10) + String(repeating: "#", count: count) + " (\\(count))")
}
print("bins used: \\(bins.count)")
`),
];
