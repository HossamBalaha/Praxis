(* OCaml demo — the sieve of Eratosthenes, functional style. *)

let sieve limit =
  let rec go candidates acc =
    match candidates with
    | [] -> List.rev acc
    | p :: rest when p * p > limit -> List.rev_append acc (p :: rest)
    | p :: rest -> p :: go (List.filter (fun x -> x mod p <> 0) rest) (p :: acc)
  in
  go (List.init (limit - 1) (fun i -> i + 2)) []

let () =
  print_endline "Praxis OCaml demo";
  List.iter print_int (sieve 50);
  print_newline ();
  Printf.printf "primes below 50: %d\n" (List.length (sieve 50))
