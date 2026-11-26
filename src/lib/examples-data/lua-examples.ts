/**
 * 8 Lua reference templates (one of the six NEW runtime
 * languages added alongside: "Other language runtimes (add other
 * languages also) + add their examples to check"). Bodies are pure
 * Lua 5.4 stdlib, created as .lua files and runnable through the
 * `lua` interpreter the moment it is installed.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Lua";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("lua", id, label, description, CAT, sub, baseName, ".lua", () => body);

export const LUA_EXAMPLES: FileExample[] = [
    ex("lua-ex-001", "Hello, Lua", "print, string.format and .. concatenation — the opening page.", "Basics", "hello_lua",
        `-- Hello, Lua — print, format and the .. operator.
print("Hello from Lua!")

local name = "Praxis"
print("Hello, " .. name .. "!")          -- .. concatenates

-- string.format is the C-style printf twin.
local count, pi = 42, 3.14159
print(string.format("int=%d pi=%.4f", count, pi))
print(string.format("width: |%10d|%-10s|", 7, "x"))

-- # is the length operator.
print("#name:", #name)                  -- 6
print("upper:", name:upper())            -- method call with :
`),

    ex("lua-ex-002", "Variables and scopes", "local vs global, multiple assignment, and the swap idiom.", "Basics", "variables_scope",
        `-- Scoping: local (always prefer) vs the implicit global table.
local count = 42
count = count + 1
print("count:", count)

-- Multiple assignment + swap in one line.
local x, y = 1, 99
x, y = y, x
print("after swap:", x, y)

-- Without 'local', the name lands in the global environment.
bare = "global"                -- works, but avoid it
print("bare:", bare)

-- A block scope: locals declared inside do…end vanish after it.
do
  local scoped = "only inside"
  print("scoped:", scoped)
end
-- print(scoped)  -- would be nil here

-- nil is the absent value; variables are nil until assigned.
local missing
print("missing is nil:", missing == nil)
`),

    ex("lua-ex-003", "Control flow", "if/elseif/else, while/repeat, numeric and generic for.", "Control flow", "control_flow",
        `-- Control flow — every branch and loop shape.
local score = 87
if score >= 90 then
  print("grade A")
elseif score >= 80 then
  print("grade B")
else
  print("keep going")
end

-- Numeric for: start, limit, step.
for i = 1, 10, 2 do
  io.write(i, " ")
end
io.write("\\n")

-- Generic for over ipairs (array part) and pairs (everything).
local nums = {10, 20, 30}
for i, v in ipairs(nums) do
  print(i, v)
end
local person = { name = "Ada", year = 1815 }
for key, value in pairs(person) do
  print(key, value)
end

-- while + repeat…until (the do-while cousin).
local power = 1
while power < 100 do power = power * 3 end
print("past 100:", power)

local tries = 0
repeat tries = tries + 1 until tries >= 2
print("repeat ran", tries, "times")
`),

    ex("lua-ex-004", "Tables", "The single data structure: array part, hash part, length and iteration.", "Data structures", "tables_tour",
        `-- Tables — arrays AND dictionaries in one construct.
local nums = {5, 1, 4, 2, 3}         -- array part: 1-based!
print("count:", #nums)              -- # = length
print("first:", nums[1])             -- NOT nums[0]

-- Hash part: any key type.
local person = { name = "Ada", year = 1815 }
person.lang = "Analytical Engine"    -- add a field
print(person.name, person.year, person.lang)

-- Mixing both parts is legal (but keep them separate when possible).
local mixed = { "first", key = "value", "second" }
print(mixed[1], mixed.key, mixed[2])

-- table.* helpers.
table.insert(nums, 9)                -- append
table.sort(nums)
print("sorted:", table.concat(nums, " "))
print("removed:", table.remove(nums))  -- pop from the end

-- Nested tables = records and trees.
local tree = {
  left  = { value = 1 },
  right = { value = 2 },
  value = 3,
}
print("root:", tree.value, "children:", tree.left.value, tree.right.value)
`),

    ex("lua-ex-005", "Functions", "Multiple returns, varargs, first-class functions and closures.", "Functions", "functions_tour",
        `-- Functions — first-class, multi-return, varargs.
local function minmax(values)
  local lo, hi = math.huge, -math.huge
  for _, v in ipairs(values) do
    if v < lo then lo = v end
    if v > hi then hi = v end
  end
  return lo, hi                       -- multiple returns
end

local function sum(...)
  local total = 0
  for _, v in ipairs({...}) do       -- {...} packs the varargs
    total = total + v
  end
  return total
end

local lo, hi = minmax({5, 1, 4, 2, 3})
print("min:", lo, "max:", hi)
print("sum():", sum())
print("sum(1,2,3):", sum(1, 2, 3))

-- Functions are values; closures capture their locals.
local function counter()
  local count = 0
  return function()
    count = count + 1
    return count
  end
end
local bump = counter()
bump()
print("closure count:", bump())
`),

    ex("lua-ex-006", "Strings", "string library pass: format, sub, find, gsub, patterns and repetition.", "Text", "strings_tour",
        `-- Strings — the string library in one pass.
local text = "The quick brown fox"

print("upper:", text:upper())
print("len:", #text)
print("sub:", text:sub(5, 9))              -- quick (1-based, inclusive)
print("rev:", text:reverse())

-- find returns start + end (or nil).
local startAt, endAt = text:find("fox")
print("fox at:", startAt, endAt)

-- gsub substitutes with Lua patterns (not regex!).
print(text:gsub("fox", "cat"))
print(("a-b-c"):gsub("-", "+"))            -- chained on a literal

-- The pattern language: %a letters, %d digits, %s space, + one-or-more.
local digits = "id: 42, age: 31"
print("digits:", digits:match("%d+"))       -- first match: 42
for word in text:gmatch("%a+") do
  io.write("[", word, "] ")
end
io.write("\\n")

-- gsub with a FUNCTION replacement transforms each match.
local shout = ("abc"):gsub("%a", function(c) return c:upper() end)
print("shout:", shout)

-- string.rep repeats.
print("line:", string.rep("-", 20))
`),

    ex("lua-ex-007", "Metatables", "The OO layer: __index classes, constructors and operator overloading.", "Advanced", "metatables_oop",
        `-- Metatables — how Lua does objects and operators.
local Point = {}
Point.__index = Point              -- the class dispatch table

function Point.new(x, y)
  local self = setmetatable({}, Point)
  self.x = x
  self.y = y
  return self
end

function Point:length()            -- a method
  return math.sqrt(self.x ^ 2 + self.y ^ 2)
end

function Point:__tostring()        -- used by print/tostring
  return string.format("Point(%.1f, %.1f)", self.x, self.y)
end

function Point.__add(a, b)         -- operator overloading: p + q
  return Point.new(a.x + b.x, a.y + b.y)
end

local p = Point.new(3, 4)
local q = Point.new(1, 1)
print(p)                            -- __tostring
print("length:", p:length())       -- : passes self
print(p + q)                       -- __add
print("rawtype:", type(p))         -- table (there are no classes)

-- setmetatable on a plain table gives defaults via __index chains.
local defaults = { retries = 3, timeout = 30 }
local config = setmetatable({}, { __index = defaults })
print("timeout:", config.timeout)  -- inherited from defaults
config.timeout = 5                 -- shadows only for THIS table
print("timeout now:", config.timeout, "retries still:", config.retries)
`),

    ex("lua-ex-008", "Pcall and file I/O", "Protected calls (pcall) for errors and the io library for files.", "Practical", "pcall_files",
        `-- pcall (protected call) + the io library.
local function risky(n)
  if n < 0 then error("negative: " .. n, 2) end
  return math.sqrt(n)
end

-- pcall traps the error: ok flag + message.
local ok, result = pcall(risky, 16)
print("ok:", ok, "result:", result)

local ok2, err = pcall(risky, -1)
print("ok2:", ok2, "err:", err)

-- Reading + writing files.
local path = "/tmp/praxis_lua_demo.txt"
local out = assert(io.open(path, "w"))   -- assert turns nil into an error
out:write("alpha 1\\n", "beta 2\\n", "gamma 3\\n")
out:close()                               -- ALWAYS close

for line in io.lines(path) do             -- io.lines iterates a file
  print("read:", line)
end

os.remove(path)                           -- tidy
print("cleaned up")
`),
];
