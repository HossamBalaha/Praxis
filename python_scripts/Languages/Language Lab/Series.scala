// Series.scala — runs through `scala` (the runtime registry's Scala entry).
// A case class + pattern matching over a fold: the registry's compile-then-run
// path (the first run takes a moment while scala compiles the script).
case class Reading(sensor: String, value: Double)

object Series {
  def summary(readings: List[Reading]): String = {
    val total = readings.map(_.value).sum
    val mean = total / readings.size
    val spread = readings.map(_.value).max - readings.map(_.value).min
    f"n=${readings.size}%d total=$total%.2f mean=$mean%.2f spread=$spread%.2f"
  }

  def main(args: Array[String]): Unit = {
    val readings = List(
      Reading("alpha", 12.5),
      Reading("beta", 8.0),
      Reading("gamma", 20.3)
    )
    println(s"Hello from Scala — ${summary(readings)}")
  }
}
