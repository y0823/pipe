#!/bin/bash
DB=".wrangler/state/v3/d1/miniflare-D1DatabaseObject/a7a5ace5f96faa2410d2159f829a056ad8508e285e6582ee0491f1450d6b01d0.sqlite"
OUT="sync_to_d1.sql"

echo "PRAGMA foreign_keys=OFF;" > $OUT

TABLES=(
  "product_attributes"
  "product_prices"
  "tbl_DegreasingTreatment"
  "tbl_R"
  "tbl_angle"
  "tbl_hic"
  "tbl_lowtmp"
  "tbl_materialtype"
  "tbl_others"
  "tbl_paohuang"
  "tbl_prod_name"
  "tbl_special"
  "tbl_vendors"
  "tbl_zn"
)

for TBL in "${TABLES[@]}"; do
  echo "DROP TABLE IF EXISTS \"$TBL\";" >> $OUT
  sqlite3 $DB ".dump \"$TBL\"" | grep -v "PRAGMA foreign_keys=OFF;" | grep -v "BEGIN TRANSACTION;" | grep -v "COMMIT;" >> $OUT
done

# 追加优化后的索引定义
cat restore_indexes.sql >> $OUT
echo "ANALYZE;" >> $OUT
echo "Prepared $OUT for D1 sync, including optimized indexes and query planner stats."
