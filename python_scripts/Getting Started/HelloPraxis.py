"""Say hello — the traditional first script, camelCase edition."""
greeting = "Hello"
target = "Praxis"

print(f"{greeting}, {target}!")


def Shout(message: str) -> str:
  """Uppercase a message with an exclamation mark."""
  return f"{message.upper()}!"


for audienceName in ["reader", "writer", "runner"]:
  print(Shout(f"hi {audienceName}"))
