/**
 * 10 Ruby reference templates (the "add other languages
 * also + their examples to check" batch). Bodies are idiomatic Ruby
 * (pure stdlib), created as .rb files and runnable through the `ruby`
 * interpreter the moment it is installed.
 *
 * Ruby identifiers keep their native snake_case (no naming tokens).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Ruby";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("ruby", id, label, description, CAT, sub, baseName, ".rb", () => body);

export const RUBY_EXAMPLES: FileExample[] = [
    ex("ruby-ex-001", "Hello, Ruby", "puts vs print, string interpolation and the everything-is-an-object rule.", "Basics", "hello_ruby",
        `# Hello, Ruby — puts, print and #{...} interpolation.
name = "Praxis"

puts "Hello from Ruby!"          # puts adds a newline
print "Hello, ", name, "!"        # print does not
puts                              # ...so close the line ourselves

# #{...} interpolates ANY expression inside double quotes.
count = 3
puts "I have #{count} files and #{count * 2} shoes"

# Everything answers to methods — even integers.
puts 42.class                    # Integer
puts "word".length               # 4
puts :symbol.class               # Symbol
puts nil.to_s.inspect            # "nil"
`),

    ex("ruby-ex-002", "Branching and case", "if/elsif/else with modifiers, unless, and case/when without ranges and with.", "Control flow", "branching_case",
        `# Branching: modifiers, unless, case/when (with AND without a value).
score = 87

grade = if score >= 90 then "A"
        elsif score >= 80 then "B"
        elsif score >= 70 then "C"
        else "F"
        end
puts "score #{score} -> #{grade}"

# Statement MODIFIERS: the condition trails the action.
puts "passed!" if score >= 60
puts "not perfect" unless score == 100

# case/when WITH a subject — when clauses are === matches.
weekday = 6
kind = case weekday
       when 1, 7 then "weekend"
       when 2..6  then "weekday"      # range match
       else "unknown"
       end
puts "day #{weekday} is a #{kind}"

# case/when WITHOUT a subject — plain conditions, first truth wins.
temp = 28
description = case
              when temp > 30 then "hot"
              when temp > 20 then "pleasant"
              else "cool"
              end
puts "#{temp}C feels #{description}"
`),

    ex("ruby-ex-003", "Loops and enumerables", "times, upto, while, and the Enumerable trio each/map/select/reduce.", "Control flow", "loops_enumerables",
        `# Loops + the Enumerable heart of Ruby.
3.times { |i| print "#{i} " }        # block form
puts
1.upto(5) { |i| print "#{i} " }
puts

power = 1
while power < 100
  power *= 3
end
puts "first power of 3 past 100: #{power}"

nums = [5, 1, 4, 2, 3]

# each — visit every element.
print "each: "
nums.each { |n| print n }
puts

# map — transform into a new array.
squares = nums.map { |n| n * n }
puts "squares: #{squares.inspect}"

# select / reject — filter.
puts "big:   #{nums.select { |n| n > 2 }.inspect}"
puts "small: #{nums.reject { |n| n > 2 }.inspect}"

# reduce — fold to one value.
puts "total: #{nums.reduce(0) { |sum, n| sum + n }}"
puts "also:  #{nums.sum}"            # the shortcut

# each_with_object and group_by — the two daily refinements.
word_lengths = %w[ruby go lua rust].each_with_object({}) do |w, acc|
  acc[w] = w.length
end
puts word_lengths.inspect

by_parity = (1..8).group_by { |n| n.even? ? :even : :odd }
puts by_parity.inspect
`),

    ex("ruby-ex-004", "Methods and blocks", "def with defaults + varargs, explicit blocks, yield and to_proc &.", "Functions", "methods_blocks",
        `# Methods: defaults, splats, blocks.
def greet(name, punctuation = "!")
  "Hello, #{name}#{punctuation}"
end

def sum(*values)          # the splat collects any count of args
  values.reduce(0, :+)    # :+ is the method reference (to_proc)
end

# An explicit block — check + call + forward.
def around
  return "no block given" unless block_given?
  puts "before"
  result = yield          # runs the block
  puts "after"
  result * 2
end

puts greet("Ada")
puts greet("Grace", "?")
puts "sum() = #{sum}"
puts "sum(1,2,3) = #{sum(1, 2, 3)}"
puts around { 21 }
`),

    ex("ruby-ex-005", "Arrays", "Literal shapes, push/pop, slices, include, sort with blocks and the set-like ops.", "Data structures", "arrays_tour",
        `# Arrays — literals, growth, slicing, sorting.
nums = [5, 1, 4, 2, 3]

nums.push(9)              # append (<< is the same)
nums << 10
last = nums.pop           # remove from the end

puts "after push/pop: #{nums.inspect}, popped #{last}"

# Slices: [start, count] and ranges.
puts "first two: #{nums[0, 2].inspect}"
puts "middle:     #{nums[1..3].inspect}"

# Membership + index.
puts "has 4? #{nums.include?(4)}  where is 4? index #{nums.find_index(4)}"

# Sorting with a block (descending).
puts "desc: #{nums.sort { |a, b| b <=> a }.inspect}"
puts "sorted: #{nums.sort.inspect}"
puts "uniq:  #{[1, 3, 1, 2, 3].uniq.inspect}"

# Set-like operators on arrays.
a = [1, 2, 3, 4]
b = [3, 4, 5, 6]
puts "union:        #{(a | b).inspect}"
puts "intersection: #{(a & b).inspect}"
puts "difference:   #{(a - b).inspect}"
`),

    ex("ruby-ex-006", "Hashes", "Symbols vs string keys, default values, fetch vs [], and iteration.", "Data structures", "hashes_tour",
        `# Hashes — the Ruby dictionary.
freq = Hash.new(0)          # default value for missing keys
%w[to be or not to be].each { |w| freq[w] += 1 }
puts freq.inspect

# Hash literal (symbol keys get the shorthand).
person = { name: "Ada", year: 1815 }
puts person[:name]
person[:lang] = "Analytical Engine"
puts person.inspect

# fetch: raises (or takes a default) when the key is absent — the safe read.
puts person.fetch(:missing, "not there")
begin
  person.fetch(:missing)
rescue KeyError => e
  puts "fetch raised: #{e.class}"
end

# Iteration shapes.
person.each { |key, value| puts "#{key} => #{value}" }
puts "keys:   #{person.keys.inspect}"
puts "values: #{person.values.inspect}"

# select / map over pairs → a new hash.
older = person.select { |k, v| k != :name }
puts older.inspect

# merge with a block resolving collisions.
defaults = { retries: 3, timeout: 30 }
overrides = { timeout: 5 }
merged = defaults.merge(overrides) { |key, old, new| new }
puts merged.inspect
`),

    ex("ruby-ex-007", "Classes", "attr_accessor, initialize, to_s, self methods and instance state.", "OOP", "classes_tour",
        `# Classes: state, accessors, to_s and class methods.
class Counter
  attr_reader :count          # generates the reader only
  attr_accessor :label        # reader + writer

  def initialize(label = "counter")
    @count = 0                # @ = instance variable
    @label = label
  end

  def bump(by = 1)
    @count += by
    self                      # return self → chainable
  end

  def to_s                    # puts/print call this
    "#{@label}: #{@count}"
  end

  def reset!
    @count = 0
    self
  end

  # A class method (def self.…).
  def self.from_array(values, label)
    counter = new(label)       # new calls initialize
    values.each { |v| counter.bump(v) }
    counter
  end
end

c = Counter.new("tickets")
c.bump(2).bump(3)              # chaining via self
puts c                          # to_s
c.label = "admissions"
puts c
puts Counter.from_array([1, 2, 3], "sum").to_s
`),

    ex("ruby-ex-008", "Modules and mixins", "module namespaces, class methods via extend self, include as mixin.", "OOP", "modules_mixins",
        `# Modules: namespaces AND mixins — Ruby's multiple inheritance.
module Formatting
  # included as instance methods…
  def bracket(text)
    "[#{text}]"
  end

  def quote(text)
    "\\"#{text}\\""
  end

  # …or extended as class methods.
  module ClassMethods
    def slug(text)
      text.downcase.strip.tr(" ", "-")
    end
  end

  def self.included(base)
    base.extend(ClassMethods)
  end
end

class Report
  include Formatting          # the mixin
end

r = Report.new
puts r.bracket("mixin")
puts r.quote("included")
puts Report.slug("A Fancy Title")   # via extend
`),

    ex("ruby-ex-009", "Exceptions", "begin/rescue/ensure, retry-free flow, custom error classes and else.", "Robustness", "exceptions_tour",
        `# Exceptions: begin/rescue/else/ensure + custom classes.
class ValidationError < StandardError
  attr_reader :field
  def initialize(field)
    super("bad value for '#{field}'")
    @field = field
  end
end

def parse_age(text)
  age = Integer(text)          # raises ArgumentError on junk
  raise ValidationError, "age" if age < 0
  age
end

begin
  puts parse_age("31")
  puts parse_age("thirty-one")
rescue ValidationError => e
  puts "#{e.class} on #{e.field}: #{e.message}"
rescue ArgumentError => e
  puts "argument problem: #{e.message}"
else
  puts "no exception happened"        # runs only when nothing raised
ensure
  puts "ensure always runs"            # cleanup, no matter what
end
`),

    ex("ruby-ex-010", "Files", "File.write/read, line iteration with each_line and the block auto-close idiom.", "Practical", "files_tour",
        `# Files — write, read, iterate lines, auto-close.
path = "/tmp/praxis_ruby_demo.txt"

File.write(path, "alpha 1\\nbeta 2\\ngamma 3\\n")

# File.read slurps the whole file.
puts File.read(path).lines.length.to_s + " lines total"

# The block form closes the handle AUTOMATICALLY at the end.
File.open(path, "r") do |file|
  file.each_line.with_index(1) do |line, lineno|
    print "#{lineno}: #{line}"          # lines keep their newline
  end
end

# File.foreach streams lines without loading the file.
total = 0
File.foreach(path) { |line| total += 1 }
puts "foreach saw #{total} lines"

File.delete(path)
puts "cleaned up"
`),
];
