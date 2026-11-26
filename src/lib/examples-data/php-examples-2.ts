/**
 * the PHP top-up: 40 more reference templates on top of the
 * ten more ("at least 50 like others". Pure PHP 8 stdlib.
 *
 * Bodies avoid ${var} interpolation (TS template literal collision) —
 * {$var} or concatenation instead.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "PHP";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("php", id, label, description, CAT, sub, baseName, ".php", () => body);

export const PHP_2_EXAMPLES: FileExample[] = [
    ex("php2-ex-001", "Types and coercion", "intdiv, str repeat, casting, gettype.", "Language Core", "types",
        `<?php
declare(strict_types=1);

$count = 10;
$price = 19.99;
$label = "total";

echo gettype($count), " ", gettype($price), PHP_EOL;
echo "cast: ", (int) $price, " ", (string) $count, PHP_EOL;

echo intdiv(17, 5), " remainder ", 17 % 5, PHP_EOL;
echo str_repeat("-", 10), PHP_EOL;

// Number formatting the locale-free way.
echo sprintf("%s = %.2f (hex %X)", $label, $price, 255), PHP_EOL;
echo number_format(1234567.891, 2), PHP_EOL;
`),
    ex("php2-ex-002", "Strings in depth", "Interpolation forms, heredoc, explode/implode, str functions.", "Language Core", "strings",
        `<?php
$name = "Praxis";
$round = 45;

echo "Hello, {$name} round {$round}!", PHP_EOL;   // {$var} inside quotes
echo 'Single quotes keep {$name} literal', PHP_EOL;

$text = <<<DOC
Heredoc spans lines {$name}
and keeps spacing readable.
DOC;
echo $text, PHP_EOL;

$parts = explode(",", "alpha,beta,gamma");
echo implode(" | ", $parts), PHP_EOL;
echo strtoupper(substr("praxis", 0, 3)), PHP_EOL;
echo str_pad($name, 10, "*", STR_PAD_BOTH), PHP_EOL;
echo "length: ", mb_strlen("ünïcode"), PHP_EOL;
`),
    ex("php2-ex-003", "Arrays: the workhorse", "Indexed + associative + nested + count.", "Arrays", "arrays_basics",
        `<?php
$nums = [3, 1, 4, 1, 5];
echo "count: ", count($nums), PHP_EOL;
echo "first: ", $nums[0], " last: ", end($nums), PHP_EOL;

$user = ["name" => "Ada", "roles" => ["admin", "dev"], "active" => true];
echo $user["name"], " has ", count($user["roles"]), " roles", PHP_EOL;

$user["age"] = 36;                 // append a key
unset($user["active"]);            // remove a key
echo "keys: ", implode(",", array_keys($user)), PHP_EOL;

// in_array / array_search / array_key_exists.
var_dump(in_array("dev", $user["roles"]));
echo "admin at index ", array_search("admin", $user["roles"]), PHP_EOL;
var_dump(array_key_exists("age", $user));
`),
    ex("php2-ex-004", "Sorting arrays", "sort, ksort, usort, multisort by field.", "Arrays", "sorting",
        `<?php
$nums = [5, 2, 9, 1];
sort($nums);
echo implode(",", $nums), PHP_EOL;
rsort($nums);
echo implode(",", $nums), PHP_EOL;

$map = ["b" => 2, "a" => 1, "c" => 3];
ksort($map);
echo implode(",", array_keys($map)), PHP_EOL;

$people = [
    ["name" => "ada", "score" => 92],
    ["name" => "alan", "score" => 81],
];
usort($people, fn($x, $y) => $y["score"] <=> $x["score"]);   // high first
foreach ($people as $p) {
    echo $p["name"], " ", $p["score"], PHP_EOL;
}
`),
    ex("php2-ex-005", "Array functions tour", "map, filter, reduce, column, combine.", "Arrays", "array_fns",
        `<?php
$nums = [1, 2, 3, 4, 5];

$doubled = array_map(fn($n) => $n * 2, $nums);
echo implode(",", $doubled), PHP_EOL;

$evens = array_filter($nums, fn($n) => $n % 2 === 0);
echo implode(",", $evens), PHP_EOL;

$total = array_reduce($nums, fn($carry, $n) => $carry + $n, 0);
echo "sum: ", $total, PHP_EOL;

$people = [["id" => 1, "name" => "ada"], ["id" => 2, "name" => "alan"]];
$names = array_column($people, "name", "id");
echo $names[1], " / ", $names[2], PHP_EOL;

print_r(array_combine(["a", "b"], [1, 2]));
`),
    ex("php2-ex-006", "Control flow", "if chains, match (8.0), while, foreach with keys.", "Language Core", "control_flow",
        `<?php
$score = 87;

if ($score >= 90) { echo "A", PHP_EOL; }
elseif ($score >= 80) { echo "B", PHP_EOL; }
else { echo "C", PHP_EOL; }

// match is an EXPRESSION with strict comparison.
$grade = match (true) {
    $score >= 90 => "A",
    $score >= 80 => "B",
    default      => "C",
};
echo "grade: ", $grade, PHP_EOL;

foreach (["a" => 1, "b" => 2] as $key => $value) {
    echo $key, " = ", $value, PHP_EOL;
}

$i = 3;
while ($i-- > 0) { echo "tick ", $i, PHP_EOL; }
`),
    ex("php2-ex-007", "Functions", "Defaults, typed params, variadics, arrow fns, references.", "Functions", "functions_basics",
        `<?php
declare(strict_types=1);

function greet(string $name, string $greeting = "Hello"): string {
    return "{$greeting}, {$name}!";
}
echo greet("Ada"), PHP_EOL;
echo greet("Ada", "Bon jour"), PHP_EOL;

function sumAll(int ...$nums): int {
    return array_sum($nums);
}
echo sumAll(1, 2, 3, 4), PHP_EOL;

function bump(int &$value): void { $value++; }
$n = 5; bump($n);
echo "bumped: ", $n, PHP_EOL;

$adder = fn($a, $b) => $a + $b;               // arrow function
echo $adder(6, 7), PHP_EOL;
`),
    ex("php2-ex-008", "First-class functions", "Callbacks, closures, use-capture, callable types.", "Functions", "closures",
        `<?php
function applyTwice(callable $fn, $value) {
    return $fn($fn($value));
}

echo applyTwice(fn($x) => $x + 3, 10), PHP_EOL;

$factor = 3;
$scaled = function ($x) use ($factor) {
    return $x * $factor;
};
echo $scaled(14), PHP_EOL;

$counter = function () {
    static $count = 0;                 // persists between calls
    return ++$count;
};
echo $counter(), " ", $counter(), " ", $counter(), PHP_EOL;

usort($rows = ["pear", "fig", "apple"], fn($a, $b) => strcmp($a, $b));
echo implode(",", $rows), PHP_EOL;
`),
    ex("php2-ex-009", "Classes and visibility", "Properties, methods, statics, readonly.", "Classes & Objects", "classes_basics",
        `<?php
declare(strict_types=1);

class Player {
    public string $name;
    private int $score;
    public static int $count = 0;

    public function __construct(string $name, int $score = 0) {
        $this->name = $name;
        $this->score = $score;
        self::$count++;
    }

    public function addPoints(int $points): self {     // fluent
        $this->score += $points;
        return $this;
    }

    public function getScore(): int { return $this->score; }
    public function __toString(): string { return "{$this->name}: {$this->score}"; }
}

$p = (new Player("Ada"))->addPoints(40)->addPoints(52);
echo $p, PHP_EOL;
echo "players created: ", Player::$count, PHP_EOL;
`),
    ex("php2-ex-010", "Constructor promotion and enums", "PHP 8 modern class features.", "Classes & Objects", "modern_classes",
        `<?php
declare(strict_types=1);

// Promoted properties + readonly.
class Point {
    public function __construct(
        public readonly float $x,
        public readonly float $y,
    ) {}

    public function withOffset(float $dx, float $dy): self {
        return new self($this->x + $dx, $this->y + $dy);
    }
}

enum Status: string {
    case Idle = "idle";
    case Busy = "busy";
    case Done = "done";

    public function label(): string {
        return match ($this) {
            Status::Idle => "waiting for work",
            Status::Busy => "processing",
            Status::Done => "finished",
        };
    }
}

$p = new Point(1, 2);
echo $p->withOffset(3, 4)->x, PHP_EOL;
echo Status::Busy->label(), " (value: ", Status::Busy->value, ")", PHP_EOL;
`),
    ex("php2-ex-011", "Inheritance and interfaces", "abstract, extends, implements, trait.", "Classes & Objects", "inheritance",
        `<?php
declare(strict_types=1);

interface Describable {
    public function describe(): string;
}

abstract class Entity {
    public function __construct(protected string $id) {}
    abstract public function describe(): string;
}

trait Timestamps {
    public function touched(): string { return "now"; }
}

class Document extends Entity implements Describable {
    use Timestamps;
    public function describe(): string { return "doc " . $this->id . " at " . $this->touched(); }
}

$doc = new Document("D-42");
echo $doc->describe(), PHP_EOL;
var_dump($doc instanceof Describable, $doc instanceof Entity);
`),
    ex("php2-ex-012", "Magic methods", "__get, __call, __invoke, __debugInfo.", "Classes & Objects", "magic_methods",
        `<?php
declare(strict_types=1);

class Bag {
    private array $data = [];

    public function __get(string $key) {
        return $this->data[$key] ?? null;
    }
    public function __set(string $key, $value): void {
        $this->data[$key] = $value;
    }
    public function __call(string $name, array $args) {
        return "called {$name} with " . count($args) . " arg(s)";
    }
    public function __invoke(int $x): int { return $x * 2; }
}

$bag = new Bag();
$bag->color = "blue";              // __set
echo $bag->color, PHP_EOL;         // __get
echo $bag->anything(), PHP_EOL;   // __call
echo $bag(21), PHP_EOL;            // __invoke

class Plain {
    public function __debugInfo(): array { return ["masked" => "***"]; }
}
var_dump(new Plain());
`),
    ex("php2-ex-013", "Exceptions", "try/catch/finally, custom classes, finally ordering.", "Errors", "exceptions",
        `<?php
declare(strict_types=1);

class ValidationError extends RuntimeException {}

function validate(int $age): void {
    if ($age < 0) throw new ValidationError("negative age");
    if ($age > 150) throw new ValidationError("suspicious age");
}

foreach ([36, -1, 200] as $age) {
    try {
        validate($age);
        echo "age {$age} ok", PHP_EOL;
    } catch (ValidationError $e) {
        echo "rejected: ", $e->getMessage(), PHP_EOL;
    } catch (Throwable $t) {          // the widest net
        echo "other: ", $t->getMessage(), PHP_EOL;
    } finally {
        echo "  (checked)", PHP_EOL;
    }
}
`),
    ex("php2-ex-014", "Error handling functions", "set_error_handler + error levels.", "Errors", "error_functions",
        `<?php
// Convert warnings into exceptions for unified handling.
set_error_handler(function (int $no, string $msg, string $file, int $line) {
    throw new ErrorException($msg, 0, $no, $file, $line);
});

try {
    $result = 10 / 0;                       // warning -> exception now
} catch (DivisionByZeroError | ErrorException $e) {
    echo "caught: ", $e->getMessage(), PHP_EOL;
}

restore_error_handler();
echo "error levels constant E_ALL = ", E_ALL, PHP_EOL;
`),
    ex("php2-ex-015", "Dates and intervals", "DateTime arithmetic, diff, formats.", "Dates & Time", "datetime",
        `<?php
$now = new DateTimeImmutable();
echo $now->format("Y-m-d H:i"), PHP_EOL;

$release = new DateTimeImmutable("2024-06-15 09:30");
echo $release->format("l jS \\of F"), PHP_EOL;

$interval = $now->diff($release);
echo "days apart: ", $interval->days, PHP_EOL;

$plusWeek = $release->modify("+1 week -2 days");
echo $plusWeek->format("Y-m-d"), PHP_EOL;

$period = new DatePeriod(
    new DateTime("2024-06-01"),
    new DateInterval("P1D"),                 // one day
    (new DateTime("2024-06-04"))->modify("+1 sec")
);
foreach ($period as $day) {
    echo $day->format("d"), " ";
}
echo PHP_EOL;
`),
    ex("php2-ex-016", "Time zones and timestamps", "Timezone conversions, epoch math.", "Dates & Time", "timezones",
        `<?php
$utc = new DateTimeImmutable("now", new DateTimeZone("UTC"));
echo $utc->format("H:i"), " UTC", PHP_EOL;

foreach (["Asia/Cairo", "America/New_York", "Asia/Tokyo"] as $zone) {
    $local = $utc->setTimezone(new DateTimeZone($zone));
    echo $zone, " -> ", $local->format("H:i"), PHP_EOL;
}

echo "epoch: ", time(), PHP_EOL;
echo "microtime float: ", round(microtime(true), 2), PHP_EOL;

$stamp = strtotime("2024-06-15");
echo date("D j M Y", $stamp), PHP_EOL;

// strtotime parses natural language.
echo date("Y-m-d", strtotime("next friday")), PHP_EOL;
`),
    ex("php2-ex-017", "Superglobals discipline", "$_SERVER facts without touching user input.", "Web Basics", "superglobals",
        `<?php
// Reading the read-only parts of $_SERVER is safe and informative.
$facts = [
    "php version" => PHP_VERSION,
    "interface" => PHP_SAPI,
    "os" => PHP_OS,
    "int size" => PHP_INT_SIZE . " bytes",
];

foreach ($facts as $key => $value) {
    echo str_pad($key, 12), " = ", $value, PHP_EOL;
}

// The web request variables only exist under a web SAPI.
if (isset($_SERVER["REQUEST_METHOD"])) {
    echo "method: ", $_SERVER["REQUEST_METHOD"], PHP_EOL;
} else {
    echo "running on the CLI - no request context", PHP_EOL;
}
`),
    ex("php2-ex-018", "Sanitize and validate", "filter_var with the built-in filters.", "Web Basics", "filters",
        `<?php
$email = "  ada@example.org ";
echo filter_var($email, FILTER_SANITIZE_EMAIL), PHP_EOL;

var_dump(filter_var($email, FILTER_VALIDATE_EMAIL) !== false);
var_dump(filter_var("not-an-email", FILTER_VALIDATE_EMAIL));

$ip = filter_var("8.8.8.8", FILTER_VALIDATE_IP);
echo "ip: ", is_string($ip) ? $ip : "(invalid)", PHP_EOL;

$age = filter_var("42", FILTER_VALIDATE_INT, ["options" => ["min_range" => 0, "max_range" => 120]]);
echo "age: ", is_int($age) ? $age : "(out of range)", PHP_EOL;

$url = filter_var("https://z.ai/docs?a=1", FILTER_VALIDATE_URL);
var_dump(is_string($url));
`),
    ex("php2-ex-019", "Sessions and state (CLI-safe demo)", "session functions guarded for the CLI.", "Web Basics", "sessions",
        `<?php
// A session needs a web SAPI; guard accordingly.
if (session_status() === PHP_SESSION_NONE && PHP_SAPI !== "cli") {
    session_start();
    $_SESSION["visits"] = ($_SESSION["visits"] ?? 0) + 1;
    echo "visits: ", $_SESSION["visits"], PHP_EOL;
} else {
    echo "CLI run: simulating a session array instead", PHP_EOL;
    $session = ["visits" => 1, "user" => "ada"];
    echo "visits: ", $session["visits"], " user: ", $session["user"], PHP_EOL;
}

echo "session name: ", session_name(), PHP_EOL;
echo "cookie lifetime (php.ini): ", ini_get("session.cookie_lifetime"), PHP_EOL;
`),
    ex("php2-ex-020", "JSON encode/decode", "Options, error handling, nested structures.", "Data Formats", "json",
        `<?php
$data = [
    "app" => "praxis",
    "round" => 45,
    "langs" => ["php", "powershell", "batch"],
    "meta" => ["beta" => true],
];

$json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
echo $json, PHP_EOL;

$back = json_decode($json, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    echo "error: ", json_last_error_msg(), PHP_EOL;
} else {
    echo "decoded langs: ", implode(",", $back["langs"]), PHP_EOL;
    echo "beta: ", var_export($back["meta"]["beta"], true), PHP_EOL;
}
`),
    ex("php2-ex-021", "CSV read and write", "fgetcsv/fputcsv round trip.", "Data Formats", "csv",
        `<?php
$path = sys_get_temp_dir() . "/praxis_rows.csv";

$handle = fopen($path, "w");
fputcsv($handle, ["name", "score"]);
fputcsv($handle, ["ada", 92]);
fputcsv($handle, ["alan", 81]);
fclose($handle);

$handle = fopen($path, "r");
fgetcsv($handle);                     // header
while (($row = fgetcsv($handle)) !== false) {
    echo str_pad($row[0], 8), str_pad($row[1], 6), PHP_EOL;
}
fclose($handle);
unlink($path);
echo "csv round trip done", PHP_EOL;
`),
    ex("php2-ex-022", "XML with SimpleXML", "Load a string, walk children, attributes.", "Data Formats", "xml",
        `<?php
$xmlText = <<<XML
<library>
  <book id="1" tone="dry"><title>Structure</title></book>
  <book id="2" tone="warm"><title>Design</title></book>
</library>
XML;

$lib = simplexml_load_string($xmlText);
foreach ($lib->book as $book) {
    echo "book #", $book["id"], " (", $book["tone"], "): ", $book->title, PHP_EOL;
}

echo "count: ", count($lib->book), PHP_EOL;
echo "first title: ", (string) $lib->book[0]->title, PHP_EOL;
`),
    ex("php2-ex-023", "Filesystem operations", "file_put_contents, glob, copy, unlink.", "Files & IO", "filesystem",
        `<?php
$dir = sys_get_temp_dir() . "/praxis_php";
if (!is_dir($dir)) mkdir($dir);

file_put_contents("{$dir}/a.txt", "alpha");
file_put_contents("{$dir}/b.txt", "beta");

echo "files: ", implode(",", array_map("basename", glob("{$dir}/*.txt"))), PHP_EOL;
echo "a.txt bytes: ", filesize("{$dir}/a.txt"), PHP_EOL;

copy("{$dir}/a.txt", "{$dir}/a-copy.txt");
echo "copied: ", basename(glob("{$dir}/*copy*")[0]), PHP_EOL;

array_map("unlink", glob("{$dir}/*"));
rmdir($dir);
echo "exists after cleanup: ", var_export(is_dir($dir), true), PHP_EOL;
`),
    ex("php2-ex-024", "Streams and file handles", "fgets/fwrite with a real handle.", "Files & IO", "streams",
        `<?php
$path = sys_get_temp_dir() . "/praxis_lines.txt";

$w = fopen($path, "w");
foreach (["one", "two", "three"] as $line) {
    fwrite($w, $line . PHP_EOL);
}
fclose($w);

$r = fopen($path, "r");
while (($line = fgets($r)) !== false) {
    echo "read: ", trim($line), PHP_EOL;
}
fclose($r);

// Stream wrappers: php://memory does the same without a disk file.
$mem = fopen("php://memory", "w+");
fwrite($mem, "in-memory stream");
rewind($mem);
echo "memory: ", fgets($mem), PHP_EOL;

unlink($path);
`),
    ex("php2-ex-025", "Directory iteration", "RecursiveDirectoryIterator tour.", "Files & IO", "iteration",
        `<?php
$root = sys_get_temp_dir() . "/praxis_tree";
@mkdir("{$root}/inner");
file_put_contents("{$root}/top.txt", "t");
file_put_contents("{$root}/inner/deep.txt", "d");

$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
);

$files = 0;
foreach ($it as $file) {
    if ($file->isFile()) {
        $files++;
        echo $file->getFilename(), " (", $file->getSize(), " bytes)", PHP_EOL;
    }
}
echo "total files: ", $files, PHP_EOL;

array_map("unlink", glob("{$root}/*/*"));
array_map("unlink", glob("{$root}/*"));
@rmdir("{$root}/inner");
@rmdir($root);
`),
    ex("php2-ex-026", "Password hashing", "password_hash/verify with the right algorithms.", "Security", "passwords",
        `<?php
