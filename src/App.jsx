import React, { useState, useEffect, useRef } from 'react'

// 原生、鲁棒的客户端 CSV 每一行解析逻辑
function parseCSVLine(text) {
  let p = '', c = '', r = [];
  let q = false;
  for (let i = 0; i < text.length; i++) {
    c = text[i];
    if (c === '"') {
      if (q && text[i+1] === '"') { p += '"'; i++; } // 转义的双引号
      else { q = !q; } // 开关引号状态
    } else if (c === ',') {
      if (q) { p += c; } // 引号内的逗号
      else { r.push(p); p = ''; }
    } else if (c === '\r' || c === '\n') {
      if (q) { p += c; }
    } else {
      p += c;
    }
  }
  r.push(p);
  return r;
}

const TABLE_NAME_MAP = {
  'tbl_prod_name': '产品名称配置表',
  'tbl_materialtype': '材质匹配系数表',
  'tbl_special': '特殊管件系数表',
  'tbl_R': '弯曲半径系数表',
  'tbl_angle': '角度系数表',
  'tbl_others': '其他管件系数表',
  'tbl_lowtmp': '低温管件系数表',
  'tbl_zn': '镀锌管件系数表',
  'tbl_DegreasingTreatment': '脱脂管件系数表',
  'tbl_hic': '抗硫氢管件系数表',
  'tbl_paohuang': '抛光管件系数表',
  'tbl_vendors': '厂商配置表',
  'product_attributes': '商品属性表',
  'product_prices': '商品价格表'
};

