/**
 * 8 Perl reference templates (one of the six NEW runtime
 * languages added alongside). Bodies are idiomatic modern Perl
 * (strict/warnings, stdlib only), created as .pl files and runnable
 * through `perl` the moment it is installed (it is present on most
 * Linux/macOS machines already).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Perl";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("perl", id, label, description, CAT, sub, baseName, ".pl", () => body);

export const PERL_EXAMPLES: FileExample[] = [
    ex("perl-ex-001", "Hello, Perl", "print, say, interpolation and the sigil system.", "Basics", "hello_perl",
        `#!/usr/bin/perl
use strict;
use warnings;

# Hello, Perl — print, say and the $ sigil.
print "Hello from Perl!\\n";

my $name = 'Praxis';
print "Hello, $name!\\n";            # double quotes interpolate
print 'Single quotes keep $name literal', "\\n";

# printf is the C-style twin.
my $count = 42;
my $pi    = 3.14159;
printf("int=%d float=%.4f\\n", $count, $pi);

# say (5.10+) appends the newline for you.
use feature 'say';
say "say() adds the newline";
say "Upper: ", uc($name);

# String repetition operator x.
say "-" x 20;
`),

    ex("perl-ex-002", "Variables and context", "Scalars, arrays, hashes and Perl's famous list vs scalar context.", "Basics", "variables_context",
        `#!/usr/bin/perl
use strict;
use warnings;
use feature 'say';

# The three sigils: $ scalar, @ array, % hash.
my @nums = (5, 1, 4, 2, 3);
my %person = (name => 'Ada', year => 1815);

# CONTEXT: an array in scalar context is its LENGTH.
my $count = @nums;
say "count: $count";
say "last: $nums[-1]";              # negative index counts from the end

# Arrays interpolate; hashes do not.
say "nums: @nums";

# Sorting with a block: <=> is the numeric three-way comparator.
my @sorted = sort { $a <=> $b } @nums;
say "sorted: @sorted";
my @desc = sort { $b <=> $a } @nums;
say "desc: @desc";

# Reversing + slicing.
say "reversed: ", join(' ', reverse @nums);
my @slice = @nums[1..3];            # array slice (0-based)
say "slice: @slice";

# Hash access + the missing-key rule.
say "name: $person{name}";
say "missing: ", exists $person{lang} ? "set" : "absent";
$person{lang} = 'Analytical Engine';  # assignment adds the key
say "lang now: $person{lang}";
`),

    ex("perl-ex-003", "Control flow", "if/unless/elsif, statement modifiers, while, foreach and C-style for.", "Control flow", "control_flow",
        `#!/usr/bin/perl
use strict;
use warnings;
use feature 'say';

my $score = 87;
if    ($score >= 90) { say "grade A" }
elsif ($score >= 80) { say "grade B" }
else                 { say "keep going" }

# Statement MODIFIERS: the condition trails the action.
say "passed!" if $score >= 60;
say "not perfect" unless $score == 100;

# foreach over a list.
foreach my $word ('to', 'be', 'or', 'not') {
  say $word;
}

# C-style for.
my $total = 0;
for (my $i = 1; $i <= 10; $i++) { $total += $i; }
say "1..10 sums to $total";

# while with the default iterator $_ over a list.
my @nums = (1 .. 8);
my $even = 0;
while (defined(my $n = shift @nums)) {
  $even++ if $n % 2 == 0;          # a modifier inside a loop
}
say "evens: $even";

# last/next are break/continue.
foreach my $n (1 .. 10) {
  next if $n % 2 == 0;             # skip evens
  last if $n > 7;                   # stop past 7
  say "odd: $n";
}
`),

    ex("perl-ex-004", "Subroutines", "sub + @_, named defaults, return lists and anonymous subs.", "Functions", "subroutines",
        `#!/usr/bin/perl
use strict;
use warnings;
use feature 'say';

# Arguments arrive in @_ (no signature parens in classic Perl).
sub greet {
  my ($name, $punctuation) = @_;    # the customary unpacking line
  $punctuation //= '!';             # //: defined-or default
  return "Hello, $name$punctuation";
}

# Multiple return values: a list.
sub minmax {
  my ($lo, $hi) = ($_[0], $_[0]);
  foreach my $v (@_) {
    $lo = $v if $v < $lo;
    $hi = $v if $v > $hi;
  }
  return ($lo, $hi);                # a list return
}

# An anonymous sub stored in a scalar — first-class functions.
my $double = sub { $_[0] * 2 };

say greet('Ada');
say greet('Grace', '?');
my ($lo, $hi) = minmax(5, 1, 4, 2, 3);
say "min: $lo max: $hi";
say $double->(21);
say "also: ", $double->(7);
`),

    ex("perl-ex-005", "Regular expressions", "Matching, capture groups, substitution with /g and transliteration.", "Text", "regex_tour",
        `#!/usr/bin/perl
use strict;
use warnings;
use feature 'say';

my $text = 'The quick brown fox jumps over the lazy dog';

# =~ binds a match against a variable.
if ($text =~ /quick (brown) fox/) {
  say "matched; the group was '$1'";        # $1 = first capture
}

# Substitution s/// (with /g for every occurrence).
my $swapped = $text =~ s/quick|lazy/sleepy/gr;   # /r returns a NEW string
say $swapped;

(my $edited = $text) =~ s/dog/cat/;       # without /r edits in place
say $edited;

# Global matching in list context returns every match.
my @words = $text =~ /(\\w+)/g;
say "word count: ", scalar @words;

# Character classes + quantifiers.
my @vowels = ($text =~ /([aeiou])/g);
say "vowels: ", scalar @vowels;

# Transliteration tr/// counts (and optionally swaps) characters.
my $letters = ($text =~ tr/a-zA-Z//);
say "letters: $letters";

my $upper = $text;
$upper =~ tr/a-z/A-Z/;                    # case conversion the tr way
say substr($upper, 0, 20), "...";

# Split on whitespace into words.
my @split = split /\\s+/, $text;
say "first three: @split[0..2]";
`),

    ex("perl-ex-006", "References and structures", "Anonymous arrays/hashes, -> dereferencing and nested data.", "Data structures", "references",
        `#!/usr/bin/perl
use strict;
use warnings;
use feature 'say';

# Anonymous structures: [ ] makes an array ref, { } a hash ref.
my $point = { x => 3, y => 4 };
my $nums  = [5, 1, 4, 2, 3];

# -> dereferences one level.
say "x: $point->{x}  first: $nums->[0]";
say "count: ", scalar @$nums;             # @$ flattens to the array

# NESTED data = references all the way down.
my $records = [
  { name => 'Ada',     score => 95 },
  { name => 'Alan',    score => 88 },
  { name => 'Grace',   score => 99 },
];

foreach my $record (@$records) {          # @{$records} — the @ deref
  say "$record->{name}: $record->{score}";
}

# Sorting a list of hash refs.
my @best = sort { $b->{score} <=> $a->{score} } @$records;
say "top: $best[0]{name}";               # chained arrow-free form

# Map-style transform via a block + a list.
my @names = map  { $_->{name} } @$records;
my @big   = grep { $_->{score} >= 90 } @$records;
say "names: @names";
say "90+ scorers: ", scalar @big;
`),

    ex("perl-ex-007", "Eval and exceptions", "die/croak, eval as the try, the $@ result and an exception-shaped die.", "Robustness", "eval_exceptions",
        `#!/usr/bin/perl
use strict;
use warnings;
use feature 'say';
use Carp;                       # croak: die FROM the caller's perspective

sub parse_age {
  my ($text) = @_;
  die "ValidationError: not an int: '$text'\\n"
    unless $text =~ /^\\d+$/;
  die "ValidationError: negative age\\n" if $text < 0;
  return $text + 0;
}

# eval BLOCK is Perl's try — it traps die into $@.
my $result = eval { parse_age('31') };
say "parsed: $result" unless $@;

eval { parse_age('thirty-one') };
if (my $err = $@) {
  chomp $err;
  say "caught: $err";
}

eval { croak "a carp-style complaint" };
say "croak also lands in \\$@: ", $@ ? "yes" : "no";

# eval returns undef on failure — the guard pattern.
my $value = eval { 2 ** 10 };
say "eval result: ", $value // 'failed';
`),

    ex("perl-ex-008", "File I/O", "open with the three-arg form, <$handle> line reading, die-on-fail and unlink.", "Practical", "file_io",
        `#!/usr/bin/perl
use strict;
use warnings;
use feature 'say';

my $path = '/tmp/praxis_perl_demo.txt';

# Three-arg open + the lexical handle: the modern idiom.
open(my $out, '>', $path) or die "cannot write '$path': $!";
print {$out} "alpha 1\\n";
print {$out} "beta 2\\n";
print {$out} "gamma 3\\n";
close($out) or die "close failed: $!";

# Read mode: <$handle> reads ONE line each time.
open(my $in, '<', $path) or die "cannot read '$path': $!";
while (my $line = <$in>) {          # chomp removes the trailing newline
  chomp $line;
  say "read: $line";
}
close($in);

# Slurp mode (whole file) with local $/ (the record separator).
open(my $slurp, '<', $path) or die "cannot slurp: $!";
my $whole = do { local $/; <$slurp> };
close($slurp);
say "slurped ", length($whole), " bytes";

unlink $path;                        # delete the temp file
say "cleaned up";
`),
];
