# Statistical analysis — the R viewer test set.

SensorReadings <- data.frame(
  siteName = c("alpha", "beta", "gamma", "delta"),
  temperatureC = c(21.4, -3.8, 18.2, 33.1),
  passedQc = c(TRUE, FALSE, TRUE, TRUE)
)

summary(SensorReadings$temperatureC)

SensorReadings$deviationC <- SensorReadings$temperatureC - mean(SensorReadings$temperatureC)
print(SensorReadings[order(SensorReadings$deviationC), ])

hist(SensorReadings$temperatureC, breaks = 8, main = "Sensor temperatures", xlab = "Celsius")
