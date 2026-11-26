-- Inventory analytics — the SQL viewer test set.

CREATE TABLE InventoryItems
(
    itemId     INTEGER PRIMARY KEY,
    itemName   TEXT    NOT NULL,
    unitPrice  REAL    NOT NULL,
    stockUnits INTEGER NOT NULL DEFAULT 0
);

-- Top revenue potential per item.
WITH RevenuePotential AS (SELECT itemName,
                                 unitPrice * stockUnits AS potentialValue,
                                 RANK()                    OVER (ORDER BY unitPrice * stockUnits DESC) AS revenueRank
                          FROM InventoryItems
                          WHERE stockUnits > 0)
SELECT itemName, ROUND(potentialValue, 2) AS potentialValue, revenueRank
FROM RevenuePotential
WHERE revenueRank <= 10
ORDER BY revenueRank;

-- Join items with their suppliers.
SELECT i.itemName,
       s.supplierName,
       i.stockUnits
FROM InventoryItems AS i
         JOIN Suppliers AS s ON s.supplierId = i.supplierId
WHERE i.stockUnits < 20
ORDER BY i.stockUnits ASC;
