/**
 * 10 Go reference templates (the "add other languages
 * also + their examples to check" batch). Bodies are idiomatic Go
 * (pure stdlib), created as .go files and runnable through `go run`
 * the moment the toolchain is installed.
 *
 * Go identifiers keep their native Go casing (no naming tokens).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Go";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("go", id, label, description, CAT, sub, baseName, ".go", () => body);

export const GO_EXAMPLES: FileExample[] = [
    ex("go-ex-001", "Hello, Go", "fmt.Println/Printf verbs and package main — every program's opening.", "Basics", "hello_go",
        `// Hello, Go — the fmt family.
package main

import "fmt"

func main() {
	fmt.Println("Hello from Go!") // Println joins args + newline

	name := "Praxis"              // := declares AND infers the type
	fmt.Printf("Hello, %s!\\n", name)

	// Printf verbs: %d %s %f %v %T %t.
	count, pi, flag := 42, 3.14159, true
	fmt.Printf("int=%d float=%.4f bool=%t\\n", count, pi, flag)
	fmt.Printf("types: %T %T %T\\n", count, pi, flag)

	// %v prints ANY value readably.
	fmt.Printf("slice=%v\\n", []int{5, 1, 4})
	fmt.Printf("map=%v\\n", map[string]int{"a": 1})

	// Sprintf builds the string instead of printing it.
	line := fmt.Sprintf("formatted %04d", 7)
	fmt.Println(line)
}
`),

    ex("go-ex-002", "Slices", "make/literal, append, slicing bounds, len/cap and copy.", "Data structures", "slices_tour",
        `// Slices — Go's growable list.
package main

import "fmt"

func main() {
	var empty []int                 // nil slice: len 0, usable
	fmt.Println("empty:", empty, "len:", len(empty))

	// make: length + optional capacity.
	nums := make([]int, 0, 4)
	for i := 1; i <= 5; i++ {
		nums = append(nums, i*i)    // append may reallocate + returns
	}
	fmt.Println("squares:", nums, "len:", len(nums))

	// Literal + slice expressions.
	words := []string{"alpha", "bravo", "charlie", "delta"}
	fmt.Println("first two:", words[:2])
	fmt.Println("middle:", words[1:3])
	fmt.Println("last:", words[len(words)-1:])

	// copy(dst, src) — the safe way to clone into a fixed window.
	clone := make([]int, len(nums))
	n := copy(clone, nums)
	fmt.Println("copied", n, "values ->", clone)

	// Iteration order is index order.
	for i, w := range words {
		fmt.Println(i, w)
	}
}
`),

    ex("go-ex-003", "Maps", "Literal + make, missing-key zeros, the comma-ok read, delete and range.", "Data structures", "maps_tour",
        `// Maps — Go's dictionary.
package main

import "fmt"

func main() {
	// Literal form.
	freq := map[string]int{}
	for _, word := range []string{"to", "be", "or", "not", "to", "be"} {
		freq[word]++ // missing keys read as the zero value (0)
	}
	fmt.Println("freq:", freq)

	// The comma-ok idiom — presence WITHOUT inserting.
	if count, ok := freq["to"]; ok {
		fmt.Println("'to' appears", count, "times")
	}
	if _, ok := freq["zeta"]; !ok {
		fmt.Println("'zeta' absent")
	}

	// delete + length.
	delete(freq, "or")
	fmt.Println("after delete:", freq, "size:", len(freq))

	// Map iteration order is deliberately RANDOM in Go.
	scores := map[string]int{"alice": 95, "bob": 88, "carol": 92}
	for name, score := range scores {
		fmt.Println(name, score) // any order — never rely on it
	}

	// Nested maps: map of maps.
	grid := map[string]map[string]int{}
	if grid["a"] == nil {
		grid["a"] = map[string]int{}
	}
	grid["a"]["b"] = 1
	fmt.Println("nested:", grid)
}
`),

    ex("go-ex-004", "Functions", "Multiple return values, error returns, variadic, closures and defer.", "Functions", "functions_tour",
        `// Functions — Go's error convention lives here.
package main

import (
	"errors"
	"fmt"
)

func divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, errors.New("division by zero")
	}
	return a / b, nil
}

// Variadic parameter.
func sum(values ...int) int {
	total := 0
	for _, v := range values {
		total += v
	}
	return total
}

func main() {
	// The comma-ok / if err != nil idiom.
	if result, err := divide(10, 4); err != nil {
		fmt.Println("error:", err)
	} else {
		fmt.Printf("10 / 4 = %.2f\\n", result)
	}
	if _, err := divide(1, 0); err != nil {
		fmt.Println("caught:", err)
	}

	fmt.Println("sum() =", sum())
	fmt.Println("sum(1,2,3) =", sum(1, 2, 3))

	// defer queues a call for function EXIT (LIFO).
	defer fmt.Println("deferred 1 (runs last)")
	defer fmt.Println("deferred 2 (runs first)")

	// Closures capture their variables by reference.
	counter := 0
	bump := func() int { counter++; return counter }
	bump()
	bump()
	fmt.Println("closure counter:", bump())
	fmt.Println("main body done")
}
`),

    ex("go-ex-005", "Structs and methods", "Type declarations, methods with value vs pointer receivers and embedding.", "OOP", "structs_methods",
        `// Structs + methods — Go's object system.
package main

import (
	"fmt"
	"math"
)

type Point struct {
	X, Y float64 // fields on one line
}

// Value receiver: operates on a COPY.
func (p Point) length() float64 {
	return math.Hypot(p.X, p.Y)
}

// Pointer receiver: can MUTATE the original.
func (p *Point) scale(factor float64) {
	p.X *= factor
	p.Y *= factor
}

// Stringer: fmt uses this when printing the value.
func (p Point) String() string {
	return fmt.Sprintf("Point(%.1f, %.1f)", p.X, p.Y)
}

// Embedding — composition instead of inheritance.
type Named struct {
	Name string
}
type Tag struct {
	Named      // embedded: Tag.Name works directly
	Value int
}

func main() {
	p := Point{3, 4}
	fmt.Println(p, "length:", p.length())
	p.scale(2) // &p auto-taken for pointer methods
	fmt.Println(p)
	fmt.Println(Tag{Named{"go"}, 7}.Name)

	// Struct comparison: field-by-field when types match.
	fmt.Println("equal points?", Point{1, 2} == Point{1, 2})

	// Anonymous structs: quick ad-hoc records.
	stats := struct {
		Count int
		Label string
	}{3, "items"}
	fmt.Println(stats)
}
`),

    ex("go-ex-006", "Errors", "Wrapping with %w, errors.Is/As, custom error types and the sentinel pattern.", "Robustness", "errors_tour",
        `// Errors — wrapping, matching and custom types.
package main

import (
	"errors"
	"fmt"
)

// A sentinel error callers can match with errors.Is.
var ErrNotFound = errors.New("record not found")

// A custom error TYPE matched with errors.As.
type ValidationError struct {
	Field string
	Msg   string
}

func (v *ValidationError) Error() string {
	return fmt.Sprintf("invalid %s: %s", v.Field, v.Msg)
}

func loadUser(id int) (string, error) {
	if id <= 0 {
		// Wrap with %w — the chain stays inspectable.
		return "", fmt.Errorf("loadUser(%d): %w", id, ErrNotFound)
	}
	return fmt.Sprintf("user-%d", id), nil
}

func parseAge(age int) error {
	if age < 0 {
		return &ValidationError{Field: "age", Msg: "negative"}
	}
	return nil
}

func main() {
	if _, err := loadUser(-3); err != nil {
		fmt.Println("err:", err)
		fmt.Println("is NotFound?", errors.Is(err, ErrNotFound))
	}

	if err := parseAge(-1); err != nil {
		var ve *ValidationError
		if errors.As(err, &ve) {
			fmt.Println("field:", ve.Field)
		}
	}

	// The zero-value no-error case.
	if err := parseAge(31); err == nil {
		fmt.Println("age 31 is fine")
	}
}
`),

    ex("go-ex-007", "Goroutines and channels", "go spawn, unbuffered channels, select timeout and sync.WaitGroup.", "Concurrency", "goroutines_channels",
        `// Concurrency — goroutines, channels, select.
package main

import (
	"fmt"
	"sync"
	"time"
)

func main() {
	// WaitGroup: wait for a set of goroutines to finish.
	var wg sync.WaitGroup
	results := make([]int, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(slot int) { // goroutines are just "go fn()"
			defer wg.Done()
			time.Sleep(time.Duration(4-slot) * 10 * time.Millisecond)
			results[slot] = (slot + 1) * (slot + 1) // safe: disjoint slots
		}(i)
	}
	wg.Wait()
	fmt.Println("squares:", results)

	// Unbuffered channel — synchronized hand-off.
	ch := make(chan string)
	go func() { ch <- "ping" }()
	fmt.Println("received:", <-ch)

	// select with a timeout — the standard cancel shape.
	fast := make(chan string)
	go func() { time.Sleep(20 * time.Millisecond); fast <- "fast result" }()
	select {
	case msg := <-fast:
		fmt.Println("got:", msg)
	case <-time.After(200 * time.Millisecond):
		fmt.Println("timed out")
	}

	// Range over a channel closes when the sender closes it.
	stream := make(chan int, 3)
	go func() {
		for i := 1; i <= 3; i++ {
			stream <- i
		}
		close(stream)
	}()
	for v := range stream {
		fmt.Print(v, " ")
	}
	fmt.Println()
}
`),

    ex("go-ex-008", "Interfaces", "Implicit satisfaction, multiple interfaces, empty interface and type assertion.", "OOP", "interfaces_tour",
        `// Interfaces — implicit satisfaction, the Go way.
package main

import "fmt"

// Any type with Speak string satisfies Speaker — no "implements".
type Speaker interface {
	Speak() string
}

type Robot struct{ Name string }

func (r Robot) Speak() string { return r.Name + ": beep boop" }

type Human struct{ Name string }

func (h Human) Speak() string { return h.Name + ": hello" }

// Interfaces compose.
type Greeter interface {
	Speaker
	Greeting() string
}

type Politician struct{}

func (p Politician) Speak() string    { return "my fellow citizens" }
func (p Politician) Greeting() string { return "welcome" }

func main() {
	// A slice of the INTERFACE holds mixed concrete types.
	speakers := []Speaker{Robot{"R2"}, Human{"Ada"}, Politician{}}
	for _, s := range speakers {
		fmt.Println(s.Speak())
	}

	// The any/empty interface holds anything.
	var anything any = 42
	fmt.Println("anything:", anything)
	anything = "now a string"
	fmt.Println("anything:", anything)

	// Type assertion + comma-ok.
	if v, ok := anything.(string); ok {
		fmt.Println("it IS a string:", v)
	}

	// Type SWITCH on the dynamic type.
	for _, item := range []any{7, "seven", 7.0, true} {
		switch value := item.(type) {
		case int:
			fmt.Println("int", value)
		case string:
			fmt.Println("string", value)
		case bool:
			fmt.Println("bool", value)
		default:
			fmt.Println("other", value)
		}
	}
}
`),

    ex("go-ex-009", "Files and JSON", "os.WriteFile/ReadFile, encoding/json marshal + unmarshal into structs.", "Practical", "files_json",
        `// Files + JSON — the stdlib round trip.
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// Field tags map JSON names onto struct fields.
type Score struct {
	Name  string  \`json:"name"\`
	Score int     \`json:"score"\`
	Tags  []string \`json:"tags,omitempty"\` // omitted when empty
}

func main() {
	record := Score{Name: "praxis", Score: 44, Tags: []string{"ide"}}

	// Marshal (Indent = pretty-print).
	blob, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		fmt.Println("marshal:", err)
		return
	}
	fmt.Println(string(blob))

	// Round-trip back into a NEW struct.
	var back Score
	if err := json.Unmarshal(blob, &back); err != nil {
		fmt.Println("unmarshal:", err)
		return
	}
	fmt.Printf("%#v\\n", back)

	// One-line file write + read.
	path := "/tmp/praxis_go_demo.json"
	if err := os.WriteFile(path, blob, 0o644); err != nil {
		fmt.Println("write:", err)
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Println("read:", err)
		return
	}
	fmt.Println("file bytes:", len(raw))
	os.Remove(path) // tidy
	fmt.Println("cleaned up")
}
`),

    ex("go-ex-010", "Generics and testing-style helpers", "Type parameters [T any] and the comparable constraint — the Go 1.18+ addition.", "Modern Go", "generics_tour",
        `// Generics — type parameters, constraints, instantiation.
package main

import "fmt"

// A generic function over ANY type.
func Map[T, U any](values []T, fn func(T) U) []U {
	out := make([]U, len(values))
	for i, v := range values {
		out[i] = fn(v)
	}
	return out
}

// The comparable constraint enables ==.
func Contains[T comparable](haystack []T, needle T) bool {
	for _, v := range haystack {
		if v == needle {
			return true
		}
	}
	return false
}

// A generic STACK type with methods.
type Stack[T any] struct {
	items []T
}

func (s *Stack[T]) Push(v T) { s.items = append(s.items, v) }
func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v, true
}

func main() {
	doubled := Map([]int{1, 2, 3}, func(n int) int { return n * 2 })
	fmt.Println("doubled:", doubled)

	lengths := Map([]string{"go", "praxis"}, func(s string) int { return len(s) })
	fmt.Println("lengths:", lengths)

	fmt.Println("contains 2?", Contains([]int{1, 2, 3}, 2))
	fmt.Println("contains 'z'?", Contains([]string{"a", "b"}, "z"))

	s := Stack[string]{}
	s.Push("first")
	s.Push("second")
	for {
		v, ok := s.Pop()
		if !ok {
			break
		}
		fmt.Println("popped:", v)
	}
}
`),
];