$hash = password_hash("hunter2", PASSWORD_DEFAULT);
echo "algo: ", password_get_info($hash)["algoName"], PHP_EOL;
echo "hash prefix: ", substr($hash, 0, 7), "...", PHP_EOL;

// The whole point: verification, not decryption.
var_dump(password_verify("hunter2", $hash));
var_dump(password_verify("wrong", $hash));

// Rehash check for when the cost rises.
echo "needs rehash: ", var_export(
    password_needs_rehash($hash, PASSWORD_DEFAULT, ["cost" => 12]), true
), PHP_EOL;

// A timing-safe comparison for general secrets.
$known = hash("sha256", "input");
$given = hash("sha256", "input");
var_dump(hash_equals($known, $given));
`),
    ex("php2-ex-027", "Hashing and encoding", "hash(), hash_hmac, base64.", "Security", "hashing",
        `<?php
$msg = "praxis-session-1";

echo "md5: ", md5($msg), PHP_EOL;
echo "sha256: ", hash("sha256", $msg), PHP_EOL;

// HMAC needs a secret key.
echo "hmac: ", substr(hash_hmac("sha256", $msg, "secret-key"), 0, 16), "...", PHP_EOL;

$b64 = base64_encode($msg);
echo "base64: ", $b64, PHP_EOL;
echo "decoded: ", base64_decode($b64), PHP_EOL;

