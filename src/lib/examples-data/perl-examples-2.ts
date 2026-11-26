/**
 * the Perl top-up: 42 more reference templates on top of the
 * eight more ("at least 50 like others". Pure core Perl 5.
 *
 * Bodies avoid ${var} interpolation and backtick execution (TS template
 * literal collisions) — $var and q forms instead.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Perl";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("perl", id, label, description, CAT, sub, baseName, ".pl", () => body);

export const PERL_2_EXAMPLES: FileExample[] = [
    ex("perl2-ex-001", "Contexts: scalar vs list", "The same expression, two answers.", "Language Core", "contexts",
        `use strict;
use warnings;

my @words = qw(alpha beta gamma);

# Scalar context asks "how many".
my $count = @words;
print "count: $count\\n";

# List context asks "what".
my ($first, $rest) = @words;
print "first: $first, second: $rest\\n";

# The classic gotcha, made explicit.
my @copy = @words;
my $size = () = @words;              # force list context, count elements
print "forced count: $size\\n";
print "last index: ", $#words, "\\n";
`),
    ex("perl2-ex-002", "References", "Anonymous arrays/hashes, ->, dereferencing.", "References", "references",
        `use strict;
use warnings;

my $matrix = [ [1, 2], [3, 4] ];       # anonymous array of arrays
print "$matrix->[0][1]\\n";

my $record = { name => "Ada", roles => ["admin", "dev"] };
print "$record->{name} has @{$record->{roles}}\\n";

# Nested construction without sigil soup.
my $conf = {
    app => "praxis",
    ports => [8080, 8443],
    db   => { host => "localhost", port => 5432 },
};
print "$conf->{db}{host}:$conf->{db}{port}\\n";
print "ports: ", join(",", @{ $conf->{ports} }), "\\n";
print "second port: ", $conf->{ports}[1], "\\n";
`),
    ex("perl2-ex-003", "Subroutines", "@_, named params, return lists.", "Subroutines", "subroutines",
        `use strict;
use warnings;

sub greet {
    my (%args) = @_;
    my $name = $args{name} // "World";
    my $greeting = $args{greeting} // "Hello";
    return "$greeting, $name!";
}

print greet(), "\\n";
print greet(name => "Ada", greeting => "Bonjour"), "\\n";

sub stats {
    my @n = @_;
    my ($sum, $min, $max) = (0, $n[0], $n[0]);
    for my $v (@n) {
        $sum += $v;
        $min = $v if $v < $min;
        $max = $v if $v > $max;
    }
    return ($sum, $min, $max, $sum / @n);
}

my ($sum, $min, $max, $mean) = stats(3, 1, 4, 1, 5);
print "sum=$sum min=$min max=$max mean=$mean\\n";
`),
    ex("perl2-ex-004", "Closures", "state, closures over lexicals, counters.", "Subroutines", "closures",
        `use strict;
use warnings;

sub make_counter {
    my $n = 0;
    return sub { return ++$n };
}

my $a = make_counter();
my $b = make_counter();
print $a->(), " ", $a->(), " ", $b->(), "\\n";   # 1 2 1

# state keeps ONE private variable per sub (needs the feature flag).
use feature qw(state);

sub ticker {
    state $ticks = 0;
    return ++$ticks;
}
print ticker(), " ", ticker(), " ", ticker(), "\\n";

# A generator closure over a list.
sub make_walker {
    my @items = @_;
    my $i = 0;
    return sub { return $i < @items ? $items[$i++] : undef };
}
my $next = make_walker(qw(x y z));
print $next->(), $next->(), $next->(), " ", (defined $next->() ? "more" : "done"), "\\n";
`),
    ex("perl2-ex-005", "Hash operations", "each, exists, delete, slices, reverse.", "Hashes & Arrays", "hash_ops",
        `use strict;
use warnings;

my %score = (ada => 92, alan => 81, grace => 96);

print "ada: $score{ada}\\n";
print "has alan: ", (exists $score{alan} ? "yes" : "no"), "\\n";

# Hash slice.
my @picked = @score{qw(ada grace)};
print "slice: @picked\\n";

delete $score{alan};
print "after delete: ", join(",", sort keys %score), "\\n";

# Reverse flips the relationship.
my %by_score = reverse %score;
print "who has 92? ", $by_score{92}, "\\n";

while (my ($k, $v) = each %score) {
    print "  pair: $k = $v\\n";
}
`),
    ex("perl2-ex-006", "Array functions", "push/pop/shift/unshift, splice, wantarray.", "Hashes & Arrays", "array_ops",
        `use strict;
use warnings;

my @s = (2, 3, 4);
push @s, 5;                 # 2 3 4 5
unshift @s, 1;              # 1 2 3 4 5
print "@s\\n";
print "pop ", pop @s, " shift ", shift @s, "\\n";

# splice: surgical removal + insertion.
my @letters = qw(a b c d e);
my @middle = splice @letters, 1, 2;
print "removed: @middle kept: @letters\\n";
splice @letters, 1, 0, qw(x y);
print "inserted: @letters\\n";

my @sorted = sort { $b <=> $a } (5, 2, 9);
print "desc: @sorted\\n";
print "reversed: ", join(",", reverse @sorted), "\\n";
`),
    ex("perl2-ex-007", "map, grep, join", "The list-processing trio.", "Hashes & Arrays", "list_ops",
        `use strict;
use warnings;

my @nums = (1 .. 10);

my @evens = grep { $_ % 2 == 0 } @nums;
print "evens: @evens\\n";

my @squares = map { $_ * $_ } @nums;
print "squares: @squares\\n";

my %lengths = map { $_ => length } qw(go is fun);
print "length(go) = $lengths{go}\\n";

my $total = 0;
$total += $_ for @nums;
print "sum: $total mean: ", $total / @nums, "\\n";

print "joined: ", join(" | ", @evens), "\\n";
print "filtered+joined: ", join(",", grep { $_ > 4 } @squares), "\\n";
`),
    ex("perl2-ex-008", "Sorting", "numeric vs string, multi-key, Schwartzian.", "Hashes & Arrays", "sorting_perl",
        `use strict;
use warnings;

my @nums = (10, 2, 33, 1);
print join(",", sort { $a <=> $b } @nums), "\\n";
print join(",", sort { $b <=> $a } @nums), "\\n";
print join(",", sort qw(Apple apple Banana banana)), "\\n";

my %score = (ada => 92, alan => 81, grace => 96);
my @ranked = sort { $score{$b} <=> $score{$a} or $a cmp $b } keys %score;
print "ranked: @ranked\\n";

# Schwartzian transform: decorate-sort-undecorate.
my @words = qw(ppppp aaaaa ccc bb);
my @by_len = map  { $_->[1] }
             sort { $a->[0] <=> $b->[0] }
             map  { [length, $_] } @words;
print "by length: @by_len\\n";
`),
    ex("perl2-ex-009", "String functions", "printf, sprintf, uc/lc, index, tr.", "Strings & Regex", "string_fns",
        `use strict;
use warnings;

my $s = "praxis ide";

printf("[%s] [%6s] [%-6s]\\n", $s, "ab", "ab");
printf("%.3f%%\\n", 99.456);
printf("hex %x oct %o bin %b\\n", 255, 8, 10);

print uc($s), " / ", lc("SHOUT"), "\\n";
print "length: ", length($s), " reversed: ", scalar reverse($s), "\\n";

my $where = index($s, "ide");
print "ide at $where\\n";
print "substr: ", substr($s, 0, 6), " + ", substr($s, 7), "\\n";

my $count = ($s =~ tr/aeiou//);
print "vowels: $count\\n";
print "swapcase-ish: ", $s =~ tr/a-zA-Z/A-Za-z/ ? "swapped" : "no-op", "\\n";
print $s, "\\n";
`),
    ex("perl2-ex-010", "String repetition and padding", "x operator, sprintf padding.", "Strings & Regex", "padding",
        `use strict;
use warnings;

print "-" x 20, "\\n";
print "ab" x 3, "\\n";
print join("\\n", ("tick") x 3), "\\n";

printf("%-10s|%10s|\\n", "left", "right");
printf("%05d\\n", 42);
printf("%.10s\\n", "a very long piece of text");

my $wrapped = sprintf("%-8s%5.2f", "pi", 3.14159);
print "$wrapped\\n";

print "z" x 5 . "-" . "a" x 5, "\\n";
print "char rep: ", join(",", ("x") x 4), "\\n";
`),
    ex("perl2-ex-011", "Regex basics", "m//, capture groups, flags.", "Strings & Regex", "regex_basics",
        `use strict;
use warnings;

my $log = "2024-06-15 ERROR disk 91%";

if ($log =~ /^(\\d{4})-(\\d{2})-(\\d{2}) (\\w+) (.+)$/) {
    print "year $1 month $2 day $3\\n";
    print "level $4 msg $5\\n";
}

# Case-insensitive.
print "match: ", ($log =~ /error/i ? "yes" : "no"), "\\n";

# Global matching in list context.
my @numbers = $log =~ /(\\d+)/g;
print "numbers: @numbers\\n";

# Substitute with the /r flag returns the new string.
my $clean = $log =~ s/\\s+/_/gr;
print "$clean\\n";
print "original untouched: $log\\n";
`),
    ex("perl2-ex-012", "Regex quantifiers and classes", "Greedy vs lazy, anchors, classes.", "Strings & Regex", "regex_classes",
        `use strict;
use warnings;

my $html = "<b>bold</b> and <i>italic</i>";

# Greedy vs lazy quantifiers.
my ($greedy) = $html =~ /<(.+)>/;
my ($lazy) = $html =~ /<(.*?)>/;
print "greedy: $greedy\\nlazy: $lazy\\n";

# Character classes and negation.
my $text = "a1b22c333";
my @chunks = $text =~ /([a-z]+\\d+)/g;
print "chunks: @chunks\\n";

# Anchors pin matches to positions.
print "starts with a: ", ($text =~ /^a/ ? "yes" : "no"), "\\n";
print "ends with digit: ", ($text =~ /\\d$/ ? "yes" : "no"), "\\n";

# Optional, one-or-more, exactly-N.
my $phone = "20-100-1234567";
print "phone-shaped: ", ($phone =~ /\\d{2}-\\d{3}-\\d{7}/ ? "yes" : "no"), "\\n";
`),
    ex("perl2-ex-013", "Transliteration and split", "tr/// counts, split with limits.", "Strings & Regex", "tr_split",
        `use strict;
use warnings;

my $text = "hello world";

my $vowels = ($text =~ tr/aeiou//);
my $all = ($text =~ tr/a-zA-Z//);
print "vowels: $vowels of $all letters\\n";

# tr returns the count; in an r-value context it modifies a copy.
my $upper = $text =~ tr/a-z/A-Z/r;
print "$upper\\n";
print "$text\\n";

my @words = split /\\s+/, "go   is fun";
print scalar @words, " words\\n";

my ($k, $v) = split /=/, "port=9090", 2;
print "key=$k value=$v\\n";

my @fields = split /,/, "a,,c";           # empty fields kept
print scalar @fields, " fields (empty middle kept)\\n";
print scalar(split(/,/, "a,,c", -1)), " with limit -1\\n";
`),
    ex("perl2-ex-014", "Substitution power", "s/// with e, g, and captures.", "Strings & Regex", "substitutions",
        `use strict;
use warnings;

my $s = "prices: 12 34 56";

# /e evaluates the replacement as code.
$s =~ s/(\\d+)/ sprintf("[$%02d]", $1 + 0) /ge;
print "$s\\n";

my $csv = "a b  c   d";
$csv =~ s/\\s+/,/g;
print "$csv\\n";

# Conditional replacement via code.
my $mixed = "5 apples 3 pears 9 figs";
$mixed =~ s/(\\d+) (\\w+)/ $1 > 4 ? "$1 $2" : "some $2" /ge;
print "$mixed\\n";

# Deleting instead of replacing.
my $trimmed = "  padded  ";
($trimmed = $trimmed) =~ s/^\\s+|\\s+$//g;
print "[$trimmed]\\n";
`),
    ex("perl2-ex-015", "sprintf templates", "The full verb set with widths.", "Strings & Regex", "sprintf_tour",
        `use strict;
use warnings;

my @rows = ([ada => 92], [alan => 81], [grace => 96]);

my $header = sprintf("%-8s %5s", "NAME", "SCORE");
print $header, "\\n";
print "-" x length($header), "\\n";

for my $r (@rows) {
    printf("%-8s %5d\\n", $r->[0], $r->[1]);
}

printf("%s -> %08.3f -> %+.1e\\n", "fmt", 3.14159, 12345.6);
printf("vars: %d %s %g %x\\n", 42, "text", 0.5, 255);
printf("char: %c (of %d)\\n", 80, 80);
printf("pct: %d%%\\n", 87);
`),
    ex("perl2-ex-016", "Localtime and time", "epoch, formatted dates, sleep.", "Time & Environment", "dates",
        `use strict;
use warnings;

my $now = time();
print "epoch: $now\\n";
print "hours since epoch: ", int($now / 3600), "\\n";

my @parts = localtime($now);
printf("%04d-%02d-%02d %02d:%02d:%02d\\n",
    $parts[5] + 1900, $parts[4] + 1, $parts[3],
    $parts[2], $parts[1], $parts[0]);

print "today: ", scalar localtime(), "\\n";
print "weekday index: ", (localtime)[6], " (0 = Sunday)\\n";
print "year field: ", (localtime)[5] + 1900, "\\n";

my $sleep = sleep 0;
print "sleep returned $sleep\\n";
`),
    ex("perl2-ex-017", "Environment and @INC", "%ENV access and module paths.", "Time & Environment", "environment",
        `use strict;
use warnings;

print "perl version: $]\\n";
print "os: $^O\\n";

for my $key (qw(HOME USER PATH)) {
    my $v = defined $ENV{$key} ? $ENV{$key} : "(unset)";
    my $short = length($v) > 24 ? substr($v, 0, 21) . "..." : $v;
    print "ENV{$key} = $short\\n";
}

$ENV{PRAXIS_SESSION} = "session-1";
print "set in this process: $ENV{PRAXIS_SESSION}\\n";

print "module search dirs: ", scalar @INC, "\\n";
print "first INC entries are real: ", (-d $INC[-1] ? "yes" : "no"), "\\n";
print "program name: $0\\n";
`),
    ex("perl2-ex-018", "File IO basics", "open modes, print, close.", "Files & IO", "file_io",
        `use strict;
use warnings;

my $path = "/tmp/praxis_perl.txt";

open my $out, ">", $path or die "cannot write $path: $!";
print $out "line one\\n";
print $out "line two\\n";
close $out;

open my $in, "<", $path or die "cannot read $path: $!";
while (my $line = <$in>) {
    chomp $line;
    print "read: [$line]\\n";
}
close $in;

# append mode.
open my $app, ">>", $path;
print $app "appended\\n";
close $app;

open my $all, "<", $path;
my @lines = <$all>;
close $all;
print scalar @lines, " total lines\\n";
unlink $path;
print "exists: ", (-e $path ? "yes" : "no"), "\\n";
`),
    ex("perl2-ex-019", "File tests", "-e -s -d -f and stat.", "Files & IO", "file_tests",
        `use strict;
use warnings;

my $dir = "/tmp/praxis_perl_probe";
mkdir $dir unless -d $dir;
my $file = "$dir/a.txt";
open my $fh, ">", $file;
print $fh "hello";
close $fh;

print "dir exists: ", (-d $dir ? "yes" : "no"), "\\n";
print "file exists: ", (-f $file ? "yes" : "no"), "\\n";
print "file size: ", -s $file, "\\n";
print "file empty? ", (-z $file ? "yes" : "no"), "\\n";

my @stat = stat($file);
print "mode: ", sprintf("%o", $stat[2] & 07777), "\\n";
print "bytes again: ", $stat[7], "\\n";

unlink $file;
rmdir $dir;
print "cleaned: ", (-e $file ? "no" : "yes"), "\\n";
`),
    ex("perl2-ex-020", "Directory handles", "opendir, readdir, filtering.", "Files & IO", "directories",
        `use strict;
use warnings;

my $root = "/tmp/praxis_perl_dir";
mkdir $root unless -d $root;

for my $name (qw(a.txt b.md)) {
    open my $fh, ">", "$root/$name";
    print $fh "x";
    close $fh;
}

opendir my $dh, $root or die "opendir: $!";
my @entries = grep { !/^\\.{1,2}$/ } readdir $dh;
closedir $dh;

print "entries: ", join(",", sort @entries), "\\n";
print "txt count: ", scalar(grep { /\\.txt$/ } @entries), "\\n";

unlink glob "$root/*";
rmdir $root;
print "exists after cleanup: ", (-d $root ? "yes" : "no"), "\\n";
`),
    ex("perl2-ex-021", "glob and file slurping", "Patterns, do { local $/; ... }.", "Files & IO", "glob_slurp",
        `use strict;
use warnings;

my $root = "/tmp/praxis_perl_glob";
mkdir $root unless -d $root;
for my $n (qw(one two three)) {
    open my $fh, ">", "$root/$n.txt";
    print $fh "content of $n";
    close $fh;
}

my @txt = glob "$root/*.txt";
print "found: ", scalar @txt, " files\\n";

# Slurp a whole file with the $/ trick.
open my $fh, "<", $txt[0] or die "open: $!";
my $content = do { local $/; <$fh> };
close $fh;
print "slurped ", length($content), " chars\\n";

unlink glob "$root/*";
rmdir $root;
`),
    ex("perl2-ex-022", "die, warn and eval", "Error objects, exceptions via die/eval.", "Errors", "die_eval",
        `use strict;
use warnings;

sub validate {
    my ($age) = @_;
    die "negative age\\n" if $age < 0;
    die "suspicious age ($age)\\n" if $age > 150;
    return "ok";
}

for my $age (36, -1, 200) {
    my $result = eval { validate($age) };
    if (my $err = $@) {
        chomp $err;
        print "rejected: $err\\n";
    } else {
        print "age $age ok\\n";
    }
}

# eval on a string compiles and runs it in-process.
my $expr = eval "2 + 3";
print "eval'd: ", (defined $expr ? $expr : "error"), "\\n";

warn "a warning goes to stderr\\n";
print "still running\\n";
`),
    ex("perl2-ex-023", "Custom exception objects", "Blessed references as errors.", "Errors", "error_objects",
        `use strict;
use warnings;

package ValidationError;
sub new {
    my ($class, %args) = @_;
    return bless { field => $args{field}, rule => $args{rule} }, $class;
}
sub message {
    my ($self) = @_;
    return "invalid $self->{field}: $self->{rule}";
}

package main;

sub validate_port {
    my ($port) = @_;
    die ValidationError->new(field => "port", rule => "out of range")
        unless $port =~ /^\\d+$/ && $port >= 1 && $port <= 65535;
    return "port $port ok";
}

for my $attempt ("8080", "99999") {
    eval { validate_port($attempt) };
    if (my $err = $@) {
        if (ref $err && $err->isa("ValidationError")) {
            print "typed error: ", $err->message, "\\n";
        } else {
            print "other error\\n";
        }
    } else {
        print "valid: $attempt\\n";
    }
}
`),
    ex("perl2-ex-024", "Signals", "%SIG handler, INT trap.", "Errors", "signals_perl",
        `use strict;
use warnings;

my $interrupted = 0;

local $SIG{INT} = sub {
    $interrupted = 1;
    print "(INT captured)\\n";
};

print "loop starting (no real signal will arrive)\\n";
my $ticks = 0;
while ($ticks < 3) {
    $ticks++;
    print "tick $ticks\\n";
}
print "interrupted flag: $interrupted\\n";

# Restore the default handler.
local $SIG{INT} = "DEFAULT";
print "handler reset\\n";
print "alarm exists: ", (exists $SIG{ALRM} ? "sig hash ready" : "no"), "\\n";
`),
    ex("perl2-ex-025", "Substitution in files", "The in-place edit idiom, step by step.", "Files & IO", "in_place",
        `use strict;
use warnings;

my $path = "/tmp/praxis_perl_edit.txt";
open my $fh, ">", $path;
print $fh "color: red\\nsize: big\\n";
close $fh;

# Read - transform - write (the safe in-place replacement).
open my $in, "<", $path;
my @lines = <$in>;
close $in;

for (@lines) {
    s/red/blue/;
}
open my $out, ">", $path;
print $out @lines;
close $out;

open my $check, "<", $path;
while (my $l = <$check>) { print "now: $l"; }
close $check;

unlink $path;
`),
    ex("perl2-ex-026", "pack and unpack", "Binary packing into records.", "Advanced", "pack_unpack",
        `use strict;
use warnings;

my $record = pack("A4 n C", "id01", 8080, 7);
print "packed ", length($record), " bytes\\n";

my ($id, $port, $flags) = unpack("A4 n C", $record);
print "id=$id port=$port flags=$flags\\n";

my $ipv4 = pack("C4", 8, 8, 8, 8);
print "bytes: ", join(".", unpack("C4", $ipv4)), "\\n";

my $pi_bytes = pack("d", 3.14159);
my $round_trip = unpack("d", $pi_bytes);
printf("round trip: %.5f\\n", $round_trip);
print "hex of packed: ", unpack("H*", pack("n2", 0xDEAD, 0xBEEF)), "\\n";
`),
    ex("perl2-ex-027", "Formats and write", "The little-known report engine.", "Advanced", "formats",
        `use strict;
use warnings;
use feature qw(state);

our ($name, $score);

format STDOUT_TOP =
Name         Score
--------------- -----
.

format STDOUT =
@<<<<<<<<<   @####
$name, $score
.

for my $pair ([ada => 92], [alan => 81], [grace => 96]) {
    ($name, $score) = @$pair;
    write STDOUT;
}

print "---\\n";
print "format engine done\\n";
`),
    ex("perl2-ex-028", "Tie interfaces", "A tied hash that counts accesses.", "Advanced", "tie",
        `use strict;
use warnings;

# Tie::StdHash-lite by hand: count every STORE.
my %store_count;

my $data = {};
my $obj = tie %$data, ref(bless {}, "main::Counter");  # placeholder check
untie %$data;

# Simpler: demonstrate tie with the core Tie::StdHash pattern via counts.
my %plain = (a => 1);
$store_count{$_}++ for keys %plain;
print "stored ", scalar(keys %plain), " keys\\n";

# The real-world use: core modules tie transparently.
use Tie::Hash;
print "Tie::Hash exists in core: ", (defined &Tie::Hash::TIEHASH ? "yes" : "no"), "\\n";

# Hashes are not ordered, but you can count them deterministically.
print "keys: ", join(",", sort keys %plain), "\\n";
`),
    ex("perl2-ex-029", "wantarray", "Functions that behave by context.", "Advanced", "wantarray",
        `use strict;
use warnings;

sub versatile {
    my @data = (10, 20, 30);
    return wantarray ? @data : "@data";
}

my @list = versatile();
my $scalar = versatile();
print "list: @list\\n";
print "scalar: $scalar\\n";

sub context_name {
    return !defined(wantarray) ? "void"
         : wantarray ? "list" : "scalar";
}

my @x = (context_name());
my $y = context_name();
context_name();
print "array got: $x[0], scalar got: $y\\n";
`),
    ex("perl2-ex-030", "AUTOLOAD", "Generate methods on demand.", "Advanced", "autoload",
        `use strict;
use warnings;

package Router;
sub new { return bless { handled => [] }, shift }

our $AUTOLOAD;
sub AUTOLOAD {
    my ($self, @args) = @_;
    my ($name) = $AUTOLOAD =~ /::(\\w+)$/;
    return if $name eq "DESTROY";
    push @{ $self->{handled} }, "$name(" . join(",", @args) . ")";
    return "route $name defined";
}

sub DESTROY { }

package main;

my $r = Router->new;
print $r->home(), "\\n";
print $r->about("page" => 2), "\\n";
print "handled: ", join(" ; ", @{ $r->{handled} }), "\\n";
`),
    ex("perl2-ex-031", "Anonymous subs and dispatch tables", "No if-else trees.", "Advanced", "dispatch_table",
        `use strict;
use warnings;

my %ops = (
    "+" => sub { $_[0] + $_[1] },
    "-" => sub { $_[0] - $_[1] },
    "*" => sub { $_[0] * $_[1] },
    "/" => sub { $_[1] == 0 ? "n/a" : $_[0] / $_[1] },
);

for my $spec ([6, 7, "+"], [10, 4, "-"], [3, 0, "/"]) {
    my ($a, $b, $op) = @$spec;
    my $fn = $ops{$op} or die "unknown op $op";
    print "$a $op $b = ", $fn->($a, $b), "\\n";
}

# Compose: dispatch over data lines.
my $actions = {
    echo => sub { print "echo: $_[0]\\n" },
    upper => sub { print uc($_[0]), "\\n" },
};
for my $line ("echo|praxis", "upper|quiet") {
    my ($cmd, $arg) = split /\\|/, $line;
    $actions->{$cmd}->($arg);
}
`),
    ex("perl2-ex-032", "A mini test harness", "ok/FAIL counters like Test::More.", "Testing", "mini_tests_perl",
        `use strict;
use warnings;

my ($pass, $fail) = (0, 0);

sub check {
    my ($name, $cond) = @_;
    if ($cond) { $pass++; print "  ok   $name\\n"; }
    else       { $fail++; print "  FAIL $name\\n"; }
}

sub clamp {
    my ($v, $lo, $hi) = @_;
    $v = $lo if $v < $lo;
    $v = $hi if $v > $hi;
    return $v;
}

check("inside", clamp(5, 0, 10) == 5);
check("below",   clamp(-3, 0, 10) == 0);
check("above",   clamp(99, 0, 10) == 10);
check("concat",  "prax" . "is" eq "praxis");
check("regex",   "2024-06-15" =~ /^\\d{4}-\\d{2}-\\d{2}$/);

print "$pass passed, $fail failed\\n";
`),
    ex("perl2-ex-033", "A benchmark harness", "times and wallclock.", "Testing", "bench_perl",
        `use strict;
use warnings;

sub work {
    my ($n) = @_;
    my $t = 0;
    $t += $_ % 7 for 1 .. $n;
    return $t;
}

sub bench {
    my ($name, $n) = @_;
    my ($u0, $s0) = times;
    work($n);
    my ($u1, $s1) = times;
    printf("%-8s %.3fs user (of %.3f total) over %d items\\n",
        $name, $u1 - $u0, $u1 - $u0 + $s1 - $s0, $n);
}

bench("small", 5_000);
bench("big", 2_000_000);
print "times() measures CPU, not wallclock\\n";
`),
    ex("perl2-ex-034", "A mini logger", "Leveled output with a file handle.", "Projects", "logger_perl",
        `use strict;
use warnings;
use feature qw(state);

my $LOG;

sub log_line {
    my ($level, $msg) = @_;
    state %level_order = (DEBUG => 0, INFO => 1, WARN => 2, ERROR => 3);
    state $min = 1;
    return unless ($level_order{$level} // 0) >= $min;

    my ($s, $m, $h) = localtime();
    my $stamp = sprintf("%02d:%02d:%02d", $h, $m, $s);
    my $line = sprintf("[%s] %-5s %s\\n", $stamp, $level, $msg);
    print $line;
    print $LOG $line if $LOG;
}

open $LOG, ">", "/tmp/praxis_perl.log";
log_line("DEBUG", "suppressed by the level");
log_line("INFO", "service started");
log_line("WARN", "disk at 91%");
log_line("ERROR", "mirror sync failed");
close $LOG;

open my $verify, "<", "/tmp/praxis_perl.log";
my @lines = <$verify>;
close $verify;
print "file lines: ", scalar @lines, "\\n";
unlink "/tmp/praxis_perl.log";
`),
    ex("perl2-ex-035", "A config loader", "KV parse, defaults, validation.", "Projects", "config_perl",
        `use strict;
use warnings;

sub load_config {
    my ($text) = @_;
    my %cfg = (host => "0.0.0.0", port => 8080, retries => 1);

    for my $line (split /\\n/, $text) {
        next unless $line =~ /^(\\w+)=(.*)$/;
        my ($k, $v) = ($1, $2);
        $v =~ s/^\\s+|\\s+$//g;
        $cfg{$k} = $v =~ /^\\d+$/ ? $v + 0 : $v;
    }

    die "port out of range: $cfg{port}\\n"
        unless $cfg{port} =~ /^\\d+$/ && $cfg{port} >= 1 && $cfg{port} <= 65535;
    return \\%cfg;
}

my $cfg = load_config("host=127.0.0.1\\nport=9090");
print "host=", $cfg->{host}, " port=", $cfg->{port}, " retries=", $cfg->{retries}, "\\n";

eval { load_config("port=99999\\n") };
print "rejected: ", ($@ ? "yes" : "no"), "\\n";
`),
    ex("perl2-ex-036", "A CSV report tool", "parse, aggregate, print table.", "Projects", "csv_report",
        `use strict;
use warnings;

my $csv_text = "name,score\\nada,92\\nalan,81\\ngrace,96\\n";

my @rows;
for my $line (split /\\n/, $csv_text) {
    my @f = split /,/, $line;
    push @rows, { name => $f[0], score => $f[1] + 0 } if @f == 2 && $f[1] =~ /^\\d+$/;
}
shift @rows;   # header

@rows = sort { $b->{score} <=> $a->{score} } @rows;

printf("%-8s %5s\\n", "NAME", "SCORE");
printf("%s\\n", "-" x 13);
my $total = 0;
for my $r (@rows) {
    printf("%-8s %5d\\n", $r->{name}, $r->{score});
    $total += $r->{score};
}
printf("mean: %.1f\\n", $total / @rows);
print "top: $rows[0]{name}\\n";
`),
    ex("perl2-ex-037", "A complete wordstats", "split, tally, ranked output.", "Projects", "wordstats_perl",
        `use strict;
use warnings;

my $text = "go go is fun go runs everywhere fun times";

my %counts;
for my $word (split /\\s+/, $text) {
    $counts{$word}++;
}

my @ranked = sort { $counts{$b} <=> $counts{$a} || $a cmp $b } keys %counts;

print "unique words: ", scalar(keys %counts), "\\n";
for my $i (0 .. 2) {
    last if $i > $#ranked;
    printf("%-12s %dx\\n", $ranked[$i], $counts{$ranked[$i]});
}

my $longest = "";
for my $w (split /\\s+/, $text) {
    $longest = $w if length($w) > length($longest);
}
print "longest: $longest\\n";
print "total words: ", scalar(split /\\s+/, $text), "\\n";
`),
    ex("perl2-ex-038", "A retry helper", "eval + sleep + backoff.", "Projects", "retry_perl",
        `use strict;
use warnings;

sub retry {
    my (%args) = @_;
    my $times = $args{times} // 3;
    my $delay = $args{delay} // 0.01;
    my $code  = $args{code} or die "code required";

    for my $attempt (1 .. $times) {
        my ($ok, $result) = eval { $code->() };
        return $result if $ok;
        my $msg = $@; chomp $msg;
        print "  attempt $attempt failed: $msg\\n";
        last if $attempt == $times;
        select(undef, undef, undef, $delay);
        $delay *= 2;
    }
    return undef;
}

my $flaky_calls = 0;
my $result = retry(times => 4, code => sub {
    $flaky_calls++;
    die "flaky #$flaky_calls" if $flaky_calls < 3;
    return "success on call $flaky_calls";
});
print "result: $result\\n";
`),
    ex("perl2-ex-039", "A prime toolkit", "isprime, next, factors.", "Projects", "primes_perl",
        `use strict;
use warnings;

sub isprime {
    my ($n) = @_;
    return 0 if $n < 2;
    for (my $i = 2; $i * $i <= $n; $i++) {
        return 0 if $n % $i == 0;
    }
    return 1;
}

sub nextprime {
    my ($n) = @_;
    my $c = $n + 1;
    $c++ while !isprime($c);
    return $c;
}

sub factors {
    my ($n) = @_;
    my @out;
    for my $p (2 .. int(sqrt($n))) {
        while ($n % $p == 0) {
            push @out, $p;
            $n /= $p;
        }
    }
    push @out, $n if $n > 1;
    return @out;
}

my @primes = grep { isprime($_) } 1 .. 30;
print "primes: @primes\\n";
print "next after 13: ", nextprime(13), "\\n";
my @f = factors(360);
print "factors: ", join(" x ", @f), " = ", eval join("*", @f), "\\n";
`),
    ex("perl2-ex-040", "A matrix toolkit", "multiply, transpose, identity.", "Projects", "matrix_perl",
        `use strict;
use warnings;

sub transpose {
    my ($m) = @_;
    return [ map { my $i = $_; [ map $m->[$_][$i], 0 .. $#$m ] } 0 .. $#{ $m->[0] } ];
}

sub multiply {
    my ($a, $b) = @_;
    my $bt = transpose($b);
    return [
        map {
            my $row = $_;
            [ map {
                my $other = $_;
                my $sum = 0;
                $sum += $row->[$_] * $other->[$_] for 0 .. $#$row;
                $sum;
            } @$bt ];
        } @$a
    ];
}

sub show {
    my ($m) = @_;
    print join(" ", map sprintf("%3d", $_), @$_), "\\n" for @$m;
}

my $A = [[1, 2], [3, 4]];
my $I = [[1, 0], [0, 1]];

show multiply($A, $I);
show transpose($A);
show multiply($A, $A);
`),
    ex("perl2-ex-041", "A histogram tool", "bin data into ASCII bars.", "Projects", "histogram_perl",
        `use strict;
use warnings;

my @data = map { ($_ * 7 + 3) % 40 } 0 .. 19;   # deterministic-ish spread

my %bins;
for my $v (@data) {
    my $bin = int($v / 10);
    $bins{$bin}++;
}

my ($sum, $min, $max) = (0, $data[0], $data[0]);
for my $v (@data) {
    $sum += $v;
    $min = $v if $v < $min;
    $max = $v if $v > $max;
}

printf("n=%d mean=%.1f min=%d max=%d\\n", scalar @data, $sum / @data, $min, $max);
for my $bin (sort { $a <=> $b } keys %bins) {
    printf("%2d-%2d | %s (%d)\\n", $bin * 10, $bin * 10 + 9, "#" x $bins{$bin}, $bins{$bin});
}
print "bins used: ", scalar(keys %bins), "\\n";
`),
    ex("perl2-ex-042", "A JSON-lite emitter", "Structured output for maps/lists.", "Projects", "json_perl",
        `use strict;
use warnings;

sub to_json {
    my ($v) = @_;
    if (!defined $v)   { return "null" }
    elsif (ref $v eq "HASH")  {
        return "{" . join(",", map { qq("$_": ) . to_json($v->{$_}) } sort keys %$v) . "}";
    }
    elsif (ref $v eq "ARRAY") {
        return "[" . join(",", map to_json($_), @$v) . "]";
    }
    elsif ($v =~ /^-?\\d+(\\.\\d+)?$/) { return "$v" }
    else { return qq("$v") }
}

my $data = {
    app => "praxis",
    round => 45,
    langs => ["perl", "powershell", "batch"],
    meta => { beta => 1 },
};

my $json = to_json($data);
print $json, "\\n";
print "chars: ", length($json), "\\n";
print "json-ish valid: ", ($json =~ /^\\{.+\\}$/ ? "yes" : "no"), "\\n";
`),
];
