/**
 * 8 Rust reference templates (one of the six NEW runtime
 * languages added alongside). Bodies are pure-std Rust, created as
 * .rs files; Run compiles them with rustc and executes the artifact
 * (the runtime chip in the viewer header reports when rustc is
 * missing).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Rust";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("rust", id, label, description, CAT, sub, baseName, ".rs", () => body);

export const RUST_EXAMPLES: FileExample[] = [
    ex("rust-ex-001", "Hello, Rust", "println! macros, {} vs {:?} formatting and format! — the opening page.", "Basics", "hello_rust",
        `// Hello, Rust — the println! macro family.
fn main() {
    println!("Hello from Rust!");

    let name = "Praxis";                        // immutable by default
    println!("Hello, {name}!");                  // inline named args

    // {} is Display; {:?} is Debug (works on most collections).
    let count = 42;
    let pi = 3.14159;
    let nums = [5, 1, 4];
    println!("int={count} pi={pi:.4}");
    println!("debug array: {nums:?}");
    println!("{:>8}|{:<8}|{:>8.3}", 42, "x", 2.71828); // width/align/precision

    // format! builds a String instead of printing it.
    let line = format!("formatted {count:04}");
    println!("{line}");

    let mut mutable = 1;                         // mut opt-IN to mutation
    mutable += 1;
    println!("mutable: {mutable}");
}
`),

    ex("rust-ex-002", "Control flow", "if as an expression, loop labels, while, for over ranges and match.", "Control flow", "control_flow",
        `// Control flow — if EXPRESSIONS + the match powerhouse.
fn main() {
    let score = 87;

    // if is an expression — it RETURNS a value.
    let grade = if score >= 90 { 'A' }
        else if score >= 80 { 'B' }
        else { 'C' };
    println!("score {score} -> grade {grade}");

    // for over ranges (inclusive ..=).
    for i in 1..=5 {
        print!("{i} ");
    }
    println!();
    let total: i32 = (1..=10).sum();
    println!("1..=10 sums to {total}");

    // while + loop (with a break VALUE).
    let mut power = 1;
    while power < 100 { power *= 3; }
    println!("first power of 3 past 100: {power}");

    let squared = loop { break 6 * 7 };

    // Labeled blocks jump out of nested loops.
    'outer: for row in 1..=3 {
        for col in 1..=3 {
            if row * col > 4 { break 'outer; }
            print!("{} ", row * col);
        }
    }
    println!();
    println!("loop returned: {squared}");

    // match — patterns with ranges, ors and bindings.
    let day = 6;
    let kind = match day {
        1 | 7 => "weekend",
        2..=6 => "weekday",
        _ => "unknown",
    };
    println!("day {day} is a {kind}");
}
`),

    ex("rust-ex-003", "Functions", "Typed signatures, generics, returning Result and closures.", "Functions", "functions_tour",
        `// Functions — signatures, generics, Result, closures.
fn divide(a: f64, b: f64) -> Result<f64, String> {
    if b == 0.0 {
        Err(String::from("division by zero"))
    } else {
        Ok(a / b)
    }
}

// A generic function with a trait bound.
fn largest<T: PartialOrd>(values: &[T]) -> &T {
    let mut best = &values[0];
    for v in values { if *v > *best { best = v; } }
    best
}

fn main() {
    match divide(10.0, 4.0) {
        Ok(result) => println!("10 / 4 = {result:.2}"),
        Err(err)   => println!("error: {err}"),
    }
    if let Err(err) = divide(1.0, 0.0) {
        println!("caught: {err}");
    }

    println!("largest: {}", largest(&[5, 1, 4, 2, 3]));
    println!("largest word: {}", largest(&["pear", "fig"]));

    // Closures: inferred types, captured environment.
    let factor = 3;
    let scale = |value| value * factor;      // captures factor
    println!("scaled: {}", scale(7));

    let squares: Vec<i32> = (1..=5).map(|n| n * n).collect();
    println!("squares: {squares:?}");
}
`),

    ex("rust-ex-004", "Ownership and borrowing", "move semantics, & borrows, &mut, and Copy types.", "Core concepts", "ownership_borrowing",
        `// Ownership — the rule set that replaces a garbage collector.
fn length(text: &str) -> usize {      // & borrows read-only
    text.len()                        // the caller KEEPS ownership
}

fn clear(text: &mut String) {         // &mut borrows mutably
    text.clear();                     // exactly ONE &mut at a time
}

fn main() {
    // MOVE: s1's buffer transfers to s2 — s1 is dead afterwards.
    let s1 = String::from("hello");
    let s2 = s1;                          // moved (no clone!)
    // println!("{s1}");                  // would NOT compile
    println!("moved into: {s2}");

    // CLONE when you really want both.
    let original = String::from("keep me");
    let copy = original.clone();
    println!("{original} + {copy}");

    // Borrowing: many readers OR one writer, never both.
    let owned = String::from("Praxis");
    let first = length(&owned);           // immutable borrow
    println!("{owned} has {first} chars");

    let mut mutable = String::from("content");
    clear(&mut mutable);                  // mutable borrow ends here
    println!("after clear: '{mutable}' ({})", mutable.len());

    // Copy types (ints, floats) never move-kill the source.
    let x = 5;
    let y = x;                            // copied by value
    println!("both alive: {x} {y}");
}
`),

    ex("rust-ex-005", "Structs and enums", "Named structs, tuple structs, enums with data and impl blocks.", "Core concepts", "structs_enums",
        `// Structs + enums — the data modeling core.
#[derive(Debug)]
struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn new(x: f64, y: f64) -> Self {      // associated fn = constructor
        Self { x, y }
    }
    fn length(&self) -> f64 {             // method: takes self
        (self.x * self.x + self.y * self.y).sqrt()
    }
}

// Enums carry DIFFERENT payloads per variant — a tagged union.
#[derive(Debug)]
enum Shape {
    Circle { radius: f64 },
    Rect { width: f64, height: f64 },
}

fn area(shape: &Shape) -> f64 {
    match shape {
        Shape::Circle { radius } => std::f64::consts::PI * radius * radius,
        Shape::Rect { width, height } => width * height,
    }
}

fn main() {
    let p = Point::new(3.0, 4.0);
    println!("{p:?} length = {:.3}", p.length());

    let shapes = [
        Shape::Circle { radius: 2.0 },
        Shape::Rect { width: 3.0, height: 4.0 },
    ];
    for shape in &shapes {
        println!("{shape:?} area = {:.3}", area(shape));
    }

    // Option<T> is an enum — the nil-free way to express absence.
    let maybe: Option<i32> = None;
    println!("maybe unwrapped: {}", maybe.unwrap_or(0));
}
`),

    ex("rust-ex-006", "Vectors and HashMaps", "Vec push/iter + HashMap entry counts — the two daily collections.", "Collections", "vector_map",
        `// Vec + HashMap — the collections Rust runs on.
use std::collections::HashMap;

fn main() {
    let mut nums: Vec<i32> = Vec::new();
    for i in 1..=5 { nums.push(i * i); }
    println!("squares: {nums:?}  len: {}", nums.len());

    let literal = vec![5, 1, 4, 2, 3];        // vec![] literal macro
    println!("literal: {literal:?}");

    // Indexing panics on OOB; .get returns Option.
    println!("first: {} safe third: {:?}", literal[0], literal.get(2));

    // Sort + dedup.
    let mut sorted = literal.clone();
    sorted.sort();
    println!("sorted: {sorted:?}");

    // HashMap with the entry API — the frequency idiom.
    let text = "to be or not to be";
    let mut freq: HashMap<&str, i32> = HashMap::new();
    for word in text.split_whitespace() {
        *freq.entry(word).or_insert(0) += 1;
    }
    println!("freq: {freq:?}");
    println!("'to' count: {}", freq.get("to").copied().unwrap_or(0));

    // Iteration: iter borrows, into_iter consumes.
    let total: i32 = sorted.iter().sum();
    println!("total: {total}");
}
`),

    ex("rust-ex-007", "Error handling", "Result, ? propagation, custom error enums and unwrap alternatives.", "Robustness", "error_handling",
        `// Result-based error handling — the ? operator pipeline.
use std::fmt;

#[derive(Debug)]
enum ParseError {
    Empty,
    NotANumber(String),
    Negative,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ParseError::Empty => write!(f, "input was empty"),
            ParseError::NotANumber(text) => write!(f, "not a number: '{text}'"),
            ParseError::Negative => write!(f, "negative value"),
        }
    }
}

fn parse_age(text: &str) -> Result<i32, ParseError> {
    if text.is_empty() {
        return Err(ParseError::Empty);
    }
    let value: i32 = text.parse().map_err(|_| ParseError::NotANumber(text.to_string()))?;
    if value < 0 {
        return Err(ParseError::Negative);
    }
    Ok(value)
}

// ? PROPAGATES any Err to the caller — no unwrap-panic in sight.
fn run() -> Result<i32, ParseError> {
    let first = parse_age("31")?;
    let second = parse_age("thirty-one")?;
    Ok(first + second)
}

fn main() {
    println!("{}", parse_age("31").unwrap());
    println!("{}", parse_age("-1").unwrap_or(0));
    match run() {
        Ok(value) => println!("sum: {value}"),
        Err(err)  => println!("run failed: {err}"),
    }
    println!("still running");
}
`),

    ex("rust-ex-008", "Traits and iterators", "Defining + implementing a trait, iterator adaptors chained into a pipeline.", "Advanced", "traits_iterators",
        `// Traits + the iterator pipeline.
use std::fmt;

trait Describe {
    fn describe(&self) -> String;
    fn shout(&self) -> String {            // default method body
        format!("{}!", self.describe().to_uppercase())
    }
}

struct Planet {
    name: &'static str,
    orbit_days: f64,
}

impl Describe for Planet {
    fn describe(&self) -> String {
        format!("{} orbits every {:.1} days", self.name, self.orbit_days)
    }
}

impl fmt::Display for Planet {             // implementing a std trait
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.name)
    }
}

fn main() {
    let planets = [
        Planet { name: "Mercury", orbit_days: 87.97 },
        Planet { name: "Earth",   orbit_days: 365.26 },
        Planet { name: "Jupiter", orbit_days: 4332.6 },
    ];

    for planet in &planets {
        println!("{}", planet.describe());
    }
    println!("shout: {}", planets[0].shout());

    // The iterator pipeline: filter → map → collect.
    let short_names: Vec<String> = planets.iter()
        .filter(|p| p.orbit_days < 400.0)
        .map(|p| p.name.to_string())
        .collect();
    println!("short orbits: {short_names:?}");

    let total: f64 = planets.iter().map(|p| p.orbit_days).sum();
    println!("total orbits: {total:.1}");
}
`),
];
