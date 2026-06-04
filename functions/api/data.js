// functions/api/data.js

const MOCK_CURRENT_DATA = [
  { "物料号码": "4713040087918609", "物料长描述": "有缝三通\\DN200×DN100 SCH10S/SCH10S ASME B16.9 WP304-WX", "数量": 10.5 },
  { "物料号码": "4709040087737910", "物料长描述": "有缝弯头\\45° DN300 SCH10S R=1.5D ASME B16.9 WP304-WX", "数量": 24 }
];

export async function onRequestGet(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json;charset=UTF-8"
  };

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

    if (!env.DB) {
      return new Response(JSON.stringify({
        success: true,
        source: "mock_data",
        data: MOCK_CURRENT_DATA
      }), { headers: corsHeaders });
    }

    let results = [];
    let tableUsed = userPriceTable;

    try {
      // 优先从计算完成的专属用户的 final_price_table_xxx 中查询
      const query = await env.DB.prepare(`SELECT * FROM ${userPriceTable} LIMIT 100`).all();
      results = query.results || [];
    } catch (dbErr) {
      // 如果计算表还未生成，退回到 tbl_sample 中过滤查询当前用户的原始记录
      try {
        const query = await env.DB.prepare("SELECT * FROM tbl_sample WHERE user_id = ? LIMIT 100").bind(userEmail).all();
        results = query.results || [];
        tableUsed = "tbl_sample";
      } catch (sampleErr) {
        results = [];
        tableUsed = "none";
      }
    }

    return new Response(JSON.stringify({
      success: true,
      source: "d1_database",
      table: tableUsed,
      data: results
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
