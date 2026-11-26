/**
 * 10 PHP reference templates (the "add other languages
 * also + their examples to check" batch). Bodies are idiomatic
 * command-line PHP 8 (pure stdlib), created as .php files and runnable
 * through `php` the moment it is installed.
 *
 * PHP identifiers keep their native camelCase/snake mix (no tokens).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "PHP";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("php", id, label, description, CAT, sub, baseName, ".php", () => body);

export const PHP_EXAMPLES: FileExample[] = [
    ex("php-ex-001", "Hello, PHP", "echo, printf, var_dump and interpolation — the four output styles.", "Basics", "hello_php",
        `<?php
// Hello, PHP — the output quartet.
echo "Hello from PHP!\\n";          // echo: no parentheses, multiple args
echo "Hello, ", "Praxis", "!\\n";

$name = 'Praxis';
// Double quotes interpolate variables AND {$expr}; single quotes do not.
echo "Hello, $name!\\n";
echo "Upper: " . strtoupper($name) . "\\n";   // . concatenates

printf("pi is %.4f\\n", M_PI);               // printf: C-style verbs
printf("%d %s %b\\n", 42, 'x', 10);           // int, string, binary

// var_dump: the debugging dump (type + length + value).
var_dump(3.14, 'word', [1, 2], true);
`),

    ex("php-ex-002", "Types and arrays", "The typed variable zoo, int division, and indexed + associative arrays.", "Basics", "types_arrays",
        `<?php
// Types + the two array shapes.
$count = 42;
$exact = 3.14159;
$flag  = true;
$letter = 'A';
$nothing = null;

printf("int=%d float=%.3f bool=%s\\n", $count, $exact, $flag ? 'true' : 'false');
echo gettype($count), " ", gettype($exact), " ", gettype($letter), "\\n";

// Integer division needs intdiv (/ yields float when it would lose).
printf("7/2=%s intdiv(7,2)=%s\\n", var_export(7 / 2, true), intdiv(7, 2));

// Indexed arrays.
$nums = [5, 1, 4, 2, 3];
$nums[] = 9;                     // push
$last = array_pop($nums);        // pop
printf("count=%d popped=%d\\n", count($nums), $last);
echo 'sorted: ', implode(' ', $nums), "\\n";

// Associative arrays: key => value, ordered by insertion.
$person = ['name' => 'Ada', 'year' => 1815];
$person['lang'] = 'Analytical Engine';
foreach ($person as $key => $value) {
    echo "$key => $value\\n";
}
echo isset($person['name']) ? "name is set\\n" : "no name\\n";

// list destructuring in one line.
[$a, $b] = [1, 2];
echo "a=$a b=$b\\n";
`),

    ex("php-ex-003", "Branching and match", "if/elseif/else, alternative colon syntax, and the match expression (PHP 8).", "Control flow", "branching_match",
        `<?php
// Branching + the match EXPRESSION (strict === comparisons).
$score = 87;

$grade = match (true) {
    $score >= 90 => 'A',
    $score >= 80 => 'B',
    $score >= 70 => 'C',
    default      => 'F',
};
echo "score $score -> $grade\\n";

// match on a value — no fall-through, no break.
$weekday = 6;
$kind = match ($weekday) {
    1, 7 => 'weekend',
    2, 3, 4, 5, 6 => 'weekday',
};
echo "day $weekday is a $kind\\n";

// The classic ladder…
if ($score >= 90) {
    echo "excellent\\n";
} elseif ($score >= 80) {
    echo "solid\\n";
} else {
    echo "keep going\\n";
}

// …and the alternative (colon) syntax templates use.
if ($score > 50) :
    echo "passed\\n";
else :
    echo "failed\\n";
endif;
`),

    ex("php-ex-004", "Loops", "for, foreach with index + value, while, and break/continue with levels.", "Control flow", "loops_tour",
        `<?php
// Loops — foreach is the one you will actually use.
$total = 0;
for ($i = 1; $i <= 10; $i++) {
    $total += $i;
}
echo "1..10 sums to $total\\n";

$nums = [10, 20, 30];
foreach ($nums as $n) {
    echo $n, " ";
}
echo "\\n";

// foreach with key => value.
foreach ($nums as $index => $value) {
    echo "$index:$value ";
}
echo "\\n";

// while + do-while.
$power = 1;
while ($power < 100) {
    $power *= 3;
}
echo "past 100: $power\\n";

$tries = 0;
do {
    $tries++;
} while (false);          // runs once
echo "do-while ran $tries time\\n";

// Nested loops with a levelled break (out of BOTH loops).
for ($row = 1; $row <= 3; $row++) {
    for ($col = 1; $col <= 3; $col++) {
        if ($row * $col > 4) break 2;
        echo $row * $col, ' ';
    }
}
echo "\\n";
`),

    ex("php-ex-005", "Functions", "Typed signatures, defaults, named arguments, arrow functions and varargs spread.", "Functions", "functions_tour",
        `<?php
// Functions: types, defaults, named args, arrow fns.
function volume(float $radius, float $height = 1.0): float {
    return M_PI * $radius ** 2 * $height;      // ** is power
}

function sum(int ...$values): int {           // variadic
    return array_sum($values);
}

// Named arguments (PHP 8): order-free, self-documenting.
echo volume(height: 2.0, radius: 1.0), "\\n";
echo volume(2.0), "\\n";
echo sum(), " ", sum(1, 2), " ", sum(1, 2, 3, 4, 5), "\\n";

// Arrow functions capture by-value automatically (fn =>).
$nums = [1, 2, 3, 4, 5];
$doubled = array_map(fn ($n) => $n * 2, $nums);
$big = array_filter($nums, fn ($n) => $n >= 3);
echo 'doubled: ', implode(' ', $doubled), "\\n";
echo 'big: ', implode(' ', $big), "\\n";

// First-class callable syntax (PHP 8.1): strrev(...) as a value.
$words = ['cat', 'dog'];
$reversed = array_map(strrev(...), $words);
echo implode(' ', $reversed), "\\n";
`),

    ex("php-ex-006", "Strings", "The string function pass: sprintf, strpos, substr, explode/implode, str_replace.", "Text", "strings_tour",
        `<?php
// Strings — the standard-library workbench.
$text = 'The quick brown fox jumps over the lazy dog';

printf("[%s]\\n", strtoupper(substr($text, 4, 5)));      // QUICK
printf("length=%d words=%d\\n", strlen($text), str_word_count($text));

// strpos returns the offset (or false — compare with !== strictly).
$pos = strpos($text, 'fox');
if ($pos !== false) {
    printf("'fox' at offset %d\\n", $pos);
}
var_dump(strpos($text, 'cat'));                          // bool(false)

// explode / implode: split + join.
$words = explode(' ', $text);
echo implode(' | ', array_slice($words, 0, 4)), "\\n";

// str_replace with arrays swaps every pair at once.
$swapped = str_replace(
    ['quick', 'lazy'],
    ['slow', 'busy'],
    $text
);
echo $swapped, "\\n";

// sprintf builds strings (vs printf which prints).
$row = sprintf('%04d | %-10s | %6.2f', 7, 'widget', 19.5);
echo $row, "\\n";

// Multibyte-safe twins (UTF-8): mb_strlen etc.
echo mb_strlen('héllo wörld'), " chars in the accented form\\n";
`),

    ex("php-ex-007", "Classes and objects", "Typed properties, constructor promotion, readonly, static and :: vs ->.", "OOP", "classes_tour",
        `<?php
// Classes — the modern (8.x) shape.
class Point {
    // Constructor promotion declares AND assigns in one line.
    public function __construct(
        public readonly float $x = 0.0,
        public readonly float $y = 0.0,
    ) {}

    public function distanceFromOrigin(): float {
        return hypot($this->x, $this->y);    // $this-> — not $this->
    }

    public function __toString(): string {   // echo $point works
        return sprintf('Point(%.1f, %.1f)', $this->x, $this->y);
    }
}

class Counter {                               // mutable sibling class
    public static int $instances = 0;         // static (class-level) state
    private int $count = 0;

    public function __construct() {
        self::$instances++;                   // self:: — static access
    }

    public function bump(int $by = 1): static {
        $this->count += $by;
        return $this;                         // chainable
    }

    public function count(): int {
        return $this->count;
    }
}

$p = new Point(3.0, 4.0);
echo $p, "\\n";                                  // __toString
printf("distance = %.3f\\n", $p->distanceFromOrigin());

$c = new Counter();
$c->bump(2)->bump(3);                            // chained
echo 'count: ', $c->count(), ' instances: ', Counter::$instances, "\\n";
`),

    ex("php-ex-008", "JSON and serialization", "json_encode/decode with flags, stdClass vs associative arrays.", "Practical", "json_tour",
        `<?php
// JSON — the serialize/deserialize pair.
$record = [
    'name' => 'Praxis',
    'version' => 44,
    'languages' => ['php', 'ruby', 'go'],
    'nested' => ['ok' => true],
];

$json = json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
echo $json, "\\n";

// decode: true → associative arrays; default → stdClass objects.
$back = json_decode($json, true);
printf("name=%s languages=%s ok=%s\\n",
       $back['name'],
       implode(',', $back['languages']),
       var_export($back['nested']['ok'], true));

$asObject = json_decode($json);
echo get_class($asObject), ' name=', $asObject->name, "\\n";

// Typed json_decode into a class via reflection-free manual hydration.
class Config {
    public function __construct(public array $values) {}
    public function get(string $key, mixed $fallback = null): mixed {
        return $this->values[$key] ?? $fallback;
    }
}
$config = new Config(json_decode($json, true));
echo 'version via Config: ', $config->get('version', 'missing'), "\\n";

// json_last_error catches malformed input.
json_decode('{broken');
echo json_last_error() === JSON_ERROR_SYNTAX
    ? "caught the syntax error\\n"
    : "decoded fine\\n";
`),

    ex("php-ex-009", "Exceptions", "try/catch/finally, custom exceptions, multiple catch types and finally ordering.", "Robustness", "exceptions_tour",
        `<?php
// Exceptions — typed catches + custom hierarchies.
class ValidationError extends Exception {}
class NotFound extends Exception {}

function parseAge(string $text): int {
    $age = filter_var($text, FILTER_VALIDATE_INT);   // false when invalid
    if ($age === false) {
        throw new InvalidArgumentException("not an int: '$text'");
    }
    if ($age < 0) {
        throw new ValidationError('age');
    }
    return $age;
}

try {
    echo parseAge('31'), "\\n";
    echo parseAge('thirty-one'), "\\n";
} catch (ValidationError $e) {                 // most specific first
    echo "ValidationError: {$e->getMessage()}\\n";
} catch (InvalidArgumentException $e) {
    echo "argument problem: {$e->getMessage()}\\n";
} catch (Exception $e) {                      // base — catches the rest
    echo "generic: {$e->getMessage()}\\n";
} finally {
    echo "finally always runs\\n";
}

// Multiple types in ONE catch (PHP 8).
try {
    throw new RuntimeException('either');
} catch (InvalidArgumentException | RuntimeException $e) {
    echo 'union catch saw: ', $e->getMessage(), "\\n";
}
`),

    ex("php-ex-010", "Files and CSV", "file_put_contents/file_get_contents, fgetcsv and temp streams.", "Practical", "files_csv",
        `<?php
// Files + CSV in the standard-library way.
$path = '/tmp/praxis_php_demo.csv';

// file_put_contents: the one-line write.
file_put_contents($path, "name,score\\nAda,95\\nAlan,88\\nGrace,99\\n");

// file_get_contents: the one-line read (whole file).
echo 'bytes: ', strlen(file_get_contents($path)), "\\n";

// Handle + fgetcsv: the streaming CSV read.
$rows = [];
$handle = fopen($path, 'r');
if ($handle !== false) {
    $header = fgetcsv($handle, 0, ',');       // the header row
    while (($row = fgetcsv($handle, 0, ',')) !== false) {
        $rows[] = array_combine($header, $row);  // zip into an assoc array
    }
    fclose($handle);                            // ALWAYS close
}
foreach ($rows as $row) {
    printf("%-6s score=%d\\n", $row['name'], $row['score']);
}

// Sort the rows by score, descending.
usort($rows, fn ($a, $b) => $b['score'] <=> $a['score']);
echo 'top: ', $rows[0]['name'], "\\n";

unlink($path);
echo "cleaned up\\n";
`),
];
