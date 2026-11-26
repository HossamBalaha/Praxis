# Examples — one runnable idea per language

A compact tour of the languages Praxis highlights and runs. Every
snippet fits on one screen and prints something when executed with the
language's runtime.

## Python — statistics without imports

```python
import statistics as st

samples = [12, 14, 15, 15, 16, 19, 21, 24, 24, 27]
print(f"mean   : {st.mean(samples):.2f}")
print(f"median : {st.median(samples)}")
print(f"stdev  : {st.stdev(samples):.2f}")
```

```text
mean   : 18.70
median : 17.5
stdev  : 4.99
```

## JavaScript — the debounced logger

```javascript
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
const log = debounce((x) => console.log("settled:", x), 200);
log(1); log(2); log(3); // only the last one prints
```

## TypeScript — a typed result

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function parsePort(raw: string): Result<number> {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 && n < 65536
    ? { ok: true, value: n }
    : { ok: false, error: new Error(`not a port: ${raw}`) };
}
```

## Go — worker pool

```go
func main() {
    jobs := make(chan int, 8)
    var wg sync.WaitGroup
    for w := 0; w < 3; w++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for j := range jobs {
                fmt.Printf("worker %d handled job %d\n", id, j)
            }
        }(w)
    }
    for j := 1; j <= 6; j++ { jobs <- j }
    close(jobs)
    wg.Wait()
}
```

## Rust — ownership in four lines

```rust
fn main() {
    let owned = String::from("praxis");
    let borrowed = &owned;
    println!("{borrowed} borrows, {owned} owns");
}
```

## Java — a record + stream

```java
record Reading(String sensor, double celsius) {}

var warm = readings.stream()
    .filter(r -> r.celsius() > 20)
    .map(Reading::sensor)
    .sorted()
    .toList();
```

## C — pointer arithmetic

```c
#include <stdio.h>
int main(void) {
    int row[4] = {2, 4, 6, 8};
    for (int *p = row; p < row + 4; p++)
        printf("%d ", *p * 2);
    putchar('\n');
    return 0;
}
```

## C++ — RAII guard

```cpp
struct Timer {
    std::chrono::steady_clock::time_point t0{std::chrono::steady_clock::now()};
    ~Timer() {
        auto us = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::steady_clock::now() - t0).count();
        std::cout << "elapsed: " << us << "us\n";
    }
};
```

## Ruby — blocks

```ruby
%w[alpha beta gamma].each_with_index do |name, i|
  puts format("%02d. %s", i + 1, name.upcase)
end
```

## PHP — associative map

```php
$counts = array_count_values(str_split("mississippi"));
arsort($counts);
foreach (array_slice($counts, 0, 3, true) as $ch => $n) {
    echo "$ch appears $n times\n";
}
```

## R — vectorized transform

```r
heights <- c(1.62, 1.75, 1.68, 1.80, 1.71)
z <- scale(heights)
print(round(as.numeric(z), 2))
```

## MATLAB — signal sweep

```matlab
t = linspace(0, 1, 500);
sweep = sin(2*pi*(50*t + 100*t.^2));
fprintf("peak amplitude: %.3f\n", max(abs(sweep)));
```

## Lua — metatables

```lua
local Vec = {}
Vec.__index = Vec
function Vec.new(x, y) return setmetatable({x = x, y = y}, Vec) end
function Vec.__add(a, b) return Vec.new(a.x + b.x, a.y + b.y) end
local v = Vec.new(1, 2) + Vec.new(3, 4)
print(string.format("(%d, %d)", v.x, v.y))
```

## Perl — count word frequencies

```perl
my %freq;
$freq{$_}++ for split /\s+/, "the quick brown fox the lazy dog the end";
printf "%-6s %d\n", $_, $freq{$_} for sort keys %freq;
```

## Julia — multiple dispatch

```julia
describe(x::Int) = "integer $x"
describe(x::Float64) = "float $x"
describe(v::Vector) = "vector of length $(length(v))"
println(describe(7)), println(describe([1, 2, 3]))
```

## Kotlin — data class + when

```kotlin
data class Pt(val x: Int, val y: Int)

fun quadrant(p: Pt) = when {
    p.x > 0 && p.y > 0 -> "I"
    p.x < 0 && p.y > 0 -> "II"
    else -> "axis or beyond"
}
```

## Swift — optionals

```swift
let raw = ["10", "x", "42"]
let parsed = raw.compactMap { Int($0) }
print(parsed.reduce(0, +))  // 52
```

## Shell — safe backup rotation

```bash
set -euo pipefail
for i in 4 3 2 1; do
  [ -f "backup.$i.tar.gz" ] && mv "backup.$i.tar.gz" "backup.$((i + 1)).tar.gz"
done
tar -czf backup.1.tar.gz ./data
```

## SQL — window function

```sql
SELECT sensor, recorded_at, celsius,
       ROUND(AVG(celsius) OVER (
         PARTITION BY sensor
         ORDER BY recorded_at
         ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
       ), 2) AS rolling_avg
FROM readings
ORDER BY sensor, recorded_at;
```

## YAML — a service manifest

```yaml
service: ingest
replicas: 3
resources:
  cpu: 500m
  memory: 512Mi
probes:
  readiness: /healthz
  liveness: /livez
```

## TOML — dependency pins

```toml
[project]
name = "readme-examples"
version = "0"

[dependencies]
numpy = ">=1.26"
```

## JSON — a nested event

```json
{
  "event": "run.finished",
  "at": "2026-11-18T09:41:00Z",
  "run": { "id": "r-812", "exitCode": 0, "seconds": 4.2 }
}
```
