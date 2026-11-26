/**
 * the Rust top-up: 42 more reference templates on top of the
 * eight more ("at least 50 like others". Pure stdlib Rust, runnable
 * through rustc the moment the toolchain exists.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Rust";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("rust", id, label, description, CAT, sub, baseName, ".rs", () => body);

export const RUST_2_EXAMPLES: FileExample[] = [
    ex("rust2-ex-001", "Ownership moves", "Values move; borrow instead.", "Ownership & Borrowing", "ownership_moves",
        `#[derive(Debug)]
struct LogLine { level: String, msg: String }

fn consume(line: LogLine) -> String { line.level }   // takes ownership

fn main() {
    let line = LogLine { level: "INFO".into(), msg: "started".into() };

    let level = consume(line);
    println!("level was {}", level);

    // println!("{:?}", line);  // borrow-checker: line was moved above

    let owned = LogLine { level: "WARN".into(), msg: "disk".into() };
    let borrowed = &owned.msg;          // borrow keeps the owner alive
    println!("{} -> {}", owned.level, borrowed);
}
`),
    ex("rust2-ex-002", "Borrowing rules", "One mutable OR many immutable.", "Ownership & Borrowing", "borrow_rules",
        `fn main() {
    let mut v = vec![10, 20, 30];

    {
        let read1 = &v[0];
        let read2 = &v[1];
        println!("reads: {} {}", read1, read2);
    }                                       // immutable borrows end here

    let write = &mut v[0];
    *write += 5;                            // now a mutable borrow is fine
    println!("after write: {:?}", v);

    // Push while reading would be refused - the classic error shape.
    let first = v[0];
    v.push(40);                             // v[0] copy already made: safe
    println!("first={} len={} -> {:?}", first, v.len(), v);
}
`),
    ex("rust2-ex-003", "Copy and Clone", "Stack types copy; heap types clone.", "Ownership & Borrowing", "copy_clone",
        `#[derive(Clone, Debug)]
struct Heap { data: Vec<i32> }

#[derive(Copy, Clone, Debug)]
struct Stack { x: i32, y: i32 }

fn main() {
    let a = Stack { x: 1, y: 2 };
    let b = a;               // implicit COPY (Stack is Copy)
    println!("both fine: {:?} {:?}", a, b);

    let h = Heap { data: vec![1, 2] };
    let h2 = h.clone();      // explicit deep clone
    println!("{:?} {:?}", h, h2);

    let owned = String::from("praxis");
    let slice = &owned[..3]; // borrows the prefix
    println!("slice {} of {}", slice, owned);
}
`),
    ex("rust2-ex-004", "Lifetimes", "Returning references needs a declared lifetime.", "Ownership & Borrowing", "lifetimes",
        `fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    let s1 = String::from("praxis");
    let shorter = String::from("go");

    let best = longest(&s1, &shorter);
    println!("longest: {}", best);
    println!("length: {}", best.len());

    // Structs holding references need lifetimes too.
    struct Excerpt<'a> { part: &'a str }
    let text = String::from("round forty-five");
    let ex = Excerpt { part: &text[6..] };
    println!("excerpt: {}", ex.part);
}
`),
    ex("rust2-ex-005", "Traits", "Definition, impl blocks, default methods.", "Traits & Generics", "traits_basics",
        `trait Describe {
    fn name(&self) -> String;
    fn detail(&self) -> String { format!("just {}", self.name()) }  // default
}

struct Server { host: String, port: u16 }
struct Client { id: String }

impl Describe for Server {
    fn name(&self) -> String { format!("{}:{}", self.host, self.port) }
    fn detail(&self) -> String { format!("serving on {}", self.name()) }
}

impl Describe for Client {
    fn name(&self) -> String { self.id.clone() }
}

fn main() {
    let things: Vec<Box<dyn Describe>> = vec![
        Box::new(Server { host: "0.0.0.0".into(), port: 8080 }),
        Box::new(Client { id: "cli-42".into() }),
    ];
    for t in &things {
        println!("{} :: {}", t.name(), t.detail());
    }
}
`),
    ex("rust2-ex-006", "Generic functions and structs", "Monomorphized generics with trait bounds.", "Traits & Generics", "generics_rust",
        `use std::fmt::Display;

fn print_all<T: Display>(items: &[T]) {
    for (i, x) in items.iter().enumerate() {
        print!("[{}] {} ", i, x);
    }
    println!();
}

struct Pair<T> { a: T, b: T }
impl<T: PartialOrd + Copy> Pair<T> {
    fn larger(&self) -> T { if self.a > self.b { self.a } else { self.b } }
}

fn main() {
    print_all(&[1, 2, 3]);
    print_all(&["a", "b"]);
    print_all(&[2.5, 1.5]);

    let p = Pair { a: 10, b: 20 };
    println!("larger: {}", p.larger());
}
`),
    ex("rust2-ex-007", "Iterators as values", "chains, collect into different containers.", "Iterators", "iterator_chains",
        `fn main() {
    let sum: i32 = (1..=10).filter(|n| n % 2 == 0).sum();
    println!("even sum: {}", sum);

    let squares: Vec<i32> = (1..=5).map(|n| n * n).collect();
    println!("{:?}", squares);

    let set: std::collections::BTreeSet<i32> = [3, 1, 4, 1, 5].iter().copied().collect();
    println!("{:?}", set);

    let joined: String = ["go", "is", "fun"]
        .iter().map(|s| s.to_uppercase()).collect::<Vec<_>>().join("-");
    println!("{}", joined);

    let total: i32 = vec![1, 2, 3].into_iter().fold(0, |acc, x| acc + x * 10);
    println!("folded: {}", total);
}
`),
    ex("rust2-ex-008", "Custom iterator", "impl Iterator for your own type.", "Iterators", "custom_iterator",
        `struct Fibonacci { a: u64, b: u64 }

impl Iterator for Fibonacci {
    type Item = u64;
    fn next(&mut self) -> Option<u64> {
        let out = self.a;
        let next = self.a.checked_add(self.b)?;
        self.a = self.b;
        self.b = next;
        Some(out)
    }
}

fn main() {
    let fib = Fibonacci { a: 1, b: 1 };
    println!("first 10: {:?}", fib.take(10).collect::<Vec<_>>());

    let big: Vec<u64> = Fibonacci { a: 1, b: 1 }
        .take_while(|n| *n < 100).collect();
    println!("under 100: {:?} ({} values)", big, big.len());
}
`),
    ex("rust2-ex-009", "Result and error handling", "propagation with ?, custom errors.", "Errors", "result_error",
        `#[derive(Debug)]
enum ParseError {
    Empty,
    NotANumber(String),
    OutOfRange(i32),
}

fn parse_age(text: &str) -> Result<i32, ParseError> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(ParseError::Empty);
    }
    let n: i32 = trimmed.parse().map_err(|_| ParseError::NotANumber(text.into()))?;
    if !(0..=150).contains(&n) {
        return Err(ParseError::OutOfRange(n));
    }
    Ok(n)
}

fn main() {
    for attempt in ["36", " 41 ", "", "abc", "200"] {
        match parse_age(attempt) {
            Ok(age) => println!("ok: {}", age),
            Err(e) => println!("rejected: {:?}", e),
        }
    }
}
`),
    ex("rust2-ex-010", "Option combinators", "map, and_then, unwrap_or, ok_or.", "Errors", "option_combinators",
        `fn find_index(s: &str, needle: char) -> Option<usize> {
    s.find(needle)
}

fn main() {
    let s = "praxis";

    println!("{:?}", find_index(s, 'x'));
    println!("{:?}", find_index(s, 'a'));
    println!("{}", find_index(s, 'a').unwrap_or(usize::MAX));

    let doubled = find_index(s, 'a').map(|i| i * 2);
    println!("{:?}", doubled);

    // and_then chains Options.
    let after = find_index(s, 'r').and_then(|i| s.get(i..i + 2).map(String::from));
    println!("{:?}", after);

    // ok_or turns Option into Result.
    let forced = find_index(s, 'z').ok_or("letter missing");
    println!("{:?}", forced);
}
`),
    ex("rust2-ex-011", "Box and dynamic dispatch", "trait objects behind a Box.", "Ownership & Borrowing", "boxed_traits",
        `trait Sound { fn speak(&self) -> &'static str; }

struct Cat;
struct Dog;
impl Sound for Cat { fn speak(&self) -> &'static str { "meow" } }
impl Sound for Dog { fn speak(&self) -> &'static str { "bark" } }

fn main() {
    let zoo: Vec<Box<dyn Sound>> = vec![
        Box::new(Cat),
        Box::new(Dog),
        Box::new(Cat),
    ];

    for animal in &zoo {
        println!("{}", animal.speak());
    }

    // Box fixes unsized types too.
    let large: Box<[u8]> = vec![0u8; 10].into_boxed_slice();
    println!("boxed slice of {}", large.len());
}
`),
    ex("rust2-ex-012", "Rc and RefCell", "Shared ownership + interior mutability.", "Ownership & Borrowing", "rc_refcell",
        `use std::cell::RefCell;
use std::rc::Rc;

fn main() {
    let shared = Rc::new(RefCell::new(vec![1, 2, 3]));

    let a = Rc::clone(&shared);
    let b = Rc::clone(&shared);

    a.borrow_mut().push(4);              // one mutable borrow at a time
    println!("count: {}", Rc::strong_count(&shared));

    b.borrow_mut().push(5);
    println!("contents: {:?}", shared.borrow());

    let value = Rc::new(42);
    let observers = vec![Rc::clone(&value), Rc::clone(&value)];
    println!("{} observers, value {}", observers.len(), value);
}
`),
    ex("rust2-ex-013", "String vs &str", "Owned buffers vs borrowed views.", "Strings", "string_str",
        `fn takes_str(text: &str) -> usize { text.len() }

fn main() {
    let owned = String::from("praxis");
    let literal = "literal";                     // &'static str

    println!("{} {} {}", owned, literal, owned.len());
    println!("{} {}", takes_str(&owned), takes_str(literal));

    // Concatenation flavors.
    let full = owned.clone() + " " + literal;
    println!("{}", full);

    let formatted = format!("{}-{}", "go", "rust");
    println!("{}", formatted);

    // Slices borrow pieces.
    println!("{} {}", &full[0..2], &full[full.len() - 4..]);
}
`),
    ex("rust2-ex-014", "String building", "push_str, insert, replace, split.", "Strings", "string_ops",
        `fn main() {
    let mut s = String::from("praxis");
    s.push_str(" ide");
    s.push('!');
    println!("{}", s);

    s.insert_str(0, "the ");
    println!("{}", s);

    println!("{}", s.replace("the", "a"));
    println!("{:?}", s.split(' ').collect::<Vec<_>>());

    println!("upper: {}", s.to_uppercase());
    println!("trimmed: [{}]", "  padded  ".trim());

    for (i, c) in s.char_indices().take(5) {
        println!("byte {} -> {}", i, c);
    }
    println!("chars: {} bytes: {}", s.chars().count(), s.len());
}
`),
    ex("rust2-ex-015", "Vec operations", "push, retain, drain, windows, chunks.", "Collections", "vec_ops",
        `fn main() {
    let mut v = vec![3, 1, 4, 1, 5];

    v.push(9);
    v.insert(0, 2);
    println!("{:?}", v);

    v.retain(|x| x % 2 == 1);          // keep odds
    println!("odds: {:?}", v);

    let mut numbers = vec![1, 2, 3, 4, 5];
    let drained: Vec<i32> = numbers.drain(1..3).collect();
    println!("drained {:?} left {:?}", drained, numbers);

    let data = [1, 2, 3, 4, 5];
    println!("windows: {:?}", data.windows(2).collect::<Vec<_>>());
    println!("chunks: {:?}", data.chunks(2).collect::<Vec<_>>());

    numbers.sort_unstable();
    println!("sorted: {:?}", numbers);
}
`),
    ex("rust2-ex-016", "HashMap", "entry API, counting, iteration order.", "Collections", "hashmap_ops",
        `use std::collections::HashMap;

fn main() {
    let text = "go go is fun go runs everywhere fun times";
    let mut counts: HashMap<&str, u32> = HashMap::new();

    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    println!("{:?}", counts);

    let mut ages = HashMap::new();
    ages.insert("ada", 36);
    ages.insert("alan", 41);

    println!("{:?}", ages.get("ada"));
    println!("{}", ages.get("grace").copied().unwrap_or(0));

    ages.remove("alan");
    println!("keys left: {}", ages.len());

    let mut ordered: Vec<_> = counts.iter().collect();
    ordered.sort_by(|a, b| b.1.cmp(a.1));
    println!("top: {:?} with {}x", ordered[0].0, ordered[0].1);
}
`),
    ex("rust2-ex-017", "BTreeMap and HashSet", "Sorted maps, membership sets.", "Collections", "btreemap_set",
        `use std::collections::{BTreeMap, HashSet};

fn main() {
    let mut sorted = BTreeMap::new();
    sorted.insert("zulu", 26);
    sorted.insert("alpha", 1);
    sorted.insert("mike", 13);
    // Iteration is ALWAYS key-sorted.
    for (k, v) in &sorted { println!("{} = {}", k, v); }

    let a: HashSet<_> = [1, 2, 3, 4].iter().copied().collect();
    let b: HashSet<_> = [3, 4, 5, 6].iter().copied().collect();

    println!("{:?}", a.union(&b).collect::<Vec<_>>());
    println!("{:?}", a.intersection(&b).collect::<Vec<_>>());
    println!("{}", a.contains(&3), a.is_disjoint(&[9].iter().copied().collect()));
}
`),
    ex("rust2-ex-018", "Enums with data", "Algebraic data types + exhaustive matches.", "Enums", "data_enums",
        `enum Shape {
    Circle { r: f64 },
    Rect { w: f64, h: f64 },
    Empty,
}

fn area(s: &Shape) -> f64 {
    match s {
        Shape::Circle { r } => std::f64::consts::PI * r * r,
        Shape::Rect { w, h } => w * h,
        Shape::Empty => 0.0,
    }
}

fn main() {
    let shapes = vec![
        Shape::Circle { r: 1.0 },
        Shape::Rect { w: 3.0, h: 4.0 },
        Shape::Empty,
    ];

    let mut total = 0.0;
    for s in &shapes {
        let a = area(s);
        println!("area {:.3}", a);
        total += a;
    }
    println!("total {:.3}", total);
}
`),
    ex("rust2-ex-019", "Pattern matching power", "Guards, ranges, binding, tuples, nested.", "Enums", "patterns",
        `fn classify(v: i32) -> &'static str {
    match v {
        n if n < 0 => "negative",
        0 => "zero",
        1 | 2 | 3 => "small",
        4..=9 => "medium",
        _ => "large",
    }
}

fn main() {
    for v in [-5, 0, 2, 7, 99] {
        println!("{} -> {}", v, classify(v));
    }

    let pair = (1, "go");
    match pair {
        (0, _) => println!("zero head"),
        (n, s) if n == 1 => println!("one {}", s),
        (_, s) => println!("other {}", s),
    }

    if let Some(x) = Some(42) { println!("if let saw {}", x); }
    while let Some(n) = { None::<i32> } { println!("{}", n); }
    let _ = 3; // ignore binding
}
`),
    ex("rust2-ex-020", "Closures", "Three capture modes, Fn/FnMut/FnOnce.", "Functions", "closures_rust",
        `fn main() {
    let factor = 3;

    // Borrows factor (Fn).
    let scaled = |x: i32| x * factor;
    println!("{}", scaled(10));

    // Mutable state (FnMut).
    let mut count = 0;
    let mut tally = || { count += 1; count };
    tally(); tally();
    println!("counted {}", tally());

    // Consuming (FnOnce).
    let name = String::from("praxis");
    let consume = move || format!("[{}]", name);
    println!("{}", consume());

    // Passing closures into functions.
    fn apply<F: Fn(i32) -> i32>(f: F, v: i32) -> i32 { f(v) }
    println!("{}", apply(|x| x + 1, 41));
}
`),
    ex("rust2-ex-021", "Functions and impl blocks", "Associated functions vs methods.", "Functions", "impl_blocks",
        `struct Counter { value: u32 }

impl Counter {
    fn new() -> Self { Counter { value: 0 } }          // associated fn
    fn bump(&mut self) -> &mut Self { self.value += 1; self }
    fn value(&self) -> u32 { self.value }
}

impl Default for Counter {
    fn default() -> Self { Self::new() }
}

fn main() {
    let mut c = Counter::new();
    c.bump().bump().bump();
    println!("{}", c.value());

    let d = Counter::default();
    println!("{} {}", d.value(), d.value() == 0);

    fn add(a: i32, b: i32) -> i32 { a + b }
    println!("{}", add(3, 4));
}
`),
    ex("rust2-ex-022", "Slices", "Str and array views without ownership.", "Arrays & Slices", "slices",
        `fn sum_all(nums: &[i32]) -> i32 { nums.iter().sum() }

fn first_word(s: &str) -> &str {
    match s.find(' ') {
        Some(i) => &s[..i],
        None => s,
    }
}

fn main() {
    let v = vec![1, 2, 3, 4, 5];
    println!("{} {}", sum_all(&v), sum_all(&v[1..4]));

    println!("[{}]", first_word("hello world"));
    println!("[{}]", first_word("single"));

    let data: [u8; 4] = [10, 20, 30, 40];
    let mid: &[u8] = &data[1..3];
    println!("{:?}", mid);
    println!("{}", data.len());
}
`),
    ex("rust2-ex-023", "Arrays and tuples", "Fixed arrays, tuple destructuring.", "Arrays & Slices", "arrays_tuples",
        `fn main() {
    let grid: [[u8; 3]; 2] = [[1, 2, 3], [4, 5, 6]];
    println!("{:?} {}", grid, grid[1][2]);

    let mut total = 0;
    for row in &grid { for cell in row { total += cell; } }
    println!("sum {}", total);

    let point = (3.0, 4.0);
    let (x, y) = point;
    println!("{} {} hypot {:.2}", x, y, (x * x + y * y).sqrt());

    let mixed = (1, "two", 3.0, [4]);
    println!("{} {} {} {}", mixed.0, mixed.1, mixed.2, mixed.3[0]);

    let unit = ();
    println!("{:?}", unit);
}
`),
    ex("rust2-ex-024", "Formatting output", "{}, {:?}, width/precision, named args.", "Input & Output", "formatting",
        `struct Server { host: String, port: u16 }

fn main() {
    let s = Server { host: "0.0.0.0".into(), port: 8080 };
    println!("{} on {}", s.host, s.port);
    println!("{:?}", (s.host.as_str(), s.port));

    println!("[{:>8}] [{:<8}] [{:^8}]", "r", "l", "c");
    println!("{:08.3}", 3.14159);
    println!("{:?}", vec![1, 2, 3]);
    println!("{:#?}", vec![1, 2, 3]);

    println!("{round} {of} {total}", round = 45, of = "of", total = "Praxis");
    println!("binary {:b} hex {:x} oct {:o}", 10, 255, 8);
}
`),
    ex("rust2-ex-025", "File IO", "fs::write/read, BufReader lines.", "Input & Output", "file_io",
        `use std::fs;
use std::io::{BufRead, BufReader, Write};

fn main() -> std::io::Result<()> {
    let path = "/tmp/praxis_rust.txt";

    fs::write(path, "line one\\nline two\\n")?;
    let content = fs::read_to_string(path)?;
    println!("read back {} bytes", content.len());

    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);
    for (i, line) in reader.lines().enumerate() {
        println!("{}: {}", i, line?);
    }

    let mut out = fs::File::create(path)?;
    writeln!(out, "overwritten")?;
    drop(out);

    fs::remove_file(path)?;
    println!("exists: {}", std::path::Path::new(path).exists());
    Ok(())
}
`),
    ex("rust2-ex-026", "Command arguments", "args(), env::var, exit codes.", "Input & Output", "args_env",
        `use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    println!("argv[0] basename: {}", args[0].rsplit('/').next().unwrap_or(&args[0]));

    // Simulated flags (real main would parse the real args vector).
    let flags = ["--verbose", "--top=3"];
    println!("verbose? {}", flags.iter().any(|f| f == "--verbose"));

    match env::var("HOME") {
        Ok(home) => println!("home set ({} chars)", home.len()),
        Err(_) => println!("home unset"),
    }

    env::set_var("PRAXIS_SESSION", "session-1");
    println!("session: {}", env::var("PRAXIS_SESSION").unwrap_or_default());

    std::process::Command::new("echo")
        .arg("spawned").status().ok();
}
`),
    ex("rust2-ex-027", "Threads", "spawn, join, move closures.", "Concurrency", "threads_rust",
        `use std::thread;

fn main() {
    let data = vec![1, 2, 3];

    // 'move' transfers ownership into the thread.
    let handle = thread::spawn(move || {
        let total: i32 = data.iter().sum();
        println!("thread computed {}", total);
    });
    handle.join().unwrap();

    let handles: Vec<_> = (1..=3).map(|id| {
        thread::spawn(move || format!("worker {}", id))
    }).collect();
    for h in handles { println!("{}", h.join().unwrap()); }
}
`),
    ex("rust2-ex-028", "Channels", "mpsc sender/receiver pipeline.", "Concurrency", "channels_rust",
        `use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    // Clone the sender for several producers.
    for id in 1..=3 {
        let tx = tx.clone();
        thread::spawn(move || {
            tx.send(format!("msg from {}", id)).unwrap();
        });
    }
    drop(tx);                                   // all senders done

    let mut got = 0;
    while let Ok(m) = rx.recv() {
        println!("received: {}", m);
        got += 1;
    }
    println!("total messages: {}", got);
}
`),
    ex("rust2-ex-029", "Arc, Mutex and atomic", "Shared counting under threads.", "Concurrency", "mutex_atomic",
        `use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let atomic = Arc::new(AtomicUsize::new(0));

    let handles: Vec<_> = (0..4).map(|_| {
        let c = Arc::clone(&counter);
        let a = Arc::clone(&atomic);
        thread::spawn(move || {
            for _ in 0..1000 {
                *c.lock.unwrap += 1;
                a.fetch_add(1, Ordering::Relaxed);
            }
        })
    }).collect();
    for h in handles { h.join().unwrap(); }

    println!("mutex count: {}", *counter.lock().unwrap());
    println!("atomic count: {}", atomic.load(Ordering::Relaxed));
}
`),
    ex("rust2-ex-030", "Cell and OnceLock", "Interior mutability + one-time init.", "Concurrency", "once_cell",
        `use std::cell::Cell;
use std::sync::OnceLock;

fn main() {
    // Cell works for Copy data without locking.
    let hits = Cell::new(0);
    let bump = || { hits.set(hits.get() + 1); };
    bump(); bump(); bump();
    println!("cell hits: {}", hits.get());

    // OnceLock computes once, then reuses.
    static CONFIG: OnceLock<String> = OnceLock::new();
    let value = CONFIG.get_or_init(|| "praxis-session-1".to_string());
    println!("first init: {}", value);
    println!("same pointer: {}", std::ptr::eq(value, CONFIG.get().unwrap()));
}
`),
    ex("rust2-ex-031", "Instant and Duration", "Stopwatch timing, sleeps.", "Time & Random", "timing_rust",
        `use std::thread::sleep;
use std::time::{Duration, Instant};

fn main() {
    let start = Instant::now();
    sleep(Duration::from_millis(20));
    let elapsed = start.elapsed();

    println!("slept {:?}", elapsed);
    println!("as ms: {}", elapsed.as_millis());
    println!("as micros: {}", elapsed.as_micros());

    let d = Duration::from_secs(90);
    println!("{:?} = {} min {} s", d, d.as_secs() / 60, d.as_secs() % 60);

    println!("{} seconds since epoch", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs());
}
`),
    ex("rust2-ex-032", "Random by hand", "An LCG - no external crates needed.", "Time & Random", "random_rust",
        `struct Lcg { state: u64 }
impl Lcg {
    fn new(seed: u64) -> Self { Lcg { state: seed } }
    fn next_u32(&mut self) -> u32 {
        // Numerical Recipes constants.
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.state >> 33) as u32
    }
    fn range(&mut self, lo: u32, hi: u32) -> u32 { lo + self.next_u32() % (hi - lo + 1) }
}

fn main() {
    let mut rng = Lcg::new(42);
    println!("dice: {:?}", (0..5).map(|_| rng.range(1, 6)).collect::<Vec<_>>());

    let mut again = Lcg::new(42);
    println!("re-seeded match: {}", again.range(1, 6) == (rng.range(1, 6) + 0));

    // Shuffle with Fisher-Yates over the same generator.
    let mut deck: Vec<u8> = (1..=9).collect();
    for i in (1..deck.len()).rev() {
        let j = rng.range(0, i as u32) as usize;
        deck.swap(i, j);
    }
    println!("shuffled: {:?}", deck);
}
`),
    ex("rust2-ex-033", "Command-line mini-parser", "flags + key=value by hand.", "Time & Random", "mini_argparse",
        `use std::collections::HashMap;

fn parse(argv: &[String]) -> (HashMap<String, String>, Vec<String>) {
    let mut options = HashMap::new();
    let mut positional = Vec::new();
    for arg in argv {
        if let Some(rest) = arg.strip_prefix("--") {
            if let Some(eq) = rest.find('=') {
                options.insert(rest[..eq].into(), rest[eq + 1..].into());
            } else {
                options.insert(rest.into(), "true".into());
            }
        } else {
            positional.push(arg.clone());
        }
    }
    (options, positional)
}

fn main() {
    let argv = vec!["--verbose".to_string(), "--top=3".to_string(), "report.txt".to_string()];
    let (opts, positional) = parse(&argv);

    println!("verbose: {}", opts.get("verbose").map(|s| s == "true").unwrap_or(false));
    println!("top: {}", opts.get("top").unwrap_or(&"5".to_string()));
    println!("targets: {:?}", positional);
}
`),
    ex("rust2-ex-034", "Hashing with DefaultHasher", "std-only hashing.", "Time & Random", "hashing_rust",
        `use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

fn main() {
    let mut h1 = DefaultHasher::new();
    "praxis".hash(&mut h1);
    let first = h1.finish();

    let mut h2 = DefaultHasher::new();
    "praxis".hash(&mut h2);
    let second = h2.finish();

    println!("same input, same hash: {}", first == second);
    println!("hash value: {:x}", first);

    let mut h3 = DefaultHasher::new();
    (1u8, "tuple", 3.0f64).hash(&mut h3);
    println!("tuple hash: {:x}", h3.finish());
}
`),
    ex("rust2-ex-035", "Serde-free struct printing", "Debug formatting by hand.", "Time & Random", "debug_impl",
        `struct Reading { city: &'static str, temp: i32 }

impl std::fmt::Display for Reading {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{} at {}C", self.city, self.temp)
    }
}

fn main() {
    let rows = vec![
        Reading { city: "Cairo", temp: 34 },
        Reading { city: "Oslo", temp: 12 },
        Reading { city: "Sydney", temp: 26 },
    ];

    for r in &rows {
        println!("{}", r);
    }

    let mean = rows.iter().map(|r| r.temp).sum::<i32>() as f64 / rows.len() as f64;
    println!("mean: {:.1}", mean);
    println!("coldest: {}", rows.iter().min_by_key(|r| r.temp).unwrap());
}
`),
    ex("rust2-ex-036", "A mini test harness", "assert + failure tally.", "Testing", "mini_tests_rust",
        `fn clamp(v: i32, lo: i32, hi: i32) -> i32 { v.max(lo).min(hi) }

fn main() {
    let cases = [
        ("inside", clamp(5, 0, 10), 5),
        ("below", clamp(-3, 0, 10), 0),
        ("above", clamp(99, 0, 10), 10),
        ("edge", clamp(0, 0, 10), 0),
    ];

    let mut pass = 0;
    for (name, got, want) in cases {
        let ok = got == want;
        println!("{} {} (got {} want {})",
            if ok { "  ok  " } else { "  FAIL" }, name, got, want);
        pass += ok as usize;
    }
    println!("{}/{} passed", pass, cases.len());

    assert!(pass == cases.len(), "all green");
}
`),
    ex("rust2-ex-037", "A retry helper", "closure-based retries with backoff.", "Testing", "retry_rust",
        `use std::thread::sleep;
use std::time::Duration;

fn retry<T>(times: u32, mut action: impl FnMut(u32) -> Result<T, String>) -> Option<T> {
    for attempt in 1..=times {
        match action(attempt) {
            Ok(v) => return Some(v),
            Err(e) => {
                println!("  attempt {} failed: {}", attempt, e);
                if attempt < times {
                    sleep(Duration::from_millis(u64::from(10 * (1 << (attempt - 1)))));
                }
            }
        }
    }
    None
}

fn main() {
    let mut calls = 0;
    let result = retry(4, |n| {
        calls += 1;
        if calls < 3 {
            Err(format!("flaky #{}", n))
        } else {
            Ok(format!("success on call {}", calls))
        }
    });
    println!("result: {:?}", result);
}
`),
    ex("rust2-ex-038", "A mini logger", "leveled, lock-free println.", "Testing", "logger_rust",
        `use std::sync::atomic::{AtomicU8, Ordering};

static MIN_LEVEL: AtomicU8 = AtomicU8::new(1);      // INFO

fn log(level: &str, order: u8, msg: &str) {
    if order < MIN_LEVEL.load(Ordering::Relaxed) { return; }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    println!("[{}] {:<5} {} (epoch {})", stamp % 86_400, level, msg, stamp);
}

fn main() {
    log("DEBUG", 0, "suppressed by the level");
    log("INFO", 1, "service started");
    log("WARN", 2, "disk at 91%");
    log("ERROR", 3, "mirror sync failed");

    MIN_LEVEL.store(0, Ordering::Relaxed);
    log("DEBUG", 0, "now visible");
}
`),
    ex("rust2-ex-039", "A wordstats tool", "count, sort, rank - all stdlib.", "Testing", "wordstats_rust",
        `use std::collections::HashMap;

fn main() {
    let text = "go go is fun go runs everywhere fun times";

    let mut counts: HashMap<&str, usize> = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }

    let mut ranked: Vec<(&str, usize)> = counts.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));

    println!("unique words: {}", ranked.len());
    for (word, n) in ranked.iter().take(3) {
        println!("{:<12} {}x", word, n);
    }

    let longest = text.split_whitespace().max_by_key(|w| w.len()).unwrap();
    println!("longest: {}", longest);
}
`),
    ex("rust2-ex-040", "A prime toolkit", "is_prime, next_prime, factorization.", "Testing", "primes_rust",
        `fn is_prime(n: u64) -> bool {
    if n < 2 { return false; }
    let mut i = 2;
    while i * i <= n {
        if n % i == 0 { return false; }
        i += 1;
    }
    true
}

fn next_prime(n: u64) -> u64 {
    let mut c = n + 1;
    while !is_prime(c) { c += 1; }
    c
}

fn factors(mut n: u64) -> Vec<u64> {
    let mut out = Vec::new();
    let mut p = 2;
    while p * p <= n {
        while n % p == 0 { out.push(p); n /= p; }
        p += 1;
    }
    if n > 1 { out.push(n); }
    out
}

fn main() {
    let primes: Vec<u64> = (1..=30).filter(|n| is_prime(*n)).collect();
    println!("{:?}", primes);
    println!("next after 13: {}", next_prime(13));
    println!("{:?} (product {})", factors(360),
        factors(360).into_iter().product::<u64>());
}
`),
    ex("rust2-ex-041", "A queue and stack", "VecDeque and the push/pop idiom.", "Testing", "stack_queue_rust",
        `use std::collections::VecDeque;

fn main() {
    let mut stack: Vec<i32> = Vec::new();
    stack.push(1);
    stack.push(2);
    stack.push(3);
    println!("pop {} peek {:?}", stack.pop().unwrap(), stack.last());

    let mut queue: VecDeque<String> = VecDeque::new();
    queue.push_back("first".into());
    queue.push_back("second".into());
    queue.push_front("zero".into());

    println!("front: {:?}", queue.front());
    println!("pop front: {:?}", queue.pop_front());
    println!("len: {}", queue.len());

    // A sliding window over a VecDeque.
    let window: VecDeque<i32> = (1..=5).collect();
    let sums: Vec<i32> = (0..=window.len() - 3)
        .map(|i| window[i] + window[i + 1] + window[i + 2])
        .collect();
    println!("window sums: {:?}", sums);
}
`),
    ex("rust2-ex-042", "A stats sampler tool", "generated data, summaries, histogram bars.", "Testing", "stats_sampler_rust",
        `fn lcg(seed: u64) -> impl FnMut() -> i64 {
    let mut state = seed;
    move || {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((state >> 33) as i64 % 40) - 20          // -20..19
    }
}

fn main() {
    let mut next = lcg(45);
    let data: Vec<i64> = (0..200).map(|_| next()).collect();

    let n = data.len() as f64;
    let sum: i64 = data.iter().sum();
    let mean = sum as f64 / n;
    let var = data.iter().map(|x| (x - mean).pow(2)).sum::<f64>() / n;

    println!("n = {}", data.len());
    println!("mean = {:.2} std = {:.2}", mean, var.sqrt());
    println!("range = {} .. {}", data.iter().min().unwrap(), data.iter().max().unwrap());

    let mut bins = std::collections::BTreeMap::new();
    for v in &data { *bins.entry(v / 10).or_insert(0u32) += 1; }
    for (bin, count) in bins {
        println!("{:>4} | {} ({})", bin * 10, "#".repeat(count as usize), count);
    }
}
`),
];
