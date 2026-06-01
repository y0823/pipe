// functions/api/products.js

// 模拟测试数据 - 管道配件数据降级展示，模拟联接后的双表数据
const MOCK_PIPEFITTINGS_JOINED = [
  { "序号": 1001, "名称": "有缝弯头\\90° R=1.5D", "DN1": 300, "DN2": "空", "壁厚": 3.96, "其他壁厚": "SCH5S", "材质": "304", "厂商": "东台有缝不锈", "单价": 1289.34 },
  { "序号": 1001, "名称": "有缝弯头\\90° R=1.5D", "DN1": 300, "DN2": "空", "壁厚": 3.96, "其他壁厚": "SCH5S", "材质": "304", "厂商": "实华有缝不锈", "单价": 1110.77 },
  { "序号": 1001, "名称": "有缝弯头\\90° R=1.5D", "DN1": 300, "DN2": "空", "壁厚": 3.96, "其他壁厚": "SCH5S", "材质": "304", "厂商": "沧海有缝不锈", "单价": 1289.34 },
  { "序号": 1002, "名称": "有缝三通", "DN1": 200, "DN2": "100", "壁厚": 6.02, "其他壁厚": "SCH40S", "材质": "304", "厂商": "东台有缝不锈", "单价": 850.50 },
  { "序号": 1002, "名称": "有缝三通", "DN1": 200, "DN2": "100", "壁厚": 6.02, "其他壁厚": "SCH40S", "材质": "304", "厂商": "方泉有缝不锈", "单价": 890.00 },
  { "序号": 1003, "名称": "有缝同心大小头", "DN1": 200, "DN2": "150", "壁厚": null, "其他壁厚": "SCH10S", "材质": "316", "厂商": "恒通有缝不锈", "单价": 480.00 }
];

