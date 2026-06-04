// functions/api/admin/tables.js
export async function onRequestGet(context) {
  const { env } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json;charset=UTF-8"
  };

  try {
    if (!env.DB) {
      throw new Error("数据库未绑定 (env.DB is undefined)");
    }

    // 查询所有表
    const { results: tablesData } = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'final_price_table_%' AND name != 'test_sample'"
    ).all();

    const tables = [];
    for (const t of tablesData) {
      const tableName = t.name;
      // 使用 pragma_table_info 获取列信息
      const { results: columnsData } = await env.DB.prepare(`SELECT name FROM pragma_table_info('${tableName}')`).all();
      const columns = columnsData.map(col => col.name);
      tables.push({
        name: tableName,
        columns: columns
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: tables
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
