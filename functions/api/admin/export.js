// functions/api/admin/export.js
export async function onRequestGet(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json;charset=UTF-8"
  };

  try {
    const url = new URL(request.url);
    const table = url.searchParams.get("table");

    if (!table) {
      throw new Error("Missing table parameter");
    }

    if (!env.DB) {
      throw new Error("数据库未绑定 (env.DB is undefined)");
    }

    // 防止注入，简单校验表名只能包含字母数字下划线
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      throw new Error("Invalid table name");
    }

    // 执行查询获取全表数据
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();

    return new Response(JSON.stringify({
      success: true,
      data: results || []
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
