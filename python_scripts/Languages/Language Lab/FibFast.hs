-- Fibonacci fast-doubling — the Haskell way (runghc runs it directly).
module Main where

main :: IO ()
main = do
  putStrLn "Praxis Haskell demo"
  print (map fib [0 .. 15])
  -- Streams: the infinite Fibonacci list, taken lazily.
  print (take 10 fibs)

fib :: Int -> Int
fib n = fst (fibPair n)

fibPair :: Int -> (Int, Int)
fibPair 0 = (0, 1)
fibPair n =
  let (a, b) = fibPair (n `div` 2)
      c = a * (2 * b - a)
      d = a * a + b * b
   in if even n
        then (c, d)
        else (d, c + d)

fibs :: [Int]
fibs = 0 : 1 : zipWith (+) fibs (tail fibs)