echo "hex -> bin -> hex: ", bin2hex(hex2bin("deadbeef")), PHP_EOL;
echo "crc32: ", crc32($msg), PHP_EOL;
`),
    ex("php2-ex-028", "Random values", "random_bytes, random_int, shuffle.", "Security", "randomness",
        `<?php
echo "int: ", random_int(1, 6), PHP_EOL;

// Hex-safe random bytes (never use rand for anything serious).
$bytes = random_bytes(8);
echo "hex: ", bin2hex($bytes), PHP_EOL;

echo "token: ", substr(bin2hex(random_bytes(16)), 0, 12), PHP_EOL;

$deck = range(1, 9);
shuffle($deck);
echo "shuffled: ", implode(",", $deck), PHP_EOL;

echo "array pick: ", $deck[array_rand($deck)], PHP_EOL;
`),
    ex("php2-ex-029", "Command execution safely", "escapeshellarg + the output array contract.", "System", "exec",
        `<?php
// The safe shape: argument escaping + separate exit code.
$fileName = "my report; rm -rf.txt";          // hostile input, harmless here
$escaped = escapeshellarg($fileName);
echo "escaped: ", $escaped, PHP_EOL;

// A guarded exec (true runs on Windows / Linux alike).
$code = 0;
$lines = [];
exec("php -v", $lines, $code);
echo "exit: ", $code, " first line: ", $lines[0] ?? "(none)", PHP_EOL;

