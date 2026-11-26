/**
 * the C top-up: 40 more reference templates on top of the
 * ten, bringing the language to the "at least 50 like others"
 * bar. Pure C99 stdlib, compiled + run with gcc the moment it exists.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "C";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("c", id, label, description, CAT, sub, baseName, ".c", () => body);

export const C_2_EXAMPLES: FileExample[] = [
    ex("c2-ex-001", "Pointers and swap", "&, *, the classic swap-by-reference.", "Pointers & Memory", "pointer_swap",
        `#include <stdio.h>

void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}

int main(void) {
    int x = 1, y = 99;
    swap(&x, &y);
    printf("x=%d y=%d\\n", x, y);

    int *p = &x;
    printf("pointer deref: %d, address step: %ld\\n", *p, (long)((char*)p - (char*)&y));
    return 0;
}
`),
    ex("c2-ex-002", "Pointer arithmetic on arrays", "p[i] == *(p+i), walking with ++, difference semantics.", "Pointers & Memory", "pointer_walk",
        `#include <stdio.h>

int main(void) {
    int a[5] = {10, 20, 30, 40, 50};
    int *p = a;

    printf("a[2]=%d *(p+2)=%d p[2]=%d\\n", a[2], *(p + 2), p[2]);
    for (int i = 0; i < 5; i++, p++)
        printf("walk: %d\\n", *p);

    int *first = a, *last = a + 5;
    printf("count = %td elements\\n", last - first);
    return 0;
}
`),
    ex("c2-ex-003", "Dynamic allocation", "malloc / free, sizeof-driven, the NULL check.", "Pointers & Memory", "malloc_basics",
        `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int n = 5;
    int *v = malloc(n * sizeof *v);
    if (!v) { perror("malloc"); return 1; }

    for (int i = 0; i < n; i++) v[i] = (i + 1) * (i + 1);
    for (int i = 0; i < n; i++) printf("sq[%d]=%d\\n", i, v[i]);

    free(v);
    v = NULL;              // no dangling pointer
    printf("freed\\n");
    return 0;
}
`),
    ex("c2-ex-004", "Realloc growth", "Growing a heap buffer safely (temp-pointer pattern).", "Pointers & Memory", "realloc_growth",
        `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    size_t cap = 4, used = 0;
    int *v = malloc(cap * sizeof *v);

    for (int i = 1; i <= 10; i++) {
        if (used == cap) {
            cap *= 2;
            int *nv = realloc(v, cap * sizeof *nv);
            if (!nv) { free(v); return 1; }
            v = nv;
        }
        v[used++] = i * i;
    }
    printf("used=%zu cap=%zu\\n", used, cap);
    for (size_t i = 0; i < used; i++) printf("%zu: %d\\n", i, v[i]);

    free(v);
    return 0;
}
`),
    ex("c2-ex-005", "Two pointers to one buffer", "const-correctness and aliasing made visible.", "Pointers & Memory", "aliasing",
        `#include <stdio.h>

void bump(const int *src, int *dst) { *dst = *src + 1; }

int main(void) {
    int n = 5;
    int *alias = &n;
    bump(&n, alias);        // writes back into the SAME int
    printf("n = %d\\n", n);

    const int frozen = 42;
    int copy = 0;
    bump(&frozen, &copy);
    printf("copy = %d, frozen = %d\\n", copy, frozen);
    return 0;
}
`),
    ex("c2-ex-006", "Function pointers", "Pointers to functions, dispatch tables.", "Pointers & Memory", "function_pointers",
        `#include <stdio.h>

int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }

typedef int (*binop)(int, int);

int main(void) {
    binop ops[] = {add, mul};
    const char *names[] = {"add", "mul"};

    for (int i = 0; i < 2; i++)
        printf("%s(3,4) = %d\\n", names[i], ops[i](3, 4));

    binop picked = mul;
    printf("picked: %d\\n", picked(6, 7));
    return 0;
}
`),
    ex("c2-ex-007", "String literals and arrays", "char* vs char[], strlen, the NUL terminator.", "Strings & Stdlib", "string_memory",
        `#include <stdio.h>
#include <string.h>

int main(void) {
    const char *lit = "literal";       // read-only bytes + NUL
    char buf[16] = "array";             // modifiable copy

    printf("lit=%s buf=%s\\n", lit, buf);
    printf("sizes: %zu %zu\\n", sizeof lit, sizeof buf);

    buf[0] = 'A';                       // legal: it's an array
    printf("mutated: %s (len %zu)\\n", buf, strlen(buf));

    char joined[32];
    snprintf(joined, sizeof joined, "%s+%s", lit, buf);
    printf("joined: %s\\n", joined);
    return 0;
}
`),
    ex("c2-ex-008", "strtok and parsing", "Tokenizing a sentence on delimiters.", "Strings & Stdlib", "strtok_tour",
        `#include <stdio.h>
#include <string.h>

int main(void) {
    char line[] = "alpha, beta ; gamma,delta";
    const char *delims = ", ;";

    char *tok = strtok(line, delims);
    while (tok) {
        printf("token: [%s]\\n", tok);
        tok = strtok(NULL, delims);
    }
    return 0;
}
`),
    ex("c2-ex-009", "strtol and validation", "Robust number parsing with endptr + errno.", "Strings & Stdlib", "strtol_check",
        `#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

int parse(const char *s, long *out) {
    char *end;
    errno = 0;
    long v = strtol(s, &end, 10);
    if (end == s || *end != 0 || errno == ERANGE) return 0;
    *out = v;
    return 1;
}

int main(void) {
    const char *inputs[] = {"42", "  7x", "abc", "99999999999999"};
    for (int i = 0; i < 4; i++) {
        long v;
        printf("%-15s -> %s\\n", inputs[i],
               parse(inputs[i], &v) ? "ok" : "invalid");
    }
    return 0;
}
`),
    ex("c2-ex-010", "sprintf/safe formatting", "snprintf bounds, %*d widths, field padding.", "Strings & Stdlib", "snprintf_tour",
        `#include <stdio.h>

int main(void) {
    char buf[16];
    int written = snprintf(buf, sizeof buf, "value=%d", 123456789);
    printf("stored: [%s] (truncated? %d vs %d)\\n", buf, written, (int)sizeof buf - 1);

    printf("[%8d] [%-8d] [%08d]\\n", 42, 42, 42);
    printf("[%*d] width by argument\\n", 6, 9);
    printf("[%.3f] [%.0f] [%10.1f]\\n", 3.14159, 2.71828, 99.5);
    return 0;
}
`),
    ex("c2-ex-011", "Structs", "Definition, nested init, member access, arrays of structs.", "Structs & Files", "struct_basics",
        `#include <stdio.h>

typedef struct {
    char name[16];
    int credits;
    double grade;
} Course;

int main(void) {
    Course sem = {.name = "Algorithms", .credits = 6, .grade = 3.8};
    Course others[2] = {{"Systems", 5, 3.6}, {"Ethics", 2, 4.0}};

    printf("%s: %d cr, %.1f gpa\\n", sem.name, sem.credits, sem.grade);
    double total = sem.credits;
    for (int i = 0; i < 2; i++) {
        printf("%s: %d cr\\n", others[i].name, others[i].credits);
        total += others[i].credits;
    }
    printf("total credits: %.0f\\n", total);
    return 0;
}
`),
    ex("c2-ex-012", "Pointers to structs and ->", "Heap struct, arrow access, deep copy.", "Structs & Files", "struct_pointer",
        `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { int id; char tag[8]; } Item;

int main(void) {
    Item *it = malloc(sizeof *it);
    it->id = 7;
    strcpy(it->tag, "core");

    printf("id=%d tag=%s\\n", it->id, it->tag);

    Item copy = *it;                 // whole-struct copy
    copy.id = 8;
    printf("orig=%d copy=%d (tag shared text: %s)\\n", it->id, copy.id, copy.tag);

    free(it);
    return 0;
}
`),
    ex("c2-ex-013", "Unions and bit-fields", "Overlapping storage, tagged with an enum.", "Structs & Files", "unions",
        `#include <stdio.h>

typedef enum { KIND_INT, KIND_DBL, KIND_STR } Kind;
typedef union { long i; double d; char s[8]; } Value;
typedef struct { Kind kind; Value v; } Cell;

void show(const Cell *c) {
    switch (c->kind) {
        case KIND_INT: printf("int %ld\\n", c->v.i); break;
        case KIND_DBL: printf("dbl %.2f\\n", c->v.d); break;
        case KIND_STR: printf("str %s\\n", c->v.s); break;
    }
}

int main(void) {
    printf("union size: %zu (largest member)\\n", sizeof(Value));
    Cell cells[2] = {{KIND_INT, {.i = 42}}, {KIND_DBL, {.d = 2.5}}};
    show(&cells[0]);
    show(&cells[1]);
    return 0;
}
`),
    ex("c2-ex-014", "File I/O with fprintf", "Writing structured lines, reading them back with fscanf.", "Structs & Files", "file_io",
        `#include <stdio.h>

int main(void) {
    FILE *f = fopen("praxis_scores.txt", "w+");
    if (!f) { perror("open"); return 1; }

    fprintf(f, "%s %d %d\\n", "ada", 92, 96);
    fprintf(f, "%s %d %d\\n", "alan", 81, 75);

    rewind(f);
    char name[16];
    int math, verbal;
    while (fscanf(f, "%15s %d %d", name, &math, &verbal) == 3)
        printf("%-8s math=%d verbal=%d avg=%.1f\\n", name, math, verbal, (math + verbal) / 2.0);

    fclose(f);
    remove("praxis_scores.txt");
    return 0;
}
`),
    ex("c2-ex-015", "Reading a file line by line", "fgets with a bounded buffer + sscanf extraction.", "Structs & Files", "read_lines",
        `#include <stdio.h>

int main(void) {
    FILE *f = fopen("praxis_log.txt", "w");
    fputs("level=INFO msg=boot\\n", f);
    fputs("level=WARN msg=disk\\n", f);
    fputs("level=ERROR msg=sync\\n", f);
    fclose(f);

    f = fopen("praxis_log.txt", "r");
    char line[128], level[8], msg[32];
    while (fgets(line, sizeof line, f)) {
        if (sscanf(line, "level=%7s msg=%31s", level, msg) == 2)
            printf("[%s] %s\\n", level, msg);
    }
    fclose(f);
    remove("praxis_log.txt");
    return 0;
}
`),
    ex("c2-ex-016", "Endianness and bytes", "Reading a value's bytes through a union / shifts.", "Bits & Numbers", "endianness",
        `#include <stdio.h>
#include <stdint.h>

int main(void) {
    uint32_t v = 0x01020304;
    uint8_t *b = (uint8_t *)&v;

    printf("bytes: %02x %02x %02x %02x\\n", b[0], b[1], b[2], b[3]);
    printf("machine looks %s-endian\\n", b[0] == 0x01 ? "big" : "little");

    // Same via shifts (order-independent truth).
    printf("assembled: %08x\\n",
           (uint32_t)b[0] << 24 | (uint32_t)b[1] << 16 | (uint32_t)b[2] << 8 | b[3]);
    return 0;
}
`),
    ex("c2-ex-017", "Bit masks and flags", "set / clear / toggle / test with the classic macros.", "Bits & Numbers", "bit_masks",
        `#include <stdio.h>
#define SET(v, b)   ((v) |=  (1u << (b)))
#define CLEAR(v, b) ((v) &= ~(1u << (b)))
#define TOGGLE(v, b)((v) ^=  (1u << (b)))
#define TEST(v, b)  (((v) >> (b)) & 1u)

int main(void) {
    unsigned flags = 0;
    SET(flags, 0); SET(flags, 2); SET(flags, 3);
    printf("flags=0x%x\\n", flags);

    TOGGLE(flags, 3);
    printf("after toggle: 0x%x (bit3=%u)\\n", flags, TEST(flags, 3));

    CLEAR(flags, 2);
    printf("cleared: 0x%x popcount-ish %u\\n", flags, __builtin_popcount(flags));
    return 0;
}
`),
    ex("c2-ex-018", "Shifting and packing", "Packing four bytes into an int and back.", "Bits & Numbers", "pack_bytes",
        `#include <stdio.h>
#include <stdint.h>

uint32_t pack(uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
    return (uint32_t)a << 24 | (uint32_t)b << 16 | (uint32_t)c << 8 | d;
}

int main(void) {
    uint32_t word = pack(0xde, 0xad, 0xbe, 0xef);
    printf("packed: 0x%08x\\n", word);

    printf("unpacked: %02x %02x %02x %02x\\n",
           word >> 24, word >> 16, word >> 8, word);
    printf("sign-safe shift: %u\\n", (word << 4) >> 4);
    return 0;
}
`),
    ex("c2-ex-019", "Integer limits and overflow", "UINT_MAX wrap-around, signed pitfalls.", "Bits & Numbers", "limits",
        `#include <limits.h>
#include <stdio.h>
#include <stdint.h>

int main(void) {
    printf("int max=%d min=%d\\n", INT_MAX, INT_MIN);
    printf("uint max=%u, wraps to 0 after +1\\n", UINT_MAX);

    unsigned u = UINT_MAX;
    u++;
    printf("wrapped: %u\\n", u);

    uint64_t big = (uint64_t)UINT_MAX + 1;
    printf("widened instead: %llu\\n", (unsigned long long)big);
    printf("sizeof ladder: %zu %zu %zu\\n", sizeof(short), sizeof(int), sizeof(long));
    return 0;
}
`),
    ex("c2-ex-020", "Random numbers", "srand seeding, ranges, why modulo biases.", "Bits & Numbers", "randomness",
        `#include <stdio.h>
#include <stdlib.h>

int in_range(int lo, int hi) { return lo + rand() % (hi - lo + 1); }

int main(void) {
    srand(42);                       // deterministic for the demo
    for (int i = 0; i < 5; i++)
        printf("roll: %d\\n", in_range(1, 6));

    // The biased-vs-clean comparison (range 0..9, RAND_MAX=32767).
    printf("biased %%10 never hits all buckets equally; scaled:\\n");
    for (int i = 0; i < 5; i++)
        printf("scaled: %d\\n", (int)((double)rand() / RAND_MAX * 10));
    return 0;
}
`),
    ex("c2-ex-021", "Sorting with qsort", "The comparator contract, ascending + descending.", "Arrays & Sorting", "qsort_tour",
        `#include <stdio.h>
#include <stdlib.h>

int asc(const void *a, const void *b) {
    return *(const int *)a - *(const int *)b;
}
int desc(const void *a, const void *b) {
    return *(const int *)b - *(const int *)a;
}

void show(const char *label, int *v, int n) {
    printf("%s:", label);
    for (int i = 0; i < n; i++) printf(" %d", v[i]);
    printf("\\n");
}

int main(void) {
    int v[] = {9, 2, 7, 4, 3, 8};
    int n = sizeof v / sizeof v[0];

    qsort(v, n, sizeof *v, asc);
    show("ascending", v, n);
    qsort(v, n, sizeof *v, desc);
    show("descending", v, n);
    return 0;
}
`),
    ex("c2-ex-022", "qsort with structs", "Sorting records by a field, then by two fields.", "Arrays & Sorting", "qsort_structs",
        `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { char name[10]; int score; } Row;

int by_score(const void *a, const void *b) {
    const Row *x = a, *y = b;
    return y->score - x->score;                 // high first
}
int by_name(const void *a, const void *b) {
    const Row *x = a, *y = b;
    return strcmp(x->name, y->name);
}

int main(void) {
    Row rows[] = {{"ada", 92}, {"alan", 81}, {"grace", 96}};
    int n = 3;

    qsort(rows, n, sizeof *rows, by_score);
    for (int i = 0; i < n; i++) printf("%-6s %3d\\n", rows[i].name, rows[i].score);

    qsort(rows, n, sizeof *rows, by_name);
    printf("alpha: %s %s %s\\n", rows[0].name, rows[1].name, rows[2].name);
    return 0;
}
`),
    ex("c2-ex-023", "Binary search", "bsearch + a hand-rolled lower-bound walk.", "Arrays & Sorting", "binary_search",
        `#include <stdio.h>
#include <stdlib.h>

int cmp(const void *a, const void *b) {
    return *(const int *)a - *(const int *)b;
}

int lower_bound(const int *v, int n, int target) {
    int lo = 0, hi = n;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (v[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
}

int main(void) {
    int v[] = {2, 4, 6, 8, 10, 12};
    int key = 8, n = 6;

    int *hit = bsearch(&key, v, n, sizeof *v, cmp);
    printf("bsearch: %s\\n", hit ? "found" : "missing");

    printf("lower_bound(7) -> index %d (insert before %d)\\n",
           lower_bound(v, n, 7), v[lower_bound(v, n, 7)]);
    return 0;
}
`),
    ex("c2-ex-024", "2D arrays and flattening", "Row-major indexing passed as a flat pointer.", "Arrays & Sorting", "matrix_flat",
        `#include <stdio.h>

#define ROWS 3
#define COLS 4

int at(const int *m, int r, int c) { return m[r * COLS + c]; }

int main(void) {
    int m[ROWS][COLS];
    for (int r = 0; r < ROWS; r++)
        for (int c = 0; c < COLS; c++)
            m[r][c] = r * 10 + c;

    printf("m[1][2]=%d flat=%d\\n", m[1][2], at((int *)m, 1, 2));

    int sum = 0;
    for (int i = 0; i < ROWS * COLS; i++) sum += ((int *)m)[i];
    printf("sum=%d\\n", sum);
    return 0;
}
`),
    ex("c2-ex-025", "VLA-free matrix with malloc", "A heap 2D grid via an array of row pointers.", "Arrays & Sorting", "matrix_heap",
        `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int rows = 3, cols = 4;
    int **m = malloc(rows * sizeof *m);
    for (int r = 0; r < rows; r++) {
        m[r] = malloc(cols * sizeof **m);
        for (int c = 0; c < cols; c++) m[r][c] = (r + 1) * (c + 2);
    }

    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) printf("%3d", m[r][c]);
        printf("\\n");
    }

    for (int r = 0; r < rows; r++) free(m[r]);
    free(m);
    return 0;
}
`),
    ex("c2-ex-026", "Recursion", "Factorial + fibonacci + a recursive sum.", "Algorithms", "recursion",
        `#include <stdio.h>

long factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }
long fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }

long sum_digits(long n) {
    if (n == 0) return 0;
    return n % 10 + sum_digits(n / 10);
}

int main(void) {
    printf("10! = %ld\\n", factorial(10));
    printf("fib(20) = %ld\\n", fib(20));
    printf("digits of 98765 = %ld\\n", sum_digits(98765));
    return 0;
}
`),
    ex("c2-ex-027", "Bubble and insertion sort", "The two O(n^2) classics side by side.", "Algorithms", "simple_sorts",
        `#include <stdio.h>

void bubble(int *v, int n) {
    for (int pass = 0; pass < n - 1; pass++) {
        int swapped = 0;
        for (int i = 0; i < n - 1 - pass; i++)
            if (v[i] > v[i + 1]) {
                int t = v[i]; v[i] = v[i + 1]; v[i + 1] = t;
                swapped = 1;
            }
        if (!swapped) break;          // already sorted
    }
}

void insertion(int *v, int n) {
    for (int i = 1; i < n; i++) {
        int key = v[i], j = i - 1;
        while (j >= 0 && v[j] > key) { v[j + 1] = v[j]; j--; }
        v[j + 1] = key;
    }
}

int main(void) {
    int a[] = {5, 1, 4, 2, 8}, b[] = {5, 1, 4, 2, 8};
    bubble(a, 5); insertion(b, 5);
    for (int i = 0; i < 5; i++) printf("%d%c", a[i], i == 4 ? '\\n' : ' ');
    for (int i = 0; i < 5; i++) printf("%d%c", b[i], i == 4 ? '\\n' : ' ');
    return 0;
}
`),
    ex("c2-ex-028", "Linked list", "Push, iterate, free — the canonical struct exercise.", "Algorithms", "linked_list",
        `#include <stdio.h>
#include <stdlib.h>

typedef struct node { int value; struct node *next; } node;

node *push(node *head, int value) {
    node *n = malloc(sizeof *n);
    n->value = value;
    n->next = head;
    return n;
}

int main(void) {
    node *head = NULL;
    for (int i = 1; i <= 5; i++) head = push(head, i * 10);

    for (node *p = head; p; p = p->next)
        printf("node %d\\n", p->value);

    while (head) { node *t = head->next; free(head); head = t; }
    printf("list freed\\n");
    return 0;
}
`),
    ex("c2-ex-029", "Stack and queue", "An array stack with a top index; a ring-buffer queue.", "Algorithms", "stack_queue",
        `#include <stdio.h>
#define CAP 8

typedef struct { int data[CAP]; int top; } Stack;
typedef struct { int data[CAP]; int head, count; } Queue;

void push(Stack *s, int v) { s->data[s->top++] = v; }
int pop(Stack *s) { return s->data[--s->top]; }

void enqueue(Queue *q, int v) { q->data[(q->head + q->count++) % CAP] = v; }
int dequeue(Queue *q) { int v = q->data[q->head]; q->head = (q->head + 1) % CAP; q->count--; return v; }

int main(void) {
    Stack s = {.top = 0};
    for (int i = 1; i <= 4; i++) push(&s, i);
    printf("LIFO: %d %d\\n", pop(&s), pop(&s));

    Queue q = {.head = 0, .count = 0};
    for (int i = 1; i <= 4; i++) enqueue(&q, i);
    printf("FIFO: %d %d\\n", dequeue(&q), dequeue(&q));
    return 0;
}
`),
    ex("c2-ex-030", "Growable string builder", "append() with amortized doubling, then join.", "Algorithms", "string_builder",
        `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { char *buf; size_t len, cap; } SB;

void sb_append(SB *sb, const char *s) {
    size_t add = strlen(s);
    if (sb->len + add + 1 > sb->cap) {
        sb->cap = sb->cap ? sb->cap * 2 : 64;
        sb->buf = realloc(sb->buf, sb->cap);
    }
    memcpy(sb->buf + sb->len, s, add);
    sb->len += add;
    sb->buf[sb->len] = 0;
}

int main(void) {
    SB sb = {0};
    for (int i = 0; i < 5; i++) {
        char piece[8];
        snprintf(piece, sizeof piece, "[%d]", i);
        sb_append(&sb, piece);
    }
    printf("built: %s (len %zu cap %zu)\\n", sb.buf, sb.len, sb.cap);
    free(sb.buf);
    return 0;
}
`),
    ex("c2-ex-031", "Preprocessor basics", "#define, macros with args, #ifdef config.", "Building Blocks", "preprocessor",
        `#include <stdio.h>

#define MAX_ITEMS 4
#define SQUARE(x) ((x) * (x))
#define STR_HELPER(x) #x
#define STR(x) STR_HELPER(x)

int main(void) {
    printf("MAX_ITEMS = %s\\n", STR(MAX_ITEMS));
    printf("SQUARE(3+1) = %d (parenthesized macro)\\n", SQUARE(3 + 1));

#ifdef MAX_ITEMS
    int items[MAX_ITEMS] = {0};
    printf("array of %zu\\n", sizeof items / sizeof items[0]);
#endif
    return 0;
}
`),
    ex("c2-ex-032", "Header-style separation", "static functions, extern declarations, the ODR discipline.", "Building Blocks", "translation_units",
        `#include <stdio.h>

/* A header would declare: int visible(int); */
int visible(int x);

