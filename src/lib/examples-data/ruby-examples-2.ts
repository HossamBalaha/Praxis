/**
 * the Ruby top-up: 40 more reference templates on top of the
 * ten more ("at least 50 like others". Pure Ruby corelib.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Ruby";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("ruby", id, label, description, CAT, sub, baseName, ".rb", () => body);

export const RUBY_2_EXAMPLES: FileExample[] = [
    ex("ruby2-ex-001", "Symbols and freezing", "Symbol identity, frozen strings, mutability.", "Language Core", "symbols_freeze",
        `# Symbols are interned identity; strings are mutable data.
name_sym = :praxis
name_str = "praxis"

puts name_sym.object_id == :praxis.object_id   # true - one symbol
puts name_str.object_id == "praxis".object_id  # false - new string

frozen = "immutable".freeze
begin
  frozen << "!"
rescue FrozenError => e
  puts "frozen: #{e.class}"
end

puts "equal content: #{name_str == :praxis.to_s}"
`),
    ex("ruby2-ex-002", "Blocks, procs, lambdas", "The three callable flavors and their arity rules.", "Language Core", "blocks_procs",
        `# A block is syntax; a proc/lambda is an object.
def twice
  yield
  yield
end
twice { puts "block runs" }

add = ->(a, b) { a + b }                # lambda: strict arity
flex = proc { |a, b| [a, b].compact }   # proc: lenient
puts add.call(3, 4)
puts flex.call(1).inspect

# The & sigil reuses a proc AS a block.
items = [3, 1, 4]
puts items.map(&add.curry[1]).inspect     # [4, 2, 5]
puts [1, 2, 3].map { _1 * 10 }.inspect    # numbered params (2.7+)
`),
    ex("ruby2-ex-003", "Method objects", "method(:name) + define_method metaprogramming.", "Language Core", "method_objects",
        `def shout(text)
  text.upcase + "!"
end

m = method(:shout)
puts m.call("praxis")
puts m.arity

class Toolkit
  [:bump, :drop].each do |verb|
    define_method(verb) { |n| n.send(verb == :bump ? :+ : :-, 1) }
  end
end

tool = Toolkit.new
puts tool.bump(10)
puts tool.drop(10)
puts Toolkit.instance_methods(false).inspect
`),
    ex("ruby2-ex-004", "Hashes in depth", "default procs, dig, transform, keyword args.", "Collections", "hashes_deep",
        `counts = Hash.new { |h, k| h[k] = 0 }
%w[a b a c a].each { |w| counts[w] += 1 }
puts counts.inspect

nested = { app: { name: "praxis", ports: [8080, 8443] } }
puts nested.dig(:app, :name)
puts nested.dig(:app, :ports, 1)
puts nested.dig(:app, :missing, :deeper).inspect   # nil, no crash

conf = { host: "127.0.0.1", port: 9090 }
puts conf.transform_values(&:to_s).inspect
puts conf.map { |k, v| "#{k}=#{v}" }.join(" ")

def connect(host:, port: 8080) = "#{host}:#{port}"
puts connect(host: "db")
`),
    ex("ruby2-ex-005", "Structs and Data", "Struct vs Data (Ruby 3.2+ immutable).", "Collections", "struct_data",
        `Point = Struct.new(:x, :y) do
  def +(other) = self.class.new(x + other.x, y + other.y)
end

p1 = Point.new(1, 2)
p2 = Point.new(3, 4)
puts (p1 + p2).inspect

Rect = Data.define(:w, :h) do
  def area = w * h
end

r = Rect.new(w: 3, h: 4)
puts r.area
begin
  r.w = 99
rescue NoMethodError
  puts "Data is immutable - attributes have no writers"
end
`),
    ex("ruby2-ex-006", "Set operations", "Set ops over arrays: union, intersection, difference.", "Collections", "sets",
        `require "set"

a = [1, 2, 3, 4]
b = [3, 4, 5, 6]

puts (a | b).inspect          # union
puts (a & b).inspect          # intersection
puts (a - b).inspect          # difference

sa = a.to_set
sa.add(99)
puts sa.include?(99), sa.size

words = %w[go go is fun]
unique = words.to_set
puts unique.to_a.inspect
puts words.tally.inspect
`),
    ex("ruby2-ex-007", "Enumerable from scratch", "Include Enumerable, define each, get 20+ methods.", "Collections", "enumerable",
        `class Countdown
  include Enumerable

  def initialize(from) = @from = from

  def each
    return to_enum(:each) unless block_given?
    n = @from
    while n >= 0
      yield n
      n -= 1
    end
  end
end

c = Countdown.new(4)
puts c.to_a.inspect
puts c.select(&:even?).inspect
puts c.map { |n| n * n }.inspect
puts c.include?(2)
puts c.min, c.max
puts c.sort.first
puts c.sum
`),
    ex("ruby2-ex-008", "Lazy enumerators", "Infinite sequences evaluated on demand.", "Collections", "lazy_enum",
        `naturals = (1..Float::INFINITY).lazy

squares = naturals.map { |n| n * n }
puts squares.first(5).inspect

# Take WHILE over infinity - only computed as far as needed.
puts naturals.select(&:even?).first(3).inspect

words = %w[alpha beta gamma].lazy.map(&:upcase)
puts words.take(2).to_a.inspect
`),
    ex("ruby2-ex-009", "Pattern matching", "case/in with destructuring and guards.", "Pattern Matching", "case_in",
        `inputs = [
  { kind: :point, x: 3, y: 4 },
  { kind: :circle, r: 2 },
  { kind: :pair, a: 1, b: 2 },
]

inputs.each do |input|
  result = case input
  in { kind: :point, x:, y: } then "point(#{x}, #{y})"
  in { kind: :circle, r: } then r > 1 ? "big circle" : "small circle"
  in { kind: :pair, a:, b: } then a + b
  else "unknown"
  end
  puts result
end

# Array patterns with rest.
list = [1, 2, 3, 4, 5]
list => [first, *rest]
puts "#{first} then #{rest.inspect}"
`),
    ex("ruby2-ex-010", "Right-hand and one-line patterns", "The => binding + pattern guards.", "Pattern Matching", "right_patterns",
        `config = { db: { host: "localhost", port: 5432 }, app: "praxis" }

config => { db: { host:, port: } }
puts "db at #{host}:#{port}"

case 42
in Integer => n if n > 10 then puts "big int: #{n}"
in Integer then puts "small int"
end

point = [3, 4]
point => [x, y]
puts "hypot: #{Math.hypot(x, y).round(2)}"

# Hash-only pattern on an array would raise - the guard prevents that.
value = { ok: true }
if value in { ok: true }
  puts "destructured bool with no exception"
end
`),
    ex("ruby2-ex-011", "Exceptions done right", "Custom hierarchies, ensure, retry.", "Errors", "exceptions",
        `class ValidationError < StandardError
  attr_reader :field
  def initialize(field, rule) = super("invalid #{field}: #{rule}")
end

def validate(age)
  raise ValidationError.new("age", "negative") if age.negative?
  raise ValidationError.new("age", "too high") if age > 150
  "ok"
end

[36, -1, 200].each do |age|
  begin
    puts validate(age)
  rescue ValidationError => e
    puts "rejected: #{e.message} (#{e.field})"
  ensure
    puts "  checked #{age}"
  end
end
`),
    ex("ruby2-ex-012", "Custom comparable", "Include Comparable + <=> for free ordering.", "Language Core", "comparable",
        `class Version
  include Comparable
  attr_reader :parts

  def initialize(s) = @parts = s.split(".").map(&:to_i)

  def <=>(other)
    parts <=> other.parts
  end
  def to_s = parts.join(".")
end

versions = [Version.new("1.9"), Version.new("1.10"), Version.new("1.2")]
puts versions.sort.map(&:to_s).inspect
puts Version.new("2.0") > Version.new("1.99")
puts versions.min.to_s, versions.max.to_s
puts Version.new("1.0").between?(versions.min, versions.max)
`),
    ex("ruby2-ex-013", "Modules and mixins", "Namespace, mixin methods, extend self.", "Classes", "modules",
        `module Formatting
  def bracket(text) = "[#{text}]"
  def pad(text, n) = text.rjust(n)
end

class Report
  include Formatting
  def initialize(title) = @title = title
  def header = pad(bracket(@title), 12)
end

puts Report.new("demo").header

module Utilities
  extend self
  def slug(text) = text.downcase.tr(" ", "-")
end

puts Utilities.slug("Praxis IDE Round")
puts Utilities.respond_to?(:slug)
`),
    ex("ruby2-ex-014", "Attribute macros", "attr_accessor + initialization in modern form.", "Classes", "attr_macros",
        `class Employee
  attr_reader :name, :salary
  attr_accessor :dept

  def initialize(name, salary, dept)
    @name, @salary, @dept = name, salary, dept
  end

  def with_raise(percent)
    self.class.new(name, salary * (1 + percent / 100.0), dept)
  end

  def to_s = "#{name} (#{dept}) earns #{salary.round(2)}"
end

e = Employee.new("Ada", 100.0, "eng")
puts e
puts e.with_raise(10)
e.dept = "research"
puts e.dept
`),
    ex("ruby2-ex-015", "Inheritance and super", "Method chains with inherited state.", "Classes", "inheritance",
        `class Storage
  def initialize = @items = []
  def add(item)
    @items << item
    self
  end
  def count = @items.size
end

class AuditedStorage < Storage
  def initialize
    super
    @log = []
  end

  def add(item)
    @log << "add #{item}"
    super
  end

  def audit = @log.join("; ")
end

s = AuditedStorage.new
s.add("a").add("b")
puts s.count
puts s.audit
puts s.is_a?(Storage)
`),
    ex("ruby2-ex-016", "Hooks: inherited and method_missing", "Class + object lifecycle callbacks.", "Classes", "hooks",
        `class Base
  def self.inherited(subclass)
    puts "subclass created: #{subclass}"
  end
end

class Doc < Base; end
class Sheet < Base; end

class Flexible
  def method_missing(name, *args)
    if name.to_s.start_with?("get_")
      "value of #{name.to_s.sub('get_', '')}"
    else
      super
    end
  end

  def respond_to_missing?(name, _ = false)
    name.to_s.start_with?("get_") || super
  end
end

f = Flexible.new
puts f.get_status
puts f.respond_to?(:get_anything)
`),
    ex("ruby2-ex-017", "Ranges and flip-flops", "Range objects as data + conditions.", "Language Core", "ranges",
        `r = (1..5)
puts r.include?(3)
puts r.cover?(3.5)          # continuous span
puts r.step(2).to_a.inspect
puts r.to_a.inspect

puts (1...5).size           # exclusive end

# Character ranges and case statements.
grade = 87
letter = case grade
  when 90.. then "A"
  when 80...90 then "B"
  else "C"
end
puts letter

# Range as a flip-flop style scanner.
lines = %w[start a b end start c end]
lines.each do |l|
  puts "in section: #{l}" if l == "start" .. l == "end"
end
`),
    ex("ruby2-ex-018", "Numbers and rationality", "Integer division, rational arithmetic, big numbers.", "Numbers", "numbers",
        `puts 7 / 2               # integer division
puts 7.fdiv(2)           # float division
puts 7 % 2
puts 2**10
puts 2**200              # arbitrary precision built-in

r = Rational(3, 4)
puts r, r + Rational(1, 4)
puts r.to_f

puts 0.1 + 0.2
puts (0.1 + 0.2).round(2)
puts 1_000_000           # underscores for readability
puts 0b1010, 0xff, 0o17
`),
    ex("ruby2-ex-019", "Time and date", "Time arithmetic, formatting, zones.", "Dates & Time", "time",
        `require "time"

now = Time.now
puts now.strftime("%Y-%m-%d %H:%M:%S")
puts now.year, now.month, now.wday

release = Time.parse("2024-06-15 09:30")
puts ((release - now) / 86_400).round(1), "days apart"

puts (now + 3600).strftime("%H:%M plus an hour")

utc = Time.parse("2024-06-15 09:30 UTC")
puts utc.getlocal("+02:00").strftime("%H:%M local+2")

puts Time.parse("2024-06-15").yday
`),
    ex("ruby2-ex-020", "Files and IO", "read/write, exists?, directory iteration.", "Files & IO", "file_io",
        `require "fileutils"

dir = File.join(Dir.tmpdir, "praxis_ruby")
FileUtils.mkdir_p(dir)
path = File.join(dir, "notes.txt")

File.write(path, "line one\\nline two\\n")
puts File.exist?(path)
puts File.size(path)
puts File.readlines(path).count

File.open(path, "a") { |f| f.puts "appended" }
puts File.read(path)

FileUtils.cp(path, "#{path}.bak")
puts Dir.children(dir).inspect

FileUtils.rm_r(dir)
puts File.exist?(dir)
`),
    ex("ruby2-ex-021", "Directory walking", "Find + glob patterns.", "Files & IO", "walk",
        `require "fileutils"

root = File.join(Dir.tmpdir, "praxis_walk")
FileUtils.mkdir_p(File.join(root, "inner"))
FileUtils.touch(File.join(root, "top.txt"))
FileUtils.touch(File.join(root, "inner", "deep.txt"))

# Recursive find.
count = Dir.glob(File.join(root, "**", "*")).count { |p| File.file?(p) }
puts "files found: #{count}"

Dir.glob(File.join(root, "**", "*.txt")).each do |f|
  puts File.basename(f)
end

# Children of one level.
puts Dir.children(root).inspect

FileUtils.rm_r(root)
`),
    ex("ruby2-ex-022", "Temp files and streams", "Tempfile + StringIO (file-like without disk).", "Files & IO", "temp_io",
        `require "tempfile"

temp = Tempfile.new("praxis")
temp.puts "buffered write"
temp.rewind
puts temp.read
temp.close
temp.unlink                    # removed from disk

io = StringIO.new("in-memory text")
puts io.readline
io.rewind
puts io.read.split(" ").length
puts io.string.upcase

# A block-scoped tempfile removes itself even on exceptions.
Tempfile.create do |t|
  t.write("auto cleanup")
  t.rewind
  puts t.read
end
`),
    ex("ruby2-ex-023", "CSV", "stdlib CSV read/write with headers.", "Data Formats", "csv",
        `require "csv"
require "tempfile"

t = Tempfile.new("praxis_csv")

CSV.open(t.path, "w") do |csv|
  csv << %w[name score]
  csv << %w[ada 92]
  csv << %w[alan 81]
end

rows = CSV.read(t.path, headers: true)
rows.each { |row| puts "#{row["name"]} scored #{row["score"]}" }
puts rows.map { |r| r["score"].to_i }.sum / rows.size.to_f

t.unlink
puts "csv round trip done"
`),
    ex("ruby2-ex-024", "JSON", "generate/parse with symbol keys and pretty printing.", "Data Formats", "json",
        `require "json"

data = {
  app: "praxis",
  round: 45,
  langs: %w[ruby powershell batch],
}

puts JSON.pretty_generate(data)

back = JSON.parse(JSON.generate(data), symbolize_names: true)
puts back[:langs].inspect
puts back.dig(:langs, 1)

broken = "{ not json ]"
begin
  JSON.parse(broken)
rescue JSON::ParserError => e
  puts "parse error caught: #{e.class}"
end
`),
    ex("ruby2-ex-025", "YAML", "Psych round trip and safe_load.", "Data Formats", "yaml",
        `require "yaml"
require "json"

config = {
  name: "praxis",
  features: ["editor", "run"],
  limits: { timeout: 30, retries: 2 },
}

text = YAML.dump(config)
puts text

back = YAML.safe_load(text, permitted_classes: [], aliases: false)
puts back["limits"]["timeout"]

puts YAML.safe_load(YAML.dump(back)).to_json
puts "tagged dangerous input rejected safely:"
begin
  YAML.safe_load("!ruby/object:Proc {}")
rescue Psych::DisallowedClass => e
  puts e.class.name
end
`),
    ex("ruby2-ex-026", "Regular expressions", "named groups, scan, gsub with hashes.", "Strings & Regexp", "regexp",
        `log = "2024-06-15 ERROR disk 91%"

pattern = /^(?<date>\\S+)\\s+(?<level>ERROR|WARN|INFO)\\s+(?<msg>.*)$/
if (m = log.match(pattern))
  puts "date: #{m[:date]}"
  puts "level: #{m[:level]}"
end

puts "2024-06-15".gsub(/(\\d+)-(\\d+)-(\\d+)/, "\\3/\\2/\\1")

# scan collects every match, no loop needed.
puts "a1 b22 c333".scan(/\\w(\\d+)/).flatten.inspect

counts = "the cat and the hat".scan(/\\w+/).tally
puts counts["the"]

puts "spaced    out".gsub(/\\s+/, " ")
`),
    ex("ruby2-ex-027", "String building and encoding", "each_char, bytes, encoding awareness.", "Strings & Regexp", "strings_deep",
        `s = "Praxis IDE"

puts s.chars.first(6).join
puts s.each_char.select { |c| c == "i" }.length
puts s.start_with?("Prax"), s.end_with?("IDE")

uni = "ünïcode"
puts uni.length                       # characters
puts uni.bytesize                     # bytes
puts uni.encoding

puts "pad: " + "42".rjust(6, "0")
puts "shortened: " + "a very long line"[0, 12] + "..."
puts "wrapped manually: " + ["alpha", "beta", "gamma"].join("\\n  ")

reversed = s.reverse
puts reversed
puts "#{s.swapcase} #{s.center(20, "=")}"
`),
    ex("ruby2-ex-028", "Fiber concurrency", "Fibers for cooperative multitasking.", "Concurrency", "fibers",
        `fiber = Fiber.new do
  [:a, :b, :c].each { |v| Fiber.yield v }
  :done
end

3.times { puts "resumed: #{fiber.resume}" }
puts "state: #{fiber.alive? ? "alive" : "done"}"

# Two fibers ping-ponging cooperatively.
gen = Fiber.new do
  n = 0
  loop { Fiber.yield n += 1 }
end
puts gen.resume, gen.resume
`),
    ex("ruby2-ex-029", "Threads and queues", "Thread + Queue producer/consumer.", "Concurrency", "threads",
        `queue = Queue.new
results = Queue.new

producer = Thread.new do
  [1, 2, 3].each { |job| queue << job }
  queue << :done
end

consumer = Thread.new do
  while (job = queue.pop) != :done
    results << job * 10
  end
end

producer.join
consumer.join
puts results.size
puts results.pop until results.empty?

puts Thread.list.length, "threads exist"
puts Thread.main == Thread.current
`),
    ex("ruby2-ex-030", "Mutex and condition", "Guarded updates between threads.", "Concurrency", "mutex",
        `counter = 0
lock = Mutex.new
cond = ConditionVariable.new
ready = false

worker = Thread.new do
  lock.synchronize do
    ready = true
    100.times { counter += 1 }
    cond.signal
  end
end

lock.synchronize do
  cond.wait(lock) until ready
end
worker.join

puts "counter: #{counter}"
puts "guard size: #{counter == 100}"
`),
    ex("ruby2-ex-031", "Ractor-style isolation (thread demo)", "Value sharing via immutable messages.", "Concurrency", "isolation",
        `# Real Ractors copy/share state; simulated here with frozen messages.
task = { id: 1, payload: "compute".freeze }.freeze

pool = 3.times.map do |n|
  Thread.new(task) do |t|
    { worker: n, result: t[:payload].upcase }
  end
end

pool.each { |t| puts t.value.inspect }
puts pool.map(&:value).map { |r| r[:result] }.uniq.inspect

puts "frozen payload shared safely across threads"
`),
    ex("ruby2-ex-032", "Benchmarking", "benchmark/measure + bm comparison.", "Performance", "benchmark",
        `require "benchmark"

concat = Benchmark.measure do
  s = ""
  10_000.times { s += "x" }
end
puts "concat: #{concat.real.round(3)}s"

builder = Benchmark.measure do
  s = String.new(capacity: 10_001)
  10_000.times { s << "x" }
end
puts "append: #{builder.real.round(3)}s"

n = 1_000_000
map_time = Benchmark.measure { (1..n).map { |i| i * 2 } }
puts "map over #{n}: #{map_time.real.round(3)}s"
`),
    ex("ruby2-ex-033", "ObjectSpace introspection", "Counting live objects by class.", "Performance", "objectspace",
        `before = ObjectSpace.each_object(String).count

bundle = (1..100).map { |i| "string #{i}" }
after = ObjectSpace.each_object(String).count

puts "strings before/after: #{before}/#{after}"
puts "bundle built: #{bundle.size}"

stats = Hash.new(0)
ObjectSpace.each_object(Class) { |c| stats[c.superclass] += 1 }
puts "direct Object subclasses: #{stats[Object]}"

bundle.clear
GC.start
puts "after GC: #{ObjectSpace.each_object(String).count <= after}"
`),
    ex("ruby2-ex-034", "Coverage-lite trace", "set_trace_func to observe calls.", "Performance", "tracing",
        `calls = []

set_trace_func ->(event, file, line, id, binding_, klass) do
  calls << "#{event}:#{id}" if event == "call" && id.to_s.start_with?("track_")
end

def track_add(a, b) = a + b
def track_mul(a, b) = a * b

track_add(2, 3)
track_mul(4, 5)

set_trace_func(nil)
puts calls.inspect
puts calls.size
`),
    ex("ruby2-ex-035", "Mini test framework", "A spec-flavored assert harness.", "Testing", "mini_spec",
        `$failures = 0

def describe(label)
  puts label
  result = yield
  puts "  -> #{result}"
end

def expect(actual)
  SimpleMatcher.new(actual)
end

class SimpleMatcher
  def initialize(actual) = @actual = actual
  def to_eq(expected)
    ok = @actual == expected
    puts ok ? "  ok   #{@actual.inspect} == #{expected.inspect}"
            : "  FAIL #{@actual.inspect} != #{expected.inspect}"
    $failures += 1 unless ok
  end
end

describe "arithmetic" do
  expect(2 + 2).to_eq 4
  "2 checks green"
end

describe "strings" do
  expect("praxis".upcase).to_eq "PRAXIS"
  "done"
end

puts "#{$failures} failures"
`),
    ex("ruby2-ex-036", "Stubbing and dependency injection", "Callable dependencies instead of monkeypatching.", "Testing", "stubbing",
        `class Fetcher
  def get(path) = NetDemo.get(path)
end

module NetDemo
  def self.get(path) = "real fetch of #{path}"
end

class Service
  def initialize(fetcher: Fetcher.new) = @fetcher = fetcher
  def snapshot(path) = @fetcher.get(path)
end

# A stub is just another object with the same method.
stub = Struct.new(:get).new(->(path) { "stubbed: #{path}" })
svc = Service.new(fetcher: stub)

puts svc.snapshot("/health")

real = Service.new
puts real.snapshot("/health")
`),
    ex("ruby2-ex-037", "A mini logger", "Leveled, timestamped, thread-safe.", "Projects", "logger",
        `require "logger"

log = Logger.new($stdout, level: Logger::INFO)
log.info("service started")
log.warn("disk at 91%")
log.error("mirror sync failed")
log.debug("suppressed by the level")

log.formatter = proc { |severity, _, _, msg| "[#{severity}] #{msg}\\n" }
log.info("custom formatter takes over")

puts "levels: #{Logger::Severity.constants.inspect}"
`),
    ex("ruby2-ex-038", "Config loader", "YAML + defaults + validation.", "Projects", "config_loader",
        `require "yaml"

DEFAULTS = { "host" => "0.0.0.0", "port" => 8080, "retries" => 1 }.freeze

def load_config(text)
  merged = DEFAULTS.merge(YAML.safe_load(text) || {})
  unless merged["port"].is_a?(Integer) && merged["port"].between?(1, 65_535)
    raise ArgumentError, "port out of range: #{merged["port"].inspect}"
  end
  merged
end

cfg = load_config(<<~YAML)
  host: 127.0.0.1
  port: 9090
YAML
puts "host=#{cfg["host"]} port=#{cfg["port"]} retries=#{cfg["retries"]}"

begin
  load_config("port: 99999\\n")
rescue ArgumentError => e
  puts "rejected: #{e.message}"
end
`),
    ex("ruby2-ex-039", "A CLI report tool", "ARGV + enumerable + formatted table.", "Projects", "report",
        `ROWS = [
  { city: "Cairo", temp: 34 },
  { city: "Oslo", temp: 12 },
  { city: "Sydney", temp: 26 },
].freeze

puts "ARGV received: #{ARGV.inspect} (unused in the canned demo)"

widths = { city: 8, temp: 5 }
puts format("%<city>-8s %<temp>5s", widths)
puts "-" * 14
ROWS.each do |r|
  puts format("%<city>-8s %<temp>5d", r)
end

temps = ROWS.map { |r| r[:temp] }
puts "mean: #{(temps.sum / temps.size.to_f).round(1)}"
puts "max: #{temps.max} in #{ROWS.max_by { |r| r[:temp] }[:city]}"

puts "sorted: #{ROWS.sort_by { |r| -r[:temp] }.map { |r| r[:city] }.join(" > ")}"
`),
    ex("ruby2-ex-040", "A complete wordstats tool", "Read + tally + ranked output.", "Projects", "wordstats",
        `require "tempfile"

file = Tempfile.new("praxis_words")
file.write("go go is fun\\ngo runs everywhere\\nfun times\\n")
file.rewind

words = file.read.downcase.scan(/[a-z]+/)
counts = words.tally
top = counts.max_by(3) { |_, n| n }

puts "unique words: #{counts.size}"
top.each { |word, n| puts format("%-12s %dx", word, n) }

file.close
file.unlink
puts "top 3 size: #{top.size}"
`),
];
