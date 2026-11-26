%% Erlang demo — a message-passing ping/pong pair.
%% Run with escript: escript PingPong.erl
-module(pingpong).

-export([main/1]).

main(_Args) ->
    io:format("Praxis Erlang demo~n"),
    Pong = spawn(fun pong_loop/0),
    Ping = spawn(fun () -> ping_loop(5, Pong) end),
    Ping ! start,
    timer:sleep(300),
    io:format("done~n").

ping_loop(0, _Pong) ->
    io:format("ping: finished~n");
ping_loop(N, Pong) ->
    Pong ! {ping, self()},
    receive
        pong -> io:format("ping ~p~n", [N])
    end,
    ping_loop(N - 1, Pong).

pong_loop() ->
    receive
        {ping, From} -> From ! pong
    end,
    pong_loop().
