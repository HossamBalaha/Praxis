# Language Lab

The polyglot corner — every file here RUNS through the language
runtime registry ("the main is python and others can run also"):

| File           | Runtime                              | Notes                                         |
|----------------|--------------------------------------|-----------------------------------------------|
| `Fib.java`     | `java` (JDK 11+, single-file launch) | Try args: `10 20 30`                          |
| `quicksort.c`  | `gcc` then run                       | Compile diagnostics stream first              |
| `matrix.cpp`   | `g++` then run                       | Small `Matrix` class, IKJ multiply            |
| `analyze.R`    | `Rscript`                            | Install hint when R is missing                |
| `backup.sh`    | `bash`                               | if/then/fi + case/esac + heredoc              |
| `Hello.zig`    | `zig run`                            | compile + run in one step; try args: `12`     |
| `Greet.dart`   | `dart run`                           | a tiny class + loop                           |
| `Stats.groovy` | `groovy`                             | closures + a map fold                         |
| `Series.scala` | `scala`                              | case class + pattern matching (compile first) |
| `Pipeline.exs` | `elixir`                             | pipe chain + do…end block                     |

A missing runtime never breaks the Run button — it answers with the
exact install hint (see Settings → Python → Other language runtimes
for the live detection table). Every file is also formattable:
right-click ▸ Auto-format / Auto-indent (Java, C, C++, R, shell, Zig,
Dart, Groovy, Scala, Elixir).