// escapeshellcmd is for whole commands, not arguments.
echo "cmd escape: ", escapeshellcmd('echo "hi"'), PHP_EOL;
`),
    ex("php2-ex-030", "Process control", "proc_open-lite via proc_get_status shaped demo.", "System", "processes",
        `<?php
// A safe look at process metadata through shell_free helpers.
echo "pid-like: ", getmypid(), PHP_EOL;
echo "uid: ", getmyuid(), PHP_EOL;
echo "php binary: ", PHP_BINARY, PHP_EOL;

// shell_exec returns the FULL stdout as one string.
$version = shell_exec("php -r 'echo PHP_VERSION;' 2>/dev/null");
echo "version via shell: ", $version ?: PHP_VERSION, PHP_EOL;

echo "memory used: ", memory_get_usage(true) / 1024, " KiB", PHP_EOL;
echo "peak: ", memory_get_peak_usage(true) / 1024, " KiB", PHP_EOL;
`),
    ex("php2-ex-031", "ini and configuration", "ini_get/set, display of the runtime.", "System", "ini_config",
        `<?php
echo "memory limit: ", ini_get("memory_limit"), PHP_EOL;
echo "max exec: ", ini_get("max_execution_time"), PHP_EOL;

// Runtime-only override (does not touch php.ini).
ini_set("display_errors", "1");
echo "display errors now: ", ini_get("display_errors"), PHP_EOL;

