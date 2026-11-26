;; Clojure demo — pure data transforms over a map pipeline.
;; Run with babashka: bb Pipeline.clj
(def readings
  [{:sensor "north" :value 18.2}
   {:sensor "south" :value 21.7}
   {:sensor "north" :value 19.4}])

(defn average [xs]
  (if (empty? xs)
    nil
    (/ (reduce + xs) (count xs))))

(defn summarize [rows]
  (into {}
        (map (fn [[sensor group]]
               [sensor {:count (count group)
                         :average (average (map :value group))}]))
        (group-by :sensor rows)))

(println "readings:" (count readings))
(doseq [[sensor stats] (summarize readings)]
  (println sensor "=>" stats))
