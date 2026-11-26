# Pipeline.exs — runs through `elixir` (the runtime registry's Elixir entry).
# A pipe chain + a do…end block: the exact constructs the Elixir re-indenter
# follows (right-click ▸ Auto-format).
readings = [12.5, 8.0, 20.3, 15.0, 9.8]

summary =
  readings
  |> Enum.map(&Float.round(&1, 1))
  |> Enum.sort()
  |> then(fn sorted ->
    %{
      count: length(sorted),
      total: Enum.sum(sorted),
      spread: List.last(sorted) - hd(sorted)
    }
  end)

IO.puts("Hello from Elixir — #{inspect(summary)}")
