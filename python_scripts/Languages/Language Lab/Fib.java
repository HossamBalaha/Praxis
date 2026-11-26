// tags: java, getting-started
/** Fib.java — a single-file Java program (JEP 330: `java Fib.java`,
 *  JDK 11+). The IDE compiles nothing — the java launcher handles it
 *  and streams stdout to the Output panel.
 *
 * Try args:  10 20 30
 */
public class Fib {
    static long fib(int n) {
        if (n <= 1) {
            return n;
        }
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        int[] targets = args.length > 0
                ? java.util.Arrays.stream(args).mapToInt(Integer::parseInt).toArray()
                : new int[] { 10, 20, 30 };
        for (int n : targets) {
            System.out.printf("fib(%d) = %d%n", n, fib(n));
        }
        System.out.println("Java run complete.");
    }
}
