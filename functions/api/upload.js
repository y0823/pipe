// functions/api/upload.js

// 统一的 CSV 状态机解析函数，处理包含逗号和双引号的字段
function parseCSV(csvText) {
  const lines = [];
  let currentLine = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++; // 跳过下一个转义的双引号
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++; // 处理 \r\n
        }
        currentLine.push(currentVal.trim());
        lines.push(currentLine);
        currentLine = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  
  if (currentLine.length > 0 || currentVal !== '') {
    currentLine.push(currentVal.trim());
    lines.push(currentLine);
  }

  return lines;
}

// 辅助函数：解析 SQL 执行计划以检测索引和全表扫描
function parseQueryPlan(planRows) {
  const indexes = [];
  const scans = [];
  let usesPrimaryKey = false;

  for (const row of planRows) {
    const detail = row.detail || row.Detail || "";
    
    // 匹配 "USING INDEX idx_name" 或 "USING COVERING INDEX idx_name"
    const indexMatch = detail.match(/USING (?:COVERING )?INDEX (\w+)/);
    if (indexMatch) {
      indexes.push(indexMatch[1]);
    }
    
    if (detail.includes("USING INTEGER PRIMARY KEY")) {
      usesPrimaryKey = true;
    }
    
    // 匹配 "SCAN TABLE table_name"
    const scanMatch = detail.match(/SCAN TABLE (\w+)/);
    if (scanMatch) {
      scans.push(scanMatch[1]);
    }
  }

  const uniqueIndexes = [...new Set(indexes)];
  if (usesPrimaryKey) {
    uniqueIndexes.push("PRIMARY KEY (rowid)");
  }
  const uniqueScans = [...new Set(scans)];

  return {
    indexes: uniqueIndexes,
    scans: uniqueScans,
    hasIndex: uniqueIndexes.length > 0,
    summary: uniqueIndexes.length > 0 
      ? `触发了索引: ${uniqueIndexes.join(", ")}` 
      : "未触发索引（执行了全表扫描）"
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json;charset=UTF-8"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 提取当前登录用户的邮箱 (双保险：优先读 Request Header，其次解析 Cookie 中的 JWT token)
    let userEmail = request.headers.get("cf-access-authenticated-user-email") || 
                    request.headers.get("Cf-Access-Authenticated-User-Email");

    if (!userEmail) {
      const cookieHeader = request.headers.get("Cookie") || "";
      const accessCookie = cookieHeader.split(";").find(c => c.trim().startsWith("CF_Authorization="));
      if (accessCookie) {
        try {
          const token = accessCookie.split("=")[1];
          const payloadBase64 = token.split(".")[1];
          const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(payloadJson);
          userEmail = payload.email;
        } catch (err) {
          console.error("解析 JWT Cookie 失败:", err);
        }
      }
    }
    userEmail = userEmail || "anonymous";
    const cleanUser = userEmail.replace(/[^a-zA-Z0-9]/g, "_");
    const userPriceTable = `final_price_table_${cleanUser}`;

    // 读取前端发送过来的 CSV 文本
    const csvText = await request.text();
    if (!csvText || csvText.trim() === "") {
      throw new Error("上传的文件内容为空。");
    }

    // 解析 CSV 为二维数组
    const parsedData = parseCSV(csvText);
    
    // 如果解析出来的行数少于 2 行（包含 1 行标题），则说明无数据
    if (parsedData.length <= 1) {
      throw new Error("CSV 文件除了标题行外不包含任何数据，或者格式不正确。");
    }

    // 排除首行（标题行），提取有效数据行
    const dataRows = parsedData.slice(1);
    
    // 增加厂商和包段查询
    // 过滤掉完全为空的空行，并整理数据
    const validRows = [];
    for (const row of dataRows) {
      if (!row || row.length < 2) continue;
      if (row.length === 2 && row[0] === "" && row[1] === "") continue;
      if (row.length >= 3 && row[0] === "" && row[1] === "" && row[2] === "") continue;
      
      const partNo = row[0] || ""; // 物料号码
      const desc = row[1] || "";   // 物料长描述
      const quantity = parseFloat(row[2]) || 0; // 数量
      const baoduan = row[3] || ""; // 包段
      const changshang = row[4] || ""; // 厂商
      
      validRows.push({ partNo, desc, quantity, baoduan, changshang });
    }

    if (validRows.length === 0) {
      throw new Error("未解析到任何有效的物料数据行。");
    }

    // 检查 D1 数据库是否绑定
    if (!env.DB) {
      console.warn("⚠️ 数据库未绑定 (env.DB is undefined)。本地开发将模拟写入成功。");
      return new Response(JSON.stringify({
        success: true,
        source: "mock_data",
        count: validRows.length,
        message: `模拟导入成功！成功处理 ${validRows.length} 条记录（未绑定真实数据库）。`,
        diagnostics: {
          rows_read: 0,
          rows_written: 0,
          duration_ms: 0,
          indexes_triggered: [],
          scans: [],
          has_index: false,
          summary: "未触发索引（本地模拟数据）",
          query_plan: ["本地模拟数据，未触发真实 D1 数据库"]
        }
      }), { headers: corsHeaders });
    }

    // --- 真实 D1 数据库操作流程 ---
    let totalRowsRead = 0;
    let totalRowsWritten = 0;
    let totalDuration = 0;

    const trackMetrics = (result) => {
      if (result && result.meta) {
        totalRowsRead += result.meta.rows_read || 0;
        totalRowsWritten += result.meta.rows_written || 0;
        totalDuration += result.meta.duration || 0;
      }
      return result;
    };
    
    // 增加厂商和包段查询
    // 0. 安全补齐 tbl_sample 的 user_id / 包段 / 厂商 字段
    const resAlterSample = await env.DB.prepare("ALTER TABLE tbl_sample ADD COLUMN user_id TEXT DEFAULT 'anonymous'").run().catch(() => {});
    if (resAlterSample) trackMetrics(resAlterSample);
    await env.DB.prepare("ALTER TABLE tbl_sample ADD COLUMN 包段 TEXT").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE tbl_sample ADD COLUMN 厂商 TEXT").run().catch(() => {});

    // 1. 清空当前登录用户的数据记录
    const resDelete = await env.DB.prepare("DELETE FROM tbl_sample WHERE user_id = ?").bind(userEmail).run();
    trackMetrics(resDelete);

    // 2. 准备批量写入语句 (D1 batch APIs)
    const statements = [];
    const insertStmt = env.DB.prepare(
      "INSERT INTO tbl_sample (物料号码, 物料长描述, 数量, 包段, 厂商, user_id) VALUES (?, ?, ?, ?, ?, ?)"
    );

    for (const item of validRows) {
      statements.push(
        insertStmt.bind(item.partNo, item.desc, item.quantity, item.baoduan, item.changshang, userEmail)
      );
    }

    // 3. 在单个事务中执行所有插入，极大缩短执行时间并保证数据完整性
    const batchRes = await env.DB.batch(statements);
    if (Array.isArray(batchRes)) {
      for (const r of batchRes) {
        trackMetrics(r);
      }
    }

    // 4. 数据导入完成后，直接在 D1 SQLite 中执行多表关联与聚合定价计算，更新专属用户的 final_price_table_xxx
    const resDrop = await env.DB.prepare(`DROP TABLE IF EXISTS ${userPriceTable}`).run();
    trackMetrics(resDrop);

    // 增加厂商和包段查询
    const createTableSql = `
      CREATE TABLE ${userPriceTable} AS
      SELECT 
          s.物料号码,
          s.物料长描述,
          s.包段,
          s.厂商,
          p.物资名称 AS 匹配名称,
        
          IIF(
              INSTR(s.物料长描述, 'DN'),
              CAST(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 2) AS NUMERIC) ,
              NULL
          ) AS DN1,

          IIF(
              INSTR(s.物料长描述, 'DN'),
              IIF(
                  INSTR(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 1), 'DN'),
                  CAST(SUBSTR(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 1), INSTR(SUBSTR(s.物料长描述, INSTR(s.物料长描述, 'DN') + 1), 'DN') + 2) AS NUMERIC) || '',
                  '空'
              ),
              NULL
          ) AS DN2,

          s.壁厚,
          s.其他壁厚,
          s.数字壁厚,

          (
              SELECT B_sub.基础材质
              FROM tbl_materialtype AS B_sub
              WHERE s.物料长描述 LIKE '%' || IFNULL(B_sub.材质, '') || '%'
              ORDER BY LENGTH(B_sub.材质) DESC
              LIMIT 1
          ) AS 材质,
        
          (
              SELECT B_sub.系数
              FROM tbl_materialtype AS B_sub
              WHERE s.物料长描述 LIKE '%' || IFNULL(B_sub.材质, '') || '%'
              ORDER BY LENGTH(B_sub.材质) DESC
              LIMIT 1
          ) AS 材质系数,

          IIF(
              INSTR(s.物料长描述, '弯头'),
              (
                  SELECT BR.系数
                  FROM tbl_R AS BR
                  WHERE s.物料长描述 LIKE '%' || BR.弯曲半径 || '%'
                  ORDER BY LENGTH(BR.弯曲半径) DESC
                  LIMIT 1
              ),
              1
          ) AS 弯曲半径系数,

          IIF(
              INSTR(s.物料长描述, '弯头'),
              (
                  SELECT BA.系数
                  FROM tbl_angle AS BA
                  WHERE s.物料长描述 LIKE '%' || BA.角度 || '%'
                  ORDER BY LENGTH(BA.角度) DESC
                  LIMIT 1
              ),
              1
          ) AS 角度系数,

          IFNULL(
              (
                  SELECT BO.系数
                  FROM tbl_others AS BO
                  WHERE s.物料长描述 LIKE '%' || BO.特殊管件 || '%'
                  ORDER BY LENGTH(BO.特殊管件) DESC
                  LIMIT 1
              ),
              1
          ) AS 特殊管件系数,

          IFNULL(
              (
                  SELECT BZ.系数
                  FROM tbl_zn AS BZ
                  WHERE s.物料长描述 LIKE '%' || BZ.镀锌 || '%'
                  ORDER BY LENGTH(BZ.镀锌) DESC
                  LIMIT 1
              ),
              1
          ) AS 镀锌,

          IFNULL(
              (
                  SELECT BL.系数
                  FROM tbl_lowtmp AS BL
                  WHERE s.物料长描述 LIKE '%' || BL.温度 || '%'
                  ORDER BY LENGTH(BL.温度) DESC
                  LIMIT 1
              ),
              1
          ) AS 低温,

         IFNULL(
              (
                  SELECT BD.系数
                  FROM tbl_DegreasingTreatment AS BD
                  WHERE s.物料长描述 LIKE '%' || BD.特征值 || '%'
                  ORDER BY LENGTH(BD.特征值) DESC
                  LIMIT 1
              ),
              1
          ) AS 脱脂,

         IFNULL(
              (
                  SELECT BH.系数
                  FROM tbl_hic AS BH
                  WHERE s.物料长描述 LIKE '%' || BH.特征值 || '%'
                  ORDER BY LENGTH(BH.特征值) DESC
                  LIMIT 1
              ),
              1
          ) AS 抗硫氢系数,

         IFNULL(
              (
                  SELECT BP.系数
                  FROM tbl_paohuang AS BP
                  WHERE s.物料长描述 LIKE '%' || BP.特征值 || '%'
                  ORDER BY LENGTH(BP.特征值) DESC
                  LIMIT 1
              ),
              1
          ) AS 抛光

      FROM (
          SELECT 
              L4.*,
              IIF(
                  INSTR(L4.壁厚, 'S'),
                  L4.壁厚,
                  NULL
              ) AS 其他壁厚,

              IIF(
                  INSTR(L4.壁厚, 'S') = 0 AND L4.壁厚 != '',
                  ROUND(CAST(L4.壁厚 AS NUMERIC), 2),
                  NULL
              ) AS 数字壁厚
          FROM (
              SELECT 
                  L3.*,
                  IFNULL(
                      IIF(
                          INSTR(extractedText, '/'), 
                          SUBSTR(extractedText, 1, INSTR(extractedText, '/') - 1), 
                          extractedText
                      ), 
                      ''
                  ) AS 壁厚
              FROM (
                  SELECT 
                      L2.*,
                      IIF(
                          INSTR(customText, '×'), 
                          IIF(
                              INSTR(LTRIM(finalXText), ' '),
                              SUBSTR(LTRIM(finalXText), 1, INSTR(LTRIM(finalXText), ' ') - 1),
                              LTRIM(finalXText)
                          ),
                          IIF(
                              INSTR(tempText, ' ') > 0 AND INSTR(SUBSTR(tempText, INSTR(tempText, ' ') + 1), ' ') > 0,
                              SUBSTR(SUBSTR(tempText, INSTR(tempText, ' ') + 1), 1, INSTR(SUBSTR(tempText, INSTR(tempText, ' ') + 1), ' ') - 1),
                              ''
                          )
                      ) AS extractedText
                  FROM (
                      SELECT 
                          L1.*,
                          IIF(
                              COALESCE(INSTR(customText, '×'), 0),
                              IIF(
                                  COALESCE(INSTR(SUBSTR(customText, INSTR(customText, '×') + 1), '×'), 0),
                                  SUBSTR(SUBSTR(customText, INSTR(customText, '×') + 1), INSTR(SUBSTR(customText, INSTR(customText, '×') + 1), '×') + 1),
                                  SUBSTR(customText, INSTR(customText, '×') + 1)
                              ),
                              ''
                          ) AS finalXText
                      FROM (
                          SELECT 
                              tbl_sample_table.*,
                              REPLACE(tbl_sample_table.物料长描述, '×DN', '厚度') AS customText,
                              REPLACE(REPLACE(tbl_sample_table.物料长描述, '×DN', '厚度'), ' DN', 'DN') AS tempText
                          FROM tbl_sample tbl_sample_table
                          WHERE tbl_sample_table.user_id = ?
                      ) L1
                  ) L2
              ) L3
          ) L4
      ) s
      LEFT JOIN 
          tbl_prod_name p 
      ON 
          SUBSTR(s.物料号码, 1, 6) = p.代码;
    `;

    // 运行 EXPLAIN QUERY PLAN 对合并计算的主要 SQL 进行诊断
    const allPlans = [];
    const runExplain = async (sql, params = []) => {
      try {
        const explainResult = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...params).all();
        if (explainResult && explainResult.results) {
          allPlans.push(...explainResult.results);
        }
      } catch (err) {
        console.error("EXPLAIN failed:", err);
      }
    };

    // 1) 诊断 CREATE TABLE 部分
    const selectSqlOnly = createTableSql.replace(`CREATE TABLE ${userPriceTable} AS`, "");
    await runExplain(selectSqlOnly, [userEmail]);

    // 执行创建临时价格表
    const resCreate = await env.DB.prepare(createTableSql).bind(userEmail).run();
    trackMetrics(resCreate);

    // 5. 在新生成的 final_price_table_xxx 表上添加 5 个后续定价运算字段
    trackMetrics(await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 其他壁厚单价 REAL`).run());
    trackMetrics(await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 匹配框架表壁厚 REAL`).run());
    trackMetrics(await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 数字壁厚单价 REAL`).run());
    trackMetrics(await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 换算后价格 REAL`).run());
    trackMetrics(await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 最终核价 REAL`).run());

    // 6. 执行后续的 UPDATE 计算逻辑 (多表数据关联与数学换算，已剔除 COALESCE 函数以启用数据库 B-Tree 索引)
    // 增加厂商和包段查询
    const update1 = `
      UPDATE ${userPriceTable}
      SET 其他壁厚单价 = (
          SELECT b.单价
          FROM product_attributes a
          INNER JOIN product_prices b ON a.序号 = b.序号
          WHERE
              a.名称 = ${userPriceTable}.匹配名称 AND
              a.DN1 = ${userPriceTable}.DN1 AND
              a.DN2 = ${userPriceTable}.DN2 AND
              a.材质 = ${userPriceTable}.材质 COLLATE NOCASE AND
              a.其他壁厚 IS ${userPriceTable}.其他壁厚 COLLATE NOCASE AND
              b.厂商 = ${userPriceTable}.厂商 AND
              b.包段 = ${userPriceTable}.包段
          LIMIT 1
      )
    `;

    const update2 = `
      UPDATE ${userPriceTable}
      SET 匹配框架表壁厚 = (
          SELECT a.壁厚
          FROM product_attributes a
          WHERE
              a.名称 = ${userPriceTable}.匹配名称 AND
              a.DN1 = ${userPriceTable}.DN1 AND
              a.DN2 = ${userPriceTable}.DN2 AND
              a.材质 = ${userPriceTable}.材质 COLLATE NOCASE AND
              a.壁厚 >= ${userPriceTable}.数字壁厚
          ORDER BY a.壁厚 ASC
          LIMIT 1
      )
    `;

    // 增加厂商和包段查询
    const update3 = `
      UPDATE ${userPriceTable}
      SET 数字壁厚单价 = (
          SELECT bp.单价
          FROM product_attributes a
          INNER JOIN product_prices bp ON a.序号 = bp.序号
          WHERE
              a.名称 = ${userPriceTable}.匹配名称 AND
              a.DN1 = ${userPriceTable}.DN1 AND
              a.DN2 = ${userPriceTable}.DN2 AND
              a.材质 = ${userPriceTable}.材质 COLLATE NOCASE AND
              a.壁厚 >= ${userPriceTable}.数字壁厚 AND
              bp.厂商 = ${userPriceTable}.厂商 AND
              bp.包段 = ${userPriceTable}.包段
          ORDER BY a.壁厚 ASC
          LIMIT 1
      )
    `;

    const update4 = `
      UPDATE ${userPriceTable}
      SET 换算后价格 = ROUND((数字壁厚单价 / 匹配框架表壁厚) * 数字壁厚, 2)
      WHERE
          数字壁厚 IS NOT NULL
          AND 匹配框架表壁厚 IS NOT NULL
          AND 匹配框架表壁厚 != 0
    `;

    const update5 = `
      UPDATE ${userPriceTable}
      SET 最终核价 = ROUND(
          CASE 
              WHEN 其他壁厚单价 IS NULL THEN 换算后价格
              WHEN 换算后价格 IS NULL THEN 其他壁厚单价
              ELSE IIF(其他壁厚单价 < 换算后价格, 其他壁厚单价, 换算后价格)
          END 
          * COALESCE(材质系数, 1) 
          * 弯曲半径系数 
          * 角度系数 
          * 特殊管件系数 
          * 镀锌 
          * 低温 
          * 脱脂 
          * 抗硫氢系数 
          * 抛光, 
          2
      )
    `;

    // 诊断关联更新 SQL
    await runExplain(update1);
    await runExplain(update2);
    await runExplain(update3);

    // 顺序执行后续的所有 UPDATE
    trackMetrics(await env.DB.prepare(update1).run());
    trackMetrics(await env.DB.prepare(update2).run());
    trackMetrics(await env.DB.prepare(update3).run());
    trackMetrics(await env.DB.prepare(update4).run());
    trackMetrics(await env.DB.prepare(update5).run());

    // 解析执行计划
    const planInfo = parseQueryPlan(allPlans);

    return new Response(JSON.stringify({
      success: true,
      source: "d1_database",
      count: validRows.length,
      message: `成功清空您的历史样本，完成批量导入，并成功执行了专属核价流程 (${userPriceTable})！`,
      diagnostics: {
        rows_read: totalRowsRead,
        rows_written: totalRowsWritten,
        duration_ms: totalDuration,
        indexes_triggered: planInfo.indexes,
        scans: planInfo.scans,
        has_index: planInfo.hasIndex,
        summary: planInfo.summary,
        query_plan: allPlans.map(row => row.detail || "")
      }
    }), { headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
