/**
 * 10 Java reference templates (the "add other languages
 * also + their examples to check" batch). Bodies are idiomatic
 * single-file Java 11+ programs (the `java` launcher runs them
 * directly — no javac step), created as .java files and runnable the
 * moment a JDK is installed (the viewer's runtime chip says when it
 * is not).
 *
 * Java identifiers keep their native camelCase (no naming tokens —
 * restyling Java ids through the Python naming styles would fight the
 * language's own conventions).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Java";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("java", id, label, description, CAT, sub, baseName, ".java", () => body);

export const JAVA_EXAMPLES: FileExample[] = [
    ex("java-ex-001", "Hello, Java", "System.out.println, printf formatting and String.format — the three output styles.", "Basics", "hello_java",
        `// Hello, Java — the three ways text reaches the console.
public class hello_java {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");          // println: newline included

        String name = "Praxis";
        System.out.printf("Hello, %s!%n", name);          // printf: C-style format

        double pi = Math.PI;
        String line = String.format("Pi is roughly %.4f", pi); // format → String
        System.out.println(line);

        // printf verbs: %d int, %s String, %f double, %n newline.
        System.out.printf("int=%d  str=%s  dbl=%.3f%n", 42, "x", 2.71828);
    }
}
`),

    ex("java-ex-002", "Variables and types", "The primitive menagerie, var, String immutability and a first look at casting.", "Basics", "variables_types",
        `// The eight primitives + var + how Strings behave.
public class variables_types {
    public static void main(String[] args) {
        int    count  = 42;           // 32-bit signed integer
        long   big    = 9_000_000_000L; // underscores group digits
        double exact  = 3.14159;
        float  rough  = 2.5f;
        char   letter = 'A';
        byte   tiny   = 127;
        short  small  = 32000;
        boolean flag  = true;

        // var infers the declared type (Java 10+), still static typing.
        var message = "inferred as String";

        System.out.printf("count=%d big=%d exact=%f%n", count, big, exact);
        System.out.printf("letter=%c tiny=%d small=%d flag=%b%n", letter, tiny, small, flag);
        System.out.println(message.getClass().getName()); // java.lang.String

        // Strings are immutable: concat RETURNS a new object.
        String a = "Hi";
        String b = a + "!";
        System.out.printf("a=%s b=%s  a==b? %b%n", a, b, a == b); // false

        // Widening cast is silent; narrowing needs an explicit cast.
        double widened = count;        // int → double: automatic
        int narrowed  = (int) exact;   // double → int: truncates
        System.out.printf("widened=%.1f narrowed=%d%n", widened, narrowed);
    }
}
`),

    ex("java-ex-003", "Branching and switch", "if / else chains, the modern switch expression with arrow labels and yield.", "Control flow", "branching_switch",
        `// if/else + the modern switch expression (Java 14+).
public class branching_switch {
    public static void main(String[] args) {
        int score = 87;

        char grade;
        if (score >= 90)       grade = 'A';
        else if (score >= 80)  grade = 'B';
        else if (score >= 70)  grade = 'C';
        else                   grade = 'F';
        System.out.printf("score=%d grade=%c%n", score, grade);

        // Switch EXPRESSION with arrow labels — no fall-through,
        // multi-value cases, and it returns a value.
        int day = 6; // Saturday
        String kind = switch (day) {
            case 1, 7 -> "weekend";
            case 2, 3, 4, 5, 6 -> "weekday";
            default -> "unknown";
        };
        System.out.println(day + " is a " + kind);

        // yield is the value when a case needs a block.
        int month = 2;
        int days = switch (month) {
            case 2 -> 28;
            case 4, 6, 9, 11 -> 30;
            default -> { yield 31; }
        };
        System.out.println("month " + month + " has " + days + " days");
    }
}
`),

    ex("java-ex-004", "Loops", "for, enhanced-for over arrays and lists, while, do-while and labeled break.", "Control flow", "loops_tour",
        `// Every loop shape Java offers.
public class loops_tour {
    public static void main(String[] args) {
        // Classic for with index.
        int total = 0;
        for (int i = 1; i <= 10; i++) total += i;
        System.out.println("1..10 sums to " + total);

        // Enhanced-for over an array — the idiom for collections.
        int[] nums = {5, 1, 4, 2, 3};
        for (int n : nums) System.out.print(n + " ");
        System.out.println();

        // while + a do-while that runs at least once.
        int power = 1;
        while (power < 100) power *= 3;
        System.out.println("first power of 3 past 100: " + power);

        int tries = 0;
        do { tries++; } while (false);   // body always executes once
        System.out.println("do-while ran " + tries + " time");

        // Labeled break exits an OUTER loop directly.
        outer:
        for (int row = 1; row <= 3; row++) {
            for (int col = 1; col <= 3; col++) {
                if (row * col > 4) break outer;
                System.out.print(row * col + " ");
            }
        }
        System.out.println();
    }
}
`),

    ex("java-ex-005", "Methods and recursion", "static methods, overloading, varargs and a recursive factorial.", "Functions", "methods_recursion",
        `// Methods: overloading, varargs, recursion.
public class methods_recursion {
    static long factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }

    // Overloads are distinguished by parameter TYPES.
    static double area(double radius)            { return Math.PI * radius * radius; }
    static double area(double w, double h)       { return w * h; }

    // varargs: call with any number of ints.
    static int sum(int... values) {
        int t = 0;
        for (int v : values) t += v;
        return t;
    }

    public static void main(String[] args) {
        System.out.println("6! = " + factorial(6));
        System.out.printf("circle(2.0)=%.3f  rect(2,3)=%.1f%n", area(2.0), area(2, 3));
        System.out.println("sum() = " + sum());
        System.out.println("sum(1,2,3) = " + sum(1, 2, 3));
        System.out.println("sum(1..5) = " + sum(1, 2, 3, 4, 5));
    }
}
`),

    ex("java-ex-006", "Arrays", "Declaration shapes, length, iteration, multi-dimensional arrays and Arrays utilities.", "Data structures", "arrays_tour",
        `// Array declaration, tools and 2-D shapes.
import java.util.Arrays;

public class arrays_tour {
    public static void main(String[] args) {
        int[] a = new int[5];        // zero-filled: [0,0,0,0,0]
        for (int i = 0; i < a.length; i++) a[i] = i * i;
        System.out.println("squares: " + Arrays.toString(a));

        int[] b = {7, 3, 9, 1};      // initializer list
        Arrays.sort(b);
        System.out.println("sorted:  " + Arrays.toString(b));

        // Arrays.copyOfRange is the slice.
        int[] mid = Arrays.copyOfRange(b, 1, 3);
        System.out.println("slice:   " + Arrays.toString(mid));

        // 2-D = array OF arrays (rows can differ in length).
        int[][] grid = {
            {1, 2, 3},
            {4, 5},
            {6}
        };
        for (int r = 0; r < grid.length; r++) {
            for (int c = 0; c < grid[r].length; c++) {
                System.out.print(grid[r][c] + " ");
            }
            System.out.println();
        }
        System.out.println("filled: " + Arrays.toString(new int[3])); // all zeros
    }
}
`),

    ex("java-ex-007", "ArrayList and maps", "The Collection workhorses: ArrayList, HashMap, iteration order and getOrDefault.", "Data structures", "arraylist_maps",
        `// ArrayList + HashMap — the two structures daily Java runs on.
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class arraylist_maps {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        names.add("Ada");
        names.add("Alan");
        names.add("Grace");
        names.set(1, "Al");           // replace index 1
        names.remove(0);              // remove by index
        System.out.println(names + "  size=" + names.size());
        System.out.println("contains Grace? " + names.contains("Grace"));

        // Word frequency with getOrDefault (the classic idiom).
        String text = "to be or not to be";
        Map<String, Integer> freq = new HashMap<>();
        for (String w : text.split(" ")) {
            freq.put(w, freq.getOrDefault(w, 0) + 1);
        }
        System.out.println(freq);    // HashMap — unordered print
        System.out.println("'to' appears " + freq.getOrDefault("to", 0) + " times");

        // Merge is the one-line alternative.
        Map<String, Integer> tally = new HashMap<>();
        for (String w : text.split(" ")) tally.merge(w, 1, Integer::sum);
        System.out.println(tally);
    }
}
`),

    ex("java-ex-008", "Classes and records", "A plain class with constructor/getters, a compact record for immutable data, and toString.", "OOP", "classes_records",
        `// A fielded class + a record (the immutable data carrier, Java 16+).
import java.util.ArrayList;
import java.util.List;

public class classes_records {
    // A classic class: state + constructor + methods.
    static class Stack {
        private final List<Integer> items = new ArrayList<>();
        void push(int v) { items.add(v); }
        int pop() { return items.remove(items.size() - 1); }
        boolean isEmpty() { return items.isEmpty(); }
    }

    // A record: immutable fields, constructor, equals/hashCode/toString
    // all generated — perfect for small value objects.
    record Point(int x, int y) {
        double distanceFromOrigin() { return Math.hypot(x, y); }
    }

    public static void main(String[] args) {
        Stack s = new Stack();
        s.push(1);
        s.push(2);
        s.push(3);
        System.out.println(s.pop() + " " + s.pop() + " empty? " + s.isEmpty());

        Point p = new Point(3, 4);
        System.out.println(p);                        // toString is generated
        System.out.printf("distance = %.3f%n", p.distanceFromOrigin());
        System.out.println(new Point(3, 4).equals(p)); // value equality
    }
}
`),

    ex("java-ex-009", "Streams and lambdas", "filter/map/sorted/collect over a list — the functional pass in one page.", "Modern Java", "streams_lambdas",
        `// Streams + lambdas: declarative collection transforms.
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

public class streams_lambdas {
    public static void main(String[] args) {
        List<String> words = List.of(
            "Praxis", "ide", "Java", "streams", "lambda", "filter", "collect"
        );

        // filter → map → collect: the bread-and-butter chain.
        List<String> big = words.stream()
                .filter(w -> w.length() >= 5)          // lambda predicate
                .map(w -> w.toUpperCase(Locale.ROOT))
                .sorted()
                .collect(Collectors.toList());
        System.out.println("uppercase, 5+ chars: " + big);

        // Terminal reductions.
        long count = words.stream().filter(w -> w.contains("a")).count();
        String joined = words.stream().collect(Collectors.joining(", "));
        int totalLen = words.stream().mapToInt(String::length).sum(); // method ref

        System.out.println("words containing 'a': " + count);
        System.out.println("joined: " + joined);
        System.out.println("total characters: " + totalLen);

        // The reduction fold: seed, accumulator, combiner.
        int letters = words.stream()
                .reduce(0, (acc, w) -> acc + w.length(), Integer::sum);
        System.out.println("letters via reduce: " + letters);
    }
}
`),

    ex("java-ex-010", "Files and exceptions", "try-with-resources reading a file, IOException handling, and Files lines streaming.", "Practical", "files_exceptions",
        `// Exceptions + file reading — the safe resource idiom.
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public class files_exceptions {
    public static void main(String[] args) {
        // try-with-resources: the resource CLOSES itself, always.
        try {
            Path here = Path.of(".").toAbsolutePath().normalize();
            System.out.println("working dir: " + here);

            // A temp file we can actually read back.
            Path note = Files.createTempFile("praxis", ".txt");
            Files.writeString(note, "line one\\nline two\\n");
            List<String> lines = Files.readAllLines(note);
            System.out.println("read " + lines.size() + " lines: " + lines);

            Files.delete(note); // tidy the temp file

            // Numbered checkpoint — parsing that throws.
            System.out.println("parsed: " + Integer.parseInt("2048"));
        } catch (IOException e) {
            System.err.println("IO failed: " + e.getMessage());
        } catch (NumberFormatException e) {
            System.err.println("bad number: " + e.getMessage());
        } finally {
            System.out.println("finally runs either way");
        }
    }
}
`),
];
