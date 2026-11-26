/**
 * the C++ top-up: 40 more reference templates on top of the
 * ten more ("at least 50 like others". Pure C++17 stdlib.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "C++";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("cpp", id, label, description, CAT, sub, baseName, ".cpp", () => body);

export const CPP_2_EXAMPLES: FileExample[] = [
    ex("cpp2-ex-001", "References and const", "lvalue references, const refs for cheap reads, aliasing.", "Language Core", "references",
        `#include <iostream>

void tune(int &target, int by) { target += by; }
int read_only(const std::string &s) { return (int)s.size(); }

int main() {
    int n = 10;
    int &alias = n;         // alias IS n
    alias += 5;
    std::cout << "n = " << n << "\\n";

    tune(n, 2);
    std::cout << "tuned: " << n << "\\n";

    std::string word = "references";
    std::cout << "len = " << read_only(word) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-002", "auto and range-for", "Type inference and the universal iteration form.", "Language Core", "auto_ranges",
        `#include <iostream>
#include <vector>
#include <map>
#include <string>

int main() {
    std::vector<int> nums{3, 1, 4, 1, 5};
    int sum = 0;
    for (auto v : nums) sum += v;              // copy
    std::cout << "sum = " << sum << "\\n";

    std::map<std::string, int> ages{{"ada", 36}, {"alan", 41}};
    for (const auto &[name, age] : ages)      // structured binding
        std::cout << name << " is " << age << "\\n";

    for (auto it = nums.begin(); it != nums.end(); ++it)
        if (*it == 4) std::cout << "found 4 at distance " << std::distance(nums.begin(), it) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-003", "Classes: RAII resource guard", "Constructor acquires, destructor releases — no leaks.", "Classes & RAII", "raii_guard",
        `#include <cstdio>
#include <iostream>

class FileCloser {
    std::FILE *f;
public:
    explicit FileCloser(const char *path) : f(std::fopen(path, "w+")) {
        if (!f) throw std::runtime_error("open failed");
    }
    ~FileCloser() { if (f) std::fclose(f); }
    FileCloser(const FileCloser &) = delete;            // no copy
    FileCloser &operator=(const FileCloser &) = delete;
    void write(const std::string &s) { std::fputs(s.c_str(), f); }
};

int main() {
    {
        FileCloser fc("praxis_raii.txt");
        fc.write("managed by RAII\\n");
    }   // closed automatically here
    std::cout << "file closed by scope exit\\n";
    std::remove("praxis_raii.txt");
    return 0;
}
`),
    ex("cpp2-ex-004", "Rule of five", "Copy ctor, assignment, and the move pair, all visible.", "Classes & RAII", "rule_of_five",
        `#include <iostream>
#include <utility>

class Buffer {
    size_t n;
    int *data;
public:
    explicit Buffer(size_t n) : n(n), data(new int[n]{}) {
        std::cout << "ctor " << n << "\\n";
    }
    ~Buffer() { delete[] data; std::cout << "dtor\\n"; }
    Buffer(const Buffer &o) : n(o.n), data(new int[o.n]) {
        std::cout << "copy ctor\\n";
    }
    Buffer &operator=(const Buffer &o) {
        if (this != &o) { delete[] data; n = o.n; data = new int[o.n]; }
        std::cout << "copy assign\\n";
        return *this;
    }
    Buffer(Buffer &&o) noexcept : n(o.n), data(o.data) {
        o.data = nullptr; o.n = 0;
        std::cout << "move ctor\\n";
    }
    Buffer &operator=(Buffer &&o) noexcept {
        std::swap(n, o.n); std::swap(data, o.data);
        std::cout << "move assign\\n";
        return *this;
    }
};

int main() {
    Buffer a(4);
    Buffer b = a;          // copy
    Buffer c = std::move(a);  // move; a is now hollow
    b = std::move(c);
    return 0;
}
`),
    ex("cpp2-ex-005", "Inheritance and virtuals", "Base contract, override, virtual destructor.", "Classes & RAII", "inheritance",
        `#include <iostream>
#include <memory>
#include <vector>

class Shape {
public:
    virtual double area() const = 0;
    virtual ~Shape() = default;
};

class Circle : public Shape {
    double r;
public:
    explicit Circle(double r) : r(r) {}
    double area() const override { return 3.14159265 * r * r; }
};

class Square : public Shape {
    double s;
public:
    explicit Square(double s) : s(s) {}
    double area() const override { return s * s; }
};

int main() {
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Circle>(1.0));
    shapes.push_back(std::make_unique<Square>(2.0));

    for (const auto &s : shapes)
        std::cout << "area = " << s->area() << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-006", "Operator overloading", "A Vec2 with +, ==, << and scalar *.", "Classes & RAII", "operators",
        `#include <iostream>

class Vec2 {
    double x, y;
public:
    Vec2(double x, double y) : x(x), y(y) {}
    Vec2 operator+(const Vec2 &o) const { return {x + o.x, y + o.y}; }
    Vec2 operator*(double k) const { return {x * k, y * k}; }
    bool operator==(const Vec2 &o) const { return x == o.x && y == o.y; }
    friend std::ostream &operator<<(std::ostream &os, const Vec2 &v) {
        return os << "(" << v.x << ", " << v.y << ")";
    }
};

int main() {
    Vec2 a(1, 2), b(3, 4);
    std::cout << "a+b = " << a + b << "\\n";
    std::cout << "a*2.5 = " << a * 2.5 << "\\n";
    std::cout << "equal? " << ((a + b) == Vec2(4, 6)) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-007", "Templates", "Function + class templates, one specialization.", "Templates & Generics", "templates",
        `#include <iostream>
#include <string>

template <typename T>
T max_of(T a, T b) { return a > b ? a : b; }

template <typename T>
class Box {
    T item;
public:
    explicit Box(T item) : item(item) {}
    T get() const { return item; }
};

template <>
class Box<std::string> {
    std::string item;
public:
    explicit Box(std::string item) : item(std::move(item)) {}
    std::string upper() const {
        std::string out = item;
        for (auto &c : out) if (c >= 'a' && c <= 'z') c -= 32;
        return out;
    }
};

int main() {
    std::cout << max_of(3, 9) << " " << max_of(2.5, 2.7) << "\\n";
    Box<int> bi(42);
    Box<std::string> bs("praxis");
    std::cout << bi.get() << " " << bs.upper() << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-008", "STL algorithms tour", "sort, transform, accumulate, count_if, find_if.", "STL Standard", "algorithms",
        `#include <algorithm>
#include <iostream>
#include <numeric>
#include <vector>

int main() {
    std::vector<int> v{5, 2, 9, 1, 5, 6};

    std::sort(v.begin(), v.end());
    for (int x : v) std::cout << x << ' ';
    std::cout << "\\n";

    int total = std::accumulate(v.begin(), v.end(), 0);
    std::cout << "sum = " << total << " mean = " << (double)total / v.size() << "\\n";

    std::vector<int> doubled(v.size());
    std::transform(v.begin(), v.end(), doubled.begin(), [](int x) { return x * 2; });
    std::cout << "doubled has " << std::count_if(doubled.begin(), doubled.end(),
        [](int x) { return x > 10; }) << " big values\\n";

    auto it = std::find_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; });
    if (it != v.end()) std::cout << "first even: " << *it << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-009", "std::string in depth", "find, substr, compare, concatenation, numeric converts.", "STL Standard", "strings",
        `#include <iostream>
#include <string>

int main() {
    std::string s = "The quick brown fox";

    auto pos = s.find("brown");
    std::cout << "found at " << pos << ": " << s.substr(pos, 5) << "\\n";

    std::string upper;
    for (char c : s) upper += (char)std::toupper(c);
    std::cout << "shout: " << upper.substr(0, 9) << "\\n";

    std::string csv = "42,99,7";
    size_t p = 0;
    while ((p = csv.find(',')) != std::string::npos) {
        std::cout << "num: " << std::stoi(csv.substr(0, p)) << "\\n";
        csv.erase(0, p + 1);
    }
    std::cout << "last num: " << std::stoi(csv) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-010", "std::optional and variants-lite", "optional returns instead of sentinel values.", "Modern C++", "optional",
        `#include <iostream>
#include <optional>
#include <string>

std::optional<int> find_index(const std::string &s, char c) {
    for (size_t i = 0; i < s.size(); i++)
        if (s[i] == c) return (int)i;
    return std::nullopt;
}

int main() {
    if (auto idx = find_index("praxis", 'x'))
        std::cout << "x at " << *idx << "\\n";
    if (auto idx = find_index("praxis", 'q'))
        std::cout << "q at " << *idx << "\\n";
    else
        std::cout << "q not found (nullopt path)\\n";
    std::cout << "value_or: " << find_index("praxis", 'q').value_or(-1) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-011", "Lambdas and captures", "By value, by reference, mutable, generic.", "Modern C++", "lambdas",
        `#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    int factor = 3;
    int used = 0;

    auto scaled = [factor](int x) { return x * factor; };          // by value
    auto tally = [&used](int) { used++; };                          // by reference
    auto counter = [count = 0]() mutable { return ++count; };      // init capture

    std::cout << "scaled: " << scaled(14) << "\\n";

    std::vector<int> v{1, 2, 3};
    std::for_each(v.begin(), v.end(), tally);
    std::cout << "tally used " << used << " times\\n";
    std::cout << "counter: " << counter() << " " << counter() << "\\n";

    std::sort(v.begin(), v.end(), [](int a, int b) { return a > b; });
    for (int x : v) std::cout << x << ' ';
    std::cout << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-012", "Smart pointers", "unique_ptr ownership, shared_ptr counts, weak observation.", "Modern C++", "smart_pointers",
        `#include <iostream>
#include <memory>

struct Node {
    int id;
    explicit Node(int id) : id(id) { std::cout << "node " << id << " born\\n"; }
    ~Node() { std::cout << "node " << id << " died\\n"; }
};

int main() {
    std::unique_ptr<Node> a = std::make_unique<Node>(1);
    // std::unique_ptr<Node> bad = a;      // compile error: move-only
    std::unique_ptr<Node> b = std::move(a);  // ownership transferred
    std::cout << "a empty? " << (a == nullptr) << "\\n";

    std::shared_ptr<Node> s1 = std::make_shared<Node>(2);
    {
        std::shared_ptr<Node> s2 = s1;
        std::cout << "shared count: " << s1.use_count() << "\\n";
    }
    std::cout << "after scope: " << s1.use_count() << "\\n";

    std::weak_ptr<Node> w = s1;
    if (auto locked = w.lock())
        std::cout << "weak sees node " << locked->id << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-013", "Exceptions", "throw, try/catch chains, catch by const reference.", "Modern C++", "exceptions",
        `#include <iostream>
#include <stdexcept>
#include <string>

double divide(double a, double b) {
    if (b == 0) throw std::invalid_argument("divide by zero");
    return a / b;
}

int main() {
    try {
        std::cout << divide(10, 2) << "\\n";
        std::cout << divide(1, 0) << "\\n";
    } catch (const std::invalid_argument &e) {
        std::cout << "caught: " << e.what() << "\\n";
    } catch (const std::exception &e) {           // broader, later
        std::cout << "other: " << e.what() << "\\n";
    }
    std::cout << "still alive\\n";
    return 0;
}
`),
    ex("cpp2-ex-014", "constexpr and compile-time math", "constexpr functions, static_assert contracts.", "Modern C++", "constexpr",
        `#include <iostream>

constexpr long factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

constexpr int cube(int x) { return x * x * x; }

int main() {
    static_assert(factorial(5) == 120, "compile-time check");
    static_assert(cube(3) == 27, "cube");

    int runtime_input = 6;
    std::cout << "compile-time 10! = " << factorial(10) << "\\n";
    std::cout << "runtime cube(" << runtime_input << ") = " << cube(runtime_input) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-015", "Vector growth mechanics", "size/capacity, reserve, the realloc pattern.", "STL Standard", "vector_growth",
        `#include <iostream>
#include <vector>

int main() {
    std::vector<int> v;
    std::cout << "empty: size=" << v.size() << " capacity=" << v.capacity() << "\\n";

    size_t last_cap = 0, growth = 0;
    for (int i = 0; i < 33; i++) {
        v.push_back(i);
        if (v.capacity() != last_cap) {
            growth++;
            std::cout << "grew to capacity " << v.capacity() << "\\n";
            last_cap = v.capacity();
        }
    }
    std::cout << "reallocation events: " << growth << "\\n";

    std::vector<int> pre;
    pre.reserve(100);
    std::cout << "reserved: size=" << pre.size() << " capacity=" << pre.capacity() << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-016", "Map and unordered_map", "Ordered vs hashed trade-offs, [] vs insert/at.", "STL Standard", "maps",
        `#include <iostream>
#include <map>
#include <unordered_map>
#include <string>

int main() {
    std::map<std::string, int> ordered;
    ordered["zulu"] = 26; ordered["alpha"] = 1; ordered["mike"] = 13;

    std::cout << "ordered iteration:\\n";
    for (const auto &[k, v] : ordered) std::cout << "  " << k << " = " << v << "\\n";

    std::unordered_map<std::string, int> hashed;
    hashed["x"] = 1; hashed["y"] = 2;
    if (hashed.count("x")) std::cout << "x exists, value " << hashed.at("x") << "\\n";

    auto [it, ok] = hashed.insert({"x", 99});    // insert fails: key taken
    std::cout << "duplicate insert ok? " << ok << " (kept " << it->second << ")\\n";
    return 0;
}
`),
    ex("cpp2-ex-017", "Sets and multisets", "Dedup, ordered overlap, includes-style math.", "STL Standard", "sets",
        `#include <algorithm>
#include <iostream>
#include <set>
#include <vector>

int main() {
    std::vector<int> raw{5, 3, 5, 1, 3, 3, 9};
    std::set<int> unique(raw.begin(), raw.end());

    std::cout << "unique count: " << unique.size() << "\\n";
    for (int x : unique) std::cout << x << ' ';
    std::cout << "\\n";

    std::set<int> a{1, 2, 3, 4}, b{3, 4, 5, 6};
    std::vector<int> overlap;
    std::set_intersection(a.begin(), a.end(), b.begin(), b.end(),
                           std::back_inserter(overlap));
    std::cout << "intersection size: " << overlap.size() << "\\n";

    std::multiset<int> counted(raw.begin(), raw.end());
    std::cout << "threes: " << counted.count(3) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-018", "Iterators and reverse passes", "begin/end, rbegin, advance and distance.", "STL Standard", "iterators",
        `#include <iostream>
#include <iterator>
#include <vector>

int main() {
    std::vector<int> v{10, 20, 30, 40, 50};

    std::cout << "forward: ";
    for (auto it = v.begin(); it != v.end(); ++it) std::cout << *it << ' ';
    std::cout << "\\nreverse: ";
    for (auto it = v.rbegin(); it != v.rend(); ++it) std::cout << *it << ' ';
    std::cout << "\\n";

    auto mid = v.begin();
    std::advance(mid, 2);
    std::cout << "middle: " << *mid << " at " << std::distance(v.begin(), mid) << "\\n";

    std::cout << "every other: ";
    for (size_t i = 0; i < v.size(); i += 2) std::cout << v[i] << ' ';
    std::cout << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-019", "Streams and formatting", "setw, setfill, fixed precision, left/right.", "STL Standard", "streams",
        `#include <iomanip>
#include <iostream>

int main() {
    std::cout << std::fixed << std::setprecision(3);
    std::cout << "pi-ish: " << 3.14159 << " e: " << 2.71828 << "\\n";

    std::cout << "\\n" << std::left << std::setw(12) << "NAME"
              << std::right << std::setw(8) << "SCORE" << "\\n";
    std::cout << std::setfill('-') << std::setw(20) << "" << std::setfill(' ') << "\\n";

    const char *rows[3] = {"ada", "alan", "grace"};
    int scores[3] = {92, 81, 96};
    for (int i = 0; i < 3; i++) {
        std::cout << std::left << std::setw(12) << rows[i]
                  << std::right << std::setw(8) << scores[i] << "\\n";
    }

    std::cout << "hex: " << std::hex << 255 << " oct: " << std::oct << 8
              << " dec: " << std::dec << 10 << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-020", "File streams", "ofstream / ifstream round-trip with getline.", "STL Standard", "file_streams",
        `#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

int main() {
    {
        std::ofstream out("praxis_cpp.txt");
        out << "first line\\n";
        out << "second 42\\n";
    }

    std::ifstream in("praxis_cpp.txt");
    std::string line;
    while (std::getline(in, line)) {
        std::istringstream ls(line);
        std::string word;
        int number = 0;
        if (ls >> word >> number)
            std::cout << word << " -> " << number << "\\n";
        else
            std::cout << "[" << line << "] (no number)\\n";
    }
    std::remove("praxis_cpp.txt");
    return 0;
}
`),
    ex("cpp2-ex-021", "std::thread basics", "Two workers, join discipline, lambda payloads.", "Concurrency", "threads",
        `#include <iostream>
#include <thread>
#include <vector>

void worker(int id, int rounds) {
    for (int i = 0; i < rounds; i++)
        std::cout << "w" << id << ":" << i << " ";
}

int main() {
    std::vector<std::thread> pool;
    for (int id = 0; id < 2; id++)
        pool.emplace_back(worker, id, 3);

    for (auto &t : pool) t.join();      // MUST join (or detach) every thread
    std::cout << "\\nall threads joined\\n";

    std::cout << "hardware threads: " << std::thread::hardware_concurrency() << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-022", "mutex and lock_guard", "Sharing a counter without data races.", "Concurrency", "mutex",
        `#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

int main() {
    std::mutex m;
    long guarded = 0;
    long naive = 0;

    std::vector<std::thread> ts;
    for (int t = 0; t < 4; t++) {
        ts.emplace_back([&] {
            for (int i = 0; i < 100000; i++) {
                {
                    std::lock_guard<std::mutex> lk(m);
                    guarded++;
                }
                naive++;                  // unsynchronized
            }
        });
    }
    for (auto &t : ts) t.join();

    std::cout << "guarded = " << guarded << "\\n";
    std::cout << "naive = " << naive << " (racy - value may be low)\\n";
    return 0;
}
`),
    ex("cpp2-ex-023", "Atomic counters", "std::atomic<int> for lock-free counting.", "Concurrency", "atomics",
        `#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    std::atomic<int> hits{0};
    std::atomic<bool> ready{false};

    std::vector<std::thread> ts;
    for (int t = 0; t < 4; t++) {
        ts.emplace_back([&] {
            while (!ready.load()) {}       // spin until released
            for (int i = 0; i < 50000; i++) hits.fetch_add(1);
        });
    }
    ready.store(true);
    for (auto &t : ts) t.join();

    std::cout << "hits = " << hits.load() << " (exact, no mutex)\\n";
    return 0;
}
`),
    ex("cpp2-ex-024", "condition_variable producer/consumer", "notify_one / wait with a predicate.", "Concurrency", "condvar",
        `#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>

int main() {
    std::mutex m;
    std::condition_variable cv;
    std::queue<int> q;
    bool done = false;

    std::thread consumer([&] {
        std::unique_lock<std::mutex> lk(m);
        while (!done || !q.empty()) {
            cv.wait(lk, [&] { return done || !q.empty(); });
            if (!q.empty()) {
                std::cout << "consumed " << q.front() << "\\n";
                q.pop();
            }
        }
    });

    {
        std::lock_guard<std::mutex> lk(m);
        for (int i : {1, 2, 3}) q.push(i);
    }
    cv.notify_all();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    {
        std::lock_guard<std::mutex> lk(m);
        done = true;
    }
    cv.notify_all();
    consumer.join();
    return 0;
}
`),
    ex("cpp2-ex-025", "chrono timing", "steady_clock deltas, milliseconds, sleep.", "Concurrency", "chrono",
        `#include <chrono>
#include <iostream>
#include <thread>

int main() {
    using namespace std::chrono;

    auto t0 = steady_clock::now();
    std::this_thread::sleep_for(milliseconds(30));
    auto t1 = steady_clock::now();

    auto ms = duration_cast<milliseconds>(t1 - t0).count();
    auto us = duration_cast<microseconds>(t1 - t0).count();
    std::cout << "slept " << ms << " ms (" << us << " us)\\n";

    auto now = system_clock::now();
    auto secs = duration_cast<seconds>(now.time_since_epoch()).count();
    std::cout << "epoch seconds: " << secs << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-026", "std::function and callbacks", "Storing heterogeneous callables in one slot.", "Utilities", "function_objects",
        `#include <functional>
#include <iostream>
#include <map>
#include <string>

int add(int a, int b) { return a + b; }

int main() {
    std::function<int(int, int)> op;

    op = add;
    std::cout << "plain: " << op(3, 4) << "\\n";

    int bias = 10;
    op = [bias](int a, int b) { return a + b + bias; };
    std::cout << "lambda: " << op(3, 4) << "\\n";

    std::map<std::string, std::function<int(int, int)>> ops{
        {"add", [](int a, int b) { return a + b; }},
        {"mul", [](int a, int b) { return a * b; }},
    };
    for (const auto &[name, fn] : ops)
        std::cout << name << "(6,7) = " << fn(6, 7) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-027", "Tuple and structured bindings", "make_tuple, get<N>, tie, multiple returns.", "Utilities", "tuples",
        `#include <iostream>
#include <map>
#include <string>
#include <tuple>
#include <vector>

std::tuple<int, int, double> stats(const std::vector<int> &v) {
    int lo = v.front(), hi = v.front();
    long sum = 0;
    for (int x : v) { if (x < lo) lo = x; if (x > hi) hi = x; sum += x; }
    return {lo, hi, (double)sum / v.size()};
}

int main() {
    auto t = std::make_tuple(1, "two", 3.0);
    std::cout << std::get<1>(t) << " and " << std::get<2>(t) << "\\n";

    auto [lo, hi, mean] = stats({4, 8, 15, 16, 23, 42});
    std::cout << "lo=" << lo << " hi=" << hi << " mean=" << mean << "\\n";

    int a, b;
    std::tie(a, b) = std::make_pair(10, 20);
    std::cout << "tied: " << a << "," << b << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-028", "Random the modern way", "mt19937 + uniform distributions, seeded.", "Utilities", "random",
        `#include <iomanip>
#include <iostream>
#include <random>

int main() {
    std::mt19937 rng(42);                          // deterministic seed

    std::uniform_int_distribution<int> die(1, 6);
    std::uniform_real_distribution<double> unit(0.0, 1.0);
    std::normal_distribution<double> bell(100.0, 15.0);

    std::cout << "dice:";
    for (int i = 0; i < 5; i++) std::cout << ' ' << die(rng);
    std::cout << "\\n";

    std::cout << std::fixed << std::setprecision(3);
    std::cout << "unit: " << unit(rng) << "\\n";
    std::cout << "iq-ish: " << bell(rng) << " " << bell(rng) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-029", "Custom comparators and sorting structs", "sort with member lambda, stable_sort.", "Utilities", "sorting",
        `#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct Player {
    std::string name;
    int score;
    int age;
};

int main() {
    std::vector<Player> ps{{"ada", 92, 36}, {"alan", 92, 41}, {"grace", 96, 45}};

    std::sort(ps.begin(), ps.end(), [](const Player &a, const Player &b) {
        if (a.score != b.score) return a.score > b.score;   // score desc
        return a.age < b.age;                               // tie: age asc
    });
    for (const auto &p : ps)
        std::cout << p.name << " " << p.score << " (age " << p.age << ")\\n";

    std::stable_sort(ps.begin(), ps.end(),
                     [](const Player &a, const Player &b) { return a.age > b.age; });
    std::cout << "youngest now first: " << ps.front().name << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-030", "Priority queues", "top(), push/pop, custom min-heap via greater.", "Utilities", "priority_queue",
        `#include <functional>
#include <iostream>
#include <queue>
#include <vector>

int main() {
    std::priority_queue<int> max_heap;
    for (int x : {7, 2, 9, 4}) max_heap.push(x);

    std::cout << "max-heap top: " << max_heap.top() << "\\n";
    max_heap.pop();
    std::cout << "after pop: " << max_heap.top() << "\\n";

    std::priority_queue<int, std::vector<int>, std::greater<int>> min_heap;
    for (int x : {7, 2, 9, 4}) min_heap.push(x);

    std::cout << "min-heap pops:";
    while (!min_heap.empty()) {
        std::cout << ' ' << min_heap.top();
        min_heap.pop();
    }
    std::cout << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-031", "Type traits and static dispatch", "is_integral, if constexpr branching.", "Templates & Generics", "type_traits",
        `#include <iostream>
#include <string>
#include <type_traits>

template <typename T>
std::string describe(const T &v) {
    if constexpr (std::is_integral_v<T>)
        return "integer " + std::to_string(v);
    else if constexpr (std::is_floating_point_v<T>)
        return "float-ish";
    else
        return "something else";
}

int main() {
    std::cout << describe(42) << "\\n";
    std::cout << describe(3.14) << "\\n";
    std::cout << describe("text") << "\\n";

    static_assert(std::is_integral_v<int>);
    static_assert(!std::is_same_v<int, long>);
    std::cout << "sizeof(void*) = " << sizeof(void *) << " ("
              << (sizeof(void *) == 8 ? "64" : "32") << "-bit)\\n";
    return 0;
}
`),
    ex("cpp2-ex-032", "CRTP-lite mixin", "A compile-time mixin that adds methods without virtuals.", "Templates & Generics", "crtp",
        `#include <iostream>

template <typename Derived>
struct Printable {
    void shout() const {
        const auto &self = static_cast<const Derived &>(*this);
        std::cout << "[" << self.name() << "]\\n";
    }
};

struct Widget : Printable<Widget> {
    const char *name() const { return "widget"; }
};

struct Gadget : Printable<Gadget> {
    const char *name() const { return "gadget"; }
};

int main() {
    Widget w;
    Gadget g;
    w.shout();
    g.shout();
    std::cout << "no virtual table involved\\n";
    return 0;
}
`),
    ex("cpp2-ex-033", "SFINAE-free concepts-lite", "enable_if-style gating done readably.", "Templates & Generics", "enable_if",
        `#include <iostream>
#include <string>
#include <type_traits>

template <typename T, typename = std::enable_if_t<std::is_arithmetic_v<T>>>
T twice(T v) { return v + v; }

std::string twice(const char *s) { return std::string(s) + s; }

int main() {
    std::cout << twice(21) << "\\n";
    std::cout << twice(2.5) << "\\n";
    std::cout << twice("ha") << "\\n";
    // twice(std::string("x"));  // removed by enable_if - compile error
    std::cout << "arithmetic overload set works\\n";
    return 0;
}
`),
    ex("cpp2-ex-034", "Std::array and span-style views", "Fixed arrays + a lightweight window over memory.", "STL Standard", "array_views",
        `#include <algorithm>
#include <array>
#include <iostream>
#include <vector>

template <typename T>
void show_window(const T *first, size_t n) {
    for (size_t i = 0; i < n; i++) std::cout << first[i] << ' ';
    std::cout << "\\n";
}

int main() {
    std::array<int, 5> a{3, 1, 4, 1, 5};
    std::cout << "size known at compile time: " << a.size() << "\\n";
    std::sort(a.begin(), a.end());
    show_window(a.data(), a.size());

    std::vector<int> v(a.begin(), a.end());
    show_window(v.data() + 1, 3);        // middle window
    std::cout << "max of full range: " << *std::max_element(v.begin(), v.end()) << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-035", "string_view economics", "Zero-copy substrings and parsing.", "Modern C++", "string_view",
        `#include <iostream>
#include <string>
#include <string_view>
#include <vector>

std::vector<std::string_view> split(std::string_view src, char sep) {
    std::vector<std::string_view> out;
    size_t start = 0;
    while (start <= src.size()) {
        size_t p = src.find(sep, start);
        if (p == std::string_view::npos) { out.push_back(src.substr(start)); break; }
        out.push_back(src.substr(start, p - start));
        start = p + 1;
    }
    return out;
}

int main() {
    std::string csv = "alpha,beta,gamma";       // the OWNER of the bytes
    for (auto tok : split(csv, ','))
        std::cout << "token: " << tok << " (len " << tok.size() << ")\\n";
    std::cout << "no copies made after split\\n";
    return 0;
}
`),
    ex("cpp2-ex-036", "Custom iterator use with algorithms", "back_inserter, istream_iterator.", "STL Standard", "iterator_adapters",
        `#include <algorithm>
#include <iostream>
#include <iterator>
#include <sstream>
#include <vector>

int main() {
    std::istringstream input("10 20 30 40");
    std::vector<int> v{std::istream_iterator<int>(input),
                       std::istream_iterator<int>()};
    std::cout << "parsed " << v.size() << " values\\n";

    std::vector<int> squares;
    std::transform(v.begin(), v.end(), std::back_inserter(squares),
                   [](int x) { return x * x; });
    for (int x : squares) std::cout << x << ' ';
    std::cout << "\\n";

    std::copy(squares.rbegin(), squares.rend(),
              std::ostream_iterator<int>(std::cout, " <- "));
    std::cout << "\\n";
    return 0;
}
`),
    ex("cpp2-ex-037", "Time complexity demo", "Sorting sizes vs measured work, empirically.", "Algorithms", "complexity",
        `#include <algorithm>
#include <chrono>
#include <iostream>
#include <random>
#include <vector>

double time_sort(size_t n, std::mt19937 &rng) {
    std::uniform_int_distribution<int> d(0, 1000000);
    std::vector<int> v(n);
    for (int &x : v) x = d(rng);

    auto t0 = std::chrono::steady_clock::now();
    std::sort(v.begin(), v.end());
    auto t1 = std::chrono::steady_clock::now();
    return std::chrono::duration<double, std::milli>(t1 - t0).count();
}

int main() {
    std::mt19937 rng(7);
    for (size_t n : {10000, 100000, 1000000}) {
        double ms = time_sort(n, rng);
        std::cout << n << " items -> " << ms << " ms\\n";
    }
    std::cout << "(10x data ~= ~10x time on this curve: n log n)\\n";
    return 0;
}
`),
    ex("cpp2-ex-038", "A mini unit-test macro", "assert-based checks with counters.", "Projects", "unit_tests",
        `#include <iostream>

static int passed = 0, failed = 0;

#define CHECK(expr) do { \\
    if (expr) { passed++; std::cout << "  ok   " << #expr << "\\n"; } \\
    else { failed++; std::cout << "  FAIL " << #expr << "\\n"; } \\
} while (0)

int clamp(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

int main() {
    CHECK(clamp(5, 0, 10) == 5);
    CHECK(clamp(-1, 0, 10) == 0);
    CHECK(clamp(99, 0, 10) == 10);
    CHECK((clamp(0, 0, 10) == 0));

    std::cout << passed << " passed, " << failed << " failed\\n";
    return failed == 0 ? 0 : 1;
}
`),
    ex("cpp2-ex-039", "Serialization mini-format", "struct <-> text round-trip with streams.", "Projects", "serialize",
        `#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

struct Task {
    std::string title;
    int priority;
};

std::string serialize(const Task &t) {
    std::ostringstream os;
    os << t.priority << '|' << t.title;
    return os.str();
}

Task deserialize(const std::string &line) {
    std::istringstream is(line);
    int p;
    std::string title;
    is >> p;
    std::getline(is, title);          // eats the | and the rest
    return {title.substr(1), p};
}

int main() {
    std::vector<Task> tasks{{"write specs", 2}, {"ship build", 1}};

    {
        std::ofstream out("praxis_tasks.txt");
        for (const auto &t : tasks) out << serialize(t) << "\\n";
    }

    std::ifstream in("praxis_tasks.txt");
    std::string line;
    while (std::getline(in, line)) {
        Task t = deserialize(line);
        std::cout << "P" << t.priority << " " << t.title << "\\n";
    }
    std::remove("praxis_tasks.txt");
    return 0;
}
`),
    ex("cpp2-ex-040", "A complete CLI mini tool", "Args parsing + file input + algorithm + report.", "Projects", "word_count",
        `#include <algorithm>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

int main(int argc, char **argv) {
    const char *path = argc > 1 ? argv[1] : "praxis_text.txt";

    {
        std::ofstream out(path);
        out << "the quick brown fox\\nthe lazy dog\\nthe end\\n";
    }

    std::ifstream in(path);
    std::map<std::string, int> counts;
    std::string word;
    size_t lines = 0;
    std::string line;
    while (std::getline(in, line)) {
        lines++;
        std::istringstream ls(line);
        while (ls >> word) counts[word]++;
    }

    std::vector<std::pair<std::string, int>> top(counts.begin(), counts.end());
    std::sort(top.begin(), top.end(), [](auto &a, auto &b) {
        return a.second != b.second ? a.second > b.second : a.first < b.first;
    });

    std::cout << "lines: " << lines << " unique words: " << counts.size() << "\\n";
    for (size_t i = 0; i < top.size() && i < 3; i++)
        std::cout << top[i].first << ": " << top[i].second << "x\\n";

    std::remove(path);
    return 0;
}
`),
];
