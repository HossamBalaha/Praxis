/**
 * the Kotlin top-up: 42 more reference templates on top of the
 * eight more ("at least 50 like others". Pure Kotlin/JVM stdlib,
 * written for `kotlin script.kts` script mode.
 *
 * Bodies avoid ${} interpolation (TS template literal collision) —
 * string concatenation or escaped \\$ forms instead.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Kotlin";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("kotlin", id, label, description, CAT, sub, baseName, ".kts", () => body);

export const KOTLIN_2_EXAMPLES: FileExample[] = [
    ex("kotlin2-ex-001", "Null safety system", "?., ?:, let, requireNotNull.", "Language Core", "null_safety",
        `// The famous null-safety toolbox.
val name: String? = "Praxis"

println(name?.length ?: -1)          // safe call + elvis default
println(name?.uppercase() ?: "(none)")

val missing: String? = null
println(missing?.length)             // null, not an exception

name?.let { println("len via let: " + it.length) }

val forced: String = requireNotNull(name) { "name required" }
println(forced.length)

// try-catch the wrong way to see it fail gracefully.
val parsed = try { "abc".toInt() } catch (e: NumberFormatException) { null }
println(parsed ?: "was not a number")
`),
    ex("kotlin2-ex-002", "val vs var and type inference", "Immutability by default, explicit types.", "Language Core", "vals_vars",
        `val constant = 42                    // inferred Int, immutable
var counter = 0                      // mutable
counter += 1

val text: String = "explicit"
val big = 2_147_483_647L
val hex = 0xFF
val ratio = 3.14                     // Double by default
val suffix = 0.5f                    // Float needs the f

println(constant, counter)
println(text.length, big, hex, ratio, suffix)

// val does not mean deeply immutable.
val list = mutableListOf(1, 2)
list.add(3)                          // allowed: reference is final, content is not
println(list)
`),
    ex("kotlin2-ex-003", "Data classes", "copy, destructuring, componentN.", "Classes", "data_classes",
        `data class Player(val name: String, val score: Int = 0)

val ada = Player("Ada", 92)
val promoted = ada.copy(score = 96)

println(ada)                         // toString for free
println(promoted)
println(ada == Player("Ada", 92))    // structural equality

val (name, score) = promoted          // destructuring
println("destructured: " + name + " / " + score)

val top3 = listOf(ada, promoted, Player("Alan", 81))
val best = top3.maxByOrNull { it.score }
println("best: " + best!!.name)

val (n, s) = top3.first()
println("first pair: " + n + " " + s)
`),
    ex("kotlin2-ex-004", "Sealed classes and when", "Closed hierarchies + exhaustive when.", "Classes", "sealed_when",
        `sealed interface Shape {
    data class Circle(val r: Double) : Shape
    data class Rect(val w: Double, val h: Double) : Shape
    object Empty : Shape
}

fun area(s: Shape): Double = when (s) {
    is Shape.Circle -> kotlin.math.PI * s.r * s.r
    is Shape.Rect -> s.w * s.h
    Shape.Empty -> 0.0                 // no else: the set is closed
}

println(area(Shape.Circle(1.0)))
println(area(Shape.Rect(3.0, 4.0)))
println(area(Shape.Empty))
`),
    ex("kotlin2-ex-005", "Object singletons", "object, lazy, companion members.", "Classes", "objects",
        `object Config {
    val version = "1.0"
    private val cache = mutableMapOf<String, String>()

    fun get(key: String): String? = cache[key]
    fun put(key: String, value: String) { cache[key] = value }
}

class Counter {
    companion object {
        var instances = 0
        fun describe() = "Counter companion - " + instances + " instances"
    }

    init { instances++ }
}

Config.put("app", "praxis")
println(Config.get("app"))
println(Config.version)

Counter(); Counter()
println(Counter.describe())
`),
    ex("kotlin2-ex-006", "Extension functions", "Adding methods to types you don't own.", "Functions", "extensions",
        `fun String.shout(): String = this.uppercase() + "!"

fun Int.isEven(): Boolean = this % 2 == 0

fun <T> List<T>.second(): T? = if (size >= 2) this[1] else null

fun Int.rangeToSquared(): List<Int> = (1..this).map { it * it }

println("praxis".shout())
println(42.isEven())
println(listOf("a", "b", "c").second())

println(4.rangeToSquared())

// Extensions resolve statically - no dynamic dispatch surprises.
val any: Any = "text"
println((any as String).shout())
`),
    ex("kotlin2-ex-007", "Higher-order functions", "Lambdas, it, trailing closures, function types.", "Functions", "higher_order",
        `fun operate(a: Int, b: Int, op: (Int, Int) -> Int): Int = op(a, b)

println(operate(3, 4) { x, y -> x + y })
println(operate(10, 2) { x, y -> x / y })

// 'it' for single-parameter lambdas.
val words = listOf("go", "is", "fun")
println(words.filter { it.length > 2 }.map { it.uppercase() })

// Function references are first-class values.
val square: (Int) -> Int = Int::apply2
fun Int.apply2(): Int = this * 2
println(square(21))

fun repeatAction(times: Int, action: (Int) -> Unit) {
    for (i in 1..times) action(i)
}
repeatAction(3) { print("tick " + it + " ") }
println()
`),
    ex("kotlin2-ex-008", "Scope functions", "let, apply, run, also, with.", "Functions", "scope_fns",
        `data class Doc(var title: String, var lines: Int)

// apply: configure and return the object.
val doc = Doc("draft", 0).apply {
    lines = 3
    title = title.uppercase()
}
println(doc)

// let: operate on a non-null value.
val name: String? = "praxis"
println(name.let { "length is " + it.length })

// run: compute a value from an object.
val summary = doc.run { title + " has " + lines + " lines" }
println(summary)

// also: observe while keeping the pipeline value.
val tagged = "report".also { println("tagging " + it) }.let { it + "-v1" }
println(tagged)

// with: many operations on one receiver.
with(doc) {
    lines += 10
    println("after with: " + this)
}
`),
    ex("kotlin2-ex-009", "Collections tour", "List/Map/Set builders and read-only views.", "Collections", "collections_basics",
        `val nums = listOf(3, 1, 4, 1, 5)
val names = mapOf("a" to 1, "b" to 2)
val unique = setOf(3, 1, 4, 1, 5)

println(nums.size, nums.first(), nums.last())
println(names["a"], names.keys, names.values)
println(unique.size)                  // 4: duplicates dropped

// Mutable flavors live behind *Of builders.
val mutable = mutableListOf(1, 2)
mutable += 3
mutable.removeAt(0)
println(mutable)

val fromPairs = listOf("x" to 10, "y" to 20).toMap()
println(fromPairs.entries.joinToString { (k, v) -> k + "=" + v })
`),
    ex("kotlin2-ex-010", "Collection operations", "map/filter/fold/zip/flatten.", "Collections", "operations",
        `val nums = 1..10

println(nums.filter { it % 2 == 0 }.toList())
println(nums.map { it * it }.take(5).toList())
println(nums.fold(0) { acc, n -> acc + n })
println(nums.fold(1) { acc, n -> acc * n }.toString().length, " digits of 10!")

val xs = listOf(1, 2, 3)
val ys = listOf("a", "b", "c")
println(xs.zip(ys).joinToString { (a, b) -> a.toString() + b })

println(listOf(listOf(1, 2), listOf(3)).flatten())
println(nums.sum(), nums.average().toFloat(), nums.count { it > 5 })
`),
    ex("kotlin2-ex-011", "Sequences (lazy)", "generateSequence + take + eager terminal ops.", "Collections", "sequences",
        `// Lazy pipelines only compute what is consumed.
val naturals = generateSequence(1) { it + 1 }

println(naturals.take(5).toList())
println(naturals.filter { it % 3 == 0 }.take(3).toList())

// Fibonacci via sequence.
val fibs = generateSequence(1L to 1L) { (a, b) -> b to (a + b) }
println(fibs.take(10).map { it.first }.toList())

// asSequence avoids intermediate lists on big data.
val chained = (1..1_000_000).asSequence()
    .filter { it % 7 == 0 }
    .map { it / 7 }
    .take(5)
    .toList()
println(chained)
`),
    ex("kotlin2-ex-012", "Sorting and grouping", "sortedBy, groupBy, associate, partition.", "Collections", "grouping",
        `data class Emp(val name: String, val dept: String, val pay: Int)
val staff = listOf(
    Emp("ada", "eng", 120),
    Emp("alan", "eng", 110),
    Emp("grace", "ops", 100),
)

println(staff.sortedBy { it.pay }.map { it.name })
println(staff.sortedByDescending { it.pay }.first().name)

val byDept = staff.groupBy { it.dept }
println("eng has " + byDept["eng"]!!.size + " people")

println(staff.associate { it.name to it.pay })

val (rich, rest) = staff.partition { it.pay >= 110 }
println("rich: " + rich.map { it.name } + " rest: " + rest.map { it.name })
`),
    ex("kotlin2-ex-013", "String templates", "Interpolation with escaped \\$, raw strings.", "Strings", "templates",
        `val app = "praxis"
val round = 45

// String templates insert values directly.
println(app + " round " + round)
println("length of app is " + app.length)

// In raw strings (triple quotes) nothing needs escaping.
val json = """
    {
        "app": "praxis",
        "round": 45
    }
""".trimIndent()
println(json.lines().size, " lines of json")

val money = "costs \\\$5"                // escaped dollar when needed
println(money)

println("pad".padStart(8, '='))
println("2024-06-15".split("-").joinToString("/"))
`),
    ex("kotlin2-ex-014", "Regex in Kotlin", "toRegex, groups, matchEntire, findAll.", "Strings", "regex",
        `val log = "2024-06-15 ERROR disk 91%"

val pattern = Regex("""(\\d{4})-(\\d{2})-(\\d{2}) (\\w+)""")

val m = pattern.find(log)
if (m != null) {
    println("date: " + m.groupValues[1])
    println("word: " + m.groupValues[4])
}

println(Regex("\\\\d+").findAll(log).map { it.value }.toList())
println(Regex("ERROR").containsMatchIn(log))
println(Regex("\\\\s+").replace("a   b    c", " "))
println(log.replace(Regex("(\\\\d+)%"), "[$1]"))
`),
    ex("kotlin2-ex-015", "Ranges and progression", "in, downTo, step, until, chars.", "Language Core", "ranges",
        `for (i in 1..5) print(i)
println()
for (i in 5 downTo 1 step 2) print(i)
println()
for (i in 1 until 5) print(i)          // excludes the end
println()

println(3 in 1..10, 11 in 1..10)
println('c' in 'a'..'e')

// Ranges are objects: can be stored and queried.
val r = 1..100
println(r.first, r.last, r.step, 50 in r)

for (c in 'a'..'e') print(c.uppercase() + " ")
println()
`),
    ex("kotlin2-ex-016", "Operator overloading", "plus, get, invoke, compareTo.", "Classes", "operators",
        `data class Vec(val x: Int, val y: Int) {
    operator fun plus(o: Vec) = Vec(x + o.x, y + o.y)
    operator fun times(k: Int) = Vec(x * k, y * k)
    operator fun get(i: Int) = when (i) { 0 -> x; 1 -> y; else -> -1 }
    operator fun invoke() = "(" + x + ", " + y + ")"
    operator fun compareTo(o: Vec) = (x + y) - (o.x + o.y)
}

val a = Vec(1, 2)
val b = Vec(3, 4)

println(a + b)
println(a * 3)
println(a[0], a[1])
println(a())
println(a < b)
`),
    ex("kotlin2-ex-017", "Delegation", "by lazy, by map, custom delegates.", "Classes", "delegation",
        `import kotlin.properties.ReadOnlyProperty
import kotlin.reflect.KProperty

class Config {
    // lazy: computed once, on first use, thread-safe.
    val version by lazy { computeVersion() }
    private fun computeVersion() = "1.0.45"

    // map delegate reads keys as properties.
    private val fields = mapOf("host" to "0.0.0.0", "port" to 8080)
    val host: String by fields
    val port: Int by fields
}

class UpperCase(private val backing: String)
    : ReadOnlyProperty<Any?, String> {
    override fun getValue(thisRef: Any?, property: KProperty<*>) = backing.uppercase()
}

val shout: String by UpperCase("praxis")
val cfg = Config()

println(cfg.version, cfg.host, cfg.port)
println(shout)
`),
    ex("kotlin2-ex-018", "Generics", "Type params, constraints, invariance by default.", "Functions", "generics_kt",
        `fun <T : Comparable<T>> List<T>.maxOf(): T? {
    return if (isEmpty()) null else reduce { a, b -> if (a >= b) a else b }
}

fun <T> List<T>.repeated(n: Int): List<T> =
    (1..n).flatMap { this }

inline fun <reified T> typeOf() = T::class.simpleName

println(listOf(3, 9, 2).maxOf())
println(listOf("pear", "apple").maxOf())
println(listOf(1, 2).repeated(2))
println(typeOf<Int>(), typeOf<String>())

// Variance demo without going deep: List<out> is covariant.
val objects: List<Any> = listOf(1, "two", 3.0)
println(objects.size)
`),
    ex("kotlin2-ex-019", "Inline functions", "Inlining + non-local returns from lambdas.", "Functions", "inline_fns",
        `inline fun forEachWithBreak(items: List<Int>, action: (Int) -> Unit) {
    for (i in items) action(i)            // non-local return possible
}

listOf(1, 2, 3, 4).forEachWithBreak {
    if (it == 3) return@forEachWithBreak  // or a plain return from main
    print(it)
}
println()

inline fun measure(name: String, block: () -> Unit): Long {
    val t0 = System.currentTimeMillis()
    block()
    return System.currentTimeMillis() - t0
}

val ms = measure("demo") { Thread.sleep(15) }
println("measured ~" + ms + " ms")
`),
    ex("kotlin2-ex-020", "Exceptions", "try/catch/finally as expressions.", "Errors", "exceptions",
        `class ValidationError(msg: String) : RuntimeException(msg)

fun validate(age: Int) {
    if (age < 0) throw ValidationError("negative age")
    if (age > 150) throw ValidationError("suspicious age")
}

for (age in listOf(36, -1, 200)) {
    try {
        validate(age)
        println("age " + age + " ok")
    } catch (e: ValidationError) {
        println("rejected: " + e.message)
    } finally {
        println("  checked")
    }
}

// try is an EXPRESSION.
val v = try { "42".toInt() } catch (e: NumberFormatException) { -1 }
println(v)
`),
    ex("kotlin2-ex-021", "Files with java.io", "read/write text files from Kotlin.", "IO & Files", "file_io",
        `import java.io.File

val tmp = File.createTempFile("praxis", ".txt")

tmp.writeText("line one\\nline two\\n")
tmp.appendText("appended\\n")

println(tmp.readLines())
println("lines: " + tmp.readLines().size)
println("bytes: " + tmp.length())

// Line-by-line streaming.
tmp.useLines { lines ->
    lines.forEach { println("  read: " + it) }
}

tmp.delete()
println("exists: " + tmp.exists())
`),
    ex("kotlin2-ex-022", "Walk file trees", "File walk + filtering.", "IO & Files", "walk_tree",
        `import java.io.File

val root = File.createTempFile("praxis_dir", "").let {
    it.delete(); File(it.path).apply { mkdirs() }
}
File(root, "inner").mkdirs()
File(root, "a.txt").writeText("a")
File(root, "inner", "b.md").writeText("b")

val walked = root.walkTopDown().filter { it.isFile }.map { it.name }.toList()
println(walked)

val txt = root.walkTopDown().filter { it.isFile }
    .filter { it.extension == "txt" }.count()
println("txt files: " + txt)

root.deleteRecursively()
println("exists: " + root.exists())
`),
    ex("kotlin2-ex-023", "Buffered IO and streams", "readers/writers with use().", "IO & Files", "streams_io",
        `import java.io.*

val path = File.createTempFile("praxis", ".dat")

DataOutputStream(BufferedOutputStream(FileOutputStream(path))).use { out ->
    out.writeInt(42)
    out.writeDouble(2.5)
    out.writeUTF("praxis")
}

DataInputStream(BufferedInputStream(FileInputStream(path))).use { ins ->
    println(ins.readInt(), ins.readDouble(), ins.readUTF())
}

// char streams.
val sw = StringWriter()
BufferedWriter(sw).use { w -> w.write("buffered text"); w.newLine(); w.write("second") }
println(sw.toString().lines().size, " lines buffered")

path.delete()
`),
    ex("kotlin2-ex-024", "Dates with java.time", "LocalDate, Duration, formatting.", "Dates & Time", "java_time",
        `import java.time.*
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

val today = LocalDate.now()
val release = LocalDate.of(2024, 6, 15)

println("today: " + today)
println("days between: " + ChronoUnit.DAYS.between(release, today))

println(release.plusWeeks(1).minusDays(2))
println(release.dayOfWeek)

val now = LocalTime.of(9, 30)
println(now.plusMinutes(90))

val stamp = LocalDateTime.of(2024, 6, 15, 13, 45)
println(stamp.format(DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm")))
println(Duration.ofMinutes(95).toMinutes())
`),
    ex("kotlin2-ex-025", "Threads and sleep", "Java threads, Kotlin join discipline.", "Concurrency", "threads_kt",
        `val t1 = Thread {
    println("worker 1 from " + Thread.currentThread().name)
}
val t2 = Thread {
    for (i in 1..3) {
        println("worker 2 tick " + i)
        Thread.sleep(10)
    }
}

t1.start(); t2.start()
t1.join(); t2.join()
println("both joined safely")

println("cpus: " + Runtime.getRuntime().availableProcessors())
`),
    ex("kotlin2-ex-026", "Synchronized blocks", "@Synchronized + explicit locks.", "Concurrency", "sync",
        `import java.util.concurrent.locks.ReentrantLock

class Counter {
    var guarded = 0
        private set
    private val lock = ReentrantLock()

    fun increment() {
        lock.lock()
        try { guarded++ } finally { lock.unlock() }
    }
}

val c = Counter()
val threads = (1..3).map {
    Thread { repeat(1000) { c.increment() } }
}
threads.forEach { it.start() }
threads.forEach { it.join() }

println("guarded count: " + c.guarded)

@Synchronized
fun lockDemo() = println("annotated method is synchronized too")
lockDemo()
`),
    ex("kotlin2-ex-027", "Coroutines-lite (threads)", "Runnable-style concurrent data flows without coroutines.", "Concurrency", "concurrent_flows",
        `import java.util.concurrent.*

val pool = Executors.newFixedThreadPool(2)

val futures = (1..5).map { n ->
    pool.submit(Callable { n * n })
}

println(futures.map { it.get() })

pool.submit { println("plain runnable from " + Thread.currentThread().name) }.get()
pool.shutdown()
pool.awaitTermination(1, TimeUnit.SECONDS)
println("pool closed: " + pool.isShutdown)

// Concurrent collections stay consistent across threads.
val queue = ConcurrentLinkedQueue<Int>()
Thread { queue.addAll(listOf(1, 2, 3)) }.apply { start(); join() }
println("queue: " + queue)
`),
    ex("kotlin2-ex-028", "Atomics", "AtomicInteger/Long for lock-free counting.", "Concurrency", "atomics",
        `import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

val hits = AtomicInteger(0)
val label = AtomicReference("idle")

val threads = (1..3).map {
    Thread {
        repeat(50_000) { hits.incrementAndGet() }
    }
}
threads.forEach { it.start() }
threads.forEach { it.join() }

println("exact hits: " + hits.get())

label.compareAndSet("idle", "running")
println("label: " + label.get())
println("updateAndGet: " + hits.updateAndGet { it / 2 })
`),
    ex("kotlin2-ex-029", "JSON by hand (org.json-free)", "A minimal JSON writer for simple structures.", "Data Formats", "mini_json",
        `fun toJson(v: Any?): String = when (v) {
    null -> "null"
    is String -> "\\"" + v + "\\""
    is Number -> v.toString()
    is Boolean -> v.toString()
    is Map<*, *> -> v.entries.joinToString(
        prefix = "{", postfix = "}") { (k, value) -> toJson(k.toString()) + ": " + toJson(value) }
    is List<*> -> v.joinToString(prefix = "[", postfix = "]", transform = ::toJson)
    else -> "\\"" + v.toString() + "\\""
}

val data = mapOf(
    "app" to "praxis",
    "round" to 45,
    "langs" to listOf("kotlin", "powershell", "batch"),
    "meta" to mapOf("beta" to true),
)

println(toJson(data))
println(toJson(data).length, " chars")
`),
    ex("kotlin2-ex-030", "Random numbers", "kotlin.random.Random, ranges, seeds.", "Numbers", "random_kt",
        `val rng = kotlin.random.Random(42)

println(rng.nextInt(1..6))
println(rng.nextInt(1..6))
println(List(5) { rng.nextInt(1..60) })

val deck = (1..9).toMutableList()
deck.shuffle(rng)
println(deck)

println(rng.nextDouble().toString().take(6))
println(rng.nextBytes(4).joinToString { (it + 128).toString() })

// Random without a seed is truly random per run.
val fresh = kotlin.random.Random.Default.nextInt(10)
println("(unseeded roll: " + fresh + ")")
`),
    ex("kotlin2-ex-031", "Math utilities", "kotlin.math.*, integer division care.", "Numbers", "math_kt",
        `import kotlin.math.*

println(sqrt(144.0), cbrt(27.0))
println(pow(2.0, 10.0))
println(hypot(3.0, 4.0))

println(sin(PI / 2).roundToInt())
println(log10(1000.0).roundToInt())
println(exp(1.0).roundToInt())

// Integer division truncates; watch negative numbers.
println(7 / 2, -7 / 2)
println(7.0 / 2, floor(-7.0 / 2))

println(2.6.roundToInt(), 3.5.roundToInt())   // banker's rounding
println("sign/abs: " + sign(-0.5) + " " + abs(-9))
`),
    ex("kotlin2-ex-032", "when expression power", "Ranges, types, pairs, guards (with subject-less form).", "Language Core", "when_deep",
        `fun gradeOf(score: Int): String = when {
    score >= 90 -> "A"
    score >= 80 -> "B"
    else -> "C or below"
}

fun typeLabel(v: Any): String = when (v) {
    is Int -> "integer"
    is String -> "string"
    is Boolean -> "bool"
    else -> "unknown"
}

fun httpKind(code: Int): String = when (code) {
    200, 201, 204 -> "success"
    in 300..399 -> "redirect"
    404 -> "not found"
    else -> "other"
}

println(gradeOf(87))
println(typeLabel("text"))
println(httpKind(301), httpKind(404))
println(when (val x = 3 * 3) { 9 -> "nine"; else -> "not nine" })
`),
    ex("kotlin2-ex-033", "A mini test harness", "check + failure collection.", "Testing", "mini_tests_kt",
        `val failures = mutableListOf<String>()

fun check(name: String, actual: Any, expected: Any) {
    if (actual == expected) println("  ok   " + name)
    else {
        failures.add(name)
        println("  FAIL " + name + " got " + actual + " want " + expected)
    }
}

fun clamp(v: Int, lo: Int, hi: Int) = maxOf(lo, minOf(v, hi))

check("inside", clamp(5, 0, 10), 5)
check("below", clamp(-3, 0, 10), 0)
check("above", clamp(99, 0, 10), 10)
check("concat", "prax" + "is", "praxis")

println(if (failures.isEmpty()) "ALL PASS" else failures.size.toString() + " failures")
`),
    ex("kotlin2-ex-034", "A timing harness", "measureNanoTime by hand.", "Performance", "timing_kt",
        `fun work(n: Int): Int {
    var t = 0
    for (i in 0 until n) t += i % 7
    return t
}

// Warmup compiles the JIT paths.
work(10_000)

val samples = LongArray(5) {
    val t0 = System.nanoTime()
    work(500_000)
    System.nanoTime() - t0
}

println("ms per run: " + samples.map { it / 1_000_000 }.joinToString())
println("best: " + samples.min() / 1_000_000.0 + " ms")

val nano = kotlin.system.measureNanoTime { work(500) }
println("measureNanoTime: " + nano + " ns")
`),
    ex("kotlin2-ex-035", "Tail recursion", "tailrec + stack safety.", "Performance", "tailrec_kt",
        `tailrec fun countDown(n: Int, acc: Int = 0): Int =
    if (n == 0) acc else countDown(n - 1, acc + 1)

println(countDown(10))

tailrec fun factorial(n: Long, acc: Long = 1): Long =
    if (n <= 1) acc else factorial(n - 1, acc * n)

println(factorial(20))

// Without tailrec this would overflow the stack.
println(countDown(100_000))
println("no StackOverflow: the compiler turned it into a loop")
`),
    ex("kotlin2-ex-036", "Value classes", "Inline classes for type-safe wrappers.", "Classes", "value_classes",
        `@JvmInline
value class Meters(val raw: Double) {
    operator fun plus(o: Meters) = Meters(raw + o.raw)
    fun toFeet() = Feet(raw * 3.28084)
}

@JvmInline
value class Feet(val raw: Double) {
    override fun toString() = raw.toString() + " ft"
}

val a = Meters(1.5)
val b = Meters(2.5)

println((a + b).raw)
println(a.toFeet())

// No boxing cost at runtime: the Double is used directly.
println("sizeof stays a double: " + ((a + b).raw::class.simpleName))
`),
    ex("kotlin2-ex-037", "A mini logger", "Leveled, lambda-friendly, thread-safe.", "Projects", "logger_kt",
        `import java.util.concurrent.locks.ReentrantLock

object Log {
    private const val MIN = 1   // INFO
    private val lock = ReentrantLock()
    private val levels = mapOf("DEBUG" to 0, "INFO" to 1, "WARN" to 2, "ERROR" to 3)

    operator fun invoke(level: String, msg: String) {
        if ((levels[level] ?: 0) < MIN) return
        lock.lock()
        try {
            println("[" + level + "] " + msg)
        } finally {
            lock.unlock()
        }
    }
}

Log("DEBUG", "suppressed by the level")
Log("INFO", "service started")
Log("WARN", "disk at 91%")
Log("ERROR", "mirror sync failed")

(1..2).map { i -> Thread { Log("INFO", "from thread " + i) } }
    .forEach { it.start() }
    .let { }
`),
    ex("kotlin2-ex-038", "A config loader", "KV parsing + defaults + validation.", "Projects", "config_kt",
        `fun loadConfig(text: String): Map<String, Any> {
    val defaults = mapOf("host" to "0.0.0.0", "port" to 8080, "retries" to 1)

    val file = text.lineSequence()
        .filter { it.isNotBlank() && !it.startsWith("#") }
        .associate {
            val (k, v) = it.split("=", limit = 2)
            k.trim() to (v.trim().toIntOrNull() ?: v.trim())
        }

    val merged = defaults + file
    val port = merged["port"] as Int
    require(port in 1..65535) { "port out of range: " + port }
    return merged
}

println(loadConfig("host=127.0.0.1\\nport=9090"))

try {
    loadConfig("port=99999\\n")
} catch (e: IllegalArgumentException) {
    println("rejected: " + e.message)
}
`),
    ex("kotlin2-ex-039", "A table report", "Formatting alignment + aggregation.", "Projects", "table_kt",
        `import kotlin.math.roundToInt

data class Reading(val city: String, val temp: Int)

val rows = listOf(
    Reading("Cairo", 34),
    Reading("Oslo", 12),
    Reading("Sydney", 26),
)

println("%-10s %5s".format("CITY", "TEMP"))
println("-".repeat(15))
rows.sortedByDescending { it.temp }.forEach {
    println("%-10s %5d".format(it.city, it.temp))
}

val temps = rows.map { it.temp }
println("mean: " + (temps.average()).roundToInt())
println("range: " + temps.min() + ".." + temps.max())

// Named args via destructuring in map.
println(rows.joinToString { (city, temp) -> city + ":" + temp })
`),
    ex("kotlin2-ex-040", "A complete wordstats", "Files + groupBy + ranking.", "Projects", "wordstats_kt",
        `import java.io.File

val tmp = File.createTempFile("praxis", ".txt")
tmp.writeText("go go is fun\\ngo runs everywhere\\nfun times\\n")

val words = tmp.readText()
    .lowercase()
    .split(Regex("\\\\W+"))
    .filter { it.isNotBlank() }

val counts = words.groupingBy { it }.eachCount()
val top = counts.entries.sortedWith(
    compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key }
).take(3)

println("unique words: " + counts.size)
top.forEach { (word, n) -> println("%-12s %dx".format(word, n)) }

tmp.delete()
println("longest word: " + words.maxByOrNull { it.length })
`),
    ex("kotlin2-ex-041", "A retry helper", "Backoff loop with lambdas and exceptions.", "Projects", "retry_kt",
        `fun <T> retry(
    times: Int = 3,
    initialDelayMs: Long = 10,
    factor: Double = 2.0,
    block: () -> T,
): T? {
    var delay = initialDelayMs
    repeat(times - 1) {
        try {
            return block()
        } catch (e: Exception) {
            println("  attempt failed: " + e.message + " (retrying in " + delay + "ms)")
            Thread.sleep(delay)
            delay = (delay * factor).toLong()
        }
    }
    return try { block() } catch (e: Exception) {
        println("  final attempt failed: " + e.message)
        null
    }
}

var calls = 0
val result = retry(times = 4) {
    calls++
    if (calls < 3) error("flaky #" + calls) else "success on call " + calls
}
println("result: " + result)
`),
    ex("kotlin2-ex-042", "A prime toolkit", "isPrime, nextPrime, factorization.", "Projects", "primes_kt",
        `fun isPrime(n: Int): Boolean {
    if (n < 2) return false
    var i = 2
    while (i * i <= n) {
        if (n % i == 0) return false
        i++
    }
    return true
}

fun nextPrime(n: Int): Int {
    var c = n + 1
    while (!isPrime(c)) c++
    return c
}

fun primeFactors(n: Int): List<Int> {
    val factors = mutableListOf<Int>()
    var remaining = n
    var p = 2
    while (p * p <= remaining) {
        while (remaining % p == 0) {
            factors.add(p)
            remaining /= p
        }
        p++
    }
    if (remaining > 1) factors.add(remaining)
    return factors
}

println((1..30).filter(::isPrime))
println("next after 13: " + nextPrime(13))
println("factors of 360: " + primeFactors(360))
println(primeFactors(360).reduce { a, b -> a * b } == 360)
`),
];