echo "loaded ini: ", php_ini_loaded_file() ?: "(none)", PHP_EOL;

// The extension inventory (counted, not listed - it is long).
echo "extensions loaded: ", count(get_loaded_extensions()), PHP_EOL;
echo "has mbstring: ", var_export(extension_loaded("mbstring"), true), PHP_EOL;
`),
    ex("php2-ex-032", "Output buffering", "ob_start/ob_get_clean to build strings.", "System", "output_buffering",
        `<?php
ob_start();
echo "buffered line one", PHP_EOL;
echo "buffered line two", PHP_EOL;
$captured = ob_get_clean();

echo "captured ", substr_count($captured, PHP_EOL), " lines", PHP_EOL;
echo strtoupper($captured);          // the buffered text, on demand

// Nested buffers stack.
ob_start();
echo "inner";
$inner = ob_get_clean();
ob_start();
echo "outer ", strlen($inner);
echo PHP_EOL, ob_get_clean();
`),
    ex("php2-ex-033", "Timing and profiling", "hrtime, microtime deltas.", "Performance", "timing",
        `<?php
function slowish(int $n): int {
    $t = 0;
    for ($i = 0; $i < $n; $i++) $t += $i;
    return $t;
}

$t0 = hrtime(true);
slowish(300000);
$t1 = hrtime(true);
echo "hrtime: ", (int) (($t1 - $t0) / 1e6), " ms", PHP_EOL;

