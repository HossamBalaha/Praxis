// F# demo — a tiny statistics script (dotnet fsi Stats.fsx).
let readings = [| 21.4; -3.8; 18.2; 33.1; 12.9 |]

let mean xs =
    Array.sum xs / float (Array.length xs)

let stdDev xs =
    let m = mean xs
    xs
    |> Array.map (fun x -> (x - m) ** 2.0)
    |> Array.average
    |> sqrt

printfn "Praxis F# demo"
printfn "count: %d" readings.Length
printfn "mean : %.2f" (mean readings)
printfn "sdev : %.2f" (stdDev readings)
