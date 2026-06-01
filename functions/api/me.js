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

  // 从 Header 获取 Cloudflare Access 验证的用户邮箱 (兼容 HTTP/2)
  const email = request.headers.get("cf-access-authenticated-user-email") || 
                request.headers.get("Cf-Access-Authenticated-User-Email") || 
                "未登录 (本地开发)";
  
  return new Response(JSON.stringify({ email }), {
    headers: corsHeaders
  });
}
