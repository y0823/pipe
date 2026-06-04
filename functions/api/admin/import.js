// functions/api/admin/import.js
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
    if (!env.DB) {
      throw new Error("数据库未绑定 (env.DB is undefined)");
    }

    const payload = await request.json();
    const { table, mode, data } = payload;

    if (!table || !mode || !data || !Array.isArray(data)) {
      throw new Error("参数错误：需要 table, mode, data(数组) 字段");
    }

    // 防止注入，简单校验表名只能包含字母数字下划线
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      throw new Error("Invalid table name");
    }

    if (data.length === 0) {
      throw new Error("导入的数据为空");
    }

    const statements = [];

    // 覆盖模式：先删除全表数据
    if (mode === 'overwrite') {
      statements.push(env.DB.prepare(`DELETE FROM ${table}`));
    } else if (mode !== 'append') {
      throw new Error("未知的导入模式：" + mode);
    }

    // 提取字段列表
    // 为了防止有的行缺少字段，收集所有出现的字段作为 columns
    const columnsSet = new Set();
    for (const row of data) {
      Object.keys(row).forEach(k => columnsSet.add(k));
    }
    const columns = Array.from(columnsSet);
    
    if (columns.length === 0) {
      throw new Error("未能解析出有效的列字段");
    }

    const placeholders = columns.map(() => '?').join(', ');
    const insertStmt = env.DB.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);

    for (const row of data) {
      const values = columns.map(col => {
        const val = row[col];
        // 处理 undefined / null 为 SQLite NULL
        return val === undefined || val === null ? null : val;
      });
      statements.push(insertStmt.bind(...values));
    }

    // 批量执行
    await env.DB.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      message: `成功导入 ${data.length} 条数据（模式：${mode === 'overwrite' ? '覆盖' : '追加'}）`
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
