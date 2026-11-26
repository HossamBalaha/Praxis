# tags: interactive, getting-started
"""Quiz Game — live input() against the Output panel's stdin box.

Answers typed into the input strip while the script waits; wrong
answers get a hint. Three questions, then the scorecard.
"""
score = 0

questions = [
  ("Which planet is called the Red Planet?", "mars", "It is fourth from the sun."),
  ("What is 7 * 6?", "42", "The answer to life, the universe and everything."),
  ("Which language does Praxis run?", "python", "Hint: it is not a snake bite."),
]

for i, (question, answer, hint) in enumerate(questions, 1):
  print(f"Q{i}: {question}")
  for attempt in range(2):
    reply = input("> ").strip().lower()
    if reply == answer:
      print("correct!")
      score += 1
      break
    print("not quite —", hint)
print(f"\nscore: {score}/{len(questions)}")