$m0 = microtime(true);
slowish(100000);
$m1 = microtime(true);
echo "microtime: ", round(($m1 - $m0) * 1000, 2), " ms", PHP_EOL;

echo "loop iterations: ", number_format(400000), PHP_EOL;
`),
    ex("php2-ex-034", "Generators", "yield for lazy streams of data.", "Performance", "generators",
        `<?php
function squares(int $n): Generator {
    for ($i = 1; $i <= $n; $i++) {
        yield $i => $i * $i;          // with key => value
    }
}

foreach (squares(5) as $base => $sq) {
    echo "{$base}^2 = {$sq}", PHP_EOL;
}

// Memory: a generator never holds the whole sequence.
function countUp(int $n): int {
    $seen = 0;
    foreach (squares($n) as $ignored) { $seen++; }
    return $seen;
}
echo "iterated: ", countUp(10000), " entries lazily", PHP_EOL;
`),
    ex("php2-ex-035", "References and arrays", "The & trap in foreach, memory model.", "Performance", "references",
        `<?php
$nums = [1, 2, 3];

// References let a function mutate the original array.
function bump(array &$arr): void {
    foreach ($arr as &$v) { $v++; }
    unset($v);                        // break the reference after the loop
}
bump($nums);
echo implode(",", $nums), PHP_EOL;

