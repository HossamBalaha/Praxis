/**
 * Python — OOP & classes examples. Category: "OOP & classes".
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {cl, fn, mkExample, vr} from "./_helpers";

const CAT = "OOP & classes";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_OOP_EXAMPLES: FileExample[] = [
    // ─── Classes & methods ───────────────────────────────────────────
    py("py-ex-bank-account", "OOP: bank account", "Class with validation, __repr__, and a small usage scenario.", "Classes & methods", "bank_account",
        (s) => `# -*- coding: utf-8 -*-
"""A small class demonstrating state, validation and repr."""


class ${applyNamingStyle(s.classes, "BankAccount")}:
    """A simple bank account that rejects invalid operations."""

    def __init__(self, ${applyNamingStyle(s.variables, "owner")}: str, ${applyNamingStyle(s.variables, "balance")}: float = 0.0):
        self.${applyNamingStyle(s.variables, "owner")} = ${applyNamingStyle(s.variables, "owner")}
        self.${applyNamingStyle(s.variables, "balance")} = ${applyNamingStyle(s.variables, "balance")}

    def ${applyNamingStyle(s.functions, "deposit")}(self, ${applyNamingStyle(s.variables, "amount")}: float) -> None:
        if ${applyNamingStyle(s.variables, "amount")} <= 0:
            raise ValueError("deposit must be positive")
        self.${applyNamingStyle(s.variables, "balance")} += ${applyNamingStyle(s.variables, "amount")}

    def ${applyNamingStyle(s.functions, "withdraw")}(self, ${applyNamingStyle(s.variables, "amount")}: float) -> None:
        if ${applyNamingStyle(s.variables, "amount")} > self.${applyNamingStyle(s.variables, "balance")}:
            raise ValueError("insufficient funds")
        self.${applyNamingStyle(s.variables, "balance")} -= ${applyNamingStyle(s.variables, "amount")}

    def __repr__(self) -> str:
        return f"${applyNamingStyle(s.classes, "BankAccount")}({self.${applyNamingStyle(s.variables, "owner")}!r}, {self.${applyNamingStyle(s.variables, "balance")}:.2f})"


${applyNamingStyle(s.variables, "account")} = ${applyNamingStyle(s.classes, "BankAccount")}("Ada", 100.0)
${applyNamingStyle(s.variables, "account")}.${applyNamingStyle(s.functions, "deposit")}(50.0)
${applyNamingStyle(s.variables, "account")}.${applyNamingStyle(s.functions, "withdraw")}(30.0)
print(${applyNamingStyle(s.variables, "account")})

try:
    ${applyNamingStyle(s.variables, "account")}.${applyNamingStyle(s.functions, "withdraw")}(999.0)
except ValueError as ${applyNamingStyle(s.variables, "error")}:
    print(f"rejected: {${applyNamingStyle(s.variables, "error")}}")
`),
    py("py-ex-temperature", "Temperature converter", "A value class with classmethods as alternate constructors.", "Classes & methods", "temperature_converter",
        (s) => {
            const f = fn(s), v = vr(s), c = cl(s);
            return `# -*- coding: utf-8 -*-
"""A Temperature class with unit-aware constructors."""


class ${c("Temperature")}:
    def __init__(self, celsius: float):
        self.celsius = celsius

    @classmethod
    def ${f("from_fahrenheit")}(cls, fahrenheit: float) -> "${c("Temperature")}":
        return cls((fahrenheit - 32) * 5 / 9)

    @classmethod
    def ${f("from_kelvin")}(cls, kelvin: float) -> "${c("Temperature")}":
        return cls(kelvin - 273.15)

    @property
    def ${f("fahrenheit")}(self) -> float:
        return self.celsius * 9 / 5 + 32

    def __add__(self, other: "${c("Temperature")}}") -> "${c("Temperature")}":
        return ${c("Temperature")}(self.celsius + other.celsius)

    def __repr__(self) -> str:
        return f"${c("Temperature")}({self.celsius:.2f} C)"


${v("boiling")} = ${c("Temperature")}(100.0)
${v("body")} = ${c("Temperature")}.from_fahrenheit(98.6)
${v("absolute_zero")} = ${c("Temperature")}.from_kelvin(0.0)

print(f"boiling water : {${v('boiling')}}")
print(f"body temp     : {${v('body')}}")
print(f"absolute zero : {${v('absolute_zero')}}")
print(f"body in F     : {${v('body')}.fahrenheit:.1f}")
print(f"sum           : {${v('boiling')} + ${v('body')}}")
`;
        }),
    py("py-ex-stack-class", "Stack & Queue classes", "LIFO and FIFO containers with full dunder support.", "Classes & methods", "stack_queue",
        (s) => {
            const f = fn(s), v = vr(s), c = cl(s);
            return `# -*- coding: utf-8 -*-
"""Stack (LIFO) and Queue (FIFO) — the container classics."""
from collections import deque


class ${c("Stack")}:
    def __init__(self):
        self._items = []

    def push(self, item) -> None:
        self._items.append(item)

    def pop(self):
        if not self._items:
            raise IndexError("pop from an empty stack")
        return self._items.pop()

    def peek(self):
        return self._items[-1] if self._items else None

    def __len__(self) -> int:
        return len(self._items)

    def __bool__(self) -> bool:
        return bool(self._items)

    def __repr__(self) -> str:
        return f"${c("Stack")}({self._items!r})"


class ${c("Queue")}:
    def __init__(self):
        self._items = deque()

    def enqueue(self, item) -> None:
        self._items.append(item)

    def dequeue(self):
        if not self._items:
            raise IndexError("dequeue from an empty queue")
        return self._items.popleft()

    def __len__(self) -> int:
        return len(self._items)

    def __repr__(self) -> str:
        return f"${c("Queue")}({list(self._items)!r})"


${v("stack")} = ${c("Stack")}()
for ${v("value")} in [1, 2, 3]:
    ${v("stack")}.push(${v("value")})
print(f"stack      : {${v("stack")}}")
print(f"pop x2     : {${v("stack")}.pop()}, {${v("stack")}.pop()}")
print(f"peek       : {${v("stack")}.peek()}")

${v("queue")} = ${c("Queue")}()
for ${v("name")} in ["alice", "bob", "carol"]:
    ${v("queue")}.enqueue(${v("name")})
print(f"queue      : {${v("queue")}}")
print(f"served     : {${v("queue")}.dequeue()}")
print(f"remaining  : {len(${v("queue")})}")
`;
        }),
    py("py-ex-vector", "Vector with dunders", "__add__, __mul__, __abs__, __eq__ — operator overloading done right.", "Classes & methods", "vector_dunders",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A 2-D vector that behaves like a number."""
import math


class ${c("Vector")}:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y

    def __add__(self, other: "${c("Vector")}}") -> "${c("Vector")}":
        return ${c("Vector")}(self.x + other.x, self.y + other.y)

    def __sub__(self, other: "${c("Vector")}}") -> "${c("Vector")}":
        return ${c("Vector")}(self.x - other.x, self.y - other.y)

    def __mul__(self, scalar: float) -> "${c("Vector")}":
        return ${c("Vector")}(self.x * scalar, self.y * scalar)

    def __abs__(self) -> float:
        return math.hypot(self.x, self.y)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ${c("Vector")}):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __repr__(self) -> str:
        return f"${c("Vector")}({self.x:.2f}, {self.y:.2f})"


${v("a")} = ${c("Vector")}(3, 4)
${v("b")} = ${c("Vector")}(1, 2)

print(f"a           : {${v("a")}}")
print(f"a + b       : {${v("a")} + ${v("b")}}")
print(f"a - b       : {${v("a")} - ${v("b")}}")
print(f"a * 2       : {${v("a")} * 2}")
print(f"|a|         : {abs(${v("a")})}")
print(f"a == Vector(3, 4): {${v("a")} == ${c("Vector")}(3, 4)}")
print(f"a == (3, 4) : {${v("a")} == (3, 4)}")
`;
        }),

    // ─── Dataclasses ─────────────────────────────────────────────────
    py("py-ex-dataclass", "Dataclass inventory", "Typed dataclasses with defaults, a method, and sorted printing.", "Dataclasses", "dataclass_inventory",
        (s) => `# -*- coding: utf-8 -*-
"""Dataclasses: defaults, field ordering, methods, and sorting."""
from dataclasses import dataclass, field


@dataclass(order=True)
class ${applyNamingStyle(s.classes, "Item")}:
    sort_index: float = field(init=False, repr=False)
    name: str = ""
    quantity: int = 0
    unit_price: float = 0.0
    tags: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.sort_index = -self.quantity * self.unit_price

    @property
    def total(self) -> float:
        return self.quantity * self.unit_price


${applyNamingStyle(s.variables, "inventory")} = [
    ${applyNamingStyle(s.classes, "Item")}(name="cable", quantity=12, unit_price=3.5, tags=["hw"]),
    ${applyNamingStyle(s.classes, "Item")}(name="keyboard", quantity=2, unit_price=85.0, tags=["hw", "input"]),
    ${applyNamingStyle(s.classes, "Item")}(name="notebook", quantity=30, unit_price=1.2, tags=["office"]),
]

for ${applyNamingStyle(s.variables, "item")} in sorted(${applyNamingStyle(s.variables, "inventory")}):
    print(f"{${applyNamingStyle(s.variables, "item")}.name:<10} x{${applyNamingStyle(s.variables, "item")}.quantity:<3} @{${applyNamingStyle(s.variables, "item")}.unit_price:>6.2f} = {${applyNamingStyle(s.variables, "item")}.total:>8.2f}  {${applyNamingStyle(s.variables, "item")}.tags}")

print(f"inventory value: {sum(${applyNamingStyle(s.variables, "i")}.total for ${applyNamingStyle(s.variables, "i")} in ${applyNamingStyle(s.variables, "inventory")}):.2f}")
`),
    py("py-ex-frozen-dataclass", "Frozen dataclass config", "Immutable settings with hashing and validation.", "Dataclasses", "frozen_config",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Frozen dataclasses: immutable, hashable, validatable."""
from dataclasses import dataclass


@dataclass(frozen=True)
class ${c("DbConfig")}:
    host: str = "localhost"
    port: int = 5432
    database: str = "app"
    user: str = "app"
    pool_size: int = 5

    def __post_init__(self) -> None:
        if not 1 <= self.port <= 65535:
            raise ValueError(f"port {self.port} out of range")
        if self.pool_size < 1:
            raise ValueError("pool_size must be positive")

    @property
    def url(self) -> str:
        return f"postgresql://{self.user}@{self.host}:{self.port}/{self.database}"


${v("default_config")} = ${c("DbConfig")}()
${v("custom_config")} = ${c("DbConfig")}(host="db.example.com", port=6543, database="metrics")

print(f"default url : {${v("default_config")}.url}")
print(f"custom url  : {${v("custom_config")}.url}")
print(f"hashable    : {${v("default_config")} in {${v("default_config")}, ${v("custom_config")}}}")

try:
    ${v("default_config")}.port = 9999
except Exception as ${v("err")}:
    print(f"immutable   : {type(${v("err")}).__name__}")

try:
    ${c("DbConfig")}(port=99999)
except ValueError as ${v("err")}:
    print(f"validation  : {${v("err")}}")
`;
        }),
    py("py-ex-nested-dataclass", "Nested dataclasses from dict", "from_dict recursion — JSON payloads become typed objects.", "Dataclasses", "nested_from_dict",
        (s) => {
            const c = cl(s), f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Build nested dataclasses from a plain dict."""
from dataclasses import dataclass, fields
from typing import Any


@dataclass
class ${c("Address")}:
    city: str
    zip_code: str


@dataclass
class ${c("Employee")}:
    name: str
    salary: float
    address: ${c("Address")}
    skills: list[str]


def ${f("from_dict")}(cls, data: dict[str, Any]):
    ${v("kwargs")} = {}
    for ${v("field")} in fields(cls):
        ${v("value")} = data.get(${v("field")}.name)
        ${v("type_name")} = ${v("field")}.type if isinstance(${v("field")}.type, str) else getattr(${v("field")}.type, "__name__", "")
        if isinstance(${v("value")}, dict):
            ${v("value")} = ${f("from_dict")}(globals()[${v("type_name")}], ${v("value")})
        ${v("kwargs")}[${v("field")}.name] = ${v("value")}
    return cls(**${v("kwargs")})


${v("payload")} = {
    "name": "ada lovelace",
    "salary": 95000.0,
    "address": {"city": "london", "zip_code": "w1"},
    "skills": ["math", "programming"],
}

${v("employee")} = ${f("from_dict")}(${c("Employee")}, ${v("payload")})
print(f"name    : {${v("employee")}.name.title()}")
print(f"city    : {${v("employee")}.address.city}")
print(f"skills  : {${v("employee")}.skills}")
print(f"raise   : {${v("employee")}.salary * 1.1:,.0f}")
`;
        }),

    // ─── Inheritance & protocols ─────────────────────────────────────
    py("py-ex-shapes", "Shape hierarchy", "Abstract base class with area/perimeter contracts.", "Inheritance & protocols", "shape_hierarchy",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Polymorphism through an abstract base class."""
from abc import ABC, abstractmethod
import math


class ${c("Shape")}(ABC):
    @abstractmethod
    def area(self) -> float: ...

    @abstractmethod
    def perimeter(self) -> float: ...

    def describe(self) -> str:
        return f"{type(self).__name__}: area={self.area():.2f}, perimeter={self.perimeter():.2f}"


class ${c("Circle")}(${c("Shape")}):
    def __init__(self, radius: float):
        self.radius = radius

    def area(self) -> float:
        return math.pi * self.radius ** 2

    def perimeter(self) -> float:
        return 2 * math.pi * self.radius


class ${c("Rectangle")}(${c("Shape")}):
    def __init__(self, width: float, height: float):
        self.width = width
        self.height = height

    def area(self) -> float:
        return self.width * self.height

    def perimeter(self) -> float:
        return 2 * (self.width + self.height)


class ${c("Square")}(${c("Rectangle")}):
    def __init__(self, side: float):
        super().__init__(side, side)


${v("shapes")} = [${c("Circle")}(1.0), ${c("Rectangle")}(3, 4), ${c("Square")}(2.5)]
for ${v("shape")} in ${v("shapes")}:
    print(${v("shape")}.describe())

${v("total_area")} = sum(${v("shape")}.area() for ${v("shape")} in ${v("shapes")})
print(f"total area: {${v("total_area")}:.3f}")

try:
    ${c("Shape")}()
except TypeError as ${v("err")}:
    print(f"abstract enforced: {${v("err")}}")
`;
        }),
    py("py-ex-mixin", "Mixin classes", "Compose behavior: JSON-mixin + CSV-mixin over one core class.", "Inheritance & protocols", "mixin_classes",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Mixins: small capabilities, combined freely."""
import json


class ${c("JsonMixin")}:
    def to_json(self) -> str:
        return json.dumps(self.__dict__, default=str)

    @classmethod
    def from_json(cls, raw: str):
        return cls(**json.loads(raw))


class ${c("ComparableMixin")}:
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, type(self)):
            return NotImplemented
        return self.sort_key() == other.sort_key()

    def __lt__(self, other) -> bool:
        return self.sort_key() < other.sort_key()

    def sort_key(self):
        raise NotImplementedError


class ${c("Book")}(${c("JsonMixin")}, ${c("ComparableMixin")}):
    def __init__(self, title: str, year: int):
        self.title = title
        self.year = year

    def sort_key(self):
        return (self.year, self.title)

    def __repr__(self) -> str:
        return f"${c("Book")}({self.title!r}, {self.year})"


${v("library")} = [
    ${c("Book")}("structure", 1962),
    ${c("Book")}("paradigms", 1994),
    ${c("Book")}("art of programming", 1968),
]

print("sorted by year:")
for ${v("book")} in sorted(${v("library")}):
    print(f"  {${v("book")}}")

${v("serialized")} = ${v("library")}[0].to_json()
print(f"json: {${v("serialized")}}")
print(f"round-trip: {${c("Book")}.from_json(${v("serialized")})}")
print(f"equality: {${c("Book")}('structure', 1962) == ${v("library")}[0]}")
`;
        }),
    py("py-ex-protocol", "Protocols (duck typing)", "typing.Protocol — interfaces without inheritance.", "Inheritance & protocols", "protocol_typing",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Protocols: structural typing — if it quacks, it counts."""
from typing import Protocol


class ${c("Speaker")}(Protocol):
    def speak(self) -> str: ...


class ${c("Dog")}:
    def __init__(self, name: str):
        self.name = name

    def speak(self) -> str:
        return f"{self.name}: woof"


class ${c("Robot")}:
    def speak(self) -> str:
        return "BEEP-BOOP"

    def recharge(self) -> str:
        return "charging"




def make_it_talk(speaker: ${c("Speaker")}) -> str:
    return speaker.speak()


${v("dog")} = ${c("Dog")}("rex")
${v("robot")} = ${c("Robot")}()

print(make_it_talk(${v("dog")}))
print(make_it_talk(${v("robot")}))  # no inheritance needed

${v("not_a_speaker")} = 42
print(f"Dog has speak   : {hasattr(${v("dog")}, 'speak')}")
print(f"Robot has speak : {hasattr(${v("robot")}, 'speak')}")
print(f"int has speak   : {hasattr(${v("not_a_speaker")}, 'speak')}")
`;
        }),
    py("py-ex-composition", "Composition over inheritance", "Engine + Car — HAS-A beats IS-A for flexible design.", "Inheritance & protocols", "composition",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Composition: delegate instead of inherit."""


class ${c("Engine")}:
    def __init__(self, horsepower: int, fuel: str = "gasoline"):
        self.horsepower = horsepower
        self.fuel = fuel
        self.running = False

    def start(self) -> str:
        self.running = True
        return f"{self.fuel} engine ({self.horsepower} hp) started"

    def stop(self) -> str:
        self.running = False
        return "engine stopped"


class ${c("Battery")}:
    def __init__(self, kwh: float):
        self.kwh = kwh
        self.charge = 1.0

    def drain(self, fraction: float) -> None:
        self.charge = max(0.0, self.charge - fraction)


class ${c("Car")}:
    def __init__(self, name: str, engine: ${c("Engine")}, battery: ${c("Battery")} | None = None):
        self.name = name
        self.engine = engine
        self.battery = battery

    def drive(self, distance_km: float) -> str:
        if not self.engine.running:
            return f"{self.name}: start the engine first"
        if self.battery:
            self.battery.drain(distance_km / 400)
        return f"{self.name}: drove {distance_km:.0f} km"

    def status(self) -> str:
        ${v("battery_line")} = f", battery {self.battery.charge:.0%}" if self.battery else ""
        return f"{self.name}: {'running' if self.engine.running else 'off'}{${v("battery_line")}}"


${v("gas_car")} = ${c("Car")}("classic", ${c("Engine")}(180))
${v("hybrid")} = ${c("Car")}("prius", ${c("Engine")}(90), ${c("Battery")}(8.8))

print(${v("gas_car")}.drive(10))
print(${v("gas_car")}.engine.start())
print(${v("gas_car")}.drive(50))
print(${v("gas_car")}.status())

print(${v("hybrid")}.engine.start())
print(${v("hybrid")}.drive(120))
print(${v("hybrid")}.status())
`;
        }),

    // ─── Dunders & magic ─────────────────────────────────────────────
    py("py-ex-iterable-class", "Iterable Fibonacci class", "__iter__ + __next__: a class you can for-loop over.", "Dunders & magic", "iterable_fibonacci",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A class that acts like a sequence."""


class ${c("Fibonacci")}:
    def __init__(self, limit: int):
        self.limit = limit

    def __iter__(self):
        ${v("current")}, ${v("next_value")} = 0, 1
        for _ in range(self.limit):
            yield ${v("current")}
            ${v("current")}, ${v("next_value")} = ${v("next_value")}, ${v("current")} + ${v("next_value")}

    def __len__(self) -> int:
        return self.limit

    def __getitem__(self, index: int) -> int:
        if index >= self.limit:
            raise IndexError(index)
        ${v("current")}, ${v("next_value")} = 0, 1
        for _ in range(index):
            ${v("current")}, ${v("next_value")} = ${v("next_value")}, ${v("current")} + ${v("next_value")}
        return ${v("current")}


${v("fibs")} = ${c("Fibonacci")}(10)
print(f"iterate  : {list(${v("fibs")})}")
print(f"len      : {len(${v("fibs")})}")
print(f"fib[7]   : {${v("fibs")}[7]}")
print(f"last     : {${v("fibs")}[len(${v("fibs")}) - 1]}")
print(f"sum      : {sum(${v("fibs")})}")
print(f"reversed : {list(reversed(list(${v("fibs")})))}")
`;
        }),
    py("py-ex-context-manager", "Context manager", "__enter__/__exit__ + contextlib — guaranteed cleanup.", "Dunders & magic", "context_manager",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Context managers: setup + teardown, exception-safe."""
import time
from contextlib import contextmanager


class ${c("Timer")}:
    def __init__(self, label: str):
        self.label = label

    def __enter__(self) -> "${c("Timer")}":
        self.started = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        self.elapsed_ms = (time.perf_counter() - self.started) * 1000
        if exc_type is not None:
            print(f"[{self.label}] aborted after {self.elapsed_ms:.1f} ms: {exc_value}")
            return True  # swallow the exception
        print(f"[{self.label}] took {self.elapsed_ms:.1f} ms")
        return False


@contextmanager
def ${c("TagWriter")}(name: str):
    print(f"<{name}>")
    try:
        yield name.upper()
    finally:
        print(f"</{name}>")


${v("total")} = 0
with ${c("Timer")}("sum 100k") as ${v("timer")}:
    for ${v("i")} in range(100_000):
        ${v("total")} += ${v("i")}
print(f"sum = {${v("total")}}")

with ${c("Timer")}("boom"):
    raise RuntimeError("simulated failure")

with ${c("TagWriter")}("report") as ${v("title")}:
    print(f"  title: {${v("title")}}")
`;
        }),
    py("py-ex-property", "Properties & validation", "getters/setters the Python way — with read-only and computed fields.", "Dunders & magic", "properties_validation",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Properties: validation without setter noise."""


class ${c("Account")}:
    def __init__(self, owner: str, balance: float = 0.0):
        self.owner = owner
        self.balance = balance  # goes through the setter below

    @property
    def balance(self) -> float:
        return self._balance

    @balance.setter
    def balance(self, value: float) -> None:
        if value < 0:
            raise ValueError(f"balance cannot be negative: {value}")
        self._balance = value

    @property
    def is_rich(self) -> bool:
        return self._balance >= 1_000_000

    def __repr__(self) -> str:
        return f"${c("Account")}({self.owner!r}, {self._balance:.2f})"


${v("account")} = ${c("Account")}("ada", 500.0)
print(${v("account")})

${v("account")}.balance += 250.0
print(f"after deposit : {${v("account")}.balance}")
print(f"is_rich       : {${v("account")}.is_rich}")

${v("account")}.balance = 2_000_000
print(f"is_rich now   : {${v("account")}.is_rich}")

try:
    ${v("account")}.balance = -10
except ValueError as ${v("err")}:
    print(f"rejected      : {${v("err")}}")
`;
        }),
    py("py-ex-enum", "Enums & ReprEnum", "Grouped constants with iteration, values, and name safety.", "Dunders & magic", "enums",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Enums: constants that refuse to be wrong."""
from enum import Enum, auto


class ${c("OrderStatus")}(Enum):
    PENDING = auto()
    PAID = auto()
    SHIPPED = auto()
    DELIVERED = auto()
    CANCELLED = auto()


class ${c("Priority")}(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3

    def __ge__(self, other: "${c("Priority")}}") -> bool:
        return self.value >= other.value


${v("status")} = ${c("OrderStatus")}.PAID
print(f"status      : {${v("status")}}")
print(f"name        : {${v("status")}.name}")
print(f"value       : {${v("status")}.value}")
print(f"from value  : {${c("OrderStatus")}(2)}")
print(f"from name   : {${c('OrderStatus')}['SHIPPED']}")

print("\\nall statuses:")
for ${v("member")} in ${c("OrderStatus")}:
    print(f"  {${v("member")}.name:<10} = {${v("member")}.value}")

${v("tasks")} = [(${c("Priority")}.HIGH, "deploy"), (${c("Priority")}.LOW, "docs"), (${c("Priority")}.MEDIUM, "tests")]
for ${v("priority")}, ${v("task")} in sorted(${v("tasks")}, key=lambda t: t[0].value, reverse=True):
    print(f"[{${v("priority")}.name:<6}] {${v("task")}}")

print(f"\\nHIGH >= MEDIUM: {${c("Priority")}.HIGH >= ${c("Priority")}.MEDIUM}")
print(f"members count : {len(${c("OrderStatus")})}")
`;
        }),
    py("py-ex-exceptions-hierarchy", "Custom exception hierarchy", "Domain-specific errors with chaining and context.", "Dunders & magic", "exception_hierarchy",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A family of exceptions for a data pipeline."""


class ${c("PipelineError")}(Exception):
    """Base class for everything this pipeline can raise."""

    def __init__(self, stage: str, message: str):
        super().__init__(f"[{stage}] {message}")
        self.stage = stage


class ${c("SchemaError")}(${c("PipelineError")}):
    def __init__(self, stage: str, column: str, expected: str, got: str):
        super().__init__(stage, f"column {column!r}: expected {expected}, got {got}")
        self.column = column


class ${c("RangeError")}(${c("PipelineError")}):
    def __init__(self, stage: str, column: str, value: float, low: float, high: float):
        super().__init__(stage, f"{column}={value} outside [{low}, {high}]")
        self.column = column




def validate_row(row: dict) -> float:
    if "temperature" not in row:
        raise ${c("SchemaError")}("validate", "temperature", "float", "missing")
    ${v("value")} = row["temperature"]
    if not isinstance(${v("value")}, (int, float)):
        raise ${c("SchemaError")}("validate", "temperature", "float", type(${v("value")}).__name__)
    if not -90 <= ${v("value")} <= 60:
        raise ${c("RangeError")}("validate", "temperature", ${v("value")}, -90, 60)
    return float(${v("value")})


for ${v("row")} in [
    {"temperature": 21.4},
    {},
    {"temperature": "warm"},
    {"temperature": 120.0},
]:
    try:
        print(f"ok: {validate_row(${v("row")})}")
    except ${c("PipelineError")} as ${v("err")}:
        print(f"{type(${v("err")}).__name__}: {${v("err")}}")
`;
        }),
    py("py-ex-callable-object", "Callable objects", "__call__: instances that behave like functions.", "Dunders & magic", "callable_objects",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Instances you can call like functions."""


class ${c("Multiplier")}:
    def __init__(self, factor: float):
        self.factor = factor

    def __call__(self, value: float) -> float:
        return value * self.factor

    def __repr__(self) -> str:
        return f"${c("Multiplier")}({self.factor})"


class ${c("Counter2")}:
    def __init__(self):
        self.calls = 0

    def __call__(self) -> int:
        self.calls += 1
        return self.calls


${v("double")} = ${c("Multiplier")}(2.0)
${v("triple")} = ${c("Multiplier")}(3.0)

print(f"callable    : {callable(${v("double")})}")
print(f"double(21)  : {${v("double")}(21)}")
print(f"triple(7)   : {${v("triple")}(7)}")
print(f"map double  : {list(map(${v("double")}, [1, 2, 3]))}")

${v("counter")} = ${c("Counter2")}()
${v("counter")}()
${v("counter")}()
print(f"called      : {${v("counter")}()} times so far")
`;
        }),

    py("py-ex-slots", "__slots__ memory & speed", "Attribute dicts vs slots — measured, not preached.", "Dunders & magic", "slots_memory",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""__slots__: smaller objects, faster attributes."""
import sys


class ${c("PointDict")}:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y


class ${c("PointSlots")}:
    __slots__ = ("x", "y")

    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y


${v("a")} = ${c("PointDict")}(1.0, 2.0)
${v("b")} = ${c("PointSlots")}(1.0, 2.0)

print(f"dict version : {sys.getsizeof(${v("a")}) + sys.getsizeof(${v("a")}.__dict__)} bytes")
print(f"slots version: {sys.getsizeof(${v("b")})} bytes")

${v("dict_time")} = 0.0
${v("slots_time")} = 0.0
import time

${v("start")} = time.perf_counter()
for _ in range(1_000_000):
    ${v("a")}.x + ${v("a")}.y
${v("dict_time")} = time.perf_counter() - ${v("start")}

${v("start")} = time.perf_counter()
for _ in range(1_000_000):
    ${v("b")}.x + ${v("b")}.y
${v("slots_time")} = time.perf_counter() - ${v("start")}

print(f"1M attribute reads — dict: {${v("dict_time")}:.3f}s, slots: {${v("slots_time")}:.3f}s")

try:
    ${v("b")}.z = 1
except AttributeError as ${v("err")}:
    print(f"slots lock attributes down: {${v("err")}}")
`;
        }),
    py("py-ex-classmethod-ctors", "Alternative constructors", "from_csv, from_json, from_env — one class, many doors.", "Classes & methods", "classmethod_ctors",
        (s) => {
            const c = cl(s), f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Classmethods as extra constructors."""
import json


class ${c("ServerConfig")}:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port

    @classmethod
    def ${f("from_csv")}(cls, line: str) -> "${c("ServerConfig")}":
        ${v("host")}, ${v("port_text")} = line.strip().split(",")
        return cls(${v("host")}, int(${v("port_text")}))

    @classmethod
    def ${f("from_json")}(cls, raw: str) -> "${c("ServerConfig")}":
        ${v("data")} = json.loads(raw)
        return cls(${v("data")}["host"], ${v("data")}["port"])

    @classmethod
    def ${f("from_url")}(cls, url: str) -> "${c("ServerConfig")}":
        ${v("schemeless")} = url.split("://", 1)[-1]
        ${v("host")}, ${v("port_text")} = ${v("schemeless")}.rsplit(":", 1)
        return cls(${v("host")}, int(${v("port_text")}))

    def __repr__(self) -> str:
        return f"${c("ServerConfig")}({self.host}:{self.port})"


${v("configs")} = [
    ${c("ServerConfig")}("localhost", 8000),
    ${c("ServerConfig")}.${f("from_csv")}("db.example.com,5432"),
    ${c("ServerConfig")}.${f("from_json")}('{"host": "cache", "port": 6379}'),
    ${c("ServerConfig")}.${f("from_url")}("https://api.example.com:443"),
]
for ${v("config")} in ${v("configs")}:
    print(${v("config")})

${v("same")} = ${c("ServerConfig")}.${f("from_csv")}("localhost,8000") == ${v("configs")}[0]
print(f"csv constructor equals direct: {${v("same")}}")
`;
        }),
    py("py-ex-descriptor", "Descriptor validator", "A reusable field validator via the descriptor protocol.", "Classes & methods", "descriptor_validator",
        (s) => {
            const c = cl(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Descriptors: validation logic you attach, not repeat."""


class ${c("Range")}:
    def __init__(self, low: float, high: float):
        self.low = low
        self.high = high

    def __set_name__(self, owner, name: str) -> None:
        self.name = name

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        return obj.__dict__[self.name]

    def __set__(self, obj, value: float) -> None:
        if not self.low <= value <= self.high:
            raise ValueError(f"{self.name} must be in [{self.low}, {self.high}], got {value}")
        obj.__dict__[self.name] = value


class ${c("Measurement")}:
    temperature = ${c("Range")}(-90, 60)
    humidity = ${c("Range")}(0, 100)

    def __init__(self, temperature: float, humidity: float):
        self.temperature = temperature
        self.humidity = humidity

    def __repr__(self) -> str:
        return f"${c("Measurement")}(T={self.temperature}C, RH={self.humidity}%)"


print(${c("Measurement")}(21.4, 41))
print(${c("Measurement")}(38.9, 61))

for ${v("temp")}, ${v("hum")} in [(-100, 50), (25, 150)]:
    try:
        ${c("Measurement")}(${v("temp")}, ${v("hum")})
    except ValueError as ${v("err")}:
        print(f"rejected: {${v("err")}}")
`;
        }),
];
