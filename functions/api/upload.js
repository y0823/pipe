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
    // 提取并清洗当前登录用户的邮箱
    const userEmail = request.headers.get("Cf-Access-Authenticated-User-Email") || "anonymous";
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
    
    // 过滤掉完全为空的空行，并整理数据
    const validRows = [];
    for (const row of dataRows) {
      if (!row || row.length < 2) continue;
      if (row.length === 2 && row[0] === "" && row[1] === "") continue;
      if (row.length >= 3 && row[0] === "" && row[1] === "" && row[2] === "") continue;
      
      const partNo = row[0] || ""; // 物料号码
      const desc = row[1] || "";   // 物料长描述
      const quantity = parseFloat(row[2]) || 0; // 数量
      
      validRows.push({ partNo, desc, quantity });
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
        message: `模拟导入成功！成功处理 ${validRows.length} 条记录（未绑定真实数据库）。`
      }), { headers: corsHeaders });
    }

    // --- 真实 D1 数据库操作流程 ---
    
    // 0. 安全补齐 test_sample 的 user_id 字段
    await env.DB.prepare("ALTER TABLE test_sample ADD COLUMN user_id TEXT DEFAULT 'anonymous'").run().catch(() => {});

    // 1. 清空当前登录用户的数据记录
    await env.DB.prepare("DELETE FROM test_sample WHERE user_id = ?").bind(userEmail).run();

    // 2. 准备批量写入语句 (D1 batch APIs)
    const statements = [];
    const insertStmt = env.DB.prepare(
      "INSERT INTO test_sample (物料号码, 物料长描述, 数量, user_id) VALUES (?, ?, ?, ?)"
    );

    for (const item of validRows) {
      statements.push(
        insertStmt.bind(item.partNo, item.desc, item.quantity, userEmail)
      );
    }

    // 3. 在单个事务中执行所有插入，极大缩短执行时间并保证数据完整性
    await env.DB.batch(statements);

    // 4. 数据导入完成后，直接在 D1 SQLite 中执行多表关联与聚合定价计算，更新专属用户的 final_price_table_xxx
    await env.DB.prepare(`DROP TABLE IF EXISTS ${userPriceTable}`).run();

    const createTableSql = `
      CREATE TABLE ${userPriceTable} AS
      SELECT 
          s.物料号码,
          s.物料长描述,
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
              FROM test_materialtype AS B_sub
              WHERE s.物料长描述 LIKE '%' || IFNULL(B_sub.材质, '') || '%'
              LIMIT 1
          ) AS 材质,
        
          (
              SELECT B_sub.系数
              FROM test_materialtype AS B_sub
              WHERE s.物料长描述 LIKE '%' || IFNULL(B_sub.材质, '') || '%'
              LIMIT 1
          ) AS 材质系数,

          IIF(
              INSTR(s.物料长描述, '弯头'),
              (
                  SELECT BR.系数
                  FROM test_R AS BR
                  WHERE s.物料长描述 LIKE '%' || BR.弯曲半径 || '%'
                  LIMIT 1
              ),
              1
          ) AS 弯曲半径系数,

          IIF(
              INSTR(s.物料长描述, '弯头'),
              (
                  SELECT JD.系数
                  FROM test_angle AS JD
                  WHERE s.物料长描述 LIKE '%' || JD.角度 || '%'
                  LIMIT 1
              ),
              1
          ) AS 角度系数,

          IFNULL(
              (
                  SELECT TS.系数
                  FROM test_others AS TS
                  WHERE s.物料长描述 LIKE '%' || TS.特殊管件 || '%'
                  LIMIT 1
              ),
              1
          ) AS 特殊管件系数,

          IFNULL(
              (
                  SELECT DX.系数
                  FROM test_zn AS DX
                  WHERE s.物料长描述 LIKE '%' || DX.镀锌 || '%'
                  LIMIT 1
              ),
              1
          ) AS 镀锌,

          IFNULL(
              (
                  SELECT DW.系数
                  FROM test_lowtmp AS DW
                  WHERE s.物料长描述 LIKE '%' || DW.温度 || '%'
                  LIMIT 1
              ),
              1
          ) AS 低温,

         IFNULL(
              (
                  SELECT TZ.系数
                  FROM test_DegreasingTreatment AS TZ
                  WHERE s.物料长描述 LIKE '%' || TZ.特征值 || '%'
                  LIMIT 1
              ),
              1
          ) AS 脱脂,

         IFNULL(
              (
                  SELECT KLQ.系数
                  FROM test_hic AS KLQ
                  WHERE s.物料长描述 LIKE '%' || KLQ.特征值 || '%'
                  LIMIT 1
              ),
              1
          ) AS 抗硫氢系数,

         IFNULL(
              (
                  SELECT PG.系数
                  FROM test_paohuang AS PG
                  WHERE s.物料长描述 LIKE '%' || PG.特征值 || '%'
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
                              INSTR(customText, '×'),
                              IIF(
                                  INSTR(SUBSTR(customText, INSTR(customText, '×') + 1), '×'),
                                  SUBSTR(SUBSTR(customText, INSTR(customText, '×') + 1), INSTR(SUBSTR(customText, INSTR(customText, '×') + 1), '×') + 1),
                                  SUBSTR(customText, INSTR(customText, '×') + 1)
                              ),
                              ''
                          ) AS finalXText
                      FROM (
                          SELECT 
                              test_sample_table.*,
                              REPLACE(test_sample_table.物料长描述, '×DN', '厚度') AS customText,
                              REPLACE(REPLACE(test_sample_table.物料长描述, '×DN', '厚度'), ' DN', 'DN') AS tempText
                          FROM test_sample test_sample_table
                          WHERE test_sample_table.user_id = ?
                      ) L1
                  ) L2
              ) L3
          ) L4
      ) s
      LEFT JOIN 
          test_prod_name p 
      ON 
          SUBSTR(s.物料号码, 1, 6) = p.代码;
    `;
    await env.DB.prepare(createTableSql).bind(userEmail).run();

    // 5. 在新生成的 final_price_table_xxx 表上添加 5 个后续定价运算字段
    await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 其他壁厚单价 REAL`).run();
    await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 匹配框架表壁厚 REAL`).run();
    await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 数字壁厚单价 REAL`).run();
    await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 换算后价格 REAL`).run();
    await env.DB.prepare(`ALTER TABLE ${userPriceTable} ADD COLUMN 最终核价 REAL`).run();

    // 6. 执行后续的 UPDATE 计算逻辑 (多表数据关联与数学换算)
    await env.DB.prepare(`
      UPDATE ${userPriceTable}
      SET 其他壁厚单价 = (
          SELECT b.单价
          FROM tbl_ss_smls a
          INNER JOIN tbl_ss_smls_price b ON a.序号 = b.序号
          WHERE
              COALESCE(a.名称, '') = COALESCE(${userPriceTable}.匹配名称, '') AND
              COALESCE(a.DN1, '')  = COALESCE(${userPriceTable}.DN1, '') AND
              COALESCE(a.DN2, '')  = COALESCE(${userPriceTable}.DN2, '') AND
              COALESCE(a.材质, '') = COALESCE(${userPriceTable}.材质, '') AND
              COALESCE(a.其他壁厚, '') = COALESCE(${userPriceTable}.其他壁厚, '')
          LIMIT 1
      )
    `).run();

    await env.DB.prepare(`
      UPDATE ${userPriceTable}
      SET 匹配框架表壁厚 = (
          SELECT a.壁厚
          FROM tbl_ss_smls a
          WHERE
              COALESCE(a.名称, '') = COALESCE(${userPriceTable}.匹配名称, '') AND
              COALESCE(a.DN1, '')  = COALESCE(${userPriceTable}.DN1, '') AND
              COALESCE(a.DN2, '')  = COALESCE(${userPriceTable}.DN2, '') AND
              COALESCE(a.材质, '') = COALESCE(${userPriceTable}.材质, '') AND
              a.壁厚 >= ${userPriceTable}.数字壁厚
          ORDER BY a.壁厚 ASC
          LIMIT 1
      )
    `).run();

    await env.DB.prepare(`
      UPDATE ${userPriceTable}
      SET 数字壁厚单价 = (
          SELECT bp.单价
          FROM tbl_ss_smls a
          INNER JOIN tbl_ss_smls_price bp ON a.序号 = bp.序号
          WHERE
              COALESCE(a.名称, '') = COALESCE(${userPriceTable}.匹配名称, '') AND
              COALESCE(a.DN1, '')  = COALESCE(${userPriceTable}.DN1, '') AND
              COALESCE(a.DN2, '')  = COALESCE(${userPriceTable}.DN2, '') AND
              COALESCE(a.材质, '') = COALESCE(${userPriceTable}.材质, '') AND
              a.壁厚 >= ${userPriceTable}.数字壁厚
          ORDER BY a.壁厚 ASC
          LIMIT 1
      )
    `).run();

    await env.DB.prepare(`
      UPDATE ${userPriceTable}
      SET 换算后价格 = ROUND((数字壁厚单价 / 匹配框架表壁厚) * 数字壁厚, 2)
      WHERE
          数字壁厚 IS NOT NULL
          AND 匹配框架表壁厚 IS NOT NULL
          AND 匹配框架表壁厚 != 0
    `).run();

    await env.DB.prepare(`
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
    `).run();

    return new Response(JSON.stringify({
      success: true,
      source: "d1_database",
      count: validRows.length,
      message: `成功清空您的历史样本，完成批量导入，并成功执行了专属核价流程 (${userPriceTable})！`
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
