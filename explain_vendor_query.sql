EXPLAIN QUERY PLAN
SELECT a.序号, a.名称, a.DN1, a.DN2, a.壁厚, a.材质, a.其他壁厚, b.厂商, b.包段, b.单价 
FROM product_attributes a 
INNER JOIN product_prices b ON a.序号 = b.序号
WHERE a.名称 = '无缝三通'
AND a.DN1 = '40'
AND a.DN2 = '15'
AND a.材质 = '20#8163'
AND b.厂商 = '河北省盐山县电力管件有限公司';