/* static = private to this translation unit. */
static int helper(int x) { return x * 3; }

int visible(int x) { return helper(x) + 1; }

int main(void) {
    printf("visible(4) = %d\\n", visible(4));
    printf("helper stays internal; extern is the public contract\\n");
    return 0;
}
`),
    ex("c2-ex-033", "Variadic functions", "va_list walking, a sum(int n, ...) helper.", "Building Blocks", "variadic",
        `#include <stdarg.h>
#include <stdio.h>

int sum(int n, ...) {
    va_list ap;
    va_start(ap, n);
    int total = 0;
    for (int i = 0; i < n; i++) total += va_arg(ap, int);
    va_end(ap);
    return total;
}

int main(void) {
    printf("sum(3, 1, 2, 3) = %d\\n", sum(3, 1, 2, 3));
    printf("sum(5, 10, 20, 30, 40, 50) = %d\\n", sum(5, 10, 20, 30, 40, 50));
    return 0;
}
`),
    ex("c2-ex-034", "enum and switch discipline", "Typed-ish constants with a default guard.", "Building Blocks", "enum_switch",
        `#include <stdio.h>

typedef enum { IDLE, RUNNING, BLOCKED, DONE } State;

const char *name(State s) {
    switch (s) {
        case IDLE:    return "idle";
        case RUNNING:  return "running";
        case BLOCKED:  return "blocked";
        case DONE:    default: return "done";
    }
}