export async function onRequest(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json;charset=UTF-8"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name") || "";
    const dn1 = url.searchParams.get("dn1") || "";
    const dn2 = url.searchParams.get("dn2") || "";
    const thickness = url.searchParams.get("thickness") || "";
    const otherThickness = url.searchParams.get("otherThickness") || "";
    const material = url.searchParams.get("material") || "";
    const vendor = url.searchParams.get("vendor") || "";
    const minPrice = parseFloat(url.searchParams.get("minPrice")) || null;
    const maxPrice = parseFloat(url.searchParams.get("maxPrice")) || null;

    // 将所有请求参数整合，方便多级筛面（Faceted Search）条件筛选
    const activeFilters = {
      name,
      dn1,
      dn2,
      thickness,
      otherThickness,
      material,
      vendor,
      minPrice,
      maxPrice
    };

    // 检查 D1 数据库是否成功绑定
    if (!env.DB) {
      console.warn("⚠️ Cloudflare D1 数据库未绑定。将返回本地模拟测试数据。");
      
      // 模拟多级级联筛选逻辑
      const getMockFiltered = (excludeKey) => {
        let list = [...MOCK_PIPEFITTINGS_JOINED];
        if (excludeKey !== "name" && name) list = list.filter(p => p["名称"] === name);
        if (excludeKey !== "dn1" && dn1) list = list.filter(p => String(p["DN1"]) === dn1);
        if (excludeKey !== "dn2" && dn2) list = list.filter(p => String(p["DN2"]) === dn2);
        if (excludeKey !== "thickness" && thickness) list = list.filter(p => p["壁厚"] !== null && String(p["壁厚"]) === thickness);
        if (excludeKey !== "otherThickness" && otherThickness) list = list.filter(p => p["其他壁厚"] !== null && p["其他壁厚"] === otherThickness);
        if (excludeKey !== "material" && material) list = list.filter(p => p["材质"] === material);
        if (excludeKey !== "vendor" && vendor) list = list.filter(p => p["厂商"] === vendor);
        if (excludeKey !== "price") {
          if (minPrice !== null) list = list.filter(p => p["单价"] >= minPrice);
          if (maxPrice !== null) list = list.filter(p => p["单价"] <= maxPrice);
        }
        return list;
      };

      const names = [...new Set(getMockFiltered("name").map(p => p["名称"]))];
      const materials = [...new Set(getMockFiltered("material").map(p => p["材质"]))];
      const vendors = [...new Set(getMockFiltered("vendor").map(p => p["厂商"]))];
      const dn1List = [...new Set(getMockFiltered("dn1").map(p => String(p["DN1"])))].filter(x => x && x !== "null" && x !== "空");
      const dn2List = [...new Set(getMockFiltered("dn2").map(p => String(p["DN2"])))].filter(x => x && x !== "null" && x !== "空");
      const otherThicknessList = [...new Set(getMockFiltered("otherThickness").map(p => String(p["其他壁厚"])))].filter(x => x && x !== "null" && x !== "空");

      // 主数据采用全条件过滤
      let finalFiltered = [...MOCK_PIPEFITTINGS_JOINED];
      if (name) finalFiltered = finalFiltered.filter(p => p["名称"] === name);
      if (dn1) finalFiltered = finalFiltered.filter(p => String(p["DN1"]) === dn1);
      if (dn2) finalFiltered = finalFiltered.filter(p => String(p["DN2"]) === dn2);
      if (thickness) finalFiltered = finalFiltered.filter(p => p["壁厚"] !== null && String(p["壁厚"]) === thickness);
      if (otherThickness) finalFiltered = finalFiltered.filter(p => p["其他壁厚"] !== null && p["其他壁厚"] === otherThickness);
      if (material) finalFiltered = finalFiltered.filter(p => p["材质"] === material);
      if (vendor) finalFiltered = finalFiltered.filter(p => p["厂商"] === vendor);
      if (minPrice !== null) finalFiltered = finalFiltered.filter(p => p["单价"] >= minPrice);
      if (maxPrice !== null) finalFiltered = finalFiltered.filter(p => p["单价"] <= maxPrice);

      return new Response(JSON.stringify({
        success: true,
        source: "mock_data",
        data: finalFiltered,
        names,
        materials,
        vendors,
        dn1List,
        dn2List,
        otherThicknessList
      }), { headers: corsHeaders });
    }

    // --- 真实 D1 数据库级联查询逻辑 ---

    // 辅助函数：构建排除某一字段自身筛选条件后的 SQL WHERE 条件，实现刻面搜索
    const buildFacetedConditions = (excludeKey) => {
      let sqlConditions = " WHERE 1=1";
      const sqlParams = [];

      if (excludeKey !== "name" && name) {
        sqlConditions += " AND a.名称 = ?";
        sqlParams.push(name);
      }
      if (excludeKey !== "dn1" && dn1) {
        sqlConditions += " AND a.DN1 = ?";
        sqlParams.push(parseFloat(dn1) || dn1);
      }
      if (excludeKey !== "dn2" && dn2) {
        sqlConditions += " AND a.DN2 = ?";
        sqlParams.push(parseFloat(dn2) || dn2);
      }
      if (excludeKey !== "thickness" && thickness) {
        sqlConditions += " AND a.壁厚 = ?";
        sqlParams.push(parseFloat(thickness) || thickness);
      }
      if (excludeKey !== "otherThickness" && otherThickness) {
        sqlConditions += " AND a.其他壁厚 = ?";
        sqlParams.push(otherThickness);
      }
      if (excludeKey !== "material" && material) {
        sqlConditions += " AND a.材质 = ?";
        sqlParams.push(material);
      }
      if (excludeKey !== "vendor" && vendor) {
        sqlConditions += " AND b.厂商 = ?";
        sqlParams.push(vendor);
      }
      // 价格区间筛选
      if (minPrice !== null) {
        sqlConditions += " AND b.单价 >= ?";
        sqlParams.push(minPrice);
      }
      if (maxPrice !== null) {
        sqlConditions += " AND b.单价 <= ?";
        sqlParams.push(maxPrice);
      }

      return { sqlConditions, sqlParams };
    };

    // 1. 获取主列表查询条件（应用所有过滤器）
    const mainQuery = buildFacetedConditions(null);
    const sqlMain = `
      SELECT a.序号, a.名称, a.DN1, a.DN2, a.壁厚, a.材质, a.其他壁厚, b.厂商, b.单价 
      FROM tbl_ss_smls a 
      INNER JOIN tbl_ss_smls_price b ON a.序号 = b.序号
      ${mainQuery.sqlConditions}
      ORDER BY a.序号 ASC, b.单价 ASC LIMIT 200
    `;

    // 2. 为各个下拉菜单分别执行“排除自身条件”后的独特值查询，完成层层联动过滤
    const runDistinctQuery = async (columnName, excludeKey, orderSql = "") => {
      const condition = buildFacetedConditions(excludeKey);
      const sql = `
        SELECT DISTINCT ${columnName} 
        FROM tbl_ss_smls a 
        INNER JOIN tbl_ss_smls_price b ON a.序号 = b.序号 
        ${condition.sqlConditions} 
        AND ${columnName} IS NOT NULL AND ${columnName} != '空' AND ${columnName} != '' 
        ${orderSql}
      `;
      
      const { results } = await env.DB.prepare(sql).bind(...condition.sqlParams).all();
      return results.map(row => String(row[columnName.replace("a.", "").replace("b.", "")]));
    };

    // 并行运行所有数据库查询，确保高性能
    const [
      mainResults,
      names,
      materials,
      vendors,
      dn1List,
      dn2List,
      otherThicknessList
    ] = await Promise.all([
      env.DB.prepare(sqlMain).bind(...mainQuery.sqlParams).all(),
      runDistinctQuery("a.名称", "name"),
      runDistinctQuery("a.材质", "material"),
      runDistinctQuery("b.厂商", "vendor", "ORDER BY b.厂商 ASC"),
      runDistinctQuery("a.DN1", "dn1", "ORDER BY CAST(a.DN1 AS REAL) ASC"),
      runDistinctQuery("a.DN2", "dn2", "ORDER BY CAST(a.DN2 AS REAL) ASC"),
      runDistinctQuery("a.其他壁厚", "otherThickness", "ORDER BY a.其他壁厚 ASC")
    ]);

    return new Response(JSON.stringify({
      success: true,
      source: "d1_database",
      data: mainResults.results,
      names,
      materials,
      vendors,
      dn1List,
      dn2List,
      otherThicknessList
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
