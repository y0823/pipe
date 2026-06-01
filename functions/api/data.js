// functions/api/data.js

const MOCK_CURRENT_DATA = [
  { "物料号码": "4713040087918609", "物料长描述": "有缝三通\\DN200×DN100 SCH10S/SCH10S ASME B16.9 WP304-WX", "数量": 10.5 },
  { "物料号码": "4709040087737910", "物料长描述": "有缝弯头\\45° DN300 SCH10S R=1.5D ASME B16.9 WP304-WX", "数量": 24 }
];

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
      return new Response(JSON.stringify({
        success: true,
        source: "mock_data",
        data: MOCK_CURRENT_DATA
      }), { headers: corsHeaders });
    }

    let results = [];
    let tableUsed = "test_sample";

    try {
      // 优先从计算完成的 final_price_table 中查询
      const query = await env.DB.prepare("SELECT * FROM final_price_table LIMIT 100").all();
      results = query.results || [];
      tableUsed = "final_price_table";
    } catch (dbErr) {
      // 如果计算表还未生成或报错，退回到 test_sample
      const query = await env.DB.prepare("SELECT * FROM test_sample LIMIT 100").all();
      results = query.results || [];
      tableUsed = "test_sample";
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