int main(void) {
    State journey[] = {IDLE, RUNNING, BLOCKED, RUNNING, DONE};
    for (int i = 0; i < 5; i++)
        printf("%d -> %s\\n", i, name(journey[i]));
    return 0;
}
`),
    ex("c2-ex-035", "Time and clock", "time(), difftime(), clock() for CPU timing.", "System & Portability", "time_clock",
        `#include <stdio.h>
#include <time.h>

int main(void) {
    time_t now = time(NULL);
    printf("epoch seconds: %lld\\n", (long long)now);
    printf("utc string: %s", asctime(gmtime(&now)));

    struct tm parts = *localtime(&now);
    printf("local: %04d-%02d-%02d\\n", parts.tm_year + 1900, parts.tm_mon + 1, parts.tm_mday);

    clock_t c0 = clock();
    for (volatile int i = 0; i < 1000000; i++) { /* spin */ }
    printf("cpu used: %.3f s\\n", (double)(clock() - c0) / CLOCKS_PER_SEC);
    return 0;
}
`),
    ex("c2-ex-036", "argc and argv", "Argument validation + a tiny usage message.", "System & Portability", "argv_tour",
        `#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    if (argc < 3) {
        fprintf(stderr, "usage: %s <repeat> <word>\\n", argv[0]);
        return 1;
    }

    int repeat = atoi(argv[1]);
    for (int i = 0; i < repeat; i++)
        printf("arg %d: %s\\n", i, argv[2]);
    return 0;
}
`),
    ex("c2-ex-037", "Signals", "sigaction-lite: catching SIGINT with a handler flag.", "System & Portability", "signals",
        `#include <signal.h>
