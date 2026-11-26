# tags: async, intermediate
"""Async Pipeline — producers, a bounded queue, and a consumer pool.

A classic asyncio shape: several producers push readings into a queue
with backpressure (maxsize), a pool of consumers drains it, and the
final report prints totals. Watch the interleaved output ordering —
completion order, not submission order.
"""
import asyncio
import random

PRODUCERS = 4
CONSUMERS = 3
ITEMS_PER_PRODUCER = 8
QUEUE_SIZE = 5


async def producer(pid: int, queue: asyncio.Queue) -> None:
  for i in range(ITEMS_PER_PRODUCER):
    value = random.uniform(-5, 45)
    await queue.put((pid, i, value))
    print(f"P{pid} -> item {i:02d} ({value:+.1f} C)")
    await asyncio.sleep(random.uniform(0.02, 0.12))


async def consumer(cid: int, queue: asyncio.Queue, sink: list) -> None:
  handled = 0
  while True:
    item = await queue.get()
    if item is None:
      queue.task_done()
      break
    pid, i, value = item
    sink.append(value)
    handled += 1
    print(f"   C{cid} <- P{pid}/{i:02d} -> {value * 9 / 5 + 32:+.1f} F")
    await asyncio.sleep(random.uniform(0.03, 0.15))
    queue.task_done()
  print(f"consumer C{cid} handled {handled} items")


async def main() -> None:
  queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
  sink: list = []
  consumers = [asyncio.create_task(consumer(c, queue, sink)) for c in range(CONSUMERS)]
  await asyncio.gather(*(producer(p, queue) for p in range(PRODUCERS)))
  for _ in consumers:
    await queue.put(None)
  await asyncio.gather(*consumers)
  if sink:
    print(f"\nreport: {len(sink)} items · mean {sum(sink) / len(sink):.2f} C "
          f"· min {min(sink):.2f} · max {max(sink):.2f}")


if __name__ == "__main__":
  asyncio.run(main())
