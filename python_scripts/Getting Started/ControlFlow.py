"""Branching and looping: if/elif/else, for, while and match."""
# tags: basics, control-flow

gradeScores = [92, 78, 65, 54, 88, 40, 73]

for studentScore in gradeScores:
  if studentScore >= 90:
    letterGrade = "A"
  elif studentScore >= 80:
    letterGrade = "B"
  elif studentScore >= 70:
    letterGrade = "C"
  elif studentScore >= 60:
    letterGrade = "D"
  else:
    letterGrade = "F"
  print(f"score {studentScore:>3} -> {letterGrade}")

countdownValue = 3
while countdownValue > 0:
  print("T-minus", countdownValue)
  countdownValue -= 1
print("lift-off!")

for commandName, exitCode in [("build", 0), ("test", 1), ("deploy", 0)]:
  match exitCode:
    case 0:
      print(f"{commandName}: ok")
    case 1:
      print(f"{commandName}: failed")
    case _:
      print(f"{commandName}: unknown")
