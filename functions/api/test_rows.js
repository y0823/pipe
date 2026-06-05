// functions/api/test_rows.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const userEmail = "test_user";
  const userPriceTable = `final_price_table_${userEmail}`;
  
  const csvText = await request.text();
  // Simple parse for 15 lines of demo data (assuming format is known and we just want to run the SQL)
  // For exactness, we just use the known 15 lines
  const validRows = [
    { partNo: '4713040087918609', desc: '有缝三通\\DN200×DN100 SCH10S/SCH10S ASME B16.9 WP304-WX ASTM A403', quantity: 1 },
    { partNo: '4713040087908287', desc: '有缝三通\\DN200×DN150 SCH10S/SCH10S ASME B16.9 WP304-WX ASTM A403', quantity: 1 },
    { partNo: '4707180087854439', desc: '有缝同心大小头\\DN200×DN100 SCH10S/SCH10S ASME B16.9 WP304-WX ASTM A403', quantity: 1 },
    { partNo: '4707180087923644', desc: '有缝同心大小头\\DN200×DN150 SCH10S/SCH10S ASME B16.9 WP304-WX ASTM A403', quantity: 1 },
    { partNo: '4709040087737910', desc: '有缝弯头\\45° DN300 SCH10S R=1.5D ASME B16.9 WP304-WX ASTM A403 -101℃ I mpactT est', quantity: 1 },
    { partNo: '4709040093644041', desc: '有缝弯头\\45° DN300 SCH40S R=1.5D ASME B16.9 WP316/316L-WX ASTM A403 -10 1℃ Im pact Test', quantity: 1 },
    { partNo: '4709040092817576', desc: '有缝弯头\\90° DN1000×8.74 R=1.5D ASME B16.9 304-WX ASTM A403', quantity: 1 },
    { partNo: '4709040092933747', desc: '有缝弯头\\90° DN1200×8.74 R=1.5D ASME B16.9 WP304 ASTM A403', quantity: 1 },
    { partNo: '4709040087741007', desc: '有缝弯头\\90° DN200 SCH10S R=1.5D ASME B16.9 304-WX ASTM A403', quantity: 1 },
    { partNo: '4709040087736974', desc: '有缝弯头\\90° DN250 SCH10S R=1.5D ASME B16.9 304-WX ASTM A403', quantity: 1 },
    { partNo: '4709040087738021', desc: '有缝弯头\\90° DN300 SCH10S R=1.5D ASME B16.9 WP304-WX ASTM A403 -101℃ I mpactT est', quantity: 1 },
    { partNo: '4709040087739163', desc: '有缝弯头\\90° DN350 SCH10S R=1.5D ASME B16.9 WP304-WX ASTM A403', quantity: 1 },
    { partNo: '4709040087954137', desc: '有缝弯头\\90° DN400 SCH10S R=1.5D ASME B16.9 304-WX ASTM A403', quantity: 1 },
    { partNo: '4709040087741031', desc: '有缝弯头\\90° DN600 SCH10S R=1.5D ASME B16.9 WP304-WX ASTM A403', quantity: 1 },
    { partNo: '4709040087981224', desc: '有缝弯头\\90° DN800 SCH10 R=1.5D ASME B16.9 304-WX ASTM A403', quantity: 1 }
  ];

  let total_read = 0;
  let total_written = 0;

  const add = (meta) => {
    if (meta) {
      total_read += (meta.rows_read || 0);
      total_written += (meta.rows_written || 0);
    }
  };

  await env.DB.prepare("ALTER TABLE tbl_sample ADD COLUMN user_id TEXT DEFAULT 'anonymous'").run().catch(() => {});
  const r1 = await env.DB.prepare("DELETE FROM tbl_sample WHERE user_id = ?").bind(userEmail).run();
  add(r1.meta);

  const statements = [];
  const insertStmt = env.DB.prepare("INSERT INTO tbl_sample (物料号码, 物料长描述, 数量, user_id) VALUES (?, ?, ?, ?)");
  for (const item of validRows) {
    statements.push(insertStmt.bind(item.partNo, item.desc, item.quantity, userEmail));
  }
  const r2 = await env.DB.batch(statements);
  r2.forEach(r => add(r.meta));

  const r3 = await env.DB.prepare(`DROP TABLE IF EXISTS ${userPriceTable}`).run();
  add(r3.meta);

  const createTableSql = `
      CREATE TABLE ${userPriceTable} AS
      SELECT 
          s.物料号码,
          s.物料长描述,
          p.物资名称 AS 匹配名称,
          IIF(INSTR(s.物料长描述, 'DN'), CAST(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 2) AS NUMERIC) , NULL) AS DN1,
          IIF(INSTR(s.物料长描述, 'DN'), IIF(INSTR(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 1), 'DN'), CAST(SUBSTR(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 1), INSTR(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 1), 'DN') + 2) AS NUMERIC) || '', '空'), NULL) AS DN2,
          s.壁厚,
          s.其他壁厚,
          s.数字壁厚,
          (SELECT B_sub.基础材质 FROM tbl_materialtype AS B_sub WHERE s.物料长描述 LIKE '%' || IFNULL(B_sub.材质, '') || '%' ORDER BY LENGTH(B_sub.材质) DESC LIMIT 1) AS 材质,
          (SELECT B_sub.系数 FROM tbl_materialtype AS B_sub WHERE s.物料长描述 LIKE '%' || IFNULL(B_sub.材质, '') || '%' ORDER BY LENGTH(B_sub.材质) DESC LIMIT 1) AS 材质系数,
          IIF(INSTR(s.物料长描述, '弯头'), (SELECT BR.系数 FROM tbl_R AS BR WHERE s.物料长描述 LIKE '%' || BR.弯曲半径 || '%' ORDER BY LENGTH(BR.弯曲半径) DESC LIMIT 1), 1) AS 弯曲半径系数,
          IIF(INSTR(s.物料长描述, '弯头'), (SELECT BA.系数 FROM tbl_angle AS BA WHERE s.物料长描述 LIKE '%' || BA.角度 || '%' ORDER BY LENGTH(BA.角度) DESC LIMIT 1), 1) AS 角度系数,
          IFNULL((SELECT BO.系数 FROM tbl_others AS BO WHERE s.物料长描述 LIKE '%' || BO.特殊管件 || '%' ORDER BY LENGTH(BO.特殊管件) DESC LIMIT 1), 1) AS 特殊管件系数,
          IFNULL((SELECT BZ.系数 FROM tbl_zn AS BZ WHERE s.物料长描述 LIKE '%' || BZ.镀锌 || '%' ORDER BY LENGTH(BZ.镀锌) DESC LIMIT 1), 1) AS 镀锌,
          IFNULL((SELECT BL.系数 FROM tbl_lowtmp AS BL WHERE s.物料长描述 LIKE '%' || BL.温度 || '%' ORDER BY LENGTH(BL.温度) DESC LIMIT 1), 1) AS 低温,
         IFNULL((SELECT BD.系数 FROM tbl_DegreasingTreatment AS BD WHERE s.物料长描述 LIKE '%' || BD.特征值 || '%' ORDER BY LENGTH(BD.特征值) DESC LIMIT 1), 1) AS 脱脂,
         IFNULL((SELECT BH.系数 FROM tbl_hic AS BH WHERE s.物料长描述 LIKE '%' || BH.特征值 || '%' ORDER BY LENGTH(BH.特征值) DESC LIMIT 1), 1) AS 抗硫氢系数,
         IFNULL((SELECT BP.系数 FROM tbl_paohuang AS BP WHERE s.物料长描述 LIKE '%' || BP.特征值 || '%' ORDER BY LENGTH(BP.特征值) DESC LIMIT 1), 1) AS 抛光
      FROM (
          SELECT L4.*, IIF(INSTR(L4.壁厚, 'S'), L4.壁厚, NULL) AS 其他壁厚, IIF(INSTR(L4.壁厚, 'S') = 0 AND L4.壁厚 != '', ROUND(CAST(L4.壁厚 AS NUMERIC), 2), NULL) AS 数字壁厚
          FROM (SELECT L3.*, IFNULL(IIF(INSTR(extractedText, '/'), SUBSTR(extractedText, 1, INSTR(extractedText, '/') - 1), extractedText), '') AS 壁厚
              FROM (SELECT L2.*, IIF(INSTR(customText, '×'), IIF(INSTR(LTRIM(finalXText), ' '), SUBSTR(LTRIM(finalXText), 1, INSTR(LTRIM(finalXText), ' ') - 1), LTRIM(finalXText)), IIF(INSTR(tempText, ' ') > 0 AND INSTR(SUBSTR(tempText, INSTR(tempText, ' ') + 1), ' ') > 0, SUBSTR(SUBSTR(tempText, INSTR(tempText, ' ') + 1), 1, INSTR(SUBSTR(tempText, INSTR(tempText, ' ') + 1), ' ') - 1), '')) AS extractedText
                  FROM (SELECT L1.*, IIF(INSTR(customText, '×'), IIF(INSTR(SUBSTR(customText, INSTR(customText, '×') + 1), '×'), SUBSTR(SUBSTR(customText, INSTR(customText, '×') + 1), INSTR(SUBSTR(customText, INSTR(customText, '×') + 1), '×') + 1), SUBSTR(customText, INSTR(customText, '×') + 1)), '') AS finalXText
                      FROM (SELECT tbl_sample_table.*, REPLACE(tbl_sample_table.物料长描述, '×DN', '厚度') AS customText, REPLACE(REPLACE(tbl_sample_table.物料长描述, '×DN', '厚度'), ' DN', 'DN') AS tempText
                          FROM tbl_sample tbl_sample_table WHERE tbl_sample_table.user_id = 'test_user'
                      ) L1
                  ) L2
              ) L3
          ) L4
      ) s
      LEFT JOIN tbl_prod_name p ON SUBSTR(s.物料号码, 1, 6) = p.代码;
  `;
  const r4 = await env.DB.prepare(createTableSql).run();
  add(r4.meta);

  const alt1 = await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 其他壁厚单价 REAL`).run(); add(alt1.meta);
  const alt2 = await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 匹配框架表壁厚 REAL`).run(); add(alt2.meta);
  const alt3 = await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 数字壁厚单价 REAL`).run(); add(alt3.meta);
  const alt4 = await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 换算后价格 REAL`).run(); add(alt4.meta);
  const alt5 = await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 最终核价 REAL`).run(); add(alt5.meta);

  const u1 = await env.DB.prepare(`UPDATE ${userPriceTable} SET 其他壁厚单价 = (SELECT b.单价 FROM product_attributes a INNER JOIN product_prices b ON a.序号 = b.序号 WHERE a.名称 = ${userPriceTable}.匹配名称 AND a.DN1 = ${userPriceTable}.DN1 AND a.DN2 = ${userPriceTable}.DN2 AND a.材质 = ${userPriceTable}.材质 AND a.其他壁厚 IS ${userPriceTable}.其他壁厚 LIMIT 1)`).run(); add(u1.meta);
  const u2 = await env.DB.prepare(`UPDATE ${userPriceTable} SET 匹配框架表壁厚 = (SELECT a.壁厚 FROM product_attributes a WHERE a.名称 = ${userPriceTable}.匹配名称 AND a.DN1 = ${userPriceTable}.DN1 AND a.DN2 = ${userPriceTable}.DN2 AND a.材质 = ${userPriceTable}.材质 AND a.壁厚 >= ${userPriceTable}.数字壁厚 ORDER BY a.壁厚 ASC LIMIT 1)`).run(); add(u2.meta);
  const u3 = await env.DB.prepare(`UPDATE ${userPriceTable} SET 数字壁厚单价 = (SELECT bp.单价 FROM product_attributes a INNER JOIN product_prices bp ON a.序号 = bp.序号 WHERE a.名称 = ${userPriceTable}.匹配名称 AND a.DN1 = ${userPriceTable}.DN1 AND a.DN2 = ${userPriceTable}.DN2 AND a.材质 = ${userPriceTable}.材质 AND a.壁厚 >= ${userPriceTable}.数字壁厚 ORDER BY a.壁厚 ASC LIMIT 1)`).run(); add(u3.meta);
  const u4 = await env.DB.prepare(`UPDATE ${userPriceTable} SET 换算后价格 = ROUND((数字壁厚单价 / 匹配框架表壁厚) * 数字壁厚, 2) WHERE 数字壁厚 IS NOT NULL AND 匹配框架表壁厚 IS NOT NULL AND 匹配框架表壁厚 != 0`).run(); add(u4.meta);
  const u5 = await env.DB.prepare(`UPDATE ${userPriceTable} SET 最终核价 = ROUND(CASE WHEN 其他壁厚单价 IS NULL THEN 换算后价格 WHEN 换算后价格 IS NULL THEN 其他壁厚单价 ELSE IIF(其他壁厚单价 < 换算后价格, 其他壁厚单价, 换算后价格) END * COALESCE(材质系数, 1) * 弯曲半径系数 * 角度系数 * 特殊管件系数 * 镀锌 * 低温 * 脱脂 * 抗硫氢系数 * 抛光, 2)`).run(); add(u5.meta);

  return new Response(JSON.stringify({
    success: true,
    total_read,
    total_written
  }), { headers: { "Content-Type": "application/json" }});
}