// array_walk with a reference-style callback.
array_walk($nums, function (&$v) { $v *= 10; });
echo implode(",", $nums), PHP_EOL;

// copy vs reference assignment.
$copy = $nums;                       // value copy
$copy[0] = 999;
echo "original untouched: ", $nums[0], PHP_EOL;
`),
    ex("php2-ex-036", "Assertions", "assert() with a lightweight test harness.", "Testing", "assertions",
        `<?php
ini_set("zend.assertions", "1");
ini_set("assert.exception", "1");

$passed = 0;
function check(bool $cond, string $name): void {
    global $passed;
    if ($cond) { $passed++; echo "  ok  {$name}", PHP_EOL; }
    else { echo "  FAIL {$name}", PHP_EOL; }
}

function clamp(int $v, int $lo, int $hi): int {
    return max($lo, min($v, $hi));
}

check(clamp(5, 0, 10) === 5, "inside");
check(clamp(-3, 0, 10) === 0, "below");
check(clamp(99, 0, 10) === 10, "above");
assert(clamp(0, 0, 10) === 0);

echo "{$passed} checks passed", PHP_EOL;
`),
    ex("php2-ex-037", "A mini logger", "leveled, timestamped, file + stdout.", "Projects", "logger",
        `<?php
final class Log {
    private const LEVELS = ["DEBUG" => 0, "INFO" => 1, "WARN" => 2, "ERROR" => 3];

