// Hello.zig — runs through `zig run` (the runtime registry's Zig entry).
// Try args: `first second`.
const std = @import("std");

fn fibonacci(n: u32) u64 {
    if (n <= 1) return n;
    var a: u64 = 0;
    var b: u64 = 1;
    var i: u32 = 0;
    while (i < n) : (i += 1) {
        const next = a + b;
        a = b;
        b = next;
    }
    return a;
}

pub fn main() !void {
    const args = try std.process.argsAlloc(std.heap.page_allocator);
    defer std.heap.page_allocator.free(args);
    const n: u32 = if (args.len > 1) std.fmt.parseInt(u32, args[1], 10) catch 10 else 10;
    std.debug.print("Hello from Zig — fibonacci({d}) = {d}\n", .{ n, fibonacci(n) });
}
