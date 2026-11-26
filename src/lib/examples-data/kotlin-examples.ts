/**
 * 8 Kotlin reference templates (one of the six NEW runtime
 * languages added alongside). Bodies are script-style Kotlin
 * (top-level statements allowed), created as .kts files and runnable
 * through the `kotlin` script runner the moment it is installed.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Kotlin";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
    extension: string = ".kts",
) => mkExample("kotlin", id, label, description, CAT, sub, baseName, extension, () => body);

export const KOTLIN_EXAMPLES: FileExample[] = [
    ex("kotlin-ex-001", "Hello, Kotlin", "println, string templates $ and ${} — the opening page.", "Basics", "hello_kotlin",
        `// Hello, Kotlin — string templates.
println("Hello from Kotlin!")

val name = "Praxis"                    // val = immutable
println("Hello, $name!")              // $variable interpolation

var count = 42                        // var = mutable
println("count = \${count + 1}")      // \${expr} for expressions

// Triple-quoted strings keep newlines + need no escapes.
val banner = """
    +----------------+
    |    $name       |
    +----------------+
""".trimIndent()
println(banner)
`),

    ex("kotlin-ex-002", "Null safety", "val/var types, ?., ?:, !! and the null-safety system.", "Basics", "null_safety",
        `// Null safety — the type system forbids surprise nulls.
var name: String = "Ada"
// name = null                    // would NOT compile: String is non-null

var nickname: String? = null       // String? MAY hold null
println("nickname is null? \${nickname == null}")

// Safe call ?. short-circuits to null instead of crashing.
println("upper: \${nickname?.uppercase()}")
println("length: \${nickname?.length}")

// The elvis ?: supplies a default for nulls.
val shown = nickname ?: "no nickname"
println("shown: $shown")

// !! asserts non-null — throws when you're wrong (the panic button).
val forced = nickname!!.length
println("never printed: $forced")
`),

    ex("kotlin-ex-003", "Control flow", "if as an expression, when with no subject and range checks.", "Control flow", "control_flow",
        `// Control flow — expressions everywhere.
val score = 87

// if EXPRESSION returns the chosen branch.
val grade = if (score >= 90) "A" else if (score >= 80) "B" else "C"
println("score $score -> $grade")

// when (no subject) replaces long if/else ladders.
val kind = when {
    score >= 90 -> "excellent"
    score >= 80 -> "solid"
    score >= 70 -> "ok"
    else -> "keep going"
}
println(kind)

// when WITH a subject + range branches.
val day = 6
val label = when (day) {
    1, 7 -> "weekend"
    in 2..6 -> "weekday"
    else -> "unknown"
}
println("day $day is a $label")

// Ranges step too.
for (i in 1..10 step 2) print("$i ")
println()
for (i in 10 downTo 1 step 3) print("$i ")
println()
`),

    ex("kotlin-ex-004", "Functions", "Default + named args, expression bodies, varargs and lambdas.", "Functions", "functions_tour",
        `// Functions — defaults, named args, varargs, lambdas.
fun volume(radius: Double, height: Double = 1.0): Double =
    Math.PI * radius * radius * height        // expression body

fun sum(vararg values: Int): Int = values.sum()

// Trailing lambda syntax: last arg can live OUTSIDE the parens.
fun around(action: () -> Unit) {
    println("before")
    val result = action()
    println("after")
}

println(volume(1.0))
println(volume(radius = 2.0, height = 3.0))   // named args
println("sum() = \${sum()}")
println("sum(1,2,3) = \${sum(1, 2, 3)}")

around { println("inside the lambda") }

// map / filter / fold over a list.
val doubled = listOf(1, 2, 3).map { it * 2 }   // 'it' names the single param
println("doubled: $doubled")
println("big: \${listOf(1, 2, 3, 4).filter { it >= 3 }}")
println("fold: \${(1..5).fold(0) { acc, n -> acc + n }}")
`),

    ex("kotlin-ex-005", "Data classes", "Data classes: generated equals/toString/copy + destructuring.", "OOP", "data_classes",
        `// Data classes — the model layer in three lines.
data class Point(val x: Double, val y: Double) {
    fun length(): Double = hypot(x, y)
}

fun hypot(a: Double, b: Double): Double = Math.sqrt(a * a + b * b)

data class Record(val name: String, val score: Int)

fun main() {
    val p = Point(3.0, 4.0)
    println(p)                          // toString is generated
    println("length = \${p.length()}")

    // VALUE equality comes for free.
    println("equal? \${Point(1.0, 2.0) == Point(1.0, 2.0)}")

    // copy with named-arg overrides — the clone-and-tweak idiom.
    val shifted = p.copy(x = 5.0)
    println("shifted: $shifted")

    // Destructuring declarations.
    val (x, y) = p
    println("x = $x, y = $y")

    // Pair/triple literals destruct the same way.
    val (name, score) = "Ada" to 95
    println("$name scored $score")
}
main()
`),

    ex("kotlin-ex-006", "Collections", "List/Map/Set literals, zip, groupBy, sortedBy and joinToString.", "Collections", "collections_tour",
        `// Collections — the read-only core.
val nums = listOf(5, 1, 4, 2, 3)
println("first=\${nums.first()} last=\${nums.last()} size=\${nums.size}")

// Mutable siblings exist for in-place edits.
val mutable = mutableListOf(9, 8)
mutable.add(7)
mutable.removeAt(0)
println("mutable: $mutable")

// Maps (read-only + mutable).
val freq = mutableMapOf<String, Int>()
for (word in "to be or not to be".split(" ")) {
    freq[word] = (freq[word] ?: 0) + 1
}
println("freq: $freq")
println("'to' -> \${freq["to"]}")

// sortedBy / groupBy / zip / joinToString — the transform kit.
val records = listOf("Ada" to 95, "Alan" to 88, "Grace" to 99)
println(records.sortedBy { it.second })
println(records.groupBy { if (it.second >= 90) "top" else "rest" })
println(records.joinToString(" | ") { "\${it.first}:\${it.second}" })

// Pair lists -> map in one step.
val asMap = records.toMap()
println("map keys: \${asMap.keys}")
`),

    ex("kotlin-ex-007", "Sealed classes and when", "A sealed hierarchy exhausted by a single when — the modeling pattern.", "OOP", "sealed_when",
        `// Sealed class + when — closed hierarchies the compiler can check.
sealed class Shape {
    data class Circle(val radius: Double) : Shape()
    data class Rect(val width: Double, val height: Double) : Shape()
    object Empty : Shape()
}

fun area(shape: Shape): Double = when (shape) {
    is Shape.Circle -> Math.PI * shape.radius * shape.radius
    is Shape.Rect   -> shape.width * shape.height
    Shape.Empty     -> 0.0
    // NO else needed — the compiler knows the set is closed.
}

fun describe(shape: Shape): String = when (shape) {
    is Shape.Circle -> "circle r=\${shape.radius}"
    is Shape.Rect   -> "rect \${shape.width}x\${shape.height}"
    Shape.Empty     -> "empty"
}

val shapes = listOf(Shape.Circle(2.0), Shape.Rect(3.0, 4.0), Shape.Empty)
for (shape in shapes) {
    println("\${describe(shape)} -> area \${"%.3f".format(area(shape))}")
}

// 'is' smart-casts inside the branch: shape.radius needed no cast.
`),

    ex("kotlin-ex-008", "Files and exceptions", "try/catch/finally, expression form, File.writeText/readLines.", "Practical", "files_exceptions",
        `import java.io.File

// try is an EXPRESSION too.
fun parseAge(text: String): Int = try {
    text.trim().toInt()
} catch (e: NumberFormatException) {
    throw IllegalArgumentException("not an int: '$text'", e)
}

fun main() {
    val path = File.createTempFile("praxis", ".txt")
    // writeText / readText / readLines — the one-call file API.
    path.writeText("alpha 1\\nbeta 2\\ngamma 3\\n")
    println("bytes: \${path.length()}")

    path.readLines().forEachIndexed { index, line ->
        println("\${index + 1}: $line")
    }

    // finally always runs; exception classes are Java's.
    try {
        println(parseAge("31"))
        println(parseAge("thirty-one"))
    } catch (e: IllegalArgumentException) {
        println("caught: \${e.message}")
    } finally {
        println("finally always runs")
    }

    path.delete()
    println("cleaned up")
}
main()
`),
];