    public function __construct(
        private int $min = 1,
        private string $file = "",
    ) {}

    public function __invoke(string $level, string $msg): void {
        if (self::LEVELS[$level] < $this->min) return;
        $line = sprintf("[%s] %-5s %s", date("H:i:s"), $level, $msg);
        echo $line, PHP_EOL;
        if ($this->file !== "") {
            file_put_contents($this->file, $line . PHP_EOL, FILE_APPEND);
        }
    }
}

$log = new Log(min: 1, file: sys_get_temp_dir() . "/praxis_php.log");
$log("DEBUG", "suppressed by the level");
$log("INFO", "service started");
$log("WARN", "disk at 91%");
$log("ERROR", "mirror sync failed");
echo "log file lines: ", count(file($log::LEVELS ? sys_get_temp_dir() . "/praxis_php.log" : "")) ?: 0, PHP_EOL;
unlink(sys_get_temp_dir() . "/praxis_php.log");
`),
    ex("php2-ex-038", "A config loader", "JSON + validation + defaults merge.", "Projects", "config",
        `<?php
declare(strict_types=1);

function loadConfig(string $json): array {
    $defaults = ["host" => "0.0.0.0", "port" => 8080, "retries" => 1];
    $file = json_decode($json, true) ?: [];
    $merged = array_merge($defaults, $file);

    if (!is_int($merged["port"]) || $merged["port"] < 1 || $merged["port"] > 65535) {
        throw new InvalidArgumentException("port out of range");
    }
    return $merged;
}

$cfg = loadConfig('{"host": "127.0.0.1", "port": 9090}');
printf(
    "host=%s port=%d retries=%d%s",
    $cfg["host"], $cfg["port"], $cfg["retries"], PHP_EOL
);

try {
    loadConfig('{"port": 99999}');
} catch (InvalidArgumentException $e) {
    echo "rejected: ", $e->getMessage(), PHP_EOL;
}
`),
    ex("php2-ex-039", "CSV report tool", "read + aggregate + tabular output.", "Projects", "report_tool",
        `<?php
$path = sys_get_temp_dir() . "/praxis_report.csv";
$handle = fopen($path, "w");
fputcsv($handle, ["city", "temp"]);
fputcsv($handle, ["Cairo", 34]);
fputcsv($handle, ["Oslo", 12]);
fputcsv($handle, ["Sydney", 26]);
fclose($handle);

$rows = array_map("str_getcsv", file($path, FILE_IGNORE_NEW_LINES));
array_shift($rows);                             // drop header

$temps = array_column($rows, 1);
$sum = array_sum($temps);
printf("%-8s %5s%s", "CITY", "TEMP", PHP_EOL);
foreach ($rows as $row) {
    printf("%-8s %5d%s", $row[0], $row[1], PHP_EOL);
}
printf("mean: %.1f | max: %d%s", $sum / count($temps), max($temps), PHP_EOL);

unlink($path);
`),
    ex("php2-ex-040", "A complete mini tool", "Args + files + maps: wordstats.", "Projects", "wordstats",
        `<?php
declare(strict_types=1);

// wordstats.php [file] --top=N
$path = sys_get_temp_dir() . "/praxis_words.txt";
file_put_contents($path, "go go is fun\ngo runs everywhere\nfun times\n");

$text = file_get_contents($path);
$words = str_word_count(strtolower($text), 1);
$counts = array_count_values($words);
arsort($counts);

$top = 3;
echo "unique words: ", count($counts), PHP_EOL;
foreach (array_slice($counts, 0, $top, true) as $word => $n) {
    echo str_pad($word, 12), "{$n}x", PHP_EOL;
}

unlink($path);
`),
];