export default function App() {
  // ==========================================
  // 0. 全局与布局状态 (Global & Layout State)
  // ==========================================
  const [activeTab, setActiveTab] = useState('matching') // 'matching' | 'query' | 'admin'

  // 主题切换状态
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme')
      if (savedTheme) return savedTheme
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      return prefersDark ? 'dark' : 'light'
    }
    return 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  const [currentUser, setCurrentUser] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  // 获取当前登录用户
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/me')
        if (res.ok) {
          const data = await res.json()
          setCurrentUser(data.email)
        }
      } catch (err) {
        console.error('获取用户信息失败：', err)
      }
    }
    fetchUser()
  }, [])

  // ==========================================
  // 1. “价格匹配”模块状态与逻辑 (Price Matching Tab)
  // ==========================================
  const [file, setFile] = useState(null)
  const [pendingCsvText, setPendingCsvText] = useState('')
  const [csvPreview, setCsvPreview] = useState([])
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [dbData, setDbData] = useState([])
  const [loadingDb, setLoadingDb] = useState(false)
  const [dataSource, setDataSource] = useState('mock_data')
  const [showConfirm, setShowConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [matchingQueried, setMatchingQueried] = useState(false)

  // 数据库诊断弹窗状态
  const [diagnosticsData, setDiagnosticsData] = useState(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  // 拖拽调整列宽状态与函数
  const [csvColWidths, setCsvColWidths] = useState([200, 700, 150])
  const [dbColWidths, setDbColWidths] = useState([200, 700, 150])

  const startResize = (e, index, type) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const setColWidths = type === 'csv' ? setCsvColWidths : setDbColWidths
    const currentWidths = type === 'csv' ? csvColWidths : dbColWidths
    const startWidth = currentWidths[index] || 150

    const handleMouseMove = (moveEvent) => {
      const diffX = moveEvent.clientX - startX
      const newWidth = Math.max(80, startWidth + diffX)
      setColWidths(prev => {
        const next = [...prev]
        while (next.length <= index) {
          next.push(150)
        }
        next[index] = newWidth
        return next
      })
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const fileInputRef = useRef(null)

  // 加载数据库现有数据
  const fetchDbData = async () => {
    setLoadingDb(true)
    try {
      const res = await fetch('/api/data')
      if (!res.ok) throw new Error('拉取数据失败')
      const result = await res.json()
      if (result.success) {
        setDbData(result.data || [])
        setDataSource(result.source)
      } else {
        throw new Error(result.error)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDb(false)
    }
  }

  useEffect(() => {
    fetchDbData()
  }, [])

  // 依据返回数据动态计算初始列宽
  useEffect(() => {
    if (dbData.length > 0) {
      const cols = Object.keys(dbData[0])
      setDbColWidths(prev => {
        if (prev.length === cols.length) return prev
        return cols.map(col => {
          if (col === '物料长描述') return 450
          if (col === '物料号码') return 180
          if (col === '匹配名称') return 150
          if (col === '材质') return 120
          if (col.includes('系数') || col === '数量' || col === '镀锌' || col === '低温' || col === '脱脂' || col === '抛光') return 100
          return 120
        })
      })
    }
  }, [dbData])

  // 解析选择的 CSV/Excel 文件预览并缓存转换后的 CSV 文本
  const handleFile = (selectedFile) => {
    if (!selectedFile) return
    const fileName = selectedFile.name.toLowerCase()
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setErrorMsg('文件类型错误：仅支持上传 .csv 或 .xlsx/.xls 格式的表格文件。')
      setFile(null)
      setCsvPreview([])
      setPendingCsvText('')
      return
    }

    setFile(selectedFile)
    setErrorMsg('')
    setSuccessMsg('')

    // 公用的解析与预览渲染辅助函数
    const processCsvText = (text) => {
      setPendingCsvText(text)
      const lines = text.split(/\r?\n/)
      const parsedPreview = []
      for (let i = 0; i < Math.min(lines.length, 6); i++) {
        if (lines[i].trim() === '') continue
        const parsed = parseCSVLine(lines[i])
        parsedPreview.push(parsed)
      }
      setCsvPreview(parsedPreview)
      if (parsedPreview.length > 0) {
        const colsCount = parsedPreview[0].length
        const initialWidths = Array(colsCount).fill(150)
        if (colsCount > 0) initialWidths[0] = 200
        if (colsCount > 1) initialWidths[1] = 700
        if (colsCount > 2) initialWidths[2] = 150
        setCsvColWidths(initialWidths)
      }
    }

    const reader = new FileReader()
    if (fileName.endsWith('.csv')) {
      // CSV 文件：直接按 UTF-8 读取文本
      reader.onload = (e) => {
        processCsvText(e.target.result)
      }
      reader.readAsText(selectedFile, 'UTF-8')
    } else {
      // Excel 文件：读取二进制 ArrayBuffer，在前端静默转换为 CSV 文本
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = window.XLSX.read(data, { type: 'array' })
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          const csvText = window.XLSX.utils.sheet_to_csv(worksheet)
          processCsvText(csvText)
        } catch (err) {
          setErrorMsg(`Excel 文件解析失败：${err.message}`)
          setFile(null)
          setCsvPreview([])
          setPendingCsvText('')
        }
      }
      reader.readAsArrayBuffer(selectedFile)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const onButtonClick = () => {
    fileInputRef.current.click()
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  // 批量上传导入并核价计算
  const startUpload = async () => {
    if (!file || !pendingCsvText) return
    setUploading(true)
    setErrorMsg('')
    setSuccessMsg('')
    setShowConfirm(false)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: pendingCsvText,
        headers: {
          'Content-Type': 'text/csv'
        }
      })

      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || '服务器导入发生异常')
      }

      if (result.success) {
        setSuccessMsg(result.message || '导入与核价计算成功！')
        setFile(null)
        setPendingCsvText('')
        setCsvPreview([])
        fetchDbData()
        setMatchingQueried(true)
        if (result.diagnostics) {
          setDiagnosticsData(result.diagnostics)
          setShowDiagnostics(true)
        }
      } else {
        throw new Error(result.error || '上传导入失败')
      }
    } catch (uploadErr) {
      setErrorMsg(uploadErr.message)
    } finally {
      setUploading(false)
    }
  }

  const cancelSelection = () => {
    setFile(null)
    setPendingCsvText('')
    setCsvPreview([])
    setErrorMsg('')
    setSuccessMsg('')
  }

  const filteredDbData = dbData

  // 复制“最终核价”价格到剪贴板
  const handleCopyPrices = async () => {
    if (dbData.length === 0) {
      alert("当前没有可复制的价格数据。")
      return
    }
    const pricesText = dbData
      .map(item => {
        const val = item['最终核价']
        return val !== null && val !== undefined ? String(val) : ''
      })
      .join('\n')

    try {
      await navigator.clipboard.writeText(pricesText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy prices: ', err)
      alert('复制失败，请重试或检查浏览器剪贴板权限。')
    }
  }

  // 导出 final_price_table 到 Excel
  const handleExportExcel = () => {
    if (filteredDbData.length === 0) {
      alert("当前无可导出的数据记录。");
      return;
    }
    try {
      const worksheet = window.XLSX.utils.json_to_sheet(filteredDbData);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "核价计算结果");
      window.XLSX.writeFile(workbook, "final_price_table.xlsx");
    } catch (err) {
      console.error(err);
      alert("导出 Excel 文件时发生异常: " + err.message);
    }
  }

  // ==========================================
  // 2. “单项查询”模块状态与逻辑 (Single Query Tab)
  // ==========================================
  const [selectedName, setSelectedName] = useState('')
  const [selectedDn1, setSelectedDn1] = useState('')
  const [selectedDn2, setSelectedDn2] = useState('')
  const [thickness, setThickness] = useState('')
  const [localThickness, setLocalThickness] = useState('')
  const [otherThickness, setOtherThickness] = useState('')
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [selectedVendor, setSelectedVendor] = useState('')

  // 下拉列表数据源
  const [names, setNames] = useState([])
  const [dn1List, setDn1List] = useState([])
  const [dn2List, setDn2List] = useState([])
  const [materials, setMaterials] = useState([])
  const [vendors, setVendors] = useState([])
  const [otherThicknessList, setOtherThicknessList] = useState([])

  // 纯前端级联状态
  const [allSpecs, setAllSpecs] = useState([])

  // 数据展示与加载状态
  const [products, setProducts] = useState([])
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState(null)
  const [dataSourceQuery, setDataSourceQuery] = useState('mock_data')
  const [hasActiveSearch, setHasActiveSearch] = useState(false)

  // 互斥控制：当一个输入框有值时，另一个禁用
  const isThicknessDisabled = !!otherThickness
  const isOtherThicknessDisabled = !!localThickness

  // 页面初始加载时，一次性拉取所有产品规格（不包含价格数据）和所有厂商
  // 这只会消耗极少量的 D1 Reads，后续所有的级联过滤完全在前端内存中零成本完成
  useEffect(() => {
    const initAllSpecs = async () => {
      try {
        const response = await fetch(`/api/products?fetchAllSpecs=true`)
        if (response.ok) {
          const resData = await response.json()
          if (resData.success) {
            setAllSpecs(resData.allSpecs || [])
            setNames(resData.allNames || []) // 名称从 tbl_prod_name 获取
            setVendors(resData.allVendors || []) // 厂商固化
            if (resData.source) {
              setDataSourceQuery(resData.source)
            }
          }
        }
      } catch (err) {
        console.error('获取全部产品规格失败：', err)
      }
    }
    initAllSpecs()
  }, [])

  // 纯前端内存级联过滤逻辑：当任意选择发生变化时，基于全量 allSpecs 计算其他下拉框的可用选项
  useEffect(() => {
    if (allSpecs.length === 0) return

    const getValidOptions = (excludeKey) => {
      return [...new Set(allSpecs.filter(p => {
        // 刻面搜索：除了正在计算的字段自身外，如果其他字段有选择值，则该规格必须符合其他字段的值
        if (excludeKey !== 'name' && selectedName && p['名称'] !== selectedName) return false
        if (excludeKey !== 'dn1' && selectedDn1 && String(p['DN1']) !== selectedDn1) return false
        if (excludeKey !== 'dn2' && selectedDn2 && String(p['DN2']) !== selectedDn2) return false
        if (excludeKey !== 'otherThickness' && otherThickness && !isOtherThicknessDisabled && p['其他壁厚'] !== null && p['其他壁厚'] !== otherThickness) return false
        if (excludeKey !== 'material' && selectedMaterial && p['材质'] !== selectedMaterial) return false
        return true
      }).map(p => {
        // 名称不再从组合中提取去重，名称由 API 直接下发
        if (excludeKey === 'dn1') return String(p['DN1'])
        if (excludeKey === 'dn2') return String(p['DN2'])
        if (excludeKey === 'otherThickness') return String(p['其他壁厚'])
        if (excludeKey === 'material') return p['材质']
        return null
      }))].filter(x => x && x !== 'null' && x !== '空')
    }
    
    // DN 值按照数值大小排序
    const sortNumeric = (a, b) => {
      const numA = parseFloat(a) || 0
      const numB = parseFloat(b) || 0
      return numA - numB
    }
    setDn1List(getValidOptions('dn1').sort(sortNumeric))
    setDn2List(getValidOptions('dn2').sort(sortNumeric))
    
    setMaterials(getValidOptions('material').sort())
    setOtherThicknessList(getValidOptions('otherThickness').sort())

  }, [allSpecs, selectedName, selectedDn1, selectedDn2, otherThickness, selectedMaterial, isOtherThicknessDisabled])

  // 显式触发主列表报价查询
  const fetchProductsList = async () => {
    setQueryLoading(true)
    setQueryError(null)
    try {
      const params = new URLSearchParams()
      if (selectedName) params.append('name', selectedName)
      if (selectedDn1) params.append('dn1', selectedDn1)
      if (selectedDn2) params.append('dn2', selectedDn2)
      if (thickness && !isThicknessDisabled) params.append('thickness', thickness)
      if (otherThickness && !isOtherThicknessDisabled) params.append('otherThickness', otherThickness)
      if (selectedMaterial) params.append('material', selectedMaterial)
      if (selectedVendor) params.append('vendor', selectedVendor)

      const response = await fetch(`/api/products?${params.toString()}`)
      if (!response.ok) {
        let errMsg = '无法连接到核价查询服务。'
        try {
          const errData = await response.json()
          if (errData && errData.error) errMsg = errData.error
        } catch (e) {}
        throw new Error(errMsg)
      }

      const resData = await response.json()
      if (resData.success) {
        setProducts(resData.data || [])
        setHasActiveSearch(true)
        setDataSourceQuery(resData.source)
        if (resData.diagnostics) {
          setDiagnosticsData(resData.diagnostics)
          setShowDiagnostics(true)
        }
      } else {
        throw new Error(resData.error || '获取报价数据失败')
      }
    } catch (err) {
      console.error(err)
      setQueryError(err.message)
    } finally {
      setQueryLoading(false)
    }
  }

  // 联动监听：选择器改变时，重置“查询已激活”标志和结果列表
  useEffect(() => {
    setProducts([])
    setHasActiveSearch(false)
  }, [
    selectedName,
    selectedDn1,
    selectedDn2,
    thickness,
    otherThickness,
    selectedMaterial,
    selectedVendor
  ])

  // 清空筛选
  const clearFilters = () => {
    setSelectedName('')
    setSelectedDn1('')
    setSelectedDn2('')
    setThickness('')
    setLocalThickness('')
    setOtherThickness('')
    setSelectedMaterial('')
    setSelectedVendor('')
    setProducts([])
    setHasActiveSearch(false)
  }

  // 切换标签页并清空展示区
  const handleTabChange = (tabName) => {
    setActiveTab(tabName)
    // 彻底重置价格匹配模块的状态
    setMatchingQueried(false)
    setSuccessMsg('')
    setErrorMsg('')
    setFile(null)
    setPendingCsvText('')
    setCsvPreview([])
    setShowConfirm(false)
    // 彻底重置单项查询模块的状态
    clearFilters()
    setProducts([])
    setQueryError(null)
  }

  // ==========================================
  // 3. 后台管理模块状态与逻辑 (Admin Tab)
  // ==========================================
  const [adminTables, setAdminTables] = useState([])
  const [adminExportTable, setAdminExportTable] = useState('')
  const [adminImportTable, setAdminImportTable] = useState('')
  const [adminImportMode, setAdminImportMode] = useState('overwrite')
  const [adminImportFile, setAdminImportFile] = useState(null)
  const [adminParsedData, setAdminParsedData] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMsg, setAdminMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    if (activeTab === 'admin' && adminTables.length === 0) {
      const fetchTables = async () => {
        try {
          const res = await fetch('/api/admin/tables')
          const data = await res.json()
          if (data.success) {
            setAdminTables(data.data)
            if (data.data.length > 0) {
              setAdminExportTable(data.data[0].name)
              setAdminImportTable(data.data[0].name)
            }
          }
        } catch (err) {
          console.error("Failed to fetch admin tables:", err)
        }
      }
      fetchTables()
    }
  }, [activeTab])

  const handleAdminExport = async () => {
    if (!adminExportTable) return
    try {
      setAdminMsg({ type: 'info', text: `正在拉取 ${adminExportTable} 的数据 ...` })
      const res = await fetch(`/api/admin/export?table=${adminExportTable}&t=${Date.now()}`)
      const data = await res.json()
      if (data.success) {
        if (data.data.length === 0) {
          setAdminMsg({ type: 'warning', text: '该表目前没有数据！' })
          return
        }
        const worksheet = window.XLSX.utils.json_to_sheet(data.data)
        const workbook = window.XLSX.utils.book_new()
        window.XLSX.utils.book_append_sheet(workbook, worksheet, adminExportTable)
        window.XLSX.writeFile(workbook, `${adminExportTable}_export.xlsx`)
        setAdminMsg({ type: 'success', text: '导出成功！' })
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setAdminMsg({ type: 'error', text: '导出失败: ' + err.message })
    }
  }

  const handleAdminFileChange = (e) => {
    const selectedFile = e.target.files && e.target.files[0]
    if (!selectedFile) return
    setAdminImportFile(selectedFile)
    setAdminMsg({ type: '', text: '' })
    
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result)
        const workbook = window.XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = window.XLSX.utils.sheet_to_json(worksheet, { defval: null })
        
        if (jsonData.length === 0) {
          setAdminMsg({ type: 'error', text: '解析失败：表格内没有数据' })
          setAdminParsedData([])
          return
        }
        
        // 数据校验
        const selectedTableSchema = adminTables.find(t => t.name === adminImportTable)
        if (selectedTableSchema) {
          const fileHeaders = Object.keys(jsonData[0])
          const tableCols = selectedTableSchema.columns
          
          const missingCols = tableCols.filter(c => !fileHeaders.includes(c))
          if (missingCols.length > 0) {
            setAdminMsg({ type: 'error', text: `解析失败：上传的文件缺失必填列 [${missingCols.join(', ')}]，请检查后再上传！` })
            setAdminParsedData([])
            return
          }
        }
        
        setAdminParsedData(jsonData)
        setAdminMsg({ type: 'info', text: `文件解析成功，共发现 ${jsonData.length} 条数据，可以开始导入。` })
      } catch (err) {
        setAdminMsg({ type: 'error', text: '文件解析出错: ' + err.message })
        setAdminParsedData([])
      }
    }
    reader.readAsArrayBuffer(selectedFile)
  }

  const handleAdminImport = async () => {
    if (!adminImportTable || adminParsedData.length === 0) return
    setAdminLoading(true)
    setAdminMsg({ type: 'info', text: '正在提交导入，请稍候...' })
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: adminImportTable,
          mode: adminImportMode,
          data: adminParsedData
        })
      })
      const data = await res.json()
      if (data.success) {
        setAdminMsg({ type: 'success', text: data.message })
        setAdminImportFile(null)
        setAdminParsedData([])
        // 重置文件选择框的值
        const fileInput = document.getElementById('admin-file-upload')
        if (fileInput) fileInput.value = ''
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setAdminMsg({ type: 'error', text: '导入失败: ' + err.message })
    } finally {
      setAdminLoading(false)
    }
  }

  // ==========================================
  // 3. 渲染各个页面区域 (Page Render Utilities)
  // ==========================================

  // A. 价格匹配模块
  const renderMatchingView = () => {
    return (
      <div>
        {/* 文件上传面板 */}
        <section className="panel">
          {errorMsg && <div className="alert alert-error">❌ {errorMsg}</div>}
          {successMsg && <div className="alert alert-success">✅ {successMsg}</div>}

          {!file ? (
            <div 
              className={`dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={onButtonClick}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                className="file-input" 
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
              />
              <div className="dropzone-icon">📄</div>
              <h3>拖拽 CSV 或 Excel 文件至此处，或点击选择文件</h3>
              <p>支持格式：.csv, .xlsx, .xls 表格文件 (限定第一列物料号码、第二列物料长描述、第三列数量)</p>
            </div>
          ) : (
            <div>
              <div className="alert alert-warning" style={{ margin: '0 0 1.5rem 0' }}>
                <div>
                  <strong>⚠️ 注意：</strong> 开始导入后，系统将<strong>自动清空（清零）</strong>表 <code>tbl_sample</code> 中的所有现有记录，并被该文件（Excel 将在后台静默转换为 CSV 数据）所覆写。数据清空不可撤销！
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', background: 'hsla(220, 20%, 5%, 0.3)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                <div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>待上传文件：</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{file.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.8rem' }}>({(file.size / 1024).toFixed(2)} KB)</span>
                </div>
                <button className="btn btn-secondary" onClick={cancelSelection} disabled={uploading}>
                  取消选择
                </button>
              </div>

              {csvPreview.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span>📄 前端数据列预览</span>
                    <span className="badge-count" style={{ background: 'var(--card-border)', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>跳过第 1 行标题</span>
                  </h4>
                  <div className="table-container" style={{ margin: '0' }}>
                    <table className="data-table" style={{ tableLayout: 'fixed', width: `${csvColWidths.reduce((a, b) => a + b, 0)}px` }}>
                      <thead>
                        <tr>
                          {csvPreview[0].map((header, idx) => {
                            const w = csvColWidths[idx] || 150;
                            return (
                              <th key={idx} style={{ width: `${w}px`, position: 'relative' }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '12px' }} title={header}>
                                  {header || `列 ${idx + 1}`}
                                </div>
                                <div className="col-resizer" onMouseDown={(e) => startResize(e, idx, 'csv')} />
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.slice(1).map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {row.map((cell, cellIdx) => {
                              const w = csvColWidths[cellIdx] || 150;
                              return (
                                <td key={cellIdx} style={{ width: `${w}px`, maxWidth: `${w}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cell}>
                                  {cellIdx === 0 ? (
                                    <span className="badge-code">{cell}</span>
                                  ) : cellIdx === 2 ? (
                                    <span className="badge-qty">{cell}</span>
                                  ) : (
                                    cell
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'block' }}>
                    * 以上仅展示 CSV 文件前 5 行记录以核对列关系，实际导入时会读取整个文件。
                  </span>
                </div>
              )}

              {!showConfirm ? (
                <div className="btn-group">
                  <button className="btn btn-danger" onClick={() => setShowConfirm(true)} disabled={uploading}>
                    ⚡️ 开始清空并导入
                  </button>
                </div>
              ) : (
                <div className="btn-group" style={{ background: 'hsla(350, 80%, 60%, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px dashed hsla(350, 80%, 60%, 0.3)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--accent-error)', fontSize: '0.9rem', fontWeight: '600', marginRight: 'auto' }}>
                    🚨 确认要清空数据库并开始导入吗？
                  </span>
                  <button className="btn btn-secondary" onClick={() => setShowConfirm(false)} disabled={uploading}>
                    我再想想
                  </button>
                  <button className="btn btn-primary" style={{ background: 'var(--accent-error)' }} onClick={startUpload} disabled={uploading}>
                    {uploading ? (
                      <>
                        <div className="loading-spinner"></div>
                        导入中...
                      </>
                    ) : (
                      "确认清空并导入"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 查询结果预览 */}
        {matchingQueried && (
          <section className="panel" style={{ marginTop: '2.5rem' }}>
            <div className="section-title">
              <div className="section-title-left">
                <span>📊 查询结果</span>
                {dbData.length > 0 && (
                  <span className="badge-count">{dbData.length} 条记录</span>
                )}
              </div>
              {dbData.length > 0 && (
                <div className="table-header-controls">
                  <button 
                    className="btn btn-primary" 
                    style={{ 
                      padding: '0.45rem 1.1rem', 
                      fontSize: '0.82rem', 
                      background: copied ? 'var(--accent-success)' : 'var(--accent-primary)',
                      boxShadow: copied ? '0 4px 12px hsla(145, 80%, 45%, 0.2)' : '0 4px 14px 0 hsla(260, 85%, 65%, 0.3)'
                    }} 
                    onClick={handleCopyPrices}
                  >
                    {copied ? '✅ 已复制价格' : '📋 复制价格'}
                  </button>
                  <button 
                    className="btn btn-primary" 
                    style={{ 
                      padding: '0.45rem 1.1rem', 
                      fontSize: '0.82rem', 
                      background: 'var(--accent-success)', 
                      boxShadow: '0 4px 12px hsla(145, 80%, 45%, 0.2)' 
                    }} 
                    onClick={handleExportExcel}
                  >
                    📥 导出为Excel
                  </button>
                </div>
              )}
            </div>

            {loadingDb ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
                <div className="loading-spinner" style={{ marginBottom: '0.5rem' }}></div>
                <p>正在读取数据库记录...</p>
              </div>
            ) : dbData.length > 0 ? (
              <div className="table-container" style={{ margin: '0' }}>
                <table className="data-table" style={{ tableLayout: 'fixed', width: `${dbColWidths.reduce((a, b) => a + b, 0)}px` }}>
                  <thead>
                    <tr>
                      {Object.keys(dbData[0] || {}).map((colName, idx) => {
                        const isRightAlign = colName === '数量' || colName.includes('系数') || colName === '镀锌' || colName === '低温' || colName === '脱脂' || colName === '抛光';
                        return (
                          <th 
                            key={colName} 
                            style={{ 
                              width: `${dbColWidths[idx] || 120}px`, 
                              position: 'relative',
                              textAlign: isRightAlign ? 'right' : 'left'
                            }}
                          >
                            <div style={{ 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap', 
                              paddingRight: '12px',
                              float: isRightAlign ? 'right' : 'none'
                            }}>
                              {colName}
                            </div>
                            <div className="col-resizer" onMouseDown={(e) => startResize(e, idx, 'db')} />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDbData.length > 0 ? (
                      filteredDbData.map((item, index) => {
                        const cols = Object.keys(dbData[0] || {});
                        return (
                          <tr key={index}>
                            {cols.map((colName, colIdx) => {
                              const val = item[colName];
                              const w = dbColWidths[colIdx] || 120;
                              const isRightAlign = colName === '数量' || colName.includes('系数') || colName === '镀锌' || colName === '低温' || colName === '脱脂' || colName === '抛光';
                              return (
                                <td 
                                  key={colName}
                                  style={{ 
                                    width: `${w}px`, 
                                    maxWidth: `${w}px`,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    textAlign: isRightAlign ? 'right' : 'left'
                                  }}
                                  title={val !== null && val !== undefined ? String(val) : ''}
                                >
                                  {colName === '物料号码' ? (
                                    <span className="badge-code">{val}</span>
                                  ) : isRightAlign ? (
                                    <div className="badge-qty-wrapper">
                                      <span className="badge-qty">{val !== null && val !== undefined ? String(val) : '—'}</span>
                                    </div>
                                  ) : (
                                    val !== null && val !== undefined ? String(val) : '—'
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={Object.keys(dbData[0] || {}).length || 3} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                          📭 暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <p>目前数据库中无数据，请在上方上传 CSV 文件导入。</p>
              </div>
            )}
          </section>
        )}
      </div>
    )
  }

  // B. 单项查询模块
  const renderQueryView = () => {
    return (
      <div>
        {/* 联动筛选过滤器 */}
        <section className="panel">
          <div className="filter-grid">
            {/* 配件名称 */}
            <div className="filter-group">
              <label htmlFor="name-select">配件名称</label>
              <select
                id="name-select"
                value={selectedName}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedName(val)
                  setSelectedDn1('')
                  setSelectedDn2('')
                  setThickness('')
                  setLocalThickness('')
                  setOtherThickness('')
                  setSelectedMaterial('')
                }}
              >
                <option value="">全部配件</option>
                {names.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* DN1 */}
            <div className="filter-group">
              <label htmlFor="dn1-select">DN1 (直管径)</label>
              <select
                id="dn1-select"
                value={selectedDn1}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedDn1(val)
                  setSelectedDn2('')
                  setThickness('')
                  setLocalThickness('')
                  setOtherThickness('')
                }}
              >
                <option value="">全部 DN1</option>
                {dn1List.map(val => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>

            {/* DN2 */}
            <div className="filter-group">
              <label htmlFor="dn2-select">DN2 (缩管径/支管径)</label>
              <select
                id="dn2-select"
                value={selectedDn2}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedDn2(val)
                  setThickness('')
                  setLocalThickness('')
                  setOtherThickness('')
                }}
              >
                <option value="">全部 DN2</option>
                {dn2List.map(val => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>

            {/* 材质 */}
            <div className="filter-group">
              <label htmlFor="material-select">材质</label>
              <select
                id="material-select"
                value={selectedMaterial}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedMaterial(val)
                  setThickness('')
                  setLocalThickness('')
                  setOtherThickness('')
                }}
              >
                <option value="">全部材质</option>
                {materials.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* 厂商 */}
            <div className="filter-group">
              <label htmlFor="vendor-select">报价厂商</label>
              <select
                id="vendor-select"
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
              >
                <option value="">全部厂商</option>
                {vendors.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>



            {/* 标准壁厚 - 互斥 */}
            <div className="filter-group" style={{ position: 'relative' }}>
              <label htmlFor="thickness-input">标准壁厚</label>
              <input
                id="thickness-input"
                type="text"
                placeholder={isThicknessDisabled ? "已禁用 (其他壁厚生效中)" : "输入壁厚数值筛选..."}
                value={localThickness}
                onChange={(e) => setLocalThickness(e.target.value)}
                onBlur={() => setThickness(localThickness)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setThickness(localThickness)
                  }
                }}
                disabled={isThicknessDisabled}
              />
              {isThicknessDisabled && (
                <span style={{ fontSize: '0.75rem', color: 'hsl(35, 90%, 55%)', marginTop: '0.2rem' }}>
                  ⚠️ 已开启“其他壁厚”筛选，此项已禁用
                </span>
              )}
            </div>

            {/* 其他壁厚 - 互斥 */}
            <div className="filter-group" style={{ position: 'relative' }}>
              <label htmlFor="other-thickness-select">其他壁厚</label>
              <select
                id="other-thickness-select"
                value={otherThickness}
                onChange={(e) => setOtherThickness(e.target.value)}
                disabled={isOtherThicknessDisabled}
              >
                <option value="">{isOtherThicknessDisabled ? "已禁用 (标准壁厚生效中)" : "全部其他壁厚"}</option>
                {otherThicknessList.map(val => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
              {isOtherThicknessDisabled && (
                <span style={{ fontSize: '0.75rem', color: 'hsl(35, 90%, 55%)', marginTop: '0.2rem' }}>
                  ⚠️ 已开启“标准壁厚”筛选，此项已禁用
                </span>
              )}
            </div>
          </div>

          {/* 显式查询与重置操作行 */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '1rem', 
            marginTop: '1.5rem', 
            paddingTop: '1.2rem', 
            borderTop: '1px solid var(--card-border)' 
          }}>
            <button 
              className="btn btn-secondary" 
              onClick={clearFilters}
              style={{ padding: '0.55rem 1.4rem', fontSize: '0.85rem' }}
            >
              🧹 重置条件
            </button>
            <button 
              className="btn btn-primary" 
              onClick={fetchProductsList}
              disabled={queryLoading || !(selectedName || selectedDn1 || selectedDn2 || thickness || otherThickness || selectedMaterial || selectedVendor)}
              style={{ 
                padding: '0.55rem 1.8rem', 
                fontSize: '0.85rem',
                background: 'var(--accent-primary)',
                boxShadow: '0 4px 12px 0 hsla(260, 85%, 65%, 0.25)',
                fontWeight: '600',
                opacity: (selectedName || selectedDn1 || selectedDn2 || thickness || otherThickness || selectedMaterial || selectedVendor) ? 1 : 0.6,
                cursor: (selectedName || selectedDn1 || selectedDn2 || thickness || otherThickness || selectedMaterial || selectedVendor) ? 'pointer' : 'not-allowed'
              }}
            >
              {queryLoading ? (
                <>
                  <div className="loading-spinner" style={{ width: '12px', height: '12px', marginRight: '6px', borderTopColor: 'transparent' }}></div>
                  查询中...
                </>
              ) : (
                '🔍 开始查询报价'
              )}
            </button>
          </div>
        </section>

        {/* 结果栏及清除按钮 */}
        {(() => {
          const hasActiveQuery = !!(selectedName || selectedDn1 || selectedDn2 || thickness || otherThickness || selectedMaterial || selectedVendor);
          
          if (!hasActiveQuery) {
            return (
              <div className="panel" style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'var(--card-bg)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>暂无查询结果</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>请在上方选择任一筛选条件（如配件名称、直管径、材质或厂商）并点击“开始查询报价”启动检索。</p>
              </div>
            );
          }

          if (!hasActiveSearch) {
            return (
              <div className="panel" style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'var(--card-bg)', border: '1px dashed var(--card-border)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚡</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>筛选条件已更新</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>您已更改了筛选配置，请点击上方面板右下角的 <strong>“🔍 开始查询报价”</strong> 按钮检索最新结果。</p>
              </div>
            );
          }

          return (
            <>
              <div className="results-header">
                <div className="results-count">
                  找到 <strong>{products.length}</strong> 行报价记录
                </div>
                <button className="clear-btn" onClick={clearFilters}>
                  清除全部筛选条件
                </button>
              </div>

              {/* 服务端错误提示 */}
              {queryError && (
                <div style={{
                  background: 'hsla(350, 80%, 55%, 0.1)',
                  border: '1px solid hsla(350, 80%, 55%, 0.3)',
                  color: 'hsl(350, 80%, 65%)',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '2rem',
                  textAlign: 'center'
                }}>
                  ❌ {queryError}
                </div>
              )}

              {/* 级联查询报价表 */}
              {queryLoading ? (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>正在联接数据库并为您匹配价格，请稍候...</p>
                </div>
              ) : products.length > 0 ? (
                <div className="table-container" style={{ margin: '0' }}>
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>序号</th>
                        <th>名称</th>
                        <th>DN1</th>
                        <th>DN2</th>
                        <th>壁厚</th>
                        <th>其他壁厚</th>
                        <th>材质</th>
                        <th>厂商</th>
                        <th style={{ textAlign: 'right' }}>单价</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((item, index) => {
                        const hasStandard = item.壁厚 !== null && item.壁厚 !== undefined && item.壁厚 !== '';
                        const hasOther = item.其他壁厚 !== null && item.其他壁厚 !== undefined && item.其他壁厚 !== '' && item.其他壁厚 !== '空';
                        
                        return (
                          <tr key={`${item.序号}-${item.厂商}-${index}`}>
                            <td>
                              <span className="badge-primary">{item.序号}</span>
                            </td>
                            <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {item.名称}
                            </td>
                            <td>{item.DN1 !== null && item.DN1 !== undefined && item.DN1 !== '空' ? item.DN1 : '-'}</td>
                            <td>{item.DN2 !== null && item.DN2 !== undefined && item.DN2 !== '空' ? item.DN2 : '-'}</td>
                            <td>
                              {hasStandard ? <span className="badge-success">{item.壁厚}</span> : '-'}
                            </td>
                            <td>
                              {hasOther ? <span className="badge-warn">{item.其他壁厚}</span> : '-'}
                            </td>
                            <td>
                              <span className="badge-secondary">{item.材质}</span>
                            </td>
                            <td style={{ fontWeight: '500' }}>{item.厂商}</td>
                            <td style={{ textAlign: 'right' }} className="price-text">
                              ¥{parseFloat(item.单价).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div style={{ fontSize: '3rem' }}>🔩</div>
                  <h3>没有找到匹配的管道报价记录</h3>
                  <p style={{ color: 'var(--text-muted)' }}>尝试放宽筛选条件，或在上方重新选择。</p>
                </div>
              )}
            </>
          );
        })()}
      </div>
    )
  }

  // C. 后台管理页面
  const renderAdminView = () => {
    return (
      <div>
        {adminMsg.text && (
          <div className={`alert ${adminMsg.type === 'error' ? 'alert-error' : adminMsg.type === 'success' ? 'alert-success' : adminMsg.type === 'warning' ? 'alert-warning' : 'alert-info'}`} style={{ marginBottom: '1.5rem' }}>
            {adminMsg.type === 'error' && '❌ '}
            {adminMsg.type === 'success' && '✅ '}
            {adminMsg.type === 'warning' && '⚠️ '}
            {adminMsg.type === 'info' && 'ℹ️ '}
            {adminMsg.text}
          </div>
        )}

        <section className="panel" style={{ marginBottom: '2rem' }}>
          <div className="section-title">
            <div className="section-title-left">
              <span>📥 模板导出 (Template Export)</span>
            </div>
          </div>
          <div className="filter-grid" style={{ alignItems: 'flex-end' }}>
            <div className="filter-group">
              <label>选择目标表</label>
              <select value={adminExportTable} onChange={e => setAdminExportTable(e.target.value)}>
                {adminTables.map(t => (
                  <option key={t.name} value={t.name}>
                    {TABLE_NAME_MAP[t.name] ? `${TABLE_NAME_MAP[t.name]} (${t.name})` : t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group" style={{ flex: 'none' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleAdminExport}
                disabled={!adminExportTable}
              >
                导出 Excel
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <div className="section-title-left">
              <span>📤 数据导入 (Data Import)</span>
            </div>
          </div>
          <div className="filter-grid" style={{ marginBottom: '1.5rem', alignItems: 'flex-end' }}>
            <div className="filter-group">
              <label>选择目标表</label>
              <select 
                value={adminImportTable} 
                onChange={e => {
                  setAdminImportTable(e.target.value)
                  // 重置文件选择
                  setAdminImportFile(null)
                  setAdminParsedData([])
                  setAdminMsg({ type: '', text: '' })
                  const fileInput = document.getElementById('admin-file-upload')
                  if (fileInput) fileInput.value = ''
                }}
              >
                {adminTables.map(t => (
                  <option key={t.name} value={t.name}>
                    {TABLE_NAME_MAP[t.name] ? `${TABLE_NAME_MAP[t.name]} (${t.name})` : t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>导入模式</label>
              <select value={adminImportMode} onChange={e => setAdminImportMode(e.target.value)}>
                <option value="overwrite">覆盖导入 (完全清空原表)</option>
                <option value="append">追加导入 (保留原数据追加写入)</option>
              </select>
            </div>
          </div>

          <div className="filter-group" style={{ marginBottom: '1.5rem' }}>
            <label>上传数据文件 (.xlsx, .xls, .csv)</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input 
                id="admin-file-upload"
                type="file" 
                className="file-input"
                accept=".csv,.xlsx,.xls"
                onChange={handleAdminFileChange}
              />
              <button 
                className="btn btn-secondary" 
                onClick={() => document.getElementById('admin-file-upload').click()}
              >
                📁 选择文件
              </button>
              {adminImportFile && (
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  已选文件: <strong>{adminImportFile.name}</strong>
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              className={`btn ${adminImportMode === 'overwrite' ? 'btn-danger' : 'btn-primary'}`} 
              onClick={handleAdminImport}
              disabled={adminParsedData.length === 0 || adminLoading}
              style={{ opacity: (adminParsedData.length === 0 || adminLoading) ? 0.6 : 1 }}
            >
              {adminLoading ? '处理中...' : (adminImportMode === 'overwrite' ? '⚡️ 确认清空并导入' : '⚡️ 确认追加导入')}
            </button>
          </div>
        </section>
      </div>
    )
  }

  // D. 帮助文档/使用说明页面
  const renderHelpView = () => {
    return (
      <div className="panel" style={{ padding: '2.5rem 3rem' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '1.5rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.8rem' }}>
          📖 系统使用说明
        </h2>
        
        <div style={{ lineHeight: '1.7', color: 'var(--text-secondary)' }}>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--accent-primary)', marginTop: '1.5rem', marginBottom: '0.8rem', fontWeight: '600' }}>
            一、价格匹配模块 (批量导入核价)
          </h3>
          <p style={{ marginBottom: '1rem' }}>
            <strong>核心功能：</strong>通过上传 Excel/CSV 文件，系统自动将文件中的产品与数据库中的各厂商报价进行匹配，并计算出各家厂商的最终核价结果。
          </p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 1：准备文件</strong> - 请确保表格第一列是“物料号码”，第二列是“物料长描述”（即配件名称与规格等），第三列是“数量”。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 2：上传文件</strong> - 拖拽或点击上传框，选择 <code>.xlsx</code>、<code>.xls</code> 或 <code>.csv</code> 格式的文件。系统会自动解析前 5 行让你确认列名匹配是否正确。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 3：开始导入</strong> - 点击红色的“⚡️ 开始清空并导入”按钮。⚠️ <strong>注意：此操作会完全覆盖数据库中的临时计算表</strong>，导入前请确保数据无误。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 4：查看与导出</strong> - 数据处理完成后，下方表格将完整展示核价结果。你可以点击表格右上方的按钮将结果“复制到剪贴板”或“导出为 Excel”到本地。</li>
          </ul>

          <h3 style={{ fontSize: '1.25rem', color: 'var(--accent-primary)', marginTop: '2.5rem', marginBottom: '0.8rem', fontWeight: '600' }}>
            二、单项查询模块 (实时报价检索)
          </h3>
          <p style={{ marginBottom: '1rem' }}>
            <strong>核心功能：</strong>无需文件导入，直接在网页端挑选规格参数，实时查询各厂商对应配件的底层单价与规格明细。
          </p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li style={{ marginBottom: '0.5rem' }}><strong>智能级联筛选：</strong>从下拉列表中依次选择“配件名称”、“DN1”、“DN2”、“材质”、“厂商”等。下拉框中的选项会随着你其他的选择<strong>自动过滤智能收缩</strong>，确保你最终选出的组合在数据库中一定有对应产品。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>互斥设计：</strong>“标准壁厚”与“其他壁厚”是互斥参数。当你填写任意一方的内容时，另一方将自动被禁用并锁定，防止条件冲突。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>执行查询：</strong>所有所需参数选择完毕后，请点击右上角的“🔍 开始查询报价”按钮。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>清除条件：</strong>点击“🧹 重置条件”可以一键清空所有输入框并重新开始新的查询。</li>
          </ul>

          <h3 style={{ fontSize: '1.25rem', color: 'var(--accent-primary)', marginTop: '2.5rem', marginBottom: '0.8rem', fontWeight: '600' }}>
            三、后台管理模块 (数据源维护)
          </h3>
          <p style={{ marginBottom: '1rem' }}>
            <strong>核心功能：</strong>提供图形化的数据库维护界面，可以下载数据表的结构模板，以及通过追加或覆盖的方式在线批量更新后台基础配置表。
          </p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 1：获取模板</strong> - 在“操作目标表”下拉框中选择你要修改的配置表（如 <code>tbl_R</code> 等），点击右上角的“导出 Excel”即可获取最新的线上数据副本。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 2：本地修改</strong> - 直接在下载的 Excel 中修改、添加或删除对应数据。<strong>请不要随意更改表头的列名</strong>。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 3：选择导入模式</strong> - <strong>覆盖模式</strong>会首先清空线上表内的旧数据再插入新文件的数据；<strong>追加模式</strong>则会在保留原有数据的基础上插入新数据（遇到具有唯一约束的重复数据时，系统会自动平滑更新替换）。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>步骤 4：执行导入</strong> - 上传改好的 Excel 文件并点击导入，系统会自动对数据格式进行严密的校验，通过后即可直达底层数据库。</li>
          </ul>

          <h3 style={{ fontSize: '1.25rem', color: 'var(--accent-primary)', marginTop: '2.5rem', marginBottom: '0.8rem', fontWeight: '600' }}>
            四、其他注意事项
          </h3>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li style={{ marginBottom: '0.5rem' }}><strong>深色/浅色主题：</strong>点击左下角的用户图标即可快速在深色与浅色模式间切换，以适应不同的光线与阅读习惯。</li>
            <li style={{ marginBottom: '0.5rem' }}><strong>移动端完美适配：</strong>本系统已深度适配手机浏览器浏览。在手机端，您可以通过手指横向滑动表格来浏览超出屏幕宽度的完整数据列。</li>
          </ul>
        </div>
      </div>
    );
  };

  // ==========================================
  // 4. 左右分栏 Dashboard 骨架渲染
  // ==========================================
  return (
    <div className="container" style={{ position: 'relative' }}>
      
      {/* 极简全局数据库连接状态标识 (右上角) */}
      <div style={{ position: 'absolute', top: '1rem', right: '1.5rem', zIndex: 10 }}>
        {(activeTab === 'matching' ? dataSource : dataSourceQuery) === 'd1_database' ? (
          <span className="db-badge db-badge-success" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', opacity: 0.75 }}>
            🟢 数据库连接正常
          </span>
        ) : (
          <span className="db-badge db-badge-warning" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', opacity: 0.75 }}>
            🟡 模拟演示数据
          </span>
        )}
      </div>

      {/* 统一页面居中顶部标题栏 */}
      <header className="page-header">
        {activeTab === 'matching' && (
          <>
            <h1>
              <span className="header-icon">🏷️</span> 对焊管件价格匹配及查询系统
            </h1>
            <p className="subtitle">目前仅限镇海基地框架不锈钢有缝管件部分</p>
          </>
        )}

        {activeTab === 'query' && (
          <>
            <h1>
              <span className="header-icon">📊</span> 管道配件联合核价查询系统
            </h1>
            {/* 依据要求，单项查询页面去除子标题 */}
          </>
        )}

        {activeTab === 'admin' && (
          <>
            <h1>
              <span className="header-icon">⚙️</span> 系统后台管理中心
            </h1>
            <p className="subtitle">配置系统系数参数、编辑报价框架字典、以及查询系统日志</p>
          </>
        )}
        
        {activeTab === 'help' && (
          <>
            <h1>
              <span className="header-icon">📖</span> 帮助与使用指南
            </h1>
            <p className="subtitle">快速了解对焊管件系统的操作流程与使用技巧</p>
          </>
        )}
      </header>

      <div className="app-layout">
        {/* 左侧侧边栏导航 */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <span style={{ fontSize: '1.4rem' }}>🔩</span>
            <span>管道配件报价系统</span>
          </div>

          <nav className="sidebar-menu">
            <button 
              className={`sidebar-item ${activeTab === 'matching' ? 'active' : ''}`}
              onClick={() => handleTabChange('matching')}
            >
              <span style={{ fontSize: '1.1rem' }}>📋</span>
              <span>价格匹配</span>
            </button>
            
            <button 
              className={`sidebar-item ${activeTab === 'query' ? 'active' : ''}`}
              onClick={() => handleTabChange('query')}
            >
              <span style={{ fontSize: '1.1rem' }}>🔍</span>
              <span>单项查询</span>
            </button>

            <button 
              className={`sidebar-item ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => handleTabChange('admin')}
            >
              <span style={{ fontSize: '1.1rem' }}>⚙️</span>
              <span>后台管理</span>
            </button>
            
            <button 
              className={`sidebar-item ${activeTab === 'help' ? 'active' : ''}`}
              onClick={() => handleTabChange('help')}
              style={{ marginTop: '0.5rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem', borderRadius: '0', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}
            >
              <span style={{ fontSize: '1.1rem' }}>📖</span>
              <span>使用说明</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <button className="theme-toggle-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={toggleTheme} title="切换主题">
              {theme === 'dark' ? '☀️ 浅色模式' : '🌙 深色模式'}
            </button>
            {currentUser && (
              <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ 
                  fontSize: '0.72rem', 
                  color: 'var(--text-secondary)', 
                  textAlign: 'center', 
                  display: 'block', 
                  background: 'var(--input-bg)', 
                  padding: '0.45rem 0.5rem', 
                  borderRadius: '6px', 
                  border: '1px solid var(--card-border)', 
                  wordBreak: 'break-all'
                }} title={`当前登录用户: ${currentUser}`}>
                  👤 {currentUser}
                </span>
                
                <button 
                  className="btn btn-secondary logout-btn" 
                  style={{ 
                    padding: '0.4rem', 
                    fontSize: '0.72rem', 
                    width: '100%', 
                    justifyContent: 'center', 
                    borderRadius: '6px',
                    borderColor: 'hsla(350, 80%, 60%, 0.2)',
                    color: 'var(--accent-error)',
                    background: 'hsla(350, 80%, 60%, 0.05)',
                    transition: 'all 0.2s ease',
                    fontWeight: '600'
                  }}
                  disabled={loggingOut}
                  onClick={async () => {
                    if (confirm('确认要退出当前登录的账户吗？系统将自动安全清空您在云端数据库中的所有临时上传与价格计算表。')) {
                      setLoggingOut(true);
                      try {
                        await fetch('/api/cleanup', { method: 'POST' });
                      } catch (err) {
                        console.error('退出清理失败：', err);
                      }
                      window.location.href = '/cdn-cgi/access/logout';
                    }
                  }}
                >
                  {loggingOut ? '⌛ 正在清除数据...' : '🚪 退出登录'}
                </button>
              </div>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', display: 'block', marginTop: '0.8rem', fontWeight: '600', letterSpacing: '0.05em' }}>
              设计制作：老杨
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', display: 'block', marginTop: '0.3rem' }}>
              版本：v3.5
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', display: 'block', marginTop: '0.2rem', opacity: 0.85 }}>
              (新增数据库查询诊断与索引分析 | 更新于: 2026-06-05 07:38)
            </span>
          </div>
        </aside>

        {/* 右侧主内容区 */}
        <main className="main-content">
          {activeTab === 'matching' && renderMatchingView()}
          {activeTab === 'query' && renderQueryView()}
          {activeTab === 'admin' && renderAdminView()}
          {activeTab === 'help' && renderHelpView()}
        </main>
      </div>

      {showDiagnostics && diagnosticsData && (
        <div className="diag-overlay" onClick={() => setShowDiagnostics(false)}>
          <div className="diag-modal" onClick={(e) => e.stopPropagation()}>
            <div className="diag-header">
              <h3 className="diag-title">
                🔍 数据库查询诊断 (D1 Diagnostics)
              </h3>
              <button className="diag-close-btn" onClick={() => setShowDiagnostics(false)}>
                &times;
              </button>
            </div>
            <div className="diag-body">
              <div className="diag-grid">
                <div className="diag-stat-card">
                  <span className="diag-stat-label">读取行数</span>
                  <span className={`diag-stat-val ${diagnosticsData.rows_read > 500 ? 'warning' : 'success'}`}>
                    {diagnosticsData.rows_read.toLocaleString()}
                  </span>
                </div>
                <div className="diag-stat-card">
                  <span className="diag-stat-label">写入行数</span>
                  <span className="diag-stat-val">
                    {diagnosticsData.rows_written.toLocaleString()}
                  </span>
                </div>
                <div className="diag-stat-card">
                  <span className="diag-stat-label">数据库耗时</span>
                  <span className="diag-stat-val warning">
                    {diagnosticsData.duration_ms} ms
                  </span>
                </div>
              </div>

              <div className="diag-section">
                <span className="diag-section-title">⚡ 索引触发状态</span>
                <div className="diag-badge-list">
                  {diagnosticsData.indexes_triggered && diagnosticsData.indexes_triggered.length > 0 ? (
                    diagnosticsData.indexes_triggered.map((idx, i) => (
                      <span key={i} className="diag-badge index">
                        🔹 {idx}
                      </span>
                    ))
                  ) : (
                    <span className="diag-badge empty">
                      ⚠️ 未触发任何索引 (全表扫描)
                    </span>
                  )}
                </div>
              </div>

              {diagnosticsData.scans && diagnosticsData.scans.length > 0 && (
                <div className="diag-section">
                  <span className="diag-section-title">🚨 扫描的表 (全表扫描)</span>
                  <div className="diag-badge-list">
                    {diagnosticsData.scans.map((tbl, i) => (
                      <span key={i} className="diag-badge scan">
                        ⚠️ SCAN TABLE {tbl}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {diagnosticsData.query_plan && diagnosticsData.query_plan.length > 0 && (
                <div className="diag-section">
                  <span className="diag-section-title">📋 详细查询执行计划 (SQLite Explain Plan)</span>
                  <div className="diag-plan-details">
                    {diagnosticsData.query_plan.map((line, i) => (
                      <div key={i} className="diag-plan-line">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="diag-footer">
              <button className="btn-diag-confirm" onClick={() => setShowDiagnostics(false)}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