#include <stdio.h>
#include <stdlib.h>

static volatile sig_atomic_t stop = 0;

void on_int(int sig) {
    (void)sig;
    stop = 1;
}

int main(void) {
    signal(SIGINT, on_int);
    printf("loop is running (no interrupt here, so it just ends)\\n");

    // Simulate the flag flipping without an actual signal.
    for (int i = 0; i < 3 && !stop; i++) printf("tick %d\\n", i);
    printf("stopped=%d\\n", (int)stop);
    return 0;
}
`),
    ex("c2-ex-038", "atexit and cleanup", "Registered cleanup functions run in reverse order.", "System & Portability", "atexit",
        `#include <stdio.h>
#include <stdlib.h>

void cleanup_b(void) { printf("cleanup B (registered first, runs LAST)\\n"); }
void cleanup_a(void) { printf("cleanup A\\n"); }

int main(void) {
    atexit(cleanup_b);
    atexit(cleanup_a);

    printf("main body\\n");
    printf("returning now - watch the order:\\n");
    return 0;
}
`),
    ex("c2-ex-039", "A tiny test harness", "assert-driven checks over pure functions.", "Projects", "mini_test",
        `#include <assert.h>
#include <stdio.h>

int clamp(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }
int is_even(int v) { return v % 2 == 0; }

