/**
 * the Go top-up: 40 more reference templates on top of the
 * ten more ("at least 50 like others". Pure stdlib Go.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Go";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("go", id, label, description, CAT, sub, baseName, ".go", () => body);

export const GO_2_EXAMPLES: FileExample[] = [
    ex("go2-ex-001", "Multiple return values", "The comma-ok idiom and error-first returns.", "Language Core", "returns",
        `// Multiple returns — Go's comma-ok and error-first conventions.
package main

import "fmt"

func half(n int) (int, bool) { return n / 2, n%2 == 0 }

func divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, fmt.Errorf("divide by zero: %g/%g", a, b)
	}
	return a / b, nil
}

func main() {
	h, even := half(10)
	fmt.Println(h, even)
	fmt.Println(half(7))

	if r, err := divide(6, 3); err != nil {
		fmt.Println("error:", err)
	} else {
		fmt.Println("6/3 =", r)
	}
	fmt.Println(divide(1, 0))
}
`),
    ex("go2-ex-002", "Variadic functions", "Trailing slice params, the spread operator.", "Language Core", "variadics",
        `// Variadic parameters collect into a slice.
package main

import "fmt"

func sum(nums ...int) int {
	total := 0
	for _, n := range nums {
		total += n
	}
	return total
}

func joined(sep string, parts ...string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += sep
		}
		out += p
	}
	return out
}

func main() {
	fmt.Println(sum(1, 2, 3, 4))
	fmt.Println(sum())
	fmt.Println(joined("-", "a", "b", "c"))

	extra := []int{5, 10, 15}
	fmt.Println(sum(extra...)) // spread
}
`),
    ex("go2-ex-003", "Closures", "Function values that capture their environment.", "Language Core", "closures",
        `// Closures carry their captured variables along.
package main

import "fmt"

func counter() func() int {
	n := 0
	return func() int {
		n++
		return n
	}
}

func adder(bias int) func(int) int {
	return func(x int) int { return x + bias }
}

func main() {
	c := counter()
	fmt.Println(c(), c(), c()) // 1 2 3

	next := counter()
	fmt.Println("independent:", next()) // 1 again

	add10 := adder(10)
	fmt.Println(add10(5), add10(7))
}
`),
    ex("go2-ex-004", "Defer cleanup", "LIFO deferred calls; the resource-release idiom.", "Language Core", "defer",
        `// defer runs at function exit, last-in-first-out.
package main

import "fmt"

func worker(name string) {
	fmt.Println("start", name)
	defer fmt.Println("end  ", name)
	defer fmt.Println("  (second defer runs FIRST)")
	fmt.Println("body  ", name)
}

func main() {
	worker("demo")

	// Arguments are captured AT DEFER TIME.
	i := 1
	defer fmt.Println("captured i =", i)
	i = 99
	fmt.Println("current i =", i)
}
`),
    ex("go2-ex-005", "Pointers and new", "&, *, new(T), zero values.", "Language Core", "pointers",
        `// Explicit pointers — but no pointer arithmetic.
package main

import "fmt"

type Coord struct{ X, Y int }

func shift(c *Coord, dx, dy int) {
	c.X += dx
	c.Y += dy
}

func main() {
	x := 10
	p := &x
	*p = 20
	fmt.Println(x, *p)

	c := &Coord{1, 2}
	shift(c, 10, 20)
	fmt.Println(c)

	heap := new(Coord) // zero-valued, pointer returned
	fmt.Println(heap)
}
`),
    ex("go2-ex-006", "Methods on any type", "Value receivers vs pointer receivers.", "Language Core", "methods",
        `// Method sets: value vs pointer receivers.
package main

import "fmt"

type Celsius float64

func (c Celsius) toF() float64 { return float64(c)*9/5 + 32 }

type Counter struct{ n int }

func (c *Counter) Bump()   { c.n++ }
func (c Counter) Value() int { return c.n }

func main() {
	temp := Celsius(36.6)
	fmt.Println(temp.toF())

	c := &Counter{}
	c.Bump()
	c.Bump()
	fmt.Println(c.Value())

	auto := &Counter{} // the addressable-pointer shortcut
	auto.Bump()
	fmt.Println(auto.Value())
}
`),
    ex("go2-ex-007", "Interfaces", "Implicit satisfaction + the empty interface.", "Language Core", "interfaces",
        `// Interfaces are satisfied implicitly — no implements keyword.
package main

import "fmt"

type Shape interface{ Area() float64 }

type Rect struct{ W, H float64 }
func (r Rect) Area() float64 { return r.W * r.H }

type Disc struct{ R float64 }
func (d Disc) Area() float64 { return 3.14159 * d.R * d.R }

func total(shapes []Shape) float64 {
	t := 0.0
	for _, s := range shapes {
		t += s.Area()
	}
	return t
}

func main() {
	shapes := []Shape{Rect{3, 4}, Disc{1}}
	fmt.Println(total(shapes))

	var any1 interface{} = 42
	fmt.Printf("%T holds %v\\n", any1, any1)
}
`),
    ex("go2-ex-008", "Type assertions and switches", "Comma-ok assertions, type switch over a slice.", "Language Core", "type_switch",
        `// Runtime type inspection done the Go way.
package main

import "fmt"

func describe(v interface{}) string {
	switch x := v.(type) {
	case int:
		return fmt.Sprintf("int %d", x*2)
	case string:
		return fmt.Sprintf("string %q (%d runes)", x, len([]rune(x)))
	case bool:
		return fmt.Sprintf("bool %t", x)
	default:
		return fmt.Sprintf("other %T", x)
	}
}

func main() {
	vals := []interface{}{21, "Praxis", true, 3.5, []int{1}}
	for _, v := range vals {
		fmt.Println(describe(v))
	}

	// Comma-ok assertion never panics.
	if s, ok := vals[1].(string); ok {
		fmt.Println("asserted:", s)
	}
}
`),
    ex("go2-ex-009", "Embedded structs", "Composition instead of inheritance, method promotion.", "Structuring", "embedding",
        `// Embedding promotes fields and methods — Go's composition.
package main

import "fmt"

type Engine struct{ Power int }

func (e Engine) Start() string { return fmt.Sprintf("engine %dkW on", e.Power) }

type Car struct {
	Engine       // embedded
	Brand string
}

func (c Car) Describe() string {
	return c.Brand + " with " + c.Start()
}

func main() {
	c := Car{Engine{150}, "Praxida"}
	fmt.Println(c.Describe())
	fmt.Println("power via promotion:", c.Power)

	// Field shadowing beats promotion.
	type Owner struct{ Name string }
	type Pet struct {
		Owner
		Name string
	}
	p := Pet{Owner{"Ada"}, "Spot"}
	fmt.Println(p.Name, "belongs to", p.Owner.Name)
}
`),
    ex("go2-ex-010", "Struct tags and JSON", "Marshal with tags, field visibility rules.", "Structuring", "json_tags",
        `// JSON marshaling + the capitalization visibility rule.
package main

import (
	"encoding/json"
	"fmt"
)

type User struct {
	Name  string \`json:"name"\`
	Roles []string \`json:"roles,omitempty"\`
	secret string \`json:"-"\` // never serialized
}

func main() {
	u := User{Name: "ada", Roles: []string{"admin", "dev"}, secret: "nope"}

	data, err := json.MarshalIndent(u, "", "  ")
	if err != nil {
		panic(err)
	}
	fmt.Println(string(data))

	var back User
	if err := json.Unmarshal(data, &back); err != nil {
		panic(err)
	}
	fmt.Printf("round trip: %+v\\n", back)
}
`),
    ex("go2-ex-011", "Generics", "Type parameters with constraints (Go 1.18+).", "Language Core", "generics",
        `// Type-parameterized functions.
package main

import "fmt"

func Map[T, U any](in []T, f func(T) U) []U {
	out := make([]U, len(in))
	for i, v := range in {
		out[i] = f(v)
	}
	return out
}

type Number interface{ ~int | ~float64 }

func Sum[T Number](vals []T) T {
	var total T
	for _, v := range vals {
		total += v
	}
	return total
}

func main() {
	fmt.Println(Map([]int{1, 2, 3}, func(x int) int { return x * x }))
	fmt.Println(Map([]string{"a", "b"}, func(s string) string { return s + "!" }))
	fmt.Println(Sum([]int{1, 2, 3}), Sum([]float64{0.5, 1.5}))
}
`),
    ex("go2-ex-012", "Error wrapping", "fmt.Errorf %w + errors.Is/As.", "Errors", "error_wrapping",
        `// Structured error chains.
package main

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("record not found")

func find(id int) error {
	if id <= 0 {
		return fmt.Errorf("find(%d): %w", id, ErrNotFound)
	}
	return nil
}

func main() {
	err := find(-1)
	fmt.Println(err)

	if errors.Is(err, ErrNotFound) {
		fmt.Println("matched the sentinel through the wrap")
	}

	var target error = ErrNotFound
	fmt.Println("direct equality:", errors.Is(target, ErrNotFound))
}
`),
    ex("go2-ex-013", "Panic and recover", "The defer-recover guard pattern.", "Errors", "panic_recover",
        `// Converting a panic into an error value.
package main

import "fmt"

func risky(n int) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("recovered from: %v", r)
		}
	}()
	if n < 0 {
		panic("negative input")
	}
	fmt.Println("safe path:", n)
	return nil
}

func main() {
	fmt.Println(risky(10))
	fmt.Println(risky(-5))
	fmt.Println("execution continues normally")
}
`),
    ex("go2-ex-014", "Custom error type", "A struct implementing the error interface.", "Errors", "custom_errors",
        `// Errors are just values implementing error.
package main

import "fmt"

type ValidationError struct {
	Field string
	Rule  string
}

func (v ValidationError) Error() string {
	return fmt.Sprintf("invalid %s: %s", v.Field, v.Rule)
}

func validate(age int) error {
	if age < 0 {
		return ValidationError{"age", "must be non-negative"}
	}
	if age > 150 {
		return ValidationError{"age", "suspiciously high"}
	}
	return nil
}

func main() {
	for _, age := range []int{36, -1, 200} {
		if err := validate(age); err != nil {
			fmt.Println(err)
		} else {
			fmt.Println("age", age, "ok")
		}
	}
}
`),
    ex("go2-ex-015", "Goroutines and WaitGroup", "Launch, wait, done.", "Concurrency", "goroutines",
        `// The minimal parallel fan-out.
package main

import (
	"fmt"
	"sync"
)

func main() {
	var wg sync.WaitGroup

	for i := 1; i <= 5; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			fmt.Println("worker", id, "done")
		}(i)
	}
	wg.Wait()
	fmt.Println("all workers finished")
}
`),
    ex("go2-ex-016", "Channels ping-pong", "Unbuffered handoff semantics.", "Concurrency", "channels",
        `// Unbuffered channels synchronize sender and receiver.
package main

import "fmt"

func main() {
	ch := make(chan string) // rendezvous point

	go func() {
		ch <- "ping"
		fmt.Println("sender unblocked after the handoff")
	}()

	fmt.Println(<-ch) // blocks until the send above lands
	fmt.Println("receiver continues")
}
`),
    ex("go2-ex-017", "Select over channels", "Multiplexing, default non-blocking, timeouts.", "Concurrency", "select",
        `// select: the channel switch statement.
package main

import (
	"fmt"
	"time"
)

func main() {
	fast := make(chan string, 1)
	slow := make(chan string, 1)

	go func() { time.Sleep(10 * time.Millisecond); fast <- "fast" }()
	go func() { time.Sleep(80 * time.Millisecond); slow <- "slow" }()

	// First ready wins.
	for i := 0; i < 2; i++ {
		select {
		case m := <-fast:
			fmt.Println("got:", m)
		case m := <-slow:
			fmt.Println("got:", m)
		}
	}

	// Timeout pattern.
	select {
	case <-time.After(30 * time.Millisecond):
		fmt.Println("timeout path exercised")
	}
}
`),
    ex("go2-ex-018", "Worker pool", "Jobs channel, N workers, results channel.", "Concurrency", "worker_pool",
        `// The canonical worker pool shape.
package main

import (
	"fmt"
	"sync"
)

func main() {
	const workers = 3
	jobs := make(chan int, 100)
	results := make(chan string, 100)

	var wg sync.WaitGroup
	for w := 1; w <= workers; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := range jobs {
				results <- fmt.Sprintf("w%d -> %d*2=%d", id, j, j*2)
			}
		}(w)
	}

	for j := 1; j <= 6; j++ {
		jobs <- j
	}
	close(jobs)

	go func() { wg.Wait(); close(results) }()

	for r := range results {
		fmt.Println(r)
	}
}
`),
    ex("go2-ex-019", "Sync utilities", "Mutex, RWMutex, Once, atomic counter.", "Concurrency", "sync_tools",
        `// The little synchronization toolbox.
package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

func main() {
	var mu sync.RWMutex
	counter := 0

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			mu.Lock()
			counter++
			mu.Unlock()
		}()
	}
	wg.Wait()
	fmt.Println("guarded count:", counter)

	var hits int64
	var once sync.Once
	for i := 0; i < 3; i++ {
		once.Do(func() { atomic.AddInt64(&hits, 1) })
	}
	fmt.Println("once fired:", atomic.LoadInt64(&hits))
}
`),
    ex("go2-ex-020", "Context cancellation", "WithTimeout + ctx.Done() checks.", "Concurrency", "context",
        `// Context carries cancellation deadlines.
package main

import (
	"context"
	"fmt"
	"time"
)

func slow(ctx context.Context) error {
	select {
	case <-time.After(200 * time.Millisecond):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	if err := slow(ctx); err != nil {
		fmt.Println("cancelled as designed:", err)
	} else {
		fmt.Println("completed in time")
	}

	ctx2, cancel2 := context.WithCancel(context.Background())
	cancel2()
	fmt.Println("instant cancel:", ctx2.Err())
}
`),
    ex("go2-ex-021", "Time formatting", "Layout-driven formats, durations.", "Standard Library", "time_pkg",
        `// Go formats time by EXAMPLE, not by %-codes.
package main

import (
	"fmt"
	"time"
)

func main() {
	now := time.Date(2024, 6, 15, 13, 45, 30, 0, time.UTC)

	fmt.Println(now.Format("2006-01-02"))
	fmt.Println(now.Format("15:04:05"))
	fmt.Println(now.Format("Mon, 2 Jan 2006"))
	fmt.Println(now.Format(time.RFC3339))

	parsed, _ := time.Parse("2006-01-02", "2024-12-25")
	fmt.Println(parsed.Weekday())

	d := 90 * time.Minute
	fmt.Println(d, "=", d.Hours(), "hours,", d.Seconds(), "seconds")
	fmt.Println(time.Since(now) > 0, "(it is in the past)")
}
`),
    ex("go2-ex-022", "Sorting and searching", "sort.Slice, Search, custom comparators.", "Standard Library", "sort_pkg",
        `// The sort package workhorses.
package main

import (
	"fmt"
	"sort"
)

type Player struct {
	Name  string
	Score int
}

func main() {
	players := []Player{{"ada", 92}, {"alan", 81}, {"grace", 96}}

	sort.Slice(players, func(i, j int) bool {
		return players[i].Score > players[j].Score
	})
	for _, p := range players {
		fmt.Println(p.Name, p.Score)
	}

	nums := []int{1, 3, 5, 7, 9}
	i := sort.Search(len(nums), func(i int) bool { return nums[i] >= 6 })
	fmt.Println("first >= 6 at index", i, "value", nums[i])
}
`),
    ex("go2-ex-023", "Strings and runes", "Unicode-aware iteration and helpers.", "Standard Library", "strings_pkg",
        `// Strings are UTF-8 byte slices; runes are the code points.
package main

import (
	"fmt"
	"strings"
)

func main() {
	s := "Praxis, ünïcode!"

	fmt.Println("bytes:", len(s), "runes:", len([]rune(s)))
	fmt.Println("upper:", strings.ToUpper(s))
	fmt.Println("contains:", strings.Contains(s, "Praxis"))

	for i, r := range s {
		if r > 127 {
			fmt.Printf("non-ascii at %d: %q\\n", i, r)
		}
	}

	parts := strings.Split("a,b,c", ",")
	fmt.Println(parts, "joined:", strings.Join(parts, "-"))
	fmt.Println("trimmed:", strings.TrimSpace("  pad  "), "replaced:", strings.ReplaceAll(s, "ü", "u"))
}
`),
    ex("go2-ex-024", "Maps in depth", "Delete, zero values, comma-ok, key sets.", "Standard Library", "maps_pkg",
        `// Map semantics worth internalizing.
package main

import "fmt"

func main() {
	m := map[string]int{"a": 1, "b": 2}

	v, ok := m["missing"]
	fmt.Println("missing value:", v, "present:", ok)

	m["c"] = 3
	delete(m, "a")
	fmt.Println(m)

	// Zero value of the VALUE type is returned for absent keys.
	fmt.Println("absent read:", m["zzz"])

	counts := map[string]int{}
	for _, w := range []string{"go", "go", "is", "fun", "go"} {
		counts[w]++
	}
	fmt.Println(counts)
}
`),
    ex("go2-ex-025", "Reading files", "os.ReadFile, bufio scanner, stat metadata.", "Standard Library", "file_io",
        `// File input the three usual ways.
package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	path := filepath.Join(os.TempDir(), "praxis_go.txt")
	os.WriteFile(path, []byte("line one\\nline two\\nline three\\n"), 0644)
	defer os.Remove(path)

	// 1) whole file at once.
	data, _ := os.ReadFile(path)
	fmt.Printf("read %d bytes\\n", len(data))

	// 2) streaming lines.
	f, _ := os.Open(path)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fmt.Println("scan:", scanner.Text())
	}
	f.Close()

	// 3) metadata.
	info, _ := os.Stat(path)
	fmt.Println(path, info.Size(), "bytes,", info.Mode())
}
`),
    ex("go2-ex-026", "Writing with bufio", "Buffered writes + the flush contract.", "Standard Library", "bufio_writer",
        `// Don't write byte-by-byte — buffer it.
package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	path := filepath.Join(os.TempDir(), "praxis_buf.txt")
	f, err := os.Create(path)
	if err != nil {
		panic(err)
	}
	w := bufio.NewWriter(f)
	for i := 1; i <= 5; i++ {
		fmt.Fprintf(w, "record %03d\\n", i)
	}
	w.Flush() // without this the tail can be lost
	f.Close()
	defer os.Remove(path)

	data, _ := os.ReadFile(path)
	fmt.Printf("%d bytes written; first line: %q\\n", len(data), string(data[:10]))
}
`),
    ex("go2-ex-027", "Walking directories", "filepath.WalkDir, filtering extensions.", "Standard Library", "walk_dir",
        `// Recursive directory traversal.
package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	root, _ := os.MkdirTemp("", "praxis_walk")
	defer os.RemoveAll(root)

	os.MkdirAll(filepath.Join(root, "sub"), 0755)
	os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(root, "sub", "b.go"), []byte("b"), 0644)

	var dirs, files int
	filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			dirs++
		} else {
			files++
		}
		if strings.HasSuffix(path, ".go") {
			fmt.Println("go file:", path)
		}
		return nil
	})
	fmt.Println("dirs:", dirs, "files:", files)
}
`),
    ex("go2-ex-028", "HTTP GET and JSON decode", "net/http client into a struct.", "Standard Library", "http_json",
        `// A GET request whose body streams straight into structs.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

func main() {
	// A local fake server stands in for the network.
	body := \`{"items": [{"name": "cpu", "load": 0.42}, {"name": "ram", "load": 0.87}]}\`
	srv := newFakeServer(body)
	defer srv.Close()

	type Item struct {
		Name string  \`json:"name"\`
		Load float64 \`json:"load"\`
	}
	var out struct {
		Items []Item \`json:"items"\`
	}

	resp, err := http.Get(srv.URL)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		panic(err)
	}
	for _, it := range out.Items {
		fmt.Printf("%s at %.0f%%\\n", it.Name, it.Load*100)
	}
}

func newFakeServer(body string) *http.Server {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(body))
	})
	srv := &http.Server{Addr: "127.0.0.1:0", Handler: handler}
	go func() { srv.ListenAndServe() }()
	for srv.Addr == "127.0.0.1:0" {
		// waiting loop until bound (demo simplification)
		if strings.Contains(srv.Addr, ":") {
			break
		}
	}
	return srv
}
`),
    ex("go2-ex-029", "Flag-based CLI", "The flag package: named args, defaults, usage.", "Standard Library", "flags",
        `// A small flag-parsed CLI.
package main

import (
	"flag"
	"fmt"
)

func main() {
	words := flag.Int("words", 3, "how many words to emit")
	style := flag.String("style", "plain", "plain | upper")
	flag.Parse()

	fmt.Printf("words=%d style=%s extra=%v\\n", *words, *style, flag.Args())

	for i := 1; i <= *words; i++ {
		w := fmt.Sprintf("word%d", i)
		if *style == "upper" {
			w = w[:4] + "-" + w[4:]
		}
		fmt.Println(w)
	}
}
`),
    ex("go2-ex-030", "Templates", "text/template with pipelines and custom funcs.", "Standard Library", "templates",
        `// Rendering text with the template engine.
package main

import (
	"fmt"
	"os"
	"text/template"
)

func main() {
	type Report struct {
		Title string
		Rows  []string
	}
	data := Report{Title: "Build", Rows: []string{"compile ok", "tests 42/42", "lint clean"}}

	tpl := template.Must(template.New("r").Funcs(template.FuncMap{
		"upper": func(s string) string {
			out := []rune(s)
			for i, r := range out {
				if r >= 'a' && r <= 'z' {
					out[i] = r - 32
				}
			}
			return string(out)
		},
	}).Parse(` + "`" + `{{ .Title | upper }}{{ "\\n" }}{{ range .Rows }}  - {{ . }}{{ "\\n" }}{{ end }}` + "`" + `))

	tpl.Execute(os.Stdout, data)
	fmt.Println("template executed")
}
`),
    ex("go2-ex-031", "Testing a pure function", "Table-driven tests, the Go convention.", "Testing", "table_tests",
        `// Table-driven tests live next to the code.
package main

import "fmt"

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func main() {
	cases := []struct {
		in, lo, hi, want int
		desc             string
	}{
		{5, 0, 10, 5, "inside"},
		{-3, 0, 10, 0, "below"},
		{99, 0, 10, 10, "above"},
		{0, 0, 10, 0, "edge lo"},
	}

	pass := 0
	for _, c := range cases {
		got := clamp(c.in, c.lo, c.hi)
		status := "ok"
		if got != c.want {
			status = "FAIL"
		} else {
			pass++
		}
		fmt.Printf("%s: clamp(%d, %d, %d) = %d (%s)\\n",
			status, c.in, c.lo, c.hi, got, c.desc)
	}
	fmt.Println(pass, "of", len(cases), "passed")
}
`),
    ex("go2-ex-032", "Benchmarks-lite", "Manual timing without testing.B.", "Testing", "bench_lite",
        `// A quick manual benchmark.
package main

import (
	"fmt"
	"strings"
	"time"
)

func concatLoop(n int) string {
	s := ""
	for i := 0; i < n; i++ {
		s += "x"
	}
	return s
}

func concatBuilder(n int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteString("x")
	}
	return b.String()
}

func timeIt(f func(int) string, n int) time.Duration {
	t0 := time.Now()
	f(n)
	return time.Since(t0)
}

func main() {
	const n = 20000
	a, b := timeIt(concatLoop, n), timeIt(concatBuilder, n)
	fmt.Println("loop:", a, " builder:", b)
	fmt.Printf("builder is %.1fx faster here\\n", float64(a)/float64(b))
}
`),
    ex("go2-ex-033", "Reflection basics", "TypeOf, ValueOf, field walks.", "Advanced", "reflect_pkg",
        `// Reflection: runtime structure inspection.
package main

import (
	"fmt"
	"reflect"
)

type Config struct {
	Name string
	Port int
	Debug bool
}

func main() {
	c := Config{Name: "praxis", Port: 8080, Debug: true}

	t := reflect.TypeOf(c)
	fmt.Println("type:", t.Name(), "kind:", t.Kind())
	fmt.Println("exported fields:", t.NumField())

	v := reflect.ValueOf(c)
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		fmt.Printf("  %s %s = %v\\n", f.Name, f.Type, v.Field(i))
	}
}
`),
    ex("go2-ex-034", "Encoding hex and base64", "hashing with sha256, encoding with base64.", "Advanced", "encoding",
        `// Hashes and encodings without dependencies.
package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

func main() {
	msg := []byte("praxis-session-1")

	sum := sha256.Sum256(msg)
	fmt.Println("sha256:", hex.EncodeToString(sum[:])[:32]+"...")

	b64 := base64.StdEncoding.EncodeToString(msg)
	fmt.Println("base64:", b64)

	back, _ := base64.StdEncoding.DecodeString(b64)
	fmt.Println("round trip ok:", string(back) == string(msg))

	urlSafe := base64.URLEncoding.EncodeToString(msg)
	fmt.Println("url-safe:", urlSafe)
}
`),
    ex("go2-ex-035", "Regexp", "Compile once, match, find groups, replace.", "Advanced", "regexp_pkg",
        `// The regexp standard library.
package main

import (
	"fmt"
	"regexp"
)

func main() {
	log := "2024-06-15 ERROR disk usage 91%"

	re := regexp.MustCompile(\`^(\\d{4}-\\d{2}-\\d{2}) (ERROR|WARN) (.*)$\`)
	m := re.FindStringSubmatch(log)
	if m != nil {
		fmt.Println("date:", m[1], "level:", m[2])
	}

	pct := regexp.MustCompile(\`(\\d+)%\`)
	fmt.Println("pct:", pct.FindString(log))

	fmt.Println(pct.ReplaceAllString(log, "__%"))

	words := regexp.MustCompile(\`\\w+\`).FindAllString("go is fun", -1)
	fmt.Println(words)
}
`),
    ex("go2-ex-036", "Env and process info", "os.Getenv/Setenv, hostname, exit codes.", "Advanced", "os_pkg",
        `// Process-level introspection.
package main

import (
	"fmt"
	"os"
	"runtime"
)

func main() {
	home, ok := os.LookupEnv("HOME")
	fmt.Println("HOME set:", ok, home)

	os.Setenv("PRAXIS_SESSION", "session-1")
	fmt.Println("session:", os.Getenv("PRAXIS_SESSION"))

	host, err := os.Hostname()
	fmt.Println("host:", host, "err:", err == nil)

	fmt.Println("go version:", runtime.Version())
	fmt.Println("cpus:", runtime.NumCPU())
	fmt.Println("cwd:")
	wd, _ := os.Getwd()
	fmt.Println(" ", wd)
}
`),
    ex("go2-ex-037", "Signal handling", "os/signal + graceful shutdown shape.", "Advanced", "signals",
        `// Catching Ctrl-C style interrupts.
package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("simulating a loop that respects cancellation")
	for i := 0; i < 2; i++ {
		select {
		case s := <-sigs:
			fmt.Println("received:", s, "- shutting down")
			return
		case <-time.After(10 * time.Millisecond):
			fmt.Println("tick", i)
		}
	}

	// Sending ourselves a signal to exercise the path.
	_ = syscall.Getpid()
	fmt.Println("loop finished without a signal")
}
`),
    ex("go2-ex-038", "A structured logger", "leveled, timestamped logging built by hand.", "Projects", "logger",
        `// A tiny leveled logger (stdlib only).
package main

import (
	"fmt"
	"time"
)

type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
)

func (l Level) String() string { return []string{"DEBUG", "INFO", "WARN", "ERROR"}[l] }

type Logger struct{ min Level }

func (lg *Logger) Log(l Level, msg string) {
	if l >= lg.min {
		fmt.Printf("%s [%-5s] %s\\n", time.Now().Format("15:04:05"), l, msg)
	}
}

func main() {
	lg := &Logger{min: INFO}
	lg.Log(DEBUG, "suppressed")
	lg.Log(INFO, "service started")
	lg.Log(WARN, "disk at 91%")
	lg.Log(ERROR, "mirror sync failed")
	lg.Log(DEBUG, "also suppressed")
}
`),
    ex("go2-ex-039", "A config loader", "read + validate + defaults with defaults merge.", "Projects", "config",
        `// The read-validate-defaults triad.
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	Host    string \`json:"host"\`
	Port    int    \`json:"port"\`
	Retries int    \`json:"retries"\`
}

func defaults() Config { return Config{Host: "0.0.0.0", Port: 8080, Retries: 1} }

func load() (Config, error) {
	cfg := defaults()
	path := os.TempDir() + "/praxis_cfg.json"
	os.WriteFile(path, []byte(\`{"host": "127.0.0.1", "port": 9090}\`), 0644)
	defer os.Remove(path)

	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	if cfg.Port < 1 || cfg.Port > 65535 {
		return cfg, fmt.Errorf("port %d out of range", cfg.Port)
	}
	return cfg, nil
}

func main() {
	cfg, err := load()
	fmt.Println("err:", err)
	fmt.Printf("host=%s port=%d retries=%d\\n", cfg.Host, cfg.Port, cfg.Retries)
}
`),
    ex("go2-ex-040", "A complete mini tool", "flags + files + maps + report: wordstats.", "Projects", "wordstats",
        `// wordstats.go [file] - counts lines/words, ranks top words.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
)

func main() {
	top := flag.Int("top", 3, "how many top words")
	flag.Parse()

	path := "praxis_words.txt"
	if flag.NArg() > 0 {
		path = flag.Arg(0)
	} else {
		os.WriteFile(path, []byte("go go is fun\\ngo runs everywhere\\nfun times\\n"), 0644)
		defer os.Remove(path)
	}

	f, err := os.Open(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot open:", err)
		os.Exit(1)
	}
	defer f.Close()

	counts := map[string]int{}
	lines := 0
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		lines++
		for _, w := range strings.Fields(sc.Text()) {
			counts[w]++
		}
	}

	type pair struct {
		W string
		N int
	}
	var pairs []pair
	for w, n := range counts {
		pairs = append(pairs, pair{w, n})
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].N != pairs[j].N {
			return pairs[i].N > pairs[j].N
		}
		return pairs[i].W < pairs[j].W
	})

	fmt.Println("lines:", lines, "unique words:", len(pairs))
	for i := 0; i < len(pairs) && i < *top; i++ {
		fmt.Printf("%-12s %dx\\n", pairs[i].W, pairs[i].N)
	}
}
`),
];
