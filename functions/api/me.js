// functions/api/me.js

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json;charset=UTF-8"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 从 Header 获取 Cloudflare Access 验证的用户邮箱 (双保险：Header + JWT cookie)
  let email = request.headers.get("cf-access-authenticated-user-email") || 
              request.headers.get("Cf-Access-Authenticated-User-Email");

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
        console.error("解析 JWT Cookie 失败:", err);
      }
    }
  }
  email = email || "未登录 (本地开发)";
  
  return new Response(JSON.stringify({ email }), {
    headers: corsHeaders
  });
}
