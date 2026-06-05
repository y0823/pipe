PRAGMA foreign_keys=off;
BEGIN TRANSACTION;

CREATE TABLE product_prices_new (
    "序号" INTEGER NOT NULL,
    "厂商" TEXT NOT NULL,
    "单价" REAL NOT NULL, 
    "包段" TEXT NOT NULL DEFAULT '',
    PRIMARY KEY ("序号", "厂商", "包段"),
    FOREIGN KEY ("序号") REFERENCES "product_attributes"("序号") ON DELETE CASCADE
);

INSERT INTO product_prices_new ("序号", "厂商", "单价", "包段")
SELECT "序号", "厂商", "单价", COALESCE("包段", '') FROM product_prices;

DROP TABLE product_prices;

ALTER TABLE product_prices_new RENAME TO product_prices;

CREATE INDEX idx_price_vendor_baoduan ON product_prices("厂商", "包段", "序号", "单价");

COMMIT;
PRAGMA foreign_keys=on;
