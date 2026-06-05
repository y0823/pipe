CREATE INDEX IF NOT EXISTS idx_price_vendor ON product_prices("厂商");
CREATE INDEX IF NOT EXISTS idx_attr_search_opt ON product_attributes("名称", "DN1", "材质" COLLATE NOCASE, "其他壁厚" COLLATE NOCASE, "DN2");
CREATE INDEX IF NOT EXISTS idx_attr_search_opt_thick ON product_attributes("名称", "DN1", "材质" COLLATE NOCASE, "壁厚", "DN2");
CREATE INDEX IF NOT EXISTS idx_attr_search_nocase ON product_attributes("名称", "DN1", "DN2", "材质" COLLATE NOCASE, "其他壁厚" COLLATE NOCASE);

