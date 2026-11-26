// Greet.dart — runs through `dart run` (the runtime registry's Dart entry).
// A tiny class + a loop: file-kind detection, Prism highlighting and
// the brace re-indenter all exercise through this file.
void main(List<String> args) {
  final name = args.isNotEmpty ? args.first : 'Praxis';
  final counter = Counter(name);
  for (var i = 1; i <= 3; i++) {
    counter.tick();
  }
  print('Hello from Dart — ${counter.describe()}');
}

class Counter {
  final String label;
  int _ticks = 0;

  Counter(this.label);

  void tick() {
    _ticks += 1;
  }

  String describe() => '$label ticked $_ticks time${_ticks == 1 ? '' : 's'}';
}
