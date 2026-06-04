// functions/api/cleanup.js

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
    // 1. 获取并清洗当前登录用户的邮箱
    const userEmail = request.headers.get("cf-access-authenticated-user-email") || 
                      request.headers.get("Cf-Access-Authenticated-User-Email");
    
    // 如果无法直接获取，则尝试从 Cookie 中解析 JWT
    let email = userEmail;
    if (!email) {
      const cookieHeader = request.headers.get("Cookie") || "";
      const accessCookie = cookieHeader.split(";").find(c => c.trim().startsWith("CF_Authorization="));
      if (accessCookie) {
        try {
          const token = accessCookie.split("=")[1];
          const payloadBase64 = token.split(".")[1];
          const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(payloadJson);
          email = payload.email;
        } catch (err) {
          console.error("清理接口解析 JWT 失败:", err);
        }
      }
    }

    // 如果连 Cookie 都没有，说明本来就没有登录，直接返回成功即可
    if (!email) {
      return new Response(JSON.stringify({
        success: true,
        message: "无需清理（无用户登录信息）"
      }), { headers: corsHeaders });
    }

    const cleanUser = email.replace(/[^a-zA-Z0-9]/g, "_");
    const userPriceTable = `final_price_table_${cleanUser}`;

    if (!env.DB) {
      return new Response(JSON.stringify({
        success: true,
        source: "mock_data",
        message: "本地模拟环境清理成功"
      }), { headers: corsHeaders });
    }

    // 2. 擦除 tbl_sample 表中该用户的所有导入样本
    await env.DB.prepare("DELETE FROM tbl_sample WHERE user_id = ?").bind(email).run();

    // 3. 彻底删除（DROP）该用户专属的临时核价结果计算表
    await env.DB.prepare(`DROP TABLE IF EXISTS ${userPriceTable}`).run();

    return new Response(JSON.stringify({
      success: true,
      message: `已成功安全清空您在数据库中的历史上传样本及计算表 (${userPriceTable})！`
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
