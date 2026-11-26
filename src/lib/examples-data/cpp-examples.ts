/**
 * 10 C++ reference templates (the "add other languages
 * also + their examples to check" batch). Bodies are portable C++17;
 * Run compiles them with g++ and executes the artifact (the runtime
 * chip in the viewer header reports when g++ is missing).
 *
 * C++ identifiers keep their native camelCase/snake mix (no tokens).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "C++";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("cpp", id, label, description, CAT, sub, baseName, ".cpp", () => body);

export const CPP_EXAMPLES: FileExample[] = [
    ex("cpp-ex-001", "Hello, C++", "std::cout streams, iomanip formatting and std::string — the modern opening.", "Basics", "hello_cpp",
        `// Hello, C++ — streams, manipulators and std::string.
#include <iomanip>
#include <iostream>
#include <string>

int main() {
    std::cout << "Hello from C++!\\n";

    std::string name = "Praxis";
    std::cout << "Hello, " << name << "!\\n";

    // Manipulators stick until changed (setw does not).
    double pi = 3.14159265;
    std::cout << std::fixed << std::setprecision(4)
              << "pi = " << pi << "\\n";
    std::cout << "|" << std::setw(10) << 42 << "| right-aligned\\n";
    std::cout << "|" << std::left << std::setw(10) << 7 << "| left-aligned\\n";

    // std::string knows its size and concatenates.
    std::cout << "length=" << name.length()
              << " + ide = " << (name + " ide") << "\\n";
    return 0;
}
`),

    ex("cpp-ex-002", "Vectors", "std::vector push_back, iteration, size, ranges and the fill/ctor shapes.", "Containers", "vectors_tour",
        `// std::vector — THE C++ container.
#include <iostream>
#include <numeric>
#include <vector>

int main() {
    std::vector<int> nums;            // empty, grows on demand
    for (int i = 1; i <= 5; i++) nums.push_back(i * i);

    std::cout << "size=" << nums.size() << ": ";
    for (int n : nums) std::cout << n << ' ';   // range-for
    std::cout << '\\n';

    // Constructed full: count × value, initializer list, copy.
    std::vector<int> tens(4, 10);     // 10 10 10 10
    std::vector<int> copy = {1, 2, 3};

    int total = std::accumulate(nums.begin(), nums.end(), 0);
    std::cout << "squares sum=" << total << '\\n';

    // Index access + bounds-checked at.
    std::cout << "nums[2]=" << nums[2]
              << " tens.at(3)=" << tens.at(3) << '\\n';
    std::cout << "copy size=" << copy.size() << '\\n';
    return 0;
}
`),

    ex("cpp-ex-003", "Maps", "std::map (ordered) and std::unordered_map, the operator[] vs insert rule, and iteration.", "Containers", "maps_tour",
        `// std::map + std::unordered_map — word frequencies the idiomatic way.
#include <iostream>
#include <map>
#include <string>
#include <unordered_map>

int main() {
    std::string text = "to be or not to be";

    // operator[] default-constructs a value then returns it — the
    // frequency-count idiom.
    std::map<std::string, int> freq;   // red-black tree: ordered keys
    for (const std::string &w : {"to", "be", "or", "not", "to", "be"}) {
        freq[w]++;
    }
    for (const auto &[word, n] : freq) {   // structured bindings
        std::cout << word << '=' << n << ' ';
    }
    std::cout << '\\n';

    // unordered_map: hash table — faster, arbitrary print order.
    std::unordered_map<std::string, int> tally;
    for (const std::string &w : {"to", "be", "or", "not", "to", "be"}) {
        tally[w] += 1;
    }
    std::cout << "'to' count: " << tally["to"] << '\\n';

    // find does NOT insert (operator[] would).
    if (auto it = tally.find("zeta"); it == tally.end()) {
        std::cout << "zeta absent, map size still " << tally.size() << '\\n';
    }
    return 0;
}
`),

    ex("cpp-ex-004", "Classes", "A header-free class: constructor, member init, const methods and operator<<.", "OOP", "classes_tour",
        `// A complete small class — constructor, invariants, printing.
#include <cmath>
#include <iostream>
#include <string>

class Vector2 {
public:
    // Member initializers run before the body (order = declaration).
    Vector2(double x, double y) : x_(x), y_(y) {}

    // const methods promise not to touch the object.
    double length() const { return std::sqrt(x_ * x_ + y_ * y_); }

    // Operator overloading: v1 + v2 reads naturally.
    Vector2 operator+(const Vector2 &rhs) const {
        return Vector2(x_ + rhs.x_, y_ + rhs.y_);
    }

private:
    double x_;
    double y_;
};

// Stream printer so std::cout << v works.
std::ostream &operator<<(std::ostream &os, const Vector2 &v) {
    return os << "Vector2(" << v.length() << ')';
}

int main() {
    Vector2 a(3.0, 4.0);
    Vector2 b(1.0, 1.0);
    std::cout << "a: " << a << '\\n';
    std::cout << "a+b: " << (a + b) << '\\n';
    return 0;
}
`),

    ex("cpp-ex-005", "RAII and smart pointers", "unique_ptr ownership, shared_ptr refcounts, and the RAII guard that closes on scope exit.", "Modern C++", "raii_smart_pointers",
        `// RAII: resources release at scope exit — no manual cleanup.
#include <chrono>
#include <iostream>
#include <memory>
#include <string>

// A guard whose destructor runs NO MATTER HOW the scope exits.
class TimerGuard {
public:
    explicit TimerGuard(std::string label)
        : label_(std::move(label)), start_(std::chrono::steady_clock::now()) {}
    ~TimerGuard() {
        auto end = std::chrono::steady_clock::now();
        std::cout << label_ << " took "
                  << std::chrono::duration_cast<std::chrono::microseconds>(end - start_).count()
                  << " us\\n";
    }
private:
    std::string label_;
    std::chrono::steady_clock::time_point start_;
};

int main() {
    {   // unique_ptr: ONE owner; frees at the closing brace.
        auto owned = std::make_unique<int>(21);
        std::cout << "unique value: " << *owned << '\\n';
    }   // freed here

    {   // shared_ptr: refcounted; frees when the LAST handle dies.
        auto a = std::make_shared<std::string>("shared");
        auto b = a;                          // count is now 2
        std::cout << *b << " refs=" << b.use_count() << '\\n';
    }

    TimerGuard guard("guarded block");
    std::cout << "inside the guarded block\\n";
    return 0;   // guard prints its duration now
}
`),

    ex("cpp-ex-006", "Templates", "A function template, a class template and deduction — generics without the ceremony.", "Modern C++", "templates_tour",
        `// Templates: one definition, any type that fits the operations.
#include <iostream>
#include <string>

// Function template — deduced from the arguments.
template <typename T>
T maxOf(const T &a, const T &b) {
    return a > b ? a : b;
}

// Class template with a default parameter.
template <typename T = double>
class Box {
public:
    explicit Box(T value) : value_(value) {}
    const T &get() const { return value_; }
private:
    T value_;
};

// Variadic pack + fold expression (C++17): sums any count.
template <typename... Ts>
auto sumAll(Ts... values) {
    return (values + ... + 0);
}

int main() {
    std::cout << maxOf(3, 9) << '\\n';          // int
    std::cout << maxOf(2.5, 1.5) << '\\n';      // double
    std::cout << maxOf(std::string("a"), std::string("b")) << '\\n';

    Box<int>    whole(42);
    Box<>       fractional(2.75);   // uses the default (double)
    std::cout << whole.get() << ' ' << fractional.get() << '\\n';

    std::cout << "sum: " << sumAll(1, 2, 3, 4, 5) << '\\n';
    return 0;
}
`),

    ex("cpp-ex-007", "Algorithms", "sort, transform, find_if, count_if over a vector — the <algorithm> pass.", "Modern C++", "algorithms_tour",
        `// <algorithm>: the declarative collection pass.
#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    std::vector<int> nums = {42, 7, 19, 3, 88, 15};

    // sort with a custom comparator (descending).
    std::sort(nums.begin(), nums.end(),
              [](int a, int b) { return a > b; });
    for (int n : nums) std::cout << n << ' ';
    std::cout << '\\n';

    // transform: map every element into a destination.
    std::vector<int> doubled(nums.size());
    std::transform(nums.begin(), nums.end(), doubled.begin(),
                   [](int n) { return n * 2; });
    std::cout << "doubled first: " << doubled.front() << '\\n';

    // find_if: the first element matching a predicate.
    auto it = std::find_if(nums.begin(), nums.end(),
                           [](int n) { return n < 10; });
    if (it != nums.end()) std::cout << "first <10: " << *it << '\\n';

    // count_if: how many match.
    auto evens = std::count_if(nums.begin(), nums.end(),
                               [](int n) { return n % 2 == 0; });
    std::cout << "even count: " << evens << '\\n';

    // min/max element return ITERATORS.
    std::cout << "max: " << *std::max_element(nums.begin(), nums.end()) << '\\n';
    return 0;
}
`),

    ex("cpp-ex-008", "Exceptions", "throw, try/catch, catch-by-const-reference and a custom exception type.", "Robustness", "exceptions_tour",
        `// Exceptions: throw, catch by reference, custom types.
#include <iostream>
#include <stdexcept>
#include <string>

class ValidationError : public std::runtime_error {
public:
    explicit ValidationError(const std::string &field)
        : std::runtime_error("bad value for '" + field + "'"), field_(field) {}
    const std::string &field() const { return field_; }
private:
    std::string field_;
};

int parseAge(const std::string &text) {
    try {
        int age = std::stoi(text);        // throws std::invalid_argument
        if (age < 0) throw ValidationError("age");
        return age;
    } catch (const std::invalid_argument &) {
        throw;                             // re-throw to the caller
    }
}

int main() {
    // Catch by const reference — never by value (slicing!).
    try {
        std::cout << "age = " << parseAge("31") << '\\n';
        std::cout << parseAge("thirty-one") << '\\n';
    } catch (const ValidationError &e) {
        std::cout << "ValidationError on " << e.field()
                  << ": " << e.what() << '\\n';
    } catch (const std::exception &e) {    // base class catches the rest
        std::cout << "std::exception: " << e.what() << '\\n';
    }
    std::cout << "still running\\n";
    return 0;
}
`),

    ex("cpp-ex-009", "File streams", "ofstream writing, ifstream line reading and istringstream tokenizing.", "Practical", "file_streams",
        `// File streams: write, read back, and string-tokenize.
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

int main() {
    const std::string path = "/tmp/praxis_demo.txt";

    {   // Write — the stream closes at the closing brace (RAII).
        std::ofstream out(path);
        if (!out) { std::cerr << "cannot write\\n"; return 1; }
        out << "alpha 1\\n";
        out << "beta 2\\n";
        out << "gamma 3\\n";
    }

    {   // Read line-by-line with std::getline.
        std::ifstream in(path);
        std::string line;
        while (std::getline(in, line)) {
            std::cout << "read: " << line << '\\n';
        }
    }

    {   // istringstream: tokenize a line into typed values.
        std::istringstream row("score 87.5");
        std::string label;
        double value;
        row >> label >> value;
        std::cout << "parsed " << label << " = " << value << '\\n';
    }
    std::remove(path.c_str());   // tidy the temp file
    return 0;
}
`),

    ex("cpp-ex-010", "Threads", "std::thread, join, and a mutex-guarded shared counter.", "Concurrency", "threads_tour",
        `// std::thread + mutex: the smallest correct shared-state demo.
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

int main() {
    std::mutex guard;
    int shared = 0;                 // guarded by 'guard'

    // The worker: bump the shared counter a few times, safely.
    auto bump = [&](int times) {
        for (int i = 0; i < times; i++) {
            std::lock_guard<std::mutex> locked(guard);   // RAII lock
            ++shared;
        }   // unlocks automatically at the closing brace
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < 4; t++) {
        threads.emplace_back(bump, 25);
    }
    for (auto &t : threads) {
        t.join();                    // ALWAYS join (or detach) — once
    }

    std::cout << "4 threads x 25 bumps = " << shared << '\\n';
    return 0;
}
`),
];
