/**
 * the Java top-up: 40 more single-file reference templates
 * on top of the ten ("at least 50 like others"). Pure JDK.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Java";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("java", id, label, description, CAT, sub, baseName, ".java", () => body);

export const JAVA_2_EXAMPLES: FileExample[] = [
    ex("java2-ex-001", "Classes and constructors", "Fields, overloads, this-chaining, toString.", "Classes & Objects", "classes_basics",
        `public class Classes {
    static class Point {
        final int x, y;

        Point(int x, int y) { this.x = x; this.y = y; }

        Point() { this(0, 0); }           // constructor chaining

        @Override public String toString() { return "(" + x + ", " + y + ")"; }
    }

    public static void main(String[] args) {
        Point p = new Point(3, 4);
        System.out.println(p);
        System.out.println(new Point());
    }
}
`),
    ex("java2-ex-002", "Inheritance", "extends, super, polymorphic dispatch.", "Classes & Objects", "inheritance",
        `public class Inheritance {
    static class Animal {
        String name() { return "generic animal"; }
        String sound() { return "..."; }
    }

    static class Dog extends Animal {
        @Override String name() { return "dog"; }
        @Override String sound() { return "bark"; }
    }

    public static void main(String[] args) {
        Animal polymorphic = new Dog();
        System.out.println(polymorphic.name() + " says " + polymorphic.sound());
        System.out.println(new Animal().sound());
    }
}
`),
    ex("java2-ex-003", "Interfaces and default methods", "implements + default bodies + static interface methods.", "Classes & Objects", "interfaces",
        `public class Interfaces {
    interface Greeter {
        String defaultGreeting = "Hello";        // constant

        default String greet(String who) {        // default method
            return defaultGreeting + ", " + who + "!";
        }
        static Greeter formal() {                 // static factory
            return who -> "Good day, " + who + ".";
        }
    }

    public static void main(String[] args) {
        Greeter casual = who -> "Yo " + who;
        System.out.println(casual.greet("Ada"));
        System.out.println(Greeter.formal().greet("Ada"));
    }
}
`),
    ex("java2-ex-004", "Records", "Compact immutable carriers (Java 16+).", "Classes & Objects", "records",
        `public class Records {
    record Point(int x, int y) {
        // compact constructor validates without repeating fields
        Point {
            if (x < 0 || y < 0) throw new IllegalArgumentException("negative");
        }
        Point translated(int dx, int dy) {
            return new Point(x + dx, y + dy);
        }
    }

    public static void main(String[] args) {
        Point p = new Point(3, 4);
        System.out.println(p);                    // toString for free
        System.out.println(p.x() + "," + p.y()); // accessors for free
        System.out.println(p.translated(1, 1));
        System.out.println(p.equals(new Point(3, 4)));
    }
}
`),
    ex("java2-ex-005", "Enums with behavior", "Constants carrying fields and methods.", "Classes & Objects", "enums",
        `public class Enums {
    enum Planet {
        MERCURY(3.303e+23, 2.4397e6),
        EARTH(5.976e+24, 6.37814e6),
        MARS(6.421e+23, 3.4e6);

        final double mass, radius;
        Planet(double mass, double radius) { this.mass = mass; this.radius = radius; }

        double surfaceGravity() { return 6.67300E-11 * mass / (radius * radius); }
    }

    public static void main(String[] args) {
        for (Planet p : Planet.values())
            System.out.printf("%-8s g=%.2f m/s^2%n", p, p.surfaceGravity());

        Planet byName = Planet.valueOf("MARS");
        System.out.println("found: " + byName + " ordinal " + byName.ordinal());
    }
}
`),
    ex("java2-ex-006", "Generics", "Type parameters, bounds, wildcards.", "Generics", "generics",
        `import java.util.List;

public class Generics {
    static <T extends Comparable<T>> T max(List<T> xs) {
        T best = xs.get(0);
        for (T x : xs) if (x.compareTo(best) > 0) best = x;
        return best;
    }

    static double sumOfNumbers(List<? extends Number> xs) {   // wildcard
        double total = 0;
        for (Number n : xs) total += n.doubleValue();
        return total;
    }

    public static void main(String[] args) {
        System.out.println(max(List.of(3, 9, 2)));
        System.out.println(max(List.of("pear", "apple")));
        System.out.println(sumOfNumbers(List.of(1, 2.5, 3L)));
    }
}
`),
    ex("java2-ex-007", "Collections framework", "List vs Set vs Map and their contracts.", "Collections", "collections_tour",
        `import java.util.*;

public class CollectionsTour {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>(List.of("a", "b", "a"));
        System.out.println("list: " + list + " size " + list.size());

        Set<String> set = new LinkedHashSet<>(list);      // dedupe, ordered
        System.out.println("set: " + set);

        Map<String, Integer> map = new HashMap<>();
        map.put("a", 1);
        map.put("b", 2);
        map.merge("a", 10, Integer::sum);                 // accumulate
        System.out.println("map: " + map);

        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(1); stack.push(2);
        System.out.println("pop: " + stack.pop() + " peek: " + stack.peek());
    }
}
`),
    ex("java2-ex-008", "Streams: map/filter/reduce", "The three-step pipeline.", "Streams", "streams_basics",
        `import java.util.List;

public class StreamsBasics {
    public static void main(String[] args) {
        List<Integer> nums = List.of(5, 3, 9, 1, 7);

        List<Integer> bigEvens = nums.stream()
                .filter(n -> n > 3)
                .sorted()
                .toList();
        System.out.println(bigEvens);

        int total = nums.stream().reduce(0, Integer::sum);
        System.out.println("sum = " + total);

        nums.stream().map(n -> n * n)
            .forEach(n -> System.out.print(n + " "));
        System.out.println();
    }
}
`),
    ex("java2-ex-009", "Collectors", "groupingBy, joining, partitioningBy, toMap.", "Streams", "collectors",
        `import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class CollectorsTour {
    record Emp(String name, String dept, int salary) {}

    public static void main(String[] args) {
        List<Emp> staff = List.of(
                new Emp("ada", "eng", 120),
                new Emp("alan", "eng", 110),
                new Emp("grace", "ops", 100));

        Map<String, List<Emp>> byDept = staff.stream()
                .collect(Collectors.groupingBy(Emp::dept));
        byDept.forEach((d, list) ->
                System.out.println(d + ": " + list.size() + " people"));

        System.out.println(staff.stream().map(Emp::name)
                .collect(Collectors.joining(", ", "[", "]")));

        Map<Boolean, List<Emp>> rich = staff.stream()
                .collect(Collectors.partitioningBy(e -> e.salary() >= 110));
        System.out.println("high paid: " + rich.get(true).size());
    }
}
`),
    ex("java2-ex-010", "Optional", "Empty-safe returns, map/orElse chains.", "Streams", "optional",
        `import java.util.Optional;

public class OptionalTour {
    static Optional<String> find(int id) {
        return id == 1 ? Optional.of("praxis") : Optional.empty();
    }

    public static void main(String[] args) {
        System.out.println(find(1).map(String::toUpperCase).orElse("n/a"));
        System.out.println(find(2).map(String::toUpperCase).orElse("n/a"));
        System.out.println(find(2).or(() -> Optional.of("fallback")).get());

        find(1).ifPresent(s -> System.out.println("present: " + s));
        find(2).ifPresentOrElse(
                s -> System.out.println("got " + s),
                () -> System.out.println("nothing for id 2"));
    }
}
`),
    ex("java2-ex-011", "Exceptions", "Checked vs unchecked, try-with-resources, finally.", "Exceptions", "exceptions",
        `import java.io.*;

public class Exceptions {
    static int parse(String s) throws NumberFormatException {
        return Integer.parseInt(s);
    }

    public static void main(String[] args) {
        try (StringWriter w = new StringWriter();
             PrintWriter out = new PrintWriter(w)) {
            out.println("managed automatically");
            System.out.println(w.toString().strip());
        } catch (IOException e) {
            System.out.println("io: " + e.getMessage());
        }

        try {
            System.out.println(parse("42"));
            System.out.println(parse("four"));
        } catch (NumberFormatException e) {
            System.out.println("caught: " + e.getMessage());
        } finally {
            System.out.println("finally always runs");
        }
    }
}
`),
    ex("java2-ex-012", "Custom exceptions", "Exception hierarchies and meaningful messages.", "Exceptions", "custom_exceptions",
        `public class CustomExceptions {
    static class ValidationError extends RuntimeException {
        ValidationError(String field, String rule) {
            super("invalid " + field + ": " + rule);
        }
    }

    static void validate(int age) {
        if (age < 0) throw new ValidationError("age", "negative");
        if (age > 150) throw new ValidationError("age", "too high");
    }

    public static void main(String[] args) {
        for (int age : new int[]{36, -1, 200}) {
            try {
                validate(age);
                System.out.println("age " + age + " ok");
            } catch (ValidationError e) {
                System.out.println("rejected: " + e.getMessage());
            }
        }
    }
}
`),
    ex("java2-ex-013", "String methods in depth", "format, repeat, strip, blank, chars().", "Strings", "strings_tour",
        `public class StringsTour {
    public static void main(String[] args) {
        String s = "  Praxis IDE  ";
        System.out.println("[" + s.strip() + "]");       // trim smarter
        System.out.println("blank? " + "   ".isBlank());
        System.out.println("repeat: " + "ab".repeat(3));
        System.out.println("lines: " + "a\\nb\\nc".lines().count());

        String fmt = String.format("%s scored %d (%.1f%%)", "Ada", 92, 92.0);
        System.out.println(fmt);

        s.chars().filter(c -> c == ' ')
                  .forEach(c -> System.out.println("space found"));
        System.out.println("join: " + String.join("-", "a", "b", "c"));
    }
}
`),
    ex("java2-ex-014", "StringBuilder", "Mutable assembly for hot loops.", "Strings", "string_builder",
        `public class StringBuilderTour {
    public static void main(String[] args) {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= 5; i++) {
            sb.append("row ").append(i).append(System.lineSeparator());
        }
        System.out.println(sb);

        StringBuilder csv = new StringBuilder("1;2;3");
        System.out.println("len " + csv.length());
        System.out.println(csv.insert(0, "[").append("]").reverse());
        System.out.println("back to: " + csv.reverse());
    }
}
`),
    ex("java2-ex-015", "Text blocks and equals", "Multiline literals + content equality rules.", "Strings", "text_blocks",
        `public class TextBlocks {
    public static void main(String[] args) {
        String json = """
                {
                    "app": "praxis",
                    "round": 45
                }
                """;
        System.out.println(json);
        System.out.println("length: " + json.length());

        String a = "praxis";
        String b = new String("praxis");
        System.out.println("== " + (a == b) + " equals " + a.equals(b));
        System.out.println("interned: " + (a.intern() == b.intern()));
    }
}
`),
    ex("java2-ex-016", "Wrappers and boxing", "Autoboxing, unboxing, cache surprises.", "Numbers", "wrappers",
        `import java.util.*;

public class Wrappers {
    public static void main(String[] args) {
        List<Integer> boxed = new ArrayList<>();
        for (int i = 0; i < 5; i++) boxed.add(i * i);       // autobox
        int total = 0;
        for (int v : boxed) total += v;                     // unbox
        System.out.println("squares sum: " + total);

        Integer a = 127, b = 127;                            // cached
        Integer c = 128, d = 128;                            // NOT cached
        System.out.println("127 == 127: " + (a == b));
        System.out.println("128 == 128: " + (c == d) + " (use equals!)");

        System.out.println("parse: " + Integer.parseInt("42"));
        System.out.println("binary: " + Integer.toBinaryString(255));
    }
}
`),
    ex("java2-ex-017", "Math and precision", "Math.* methods and floating-point care.", "Numbers", "math_precision",
        `import java.math.BigDecimal;
import java.math.RoundingMode;

public class MathPrecision {
    public static void main(String[] args) {
        System.out.println("sqrt: " + Math.sqrt(144));
        System.out.println("pow: " + Math.pow(2, 10));
        System.out.println("round(2.5) = " + Math.round(2.5));

        double naive = 0.1 + 0.2;
        System.out.println("0.1+0.2 = " + naive);
        BigDecimal money = new BigDecimal("0.10").add(new BigDecimal("0.20"));
        System.out.println("BigDecimal: " + money);

        BigDecimal price = new BigDecimal("19.99")
                .multiply(BigDecimal.valueOf(3))
                .setScale(2, RoundingMode.HALF_UP);
        System.out.println("total: " + price);
    }
}
`),
    ex("java2-ex-018", "Random numbers", "Random, seeded, bounded ints and streams.", "Numbers", "random",
        `import java.util.Random;
import java.util.stream.IntStream;

public class RandomTour {
    public static void main(String[] args) {
        Random rng = new Random(42);                  // deterministic

        for (int i = 0; i < 5; i++) {
            System.out.println("die: " + (rng.nextInt(6) + 1));
        }

        rng.ints(5, 1, 101)                           // stream of 1..100
           .distinct()
           .sorted()
           .forEach(n -> System.out.print(n + " "));
        System.out.println();

        IntStream.rangeClosed(1, 10)
                 .filter(n -> n % 2 == 0)
                 .forEach(n -> System.out.print(n + " "));
        System.out.println();
    }
}
`),
    ex("java2-ex-019", "Local dates and times", "The java.time API: LocalDate, Duration, formatting.", "Dates & Time", "java_time",
        `import java.time.*;
import java.time.format.DateTimeFormatter;

public class JavaTime {
    public static void main(String[] args) {
        LocalDate today = LocalDate.now();
        System.out.println("today: " + today);
        System.out.println("year " + today.getYear() + " month " + today.getMonth());

        LocalDate exam = LocalDate.of(2024, 6, 15);
        System.out.println("days until: " + java.time.temporal.ChronoUnit.DAYS.between(today, exam));

        LocalTime now = LocalTime.of(9, 30);
        System.out.println(now.plus(Duration.ofMinutes(90)));

        DateTimeFormatter f = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm");
        System.out.println(LocalDateTime.of(2024, 6, 15, 13, 45).format(f));
    }
}
`),
    ex("java2-ex-020", "Files and Paths", "NIO Files/Path: read, write, walk, metadata.", "Files & IO", "nio_files",
        `import java.io.IOException;
import java.nio.file.*;
import java.util.stream.Stream;

public class NioFiles {
    public static void main(String[] args) throws IOException {
        Path tmp = Files.createTempFile("praxis", ".txt");
        Files.writeString(tmp, "line one\\nline two\\n");

        System.out.println("content:"); 
        System.out.print(Files.readString(tmp));

        System.out.println("size: " + Files.size(tmp));
        System.out.println("exists: " + Files.exists(tmp));

        try (Stream<String> lines = Files.lines(tmp)) {
            System.out.println("line count: " + lines.count());
        }

        Files.delete(tmp);
        System.out.println("deleted: " + !Files.exists(tmp));
    }
}
`),
    ex("java2-ex-021", "Buffered and byte IO", "InputStream/OutputStream copy with a buffer.", "Files & IO", "byte_io",
        `import java.io.*;

public class ByteIo {
    public static void main(String[] args) throws IOException {
        File f = File.createTempFile("praxis", ".bin");

        try (DataOutputStream out = new DataOutputStream(
                new BufferedOutputStream(new FileOutputStream(f)))) {
            out.writeInt(42);
            out.writeDouble(2.5);
            out.writeUTF("praxis");
        }

        try (DataInputStream in = new DataInputStream(
                new BufferedInputStream(new FileInputStream(f)))) {
            System.out.println("int: " + in.readInt());
            System.out.println("double: " + in.readDouble());
            System.out.println("utf: " + in.readUTF());
        }

        f.delete();
    }
}
`),
    ex("java2-ex-022", "Scanner parsing", "Delimiters, typed tokens, console-ready.", "Files & IO", "scanner",
        `import java.io.*;
import java.util.Scanner;

public class ScannerTour {
    public static void main(String[] args) throws IOException {
        File f = File.createTempFile("praxis", ".csv");
        try (PrintWriter out = new PrintWriter(f)) {
            out.println("alpha,1,9.5");
            out.println("beta,2,8.0");
        }

        try (Scanner sc = new Scanner(f).useDelimiter("[,\\n]")) {
            while (sc.hasNext()) {
                String name = sc.next();
                int rank = sc.nextInt();
                double score = sc.nextDouble();
                System.out.printf("%-6s #%d %.1f%n", name, rank, score);
            }
        }
        f.delete();
    }
}
`),
    ex("java2-ex-023", "Threads", "Runnable, start/join, names, daemon flag.", "Concurrency", "threads",
        `public class Threads {
    public static void main(String[] args) throws InterruptedException {
        Runnable worker = () -> {
            String name = Thread.currentThread().getName();
            System.out.println(name + " running");
        };

        Thread t = new Thread(worker, "worker-1");
        t.start();
        t.join();                                  // wait for it

        Thread daemon = new Thread(() -> {}, "helper");
        daemon.setDaemon(true);
        daemon.start();
        System.out.println("alive: " + daemon.isAlive());
        System.out.println("cpus: " + Runtime.getRuntime().availableProcessors());
    }
}
`),
    ex("java2-ex-024", "Executors", "Pools + futures instead of raw threads.", "Concurrency", "executors",
        `import java.util.concurrent.*;
import java.util.List;

public class ExecutorsTour {
    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(3)) {
            List<Future<Integer>> futures = new java.util.ArrayList<>();
            for (int i = 1; i <= 5; i++) {
                int n = i;
                futures.add(pool.submit(() -> n * n));
            }
            int total = 0;
            for (Future<Integer> f : futures) total += f.get();
            System.out.println("sum of squares: " + total);
        }   // auto-shutdown via try-with-resources (Java 19+)

        System.out.println("pool closed cleanly");
    }
}
`),
    ex("java2-ex-025", "Synchronized and atomics", "Locking vs atomic counters.", "Concurrency", "sync_tools",
        `import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

public class SyncTools {
    public static void main(String[] args) throws InterruptedException {
        ReentrantLock lock = new ReentrantLock();
        int[] guarded = {0};
        AtomicInteger atomic = new AtomicInteger();

        Thread[] ts = new Thread[4];
        for (int t = 0; t < 4; t++) {
            ts[t] = new Thread(() -> {
                for (int i = 0; i < 10_000; i++) {
                    lock.lock();
                    try { guarded[0]++; } finally { lock.unlock(); }
                    atomic.incrementAndGet();
                }
            });
            ts[t].start();
        }
        for (Thread t : ts) t.join();

        System.out.println("guarded: " + guarded[0]);
        System.out.println("atomic: " + atomic.get());
    }
}
`),
    ex("java2-ex-026", "Lambdas and method refs", "The four reference kinds.", "Functional Java", "lambdas",
        `import java.util.function.*;

public class Lambdas {
    static int square(int x) { return x * x; }

    public static void main(String[] args) {
        Function<Integer, Integer> sq = Lambdas::square;             // static
        BiFunction<String, String, Boolean> eq = String::equalsIgnoreCase; // instance-of-arbitrary
        Supplier<String> maker = () -> "supplied";                  // no-arg
        Consumer<String> printer = System.out::println;              // existing object

        System.out.println(sq.apply(9));
        System.out.println(eq.apply("PRAXIS", "praxis"));
        System.out.println(maker.get());
        printer.andThen(s -> {}).accept("printed via consumer");

        Predicate<Integer> even = n -> n % 2 == 0;
        System.out.println(even.or(n -> n == 1).test(7));
    }
}
`),
    ex("java2-ex-027", "Comparator building", "chained + thenComparing + reversed.", "Functional Java", "comparators",
        `import java.util.*;

public class ComparatorTour {
    record Book(String title, int year, double rating) {}

    public static void main(String[] args) {
        List<Book> books = new ArrayList<>(List.of(
                new Book("Design", 1977, 4.6),
                new Book("Structure", 1975, 4.8),
                new Book("Practice", 1980, 4.6)));

        books.sort(Comparator.comparing(Book::rating).reversed()
                .thenComparing(Book::title));
        books.forEach(b -> System.out.println(b.title() + " " + b.rating()));

        books.sort(Comparator.comparingInt(Book::year));
        System.out.println("oldest: " + books.get(0).title());
    }
}
`),
    ex("java2-ex-028", "Annotations", "Writing and reading a custom marker.", "Reflection", "annotations",
        `import java.lang.annotation.*;
import java.lang.reflect.Method;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@interface Tested { String value() default ""; }

public class Annotations {
    @Tested("checks arithmetic")
    static int add(int a, int b) { return a + b; }

    static int helper(int a) { return a + 1; }        // NOT annotated

    public static void main(String[] args) {
        for (Method m : Annotations.class.getDeclaredMethods()) {
            Tested t = m.getAnnotation(Tested.class);
            if (t != null) System.out.println(m.getName() + " <- " + t.value());
        }
    }
}
`),
    ex("java2-ex-029", "Reflection", "Inspect fields, constructors and method calls.", "Reflection", "reflection",
        `import java.lang.reflect.*;

public class ReflectionTour {
    static class Box {
        private final int secret = 42;
        public int visible() { return secret; }
    }

    public static void main(String[] args) throws Exception {
        Class<?> c = Box.class;
        System.out.println("class: " + c.getName());

        for (Field f : c.getDeclaredFields())
            System.out.println("field " + f.getName() + " : " + f.getType());

        Field secret = c.getDeclaredField("secret");
        secret.setAccessible(true);
        Box box = c.getConstructor().newInstance();
        System.out.println("read private field: " + secret.get(box));

        Method m = c.getMethod("visible");
        System.out.println("invoked: " + m.invoke(box));
    }
}
`),
    ex("java2-ex-030", "Sealed classes", "Restricted hierarchies (Java 17+).", "Language Features", "sealed",
        `public class Sealed {
    sealed interface Shape permits Circle, Square {}
    record Circle(double r) implements Shape {}
    record Square(double s) implements Shape {}

    static double area(Shape s) {
        return switch (s) {
            case Circle c -> Math.PI * c.r() * c.r();
            case Square q -> q.s() * q.s();
        };      // no default: the compiler knows the set is closed
    }

    public static void main(String[] args) {
        System.out.println(area(new Circle(1)));
        System.out.println(area(new Square(2)));
    }
}
`),
    ex("java2-ex-031", "Pattern matching switch", "Type + record deconstruction patterns.", "Language Features", "pattern_switch",
        `public class PatternSwitch {
    sealed interface Input permits Num, Str, Pair {}
    record Num(double v) implements Input {}
    record Str(String s) implements Input {}
    record Pair(Input a, Input b) implements Input {}

    static String render(Input in) {
        return switch (in) {
            case Num(double v) -> "num:" + v;
            case Str(String s) -> "str:" + s;
            case Pair(Input a, Input b) -> "(" + render(a) + ", " + render(b) + ")";
        };
    }

    public static void main(String[] args) {
        System.out.println(render(new Num(4.5)));
        System.out.println(render(new Pair(new Num(1), new Str("x"))));
    }
}
`),
    ex("java2-ex-032", "Var and instanceOf patterns", "Local inference + typed conditionals.", "Language Features", "var_patterns",
        `import java.util.*;

public class VarPatterns {
    public static void main(String[] args) {
        var names = List.of("ada", "alan", "grace");    // inferred List<String>
        System.out.println(names.getClass().getSimpleName());

        Object o = "praxis";
        if (o instanceof String s && s.length() > 3) { // binding pattern
            System.out.println("string of len " + s.length());
        }

        var map = new HashMap<String, Integer>();
        map.put("round", 45);
        for (var entry : map.entrySet()) {             // var in loops
            System.out.println(entry.getKey() + " = " + entry.getValue());
        }
    }
}
`),
    ex("java2-ex-033", "Properties config files", "java.util.Properties load + typed getters.", "Configuration", "properties",
        `import java.io.*;
import java.util.Properties;

public class PropertiesTour {
    public static void main(String[] args) throws IOException {
        File f = File.createTempFile("praxis", ".properties");
        try (PrintWriter out = new PrintWriter(f)) {
            out.println("host=127.0.0.1");
            out.println("port=9090");
            out.println("# a comment line");
        }

        Properties p = new Properties();
        try (Reader r = new FileReader(f)) {
            p.load(r);
        }
        System.out.println("host: " + p.getProperty("host"));
        int port = Integer.parseInt(p.getProperty("port", "8080"));
        System.out.println("port: " + port);
        System.out.println("missing default: " + p.getProperty("api", "none"));
        f.delete();
    }
}
`),
    ex("java2-ex-034", "System properties and env", "Reading the JVM + OS context.", "Configuration", "system_info",
        `public class SystemInfo {
    public static void main(String[] args) {
        System.out.println("java: " + System.getProperty("java.version"));
        System.out.println("vendor: " + System.getProperty("java.vendor"));
        System.out.println("os: " + System.getProperty("os.name"));
        System.out.println("user: " + System.getProperty("user.name"));
        System.out.println("path.sep is " + System.getProperty("path.separator").charAt(0));

        System.out.println("cores: " + Runtime.getRuntime().availableProcessors());
        System.out.println("max mem MB: " + Runtime.getRuntime().maxMemory() / (1 << 20));
        System.out.println("env PATH set: " + (System.getenv("PATH") != null));
    }
}
`),
    ex("java2-ex-035", "Logging with java.util.logging", "The built-in logger + levels.", "Configuration", "jul_logging",
        `import java.util.logging.*;

public class JulLogging {
    private final static Logger log = Logger.getLogger(JulLogging.class.getName());

    public static void main(String[] args) {
        log.setLevel(Level.ALL);
        log.info("service starting");
        log.warning("disk at 91%");
        log.fine("finer detail - shown only at Level.ALL");

        try {
            throw new IllegalStateException("demo failure");
        } catch (IllegalStateException e) {
            log.log(Level.SEVERE, "caught an error", e);
        }
    }
}
`),
    ex("java2-ex-036", "HashCode and equals", "Objects.equals/hash + the contract.", "Utilities", "equals_hash",
        `import java.util.*;

public class EqualsHash {
    record Key(String a, int b) {}                    // records do it right

    static class Handmade {
        final String a; final int b;
        Handmade(String a, int b) { this.a = a; this.b = b; }

        @Override public boolean equals(Object o) {
            return o instanceof Handmade h && h.b == b && Objects.equals(a, h.a);
        }
        @Override public int hashCode() { return Objects.hash(a, b); }
    }

    public static void main(String[] args) {
        System.out.println(new Key("x", 1).equals(new Key("x", 1)));
        System.out.println(new Handmade("x", 1).equals(new Handmade("x", 1)));

        Map<Key, String> m = new HashMap<>();
        m.put(new Key("x", 1), "found");
        System.out.println(m.get(new Key("x", 1)));    // needs equals+hashCode
    }
}
`),
    ex("java2-ex-037", "Arrays utilities", "Arrays.fill, copyOf, binarySearch, toString.", "Utilities", "arrays_tools",
        `import java.util.Arrays;

public class ArraysTools {
    public static void main(String[] args) {
        int[] v = {5, 2, 9, 1};

        System.out.println(Arrays.toString(v));
        Arrays.sort(v);
        System.out.println("sorted: " + Arrays.toString(v));

        int idx = Arrays.binarySearch(v, 9);
        System.out.println("9 at index " + idx);

        int[] grown = Arrays.copyOf(v, 6);
        System.out.println("grown: " + Arrays.toString(grown));

        int[] filled = new int[3];
        Arrays.fill(filled, 7);
        System.out.println("filled: " + Arrays.toString(filled));

        int[][] grid = {{1, 2}, {3, 4}};
        System.out.println("deep: " + Arrays.deepToString(grid));
    }
}
`),
    ex("java2-ex-038", "A mini test harness", "assert + a table of cases.", "Testing", "mini_tests",
        `import java.util.*;

public class MiniTests {
    static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(v, hi));
    }

    public static void main(String[] args) {
        record Case(int in, int lo, int hi, int want) {}
        List<Case> cases = List.of(
                new Case(5, 0, 10, 5),
                new Case(-1, 0, 10, 0),
                new Case(99, 0, 10, 10));

        int passed = 0;
        for (Case c : cases) {
            int got = clamp(c.in, c.lo, c.hi);
            boolean ok = got == c.want;
            if (ok) passed++;
            System.out.println((ok ? "  ok  " : "  FAIL") + " clamp(" + c.in + ")");
        }
        System.out.println(passed + "/" + cases.size() + " passed");
    }
}
`),
    ex("java2-ex-039", "Args parsing by hand", "Flags, key=value, positional collection.", "Projects", "argparse",
        `import java.util.*;

public class ArgParse {
    public static void main(String[] args) {
        // Simulated command line (real: use the args parameter).
        String[] argv = {"--verbose", "--top=3", "report.txt"};

        Map<String, String> options = new HashMap<>();
        List<String> positional = new ArrayList<>();
        for (String a : argv) {
            if (a.startsWith("--")) {
                int eq = a.indexOf('=');
                if (eq > 0) options.put(a.substring(2, eq), a.substring(eq + 1));
                else options.put(a.substring(2), "true");
            } else {
                positional.add(a);
            }
        }

        System.out.println("verbose: " + options.getOrDefault("verbose", "false"));
        System.out.println("top: " + options.getOrDefault("top", "5"));
        System.out.println("targets: " + positional);
    }
}
`),
    ex("java2-ex-040", "A complete mini tool", "Files + maps + streams: wordstats.", "Projects", "wordstats",
        `import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.*;

public class WordStats {
    public static void main(String[] args) throws IOException {
        Path tmp = Files.createTempFile("praxis", ".txt");
        Files.writeString(tmp, "the quick brown fox\\nthe lazy dog\\nthe end\\n");

        Map<String, Long> counts;
        try (Stream<String> lines = Files.lines(tmp)) {
            counts = lines.flatMap(line -> Arrays.stream(line.split("\\\\W+")))
                          .filter(w -> !w.isBlank())
                          .collect(Collectors.groupingBy(Function.identity(),
                                   Collectors.counting()));
        }

        System.out.println("unique words: " + counts.size());
        counts.entrySet().stream()
              .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
              .limit(3)
              .forEach(e -> System.out.println(e.getKey() + ": " + e.getValue() + "x"));

        Files.delete(tmp);
    }
}
`),
];