int main(void) {
    assert(clamp(5, 0, 10) == 5);
    assert(clamp(-3, 0, 10) == 0);
    assert(clamp(99, 0, 10) == 10);
    assert(is_even(0) && is_even(42));
    assert(!is_even(7));

    printf("all asserts passed\\n");

    #ifdef NDEBUG
    printf("(release build: asserts compiled out)\\n");
    #endif
    return 0;
}
`),
    ex("c2-ex-040", "A complete mini program", "Args + files + structs + sorting: a tiny gradebook tool.", "Projects", "gradebook",
        `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { char name[12]; int score; } Grade;
int by_score(const void *a, const void *b) {
    return ((const Grade *)b)->score - ((const Grade *)a)->score;
}

int main(int argc, char **argv) {
    const char *file = argc > 1 ? argv[1] : "praxis_grades.txt";

    FILE *f = fopen(file, "w");
    fputs("ada 92\\nalan 81\\ngrace 96\\nlinus 88\\n", f);
    fclose(f);

    f = fopen(file, "r");
    Grade g[8];
    int n = 0;
    while (n < 8 && fscanf(f, "%11s %d", g[n].name, &g[n].score) == 2) n++;
    fclose(f);

    qsort(g, n, sizeof *g, by_score);
    printf("%-8s %s\\n", "NAME", "SCORE");
    for (int i = 0; i < n; i++) printf("%-8s %5d\\n", g[i].name, g[i].score);

    int total = 0;
    for (int i = 0; i < n; i++) total += g[i].score;
    printf("average: %.1f\\n", n ? (double)total / n : 0.0);
    remove(file);
    return 0;
}
`),
];
