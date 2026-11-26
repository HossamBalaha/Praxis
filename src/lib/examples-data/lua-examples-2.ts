/**
 * the Lua top-up: 42 more reference templates on top of the
 * eight more ("at least 50 like others". Pure Lua 5.4 stdlib.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Lua";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("lua", id, label, description, CAT, sub, baseName, ".lua", () => body);

export const LUA_2_EXAMPLES: FileExample[] = [
    ex("lua2-ex-001", "Metatables: index and newindex", "The OOP and proxy machinery.", "Metatables", "metatable_index",
        `-- __index powers inheritance AND computed fields.
local defaults = { color = "blue", size = "M" }
local shirt = setmetatable({}, { __index = defaults })

print(shirt.color)            -- falls through to defaults
shirt.color = "red"           -- writes onto the shirt itself
print(shirt.color, defaults.color)

-- __index as a FUNCTION for lazy/derived fields.
local lazy = setmetatable({}, {
  __index = function(t, k)
    local v = k:upper() .. "!"
    rawset(t, k, v)           -- cache it for next time
    return v
  end,
})
print(lazy.hello)
print(lazy.hello)             -- second read hits the cache
print(rawlen(lazy) + 1 == 2)  -- hello + cached upper
`),
    ex("lua2-ex-002", "Classes in one page", "A constructor, methods, inheritance via metatables.", "Metatables", "classes_lua",
        `-- The canonical Lua class pattern.
local Animal = {}
Animal.__index = Animal

function Animal.new(name, sound)
  return setmetatable({ name = name, sound = sound }, Animal)
end

function Animal:speak()
  return self.name .. " says " .. self.sound
end

local Dog = setmetatable({}, { __index = Animal })
Dog.__index = Dog

function Dog.new(name)
  local o = Animal.new(name, "bark")
  return setmetatable(o, Dog)
end

function Dog:fetch(item)
  return self.name .. " fetches the " .. item
end

print(Animal.new("generic", "..."):speak())
local d = Dog.new("Rex")
print(d:speak())
print(d:fetch("stick"))
print(getmetatable(d) == Dog)
`),
    ex("lua2-ex-003", "Arithmetic metamethods", "__add, __eq, __lt, __tostring, __len.", "Metatables", "operators_lua",
        `local Vec = {}
Vec.__index = Vec
Vec.__tostring = function(v) return "(" .. v.x .. "," .. v.y .. ")" end
Vec.__eq = function(a, b) return a.x == b.x and a.y == b.y end
Vec.__lt = function(a, b) return (a.x + a.y) < (b.x + b.y) end
Vec.__len = function(v) return 2 end

Vec.__add = function(a, b) return Vec.new(a.x + b.x, a.y + b.y) end

function Vec.new(x, y)
  return setmetatable({ x = x, y = y }, Vec)
end

local a, b = Vec.new(1, 2), Vec.new(3, 4)
print(a + b)
print(tostring(a))
print(a == Vec.new(1, 2), a < b)
print(#b)
`),
    ex("lua2-ex-004", "Call metamethod", "Objects that behave like functions.", "Metatables", "callable_objects",
        `-- __call turns a table INTO a function.
local counter = setmetatable({ n = 0 }, {
  __call = function(self, step)
    self.n = self.n + (step or 1)
    return self.n
  end,
})

print(counter(), counter(), counter(10))
print(counter.n)

-- A dispatcher: call with a key, get a handler.
local routes = setmetatable({}, {
  __call = function(self, name)
    return self[name] or function() return "no route: " .. name end
  end,
})
routes.home = function() return "home page" end
print(routes.home())
print(routes.about())
`),
    ex("lua2-ex-005", "Weak tables", "garbage-collectable caches.", "Advanced", "weak_tables",
        `-- __mode = "k" makes KEYS weak: entries vanish when keys do.
local cache = setmetatable({}, { __mode = "k" })

do
  local obj = {}      -- a temporary key
  cache[obj] = "value tied to obj"
end

collectgarbage()      -- obj is gone; its entry may be too
print("cache entries after GC:", #cache + 1)  -- approximate count
print("mode set:", getmetatable(cache).__mode)

-- Pair-weak ("kv") caches release on EITHER side dying.
local kv = setmetatable({}, { __mode = "kv" })
kv[1] = {}
collectgarbage()
print("kv is weak on both sides:", getmetatable(kv).__mode)
`),
    ex("lua2-ex-006", "String patterns", "The Lua regex-lite pattern language.", "Strings & Patterns", "patterns",
        `local s = "2024-06-15 ERROR disk 91%"

-- capture groups with ()
local y, m, d = s:match("(%d+)-(%d+)-(%d+)")
print(y, m, d)

-- find positions
print(s:find("ERROR"))

-- gsub with captures
print(s:gsub("(%a+)", "[%1]"))

-- gmatch iterates matches
for tok in s:gmatch("%a+") do
  io.write(tok, "/")
end
print()

-- classes: %d %a %w %s; uppercase negates
print(("a1b2"):gsub("%d", "."))
print((" x y "):gsub("^%s*(.-)%s*$", "%1"))
`),
    ex("lua2-ex-007", "String library tour", "rep, byte/char, format with %q.", "Strings & Patterns", "string_lib",
        `local s = "praxis"

print(string.rep(s, 3, "-"))
print(s:sub(1, 3), s:sub(-3))
print(s:upper(), s:len())

-- byte <-> char
print(string.char(80, 82, 88))
print(s:byte(1))

-- format: the printf twin (%q quotes safely)
print(string.format("%s=%d (%.2f%%)", "round", 45, 99.5))
print(string.format("[%6s] [%-6s]", "ab", "ab"))
print(string.format("%q", 'he said "hi"'))

-- concat table
print(table.concat({"a", "b", "c"}, ", "))
`),
    ex("lua2-ex-008", "Table library", "insert, remove, sort, concat, unpack.", "Tables", "table_lib",
        `local t = {5, 2, 9, 1}

table.insert(t, 7)             -- append
table.insert(t, 1, 0)          -- push front
print(table.concat(t, ","))

table.sort(t)
print(table.concat(t, ","))
table.sort(t, function(a, b) return a > b end)
print(table.concat(t, ","))

print(table.remove(t))         -- pops last
print(table.concat(t, ","))

local packed = table.pack("a", "b", "c")
print(packed.n)
print(table.unpack({10, 20, 30}))
`),
    ex("lua2-ex-009", "Next and iteration order", "pairs, ipairs, next, #.", "Tables", "iteration",
        `local mixed = {10, 20, 30, name = "praxis"}

-- ipairs stops at the first nil (array part only).
for i, v in ipairs(mixed) do io.write(i, ":", v, " ") end
print()

-- pairs walks EVERYTHING (order not guaranteed).
for k, v in pairs(mixed) do io.write(k, "=", tostring(v), " ") end
print()

-- next is the primitive both are built on.
print(next(mixed) ~= nil)

-- # is only defined over the contiguous sequence.
print(#mixed)
print(mixed[mixed.name and 1 or 2])
`),
    ex("lua2-ex-010", "Table length and holes", "Why # is undefined over holes.", "Tables", "length_semantics",
        `local ok = { "a", "b", "c" }
print(#ok, #ok == 3)

-- A hole makes # implementation-defined.
local holey = { "a", "b", nil, "c" }
print("length is unspecified with holes:", #holey <= 4)

-- The robust count: count until nil.
local function count_seq(t)
  local n = 0
  for i = 1, math.huge do
    if t[i] == nil then return n end
    n = n + 1
  end
end

print(count_seq(ok))
print(count_seq({ 10, 20, 30 }))
`),
    ex("lua2-ex-011", "Coroutines", "create/resume/yield, status.", "Coroutines", "coroutine_basics",
        `local co = coroutine.create(function(a, b)
  print("inside with", a, b)
  local got = coroutine.yield(a + b)
  print("resumed with", got)
  return "done"
end)

print(coroutine.resume(co, 1, 2))
print(coroutine.status(co))
print(coroutine.resume(co, "wake"))
print(coroutine.status(co))

-- wrap: a coroutine that LOOKS like a function.
local gen = coroutine.wrap(function()
  for i = 1, 3 do coroutine.yield(i * i) end
end)
print(gen(), gen(), gen())
`),
    ex("lua2-ex-012", "Coroutine generators", "Pipeline producers and consumers.", "Coroutines", "generators_lua",
        `local function range(a, b, step)
  return coroutine.wrap(function()
    for i = a, b, step or 1 do coroutine.yield(i) end
  end)
end

local squares = {}
for n in range(1, 5) do squares[#squares + 1] = n * n end
print(table.concat(squares, ","))

-- A consumer that filters another producer.
local function filter(gen, pred)
  return coroutine.wrap(function()
    for v in gen do if pred(v) then coroutine.yield(v) end end
  end)
end

local evens = {}
for n in filter(range(1, 10), function(v) return v % 2 == 0 end) do
  evens[#evens + 1] = n
end
print(table.concat(evens, ","))
`),
    ex("lua2-ex-013", "Error handling", "pcall, error with levels, xpcall tracebacks.", "Errors", "errors_lua",
        `local ok, err = pcall(function()
  error("something broke")
end)
print(ok, err)

-- error("msg", 0) keeps the message verbatim (no position prefix).
print(pcall(function() error("clean message", 0) end))

-- xpcall pairs the call with a traceback handler.
local ok2, trace = xpcall(function()
  error("boom")
end, debug.traceback)
print(ok2, (trace:gsub("\\n.*", "")))

-- Protect a division.
local function safe_div(a, b)
  if b == 0 then error("division by zero", 2) end
  return a / b
end
print(pcall(safe_div, 10, 2))
print(pcall(safe_div, 10, 0))
`),
    ex("lua2-ex-014", "require and modules", "Writing an importable module shape.", "Modules", "modules_lua",
        `-- The modern module pattern (used as a string here to avoid a write).
local modsrc = [[
local M = {}
M.version = "1.0"

function M.greet(name)
  return "Hello, " .. name .. "!"
end

return M
]]

-- load() compiles it in-process instead of writing a file.
local chunk, err = load(modsrc, "greetmod")
if chunk then
  local M = chunk()
  print(M.version, M.greet("Praxis"))
else
  print("compile error:", err)
end

-- package.loaded maps required modules.
print(type(package.loaded.string))
print(#package.path > 0)
`),
    ex("lua2-ex-015", "File IO", "open modes, read lines, write.", "IO & Files", "file_io",
        `local path = os.tmpname()

-- w: truncate, a: append, r+: read/write.
local f = io.open(path, "w")
f:write("line one\\n", "line two\\n")
f:close()

f = io.open(path, "a")
f:write("appended\\n")
f:close()

-- Line iteration is the idiomatic read.
local n = 0
for line in io.lines(path) do
  n = n + 1
  print("read:", line)
end
print("lines:", n)

os.remove(path)
print("exists:", io.open(path, "r") ~= nil)
`),
    ex("lua2-ex-016", "Reading structured files", "CSV parse + totals.", "IO & Files", "csv_lua",
        `local path = os.tmpname()

local f = io.open(path, "w")
f:write("name,score\\nada,92\\nalan,81\\ngrace,96\\n")
f:close()

local rows = {}
for line in io.lines(path) do
  local name, score = line:match("^(.-),(%d+)$")
  if name then
    rows[#rows + 1] = { name = name, score = tonumber(score) }
  end
end

table.sort(rows, function(a, b) return a.score > b.score end)

local total = 0
for _, r in ipairs(rows) do
  print(string.format("%-6s %3d", r.name, r.score))
  total = total + r.score
end

print("mean:", string.format("%.1f", total / #rows))
os.remove(path)
`),
    ex("lua2-ex-017", "os library", "time, clock, date, getenv.", "OS & System", "os_lib",
        `print("year:", os.date("%Y"), os.date("%A"))
print("epoch:", os.time())
print("hours since epoch:", os.time() // 3600)

-- clock() = CPU seconds of THIS process.
local t0 = os.clock()
local s = 0
for i = 1, 1e6 do s = s + i end
print(string.format("loop took %.3fs", os.clock() - t0))

print("tmp dir exists:", os.getenv("TMPDIR") ~= nil or os.getenv("TEMP") ~= nil)
print("hostname env:", os.getenv("HOSTNAME") ~= nil)
`),
    ex("lua2-ex-018", "Directory listing", "io.popen-lites guarded for portability.", "OS & System", "directory",
        `-- popen reads a command's output through a pipe.
local function shell_lines(cmd)
  local ok = pcall(function()
    local p = io.popen(cmd)
    local out = p:read("a")
    p:close()
    return out
  end)
  if not ok then return nil end
end

print("popen supported:", type(shell_lines) == "function")

-- A pure-Lua portable alternative: os.remove/status.
print("remove returns on missing:", os.remove("definitely_missing") == nil)

-- File attributes exist through lfs normally; here a stat-lite via popen.
local p = io.popen and io.popen("echo praxis") or nil
if p then
  print("pipe:", p:read("l"))
  p:close()
else
  print("no pipes here")
end
`),
    ex("lua2-ex-019", "Math library", "floor/ceil, random with seeds, integer division.", "Mathematics", "math_lib",
        `print(math.floor(3.7), math.ceil(3.2), math.max(1, 9, 3))
print(math.abs(-7), math.sqrt(144), math.huge)

-- Lua 5.3+ integer floor division and modulo.
print(7 // 2, 7 % 2, -7 // 2)

-- random with a seed = reproducible.
math.randomseed(42)
print(math.random(1, 6), math.random(1, 6))
math.randomseed(42)
print(math.random(1, 6), math.random(1, 6))

print(string.format("%.4f", math.pi))
print(math.fmod(7, 3), math.tointeger("42"))
print(math.type(1), math.type(1.0))
`),
    ex("lua2-ex-020", "Numeric formatting", "string.format verbs on every type.", "Mathematics", "formatting",
        `print(string.format("%d %i", 42, -7))
print(string.format("%.3f", math.pi))
print(string.format("%e", 12345.678))
print(string.format("%g", 0.000001))
print(string.format("%5d|%-5d|", 42, 42))
print(string.format("%x %X %o", 255, 255, 8))
print(string.format("%s and %q", "text", "quoted"))

-- Floats are not integers below the syntax line.
print(1 == 1.0, math.type(1), math.type(1.0))
print(string.format("%d", 3.0))       -- ok: exact integer value
`),
    ex("lua2-ex-021", "Bitwise operations", "5.3+ bit operators on integers.", "Mathematics", "bitwise",
        `print(12 & 10, 12 | 10, 12 ~ 10)     -- and or xor
print(~5)                             -- not
print(1 << 4, 256 >> 4)               -- shifts

-- Packing bytes into an integer word.
local function pack(b3, b2, b1, b0)
  return b3 << 24 | b2 << 16 | b1 << 8 | b0
end
local word = pack(0xDE, 0xAD, 0xBE, 0xEF)
print(string.format("0x%08X", word))

print(word >> 24, (word << 8) >> 24)  -- pull bytes back out
print(math.ult(1, 2))                 -- unsigned compare
`),
    ex("lua2-ex-022", "Sorting with keys", "Multi-key comparators.", "Tables", "sorting_deep",
        `local people = {
  { name = "ada",   score = 92, age = 36 },
  { name = "alan",  score = 92, age = 41 },
  { name = "grace", score = 96, age = 45 },
}

-- score desc, then age asc.
table.sort(people, function(a, b)
  if a.score ~= b.score then return a.score > b.score end
  return a.age < b.age
end)

for _, p in ipairs(people) do
  print(string.format("%-6s %3d (%d)", p.name, p.score, p.age))
end

-- Sort a copy to keep the original order.
local copy = { table.unpack(people) }
table.sort(copy, function(a, b) return a.name < b.name end)
print(copy[1].name, copy[#copy].name)
`),
    ex("lua2-ex-023", "A stack and a queue", "Two structures over one table.", "Data Structures", "stack_queue",
        `local Stack = {}
Stack.__index = Stack
function Stack.new() return setmetatable({}, Stack) end
function Stack:push(v) self[#self + 1] = v end
function Stack:pop() local v = self[#self] self[#self] = nil return v end
function Stack:peek() return self[#self] end

local s = Stack.new()
s:push(1) s:push(2) s:push(3)
print(s:pop(), s:pop(), s:peek())

-- Queue: two indices move forward.
local Queue = { head = 1, tail = 0 }
Queue.__index = Queue
function Queue.new() return setmetatable({ head = 1, tail = 0 }, Queue) end
function Queue:enqueue(v) self.tail = self.tail + 1 self[self.tail] = v end
function Queue:dequeue()
  if self.head > self.tail then return nil end
  local v = self[self.head]
  self[self.head] = nil
  self.head = self.head + 1
  return v
end

local q = Queue.new()
q:enqueue("a") q:enqueue("b")
print(q:dequeue(), q:dequeue(), q:dequeue())
`),
    ex("lua2-ex-024", "A linked list", "Cons cells the Lua way.", "Data Structures", "linked_list",
        `local function cons(head, tail) return { head = head, tail = tail } end

local list = cons(1, cons(2, cons(3, nil)))

local function to_string(node)
  local out = {}
  while node do
    out[#out + 1] = tostring(node.head)
    node = node.tail
  end
  return table.concat(out, " -> ")
end
print(to_string(list))

local function len(node)
  local n = 0
  while node do n = n + 1 node = node.tail end
  return n
end
print("length:", len(list))

-- Reverse by rebuilding.
local function reverse(node)
  local acc = nil
  while node do
    acc = cons(node.head, acc)
    node = node.tail
  end
  return acc
end
print(to_string(reverse(list)))
`),
    ex("lua2-ex-025", "Memoization", "A generic cache higher-order function.", "Functions", "memoize",
        `local function memoize(fn)
  local cache = {}
  return setmetatable({}, {
    __index = function(_, k)
      if cache[k] == nil then cache[k] = fn(k) end
      return cache[k]
    end,
    __call = function(self, k) return self[k] end,
  })
end

local calls = 0
local slow_double = memoize(function(n)
  calls = calls + 1
  return n * 2
end)

print(slow_double(21), calls)
print(slow_double(21), calls)   -- cached: calls stays 1
print(slow_double(5), calls)
print(slow_double(5), calls)
`),
    ex("lua2-ex-026", "Varargs and select", "... packing, #-1 counting.", "Functions", "varargs",
        `local function count(...) return select("#", ...) end
print(count(1, 2, 3), count(), count(nil, nil))

local function head(...)
  return ...
end
print(head(10, 20, 30))

local function tail(...)
  return select(2, ...)
end
print(tail(10, 20, 30))

-- Pack into a table with an n field.
local function collect(...)
  return table.pack(...)
end
local t = collect("a", "b")
print(t.n, t[1], t[2])

-- forward varargs along.
local function passthrough(...) return count(...) end
print(passthrough("x", "y"))
`),
    ex("lua2-ex-027", "String interpolation by hand", "A gsub-powered template function.", "Strings & Patterns", "templates_lua",
        `local function interpolate(tpl, vars)
  return (tpl:gsub("%$([%w_]+)", function(k)
    return tostring(vars[k] ~= nil and vars[k] or ("<" .. k .. ">")
  end))
end

print(interpolate("Hello $name, round $round!", { name = "Praxis", round = 45 }))
print(interpolate("$a + $b = missing", { a = 1, b = 2 }))
print(interpolate("no vars here", {}))

-- The same idea with named args for safety.
local function fmt(tpl, t)
  return (tpl:gsub("{(%w+)}", function(k) return tostring(t[k]) end))
end
print(fmt("{city} at {temp}C", { city = "Cairo", temp = 34 }))
`),
    ex("lua2-ex-028", "Closures as objects", "State without tables.", "Functions", "closure_objects",
        `-- A counter made only of a closure.
local function make_counter()
  local n = 0
  return {
    bump = function(step) n = n + (step or 1) return n end,
    peek = function() return n end,
  }
end

local c = make_counter()
print(c.bump(), c.bump(5), c.peek())
local d = make_counter()
print("independent:", d.peek())

-- A stack of closures: private state forever.
local function make_account(start)
  local balance = start
  return function(op, amount)
    if op == "deposit" then balance = balance + amount
    elseif op == "withdraw" then balance = balance - amount end
    return balance
  end
end
local acct = make_account(100)
print(acct("deposit", 50), acct("withdraw", 30))
`),
    ex("lua2-ex-029", "goto and structured state", "goto as a clean state machine.", "Language Features", "goto_states",
        `-- Lua's goto is local-labels only - perfect for small state machines.
local function classify(text)
  ::restart::
  if #text == 0 then return "empty" end
  if text:find("^%d") then
    text = text:gsub("^%d+", "", 1)
    goto restart
  end
  if text:find("^%s") then
    text = text:gsub("^%s+", "", 1)
    goto restart
  end
  return "word: " .. text
end

print(classify(" 42 praxis"))
print(classify(""))
print(classify("go"))
`),
    ex("lua2-ex-030", "Multiple assignment and swap", "Parallel assignment tricks.", "Language Features", "parallel_assign",
        `local x, y = 1, 99
x, y = y, x                    -- the classic swap
print(x, y)

local a, b, c = 1, 2           -- c is nil
print(a, b, c)

-- Extra values are dropped.
local p, q = (function() return 1, 2, 3 end)()
print(p, q)

-- Table swap through indexing.
local t = { first = "a", second = "b" }
t.first, t.second = t.second, t.first
print(t.first, t.second)

-- And the receive side of a function call.
local function minmax(values)
  local lo, hi = math.huge, -math.huge
  for _, v in ipairs(values) do
    if v < lo then lo = v end
    if v > hi then hi = v end
  end
  return lo, hi
end
print(minmax({ 8, 3, 9, 1 }))
`),
    ex("lua2-ex-031", "Integer and float awareness", "5.3+ numeric subtleties.", "Language Features", "numerics",
        `print(math.type(1), math.type(1.0), math.type(1 // 1))
print(3 / 2, 3 // 2)            -- float divide vs integer floor

-- Integer overflow WRAPS (not an error).
print(math.maxinteger + 1 == math.mininteger)

print(string.format("%.17g", 0.1))
print(0.1 + 0.2 == 0.3)         -- the usual float truth
print(math.abs(0.1 + 0.2 - 0.3) < 1e-12)

-- tonumber parses with base or floats.
print(tonumber("42"), tonumber("ff", 16), tonumber("2.5e3"))
`),
    ex("lua2-ex-032", "A mini test harness", "assert + counters.", "Testing", "mini_tests_lua",
        `local passed, failed = 0, 0

local function check(name, fn)
  local ok, err = pcall(fn)
  if ok then
    passed = passed + 1
    print("  ok   " .. name)
  else
    failed = failed + 1
    print("  FAIL " .. name .. " -> " .. tostring(err))
  end
end

local function clamp(v, lo, hi)
  return math.max(lo, math.min(v, hi))
end

check("inside", function() assert(clamp(5, 0, 10) == 5) end)
check("below",   function() assert(clamp(-3, 0, 10) == 0) end)
check("above",   function() assert(clamp(99, 0, 10) == 10) end)
check("concat",  function() assert("prax" .. "is" == "praxis") end)

print(passed .. "/" .. passed + failed .. " passed")
`),
    ex("lua2-ex-033", "A tiny benchmark", "clock-based timing harness.", "Testing", "bench_lua",
        `local function bench(name, n, fn)
  local t0 = os.clock()
  for _ = 1, n do fn() end
  local ms = (os.clock() - t0) * 1000
  print(string.format("%-10s %8.1f ms over %d runs", name, ms, n))
  return ms
end

bench("concat", 200000, function()
  local s = ""
  for i = 1, 10 do s = s .. i end
end)

bench("table", 200000, function()
  local t = {}
  for i = 1, 10 do t[#t + 1] = i end
end)
print("(table building usually wins as strings are immutable)")
`),
    ex("lua2-ex-034", "Environment control", "setmetatable(_G) sandbox-lite.", "Advanced", "env_control",
        `-- Run untrusted-ish code with a restricted view of globals.
local function sandboxed(chunk_src)
  local chunk = load(chunk_src, "sandbox", "t", {
    print = print,
    math = math,
    string = string,
  })
  if not chunk then return "compile error" end
  local ok, result = pcall(chunk)
  return ok and tostring(result) or ("runtime error: " .. tostring(result))
end

print(sandboxed("return math.pi"))
print(sandboxed("return 1 + 1"))
print(sandboxed("os.remove('/everything')"))   -- os is hidden
print(sandboxed("print('printing is allowed')"))
`),
    ex("lua2-ex-035", "A mini logger", "leveled output with a metatable config.", "Projects", "logger_lua",
        `local Logger = {}
Logger.__index = Logger
Logger.levels = { DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3 }

function Logger.new(min)
  return setmetatable({ min = min or 1, lines = 0 }, Logger)
end

function Logger:log(level, msg)
  if self.levels[level] < self.min then return end
  self.lines = self.lines + 1
  print(string.format("[%s] %-5s %s", os.date("%H:%M:%S"), level, msg))
end

local log = Logger.new()
log:log("DEBUG", "suppressed")
log:log("INFO", "service started")
log:log("WARN", "disk at 91%")
log:log("ERROR", "mirror sync failed")
print("emitted lines:", log.lines)
`),
    ex("lua2-ex-036", "A config loader", "KV parsing + defaults + validation.", "Projects", "config_lua",
        `local function load_config(text)
  local defaults = { host = "0.0.0.0", port = 8080, retries = 1 }
  local cfg = {}
  for k, v in pairs(defaults) do cfg[k] = v end

  for line in text:gmatch("[^\\r\\n]+") do
    local key, value = line:match("^(%w+)=(.+)$")
    if key then
      cfg[key] = tonumber(value) or value
    end
  end

  assert(type(cfg.port) == "number" and cfg.port >= 1 and cfg.port <= 65535,
         "port out of range: " .. tostring(cfg.port))
  return cfg
end

local cfg = load_config("host=127.0.0.1\\nport=9090")
print(cfg.host, cfg.port, cfg.retries)

local ok, err = pcall(load_config, "port=99999\\n")
print(ok, err)
`),
    ex("lua2-ex-037", "A stats report tool", "Formatting + aggregation.", "Projects", "report_lua",
        `local rows = {
  { city = "Cairo",  temp = 34 },
  { city = "Oslo",   temp = 12 },
  { city = "Sydney", temp = 26 },
}

table.sort(rows, function(a, b) return a.temp > b.temp end)

print(string.format("%-8s %5s", "CITY", "TEMP"))
print(string.rep("-", 13))
for _, r in ipairs(rows) do
  print(string.format("%-8s %5d", r.city, r.temp))
end

local total = 0
for _, r in ipairs(rows) do total = total + r.temp end
print(string.format("mean: %.1f", total / #rows))
print("range:", math.min(rows[1].temp, rows[#rows].temp),
      math.max(rows[1].temp, rows[#rows].temp))
`),
    ex("lua2-ex-038", "A complete wordstats", "split, tally, rank.", "Projects", "wordstats_lua",
        `local text = "go go is fun go runs everywhere fun times"

local counts = {}
for word in text:gmatch("%a+") do
  counts[word] = (counts[word] or 0) + 1
end

local ranked = {}
for w, n in pairs(counts) do
  ranked[#ranked + 1] = { word = w, n = n }
end
table.sort(ranked, function(a, b)
  if a.n ~= b.n then return a.n > b.n end
  return a.word < b.word
end)

print("unique words:", #ranked)
for i = 1, math.min(3, #ranked) do
  print(string.format("%-12s %dx", ranked[i].word, ranked[i].n))
end

local longest = ""
for w in text:gmatch("%a+") do
  if #w > #longest then longest = w end
end
print("longest:", longest)
`),
    ex("lua2-ex-039", "A prime toolkit", "isprime, nextprime, factors.", "Projects", "primes_lua",
        `local function isprime(n)
  if n < 2 then return false end
  local i = 2
  while i * i <= n do
    if n % i == 0 then return false end
    i = i + 1
  end
  return true
end

local function nextprime(n)
  local c = n + 1
  while not isprime(c) do c = c + 1 end
  return c
end

local function factors(n)
  local out, remaining, p = {}, n, 2
  while p * p <= remaining do
    while remaining % p == 0 do
      out[#out + 1] = p
      remaining = remaining // p
    end
    p = p + 1
  end
  if remaining > 1 then out[#out + 1] = remaining end
  return out
end

local primes = {}
for n = 1, 30 do if isprime(n) then primes[#primes + 1] = n end end
print(table.concat(primes, " "))
print(nextprime(13))
print(table.concat(factors(360), " x "))
`),
    ex("lua2-ex-040", "A binary search toolkit", "insertion point + exact find.", "Projects", "binary_search_lua",
        `local function lower_bound(t, target)
  local lo, hi = 1, #t + 1
  while lo < hi do
    local mid = (lo + hi) // 2
    if t[mid] < target then lo = mid + 1 else hi = mid end
  end
  return lo
end

local function binary_find(t, target)
  local i = lower_bound(t, target)
  if i <= #t and t[i] == target then return i end
  return nil
end

local v = { 2, 4, 6, 8, 10, 12 }

print(binary_find(v, 8))
print(binary_find(v, 7))
print("7 would insert at:", lower_bound(v, 7))
print("0 would insert at:", lower_bound(v, 0))
print(binary_find(v, 12), binary_find(v, 2))
`),
    ex("lua2-ex-041", "A LRU cache", "Bounded cache with eviction.", "Projects", "lru_cache",
        `local LRU = {}
LRU.__index = LRU

function LRU.new(capacity)
  return setmetatable({ cap = capacity, n = 0, order = {} }, LRU)
end

function LRU:get(key)
  local hit = self[key]
  if hit == nil then return nil end
  -- refresh recency: move to the end of order.
  for i, k in ipairs(self.order) do
    if k == key then table.remove(self.order, i) break end
  end
  self.order[#self.order + 1] = key
  return hit
end

function LRU:set(key, value)
  if self[key] == nil then
    self.n = self.n + 1
    if self.n > self.cap then
      local victim = table.remove(self.order, 1)
      self[victim], self.n = nil, self.n - 1
    end
  end
  self[key] = value
  self:get(key) -- mark as recent
end

local c = LRU.new(2)
c:set("a", 1) c:set("b", 2)
print(c:get("a"))       -- refresh a
c:set("c", 3)           -- evicts b
print(c:get("b"), c:get("c"))
`),
    ex("lua2-ex-042", "A tiny event emitter", "on/emit/off with Lua closures.", "Projects", "event_emitter",
        `local Emitter = {}
Emitter.__index = Emitter

function Emitter.new()
  return setmetatable({ handlers = {} }, Emitter)
end

function Emitter:on(event, fn)
  local list = self.handlers[event] or {}
  list[#list + 1] = fn
  self.handlers[event] = list
  return fn
end

function Emitter:off(event, fn)
  local list = self.handlers[event] or {}
  for i, f in ipairs(list) do
    if f == fn then table.remove(list, i) break end
  end
end

function Emitter:emit(event, ...)
  for _, fn in ipairs(self.handlers[event] or {}) do
    fn(...)
  end
end

local bus = Emitter.new()
local handler = bus:on("log", function(msg) print("log: " .. msg) end)
bus:on("log", function(msg) print("  (second listener saw it too)") end)

bus:emit("log", "service started")
bus:off("log", handler)
bus:emit("log", "after removal")
`),
];
