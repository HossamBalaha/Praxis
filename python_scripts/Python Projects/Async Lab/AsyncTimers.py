# tags: async, getting-started
"""Async Timers — sleep races, gather and cancellation.

Fire timers with different durations at the same time; they finish in
DURATION order, not creation order. The last one is cancelled midway
so the CancelledError path prints too.
"""
import asyncio


async def timer(name: str, seconds: float) -> None:
  try:
    print(f"{name} armed for {seconds:.2f}s")
    await asyncio.sleep(seconds)
    print(f"{name} fired after {seconds:.2f}s")
  except asyncio.CancelledError:
    print(f"{name} cancelled mid-flight")
    raise


async def main() -> None:
  tasks = [
    asyncio.create_task(timer("alpha", 0.9)),
    asyncio.create_task(timer("bravo", 0.3)),
    asyncio.create_task(timer("charlie", 0.6)),
    asyncio.create_task(timer("delta", 5.0)),
  ]
  await asyncio.sleep(1.0)
  tasks[3].cancel()
  results = await asyncio.gather(*tasks, return_exceptions=True)
  print("done:", ["fired" if r is None else getattr(r, "__name__", str(r)) for r in results])


if __name__ == "__main__":
  asyncio.run(main())
