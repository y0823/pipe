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
        // 顺便让单项查询也刷新选项数据
        fetchQueryProducts()
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
  const [otherThickness, setOtherThickness] = useState('')
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [selectedVendor, setSelectedVendor] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  // 下拉列表数据源
  const [names, setNames] = useState([])
  const [dn1List, setDn1List] = useState([])
  const [dn2List, setDn2List] = useState([])
  const [materials, setMaterials] = useState([])
  const [vendors, setVendors] = useState([])
  const [otherThicknessList, setOtherThicknessList] = useState([])

  // 数据展示与加载状态
  const [products, setProducts] = useState([])
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState(null)
  const [dataSourceQuery, setDataSourceQuery] = useState('mock_data')

  // 互斥控制：当一个输入框有值时，另一个禁用
  const isThicknessDisabled = !!otherThickness
  const isOtherThicknessDisabled = !!thickness

  // 获取报价联合查询数据
  const fetchQueryProducts = async () => {
    const hasActive = !!(selectedName || selectedDn1 || selectedDn2 || thickness || otherThickness || selectedMaterial || selectedVendor || minPrice || maxPrice)
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
      if (minPrice) params.append('minPrice', minPrice)
      if (maxPrice) params.append('maxPrice', maxPrice)

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
        if (hasActive) {
          setProducts(resData.data || [])
        } else {
          setProducts([])
        }
        // 动态同步多级筛选下拉框可用项
        if (resData.names) setNames(resData.names)
        if (resData.dn1List) setDn1List(resData.dn1List)
        if (resData.dn2List) setDn2List(resData.dn2List)
        if (resData.materials) setMaterials(resData.materials)
        if (resData.vendors) setVendors(resData.vendors)
        if (resData.otherThicknessList) setOtherThicknessList(resData.otherThicknessList)
        setDataSourceQuery(resData.source)
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

  // 联动监听
  useEffect(() => {
    fetchQueryProducts()
  }, [
    selectedName,
    selectedDn1,
    selectedDn2,
    thickness,
    otherThickness,
    selectedMaterial,
    selectedVendor,
    minPrice,
    maxPrice
  ])

  // 清空筛选
  const clearFilters = () => {
    setSelectedName('')
    setSelectedDn1('')
    setSelectedDn2('')
    setThickness('')
    setOtherThickness('')
    setSelectedMaterial('')
    setSelectedVendor('')
    setMinPrice('')
    setMaxPrice('')
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
                  <strong>⚠️ 注意：</strong> 开始导入后，系统将<strong>自动清空（清零）</strong>表 <code>test_sample</code> 中的所有现有记录，并被该文件（Excel 将在后台静默转换为 CSV 数据）所覆写。数据清空不可撤销！
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
                onChange={(e) => setSelectedName(e.target.value)}
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
                onChange={(e) => setSelectedDn1(e.target.value)}
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
                onChange={(e) => setSelectedDn2(e.target.value)}
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
                onChange={(e) => setSelectedMaterial(e.target.value)}
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

            {/* 单价区间 */}
            <div className="filter-group">
              <label>单价区间 (元)</label>
              <div className="price-inputs">
                <input
                  id="min-price"
                  type="number"
                  placeholder="最低价"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  min="0"
                />
                <span>至</span>
                <input
                  id="max-price"
                  type="number"
                  placeholder="最高价"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  min="0"
                />
              </div>
            </div>

            {/* 标准壁厚 - 互斥 */}
            <div className="filter-group" style={{ position: 'relative' }}>
              <label htmlFor="thickness-input">标准壁厚</label>
              <input
                id="thickness-input"
                type="text"
                placeholder={isThicknessDisabled ? "已禁用 (其他壁厚生效中)" : "输入壁厚数值筛选..."}
                value={thickness}
                onChange={(e) => setThickness(e.target.value)}
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
        </section>

        {/* 结果栏及清除按钮 */}
        {(() => {
          const hasActiveQuery = !!(selectedName || selectedDn1 || selectedDn2 || thickness || otherThickness || selectedMaterial || selectedVendor || minPrice || maxPrice);
          return hasActiveQuery ? (
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
          ) : (
            <div className="panel" style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'var(--card-bg)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>暂无查询结果</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>请在上方选择任一筛选条件（如配件名称、直管径、材质或厂商）以启动报价检索。</p>
            </div>
          );
        })()}
      </div>
    )
  }

  // C. 后台管理页面占位
  const renderAdminView = () => {
    return (
      <div>
        <div className="panel" style={{ padding: '5rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '4.5rem', marginBottom: '1.5rem' }}>🔐</div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-primary)' }}>后台管理控制台</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto', fontSize: '0.95rem', lineHeight: '1.6' }}>
            该模块正在规划中。未来将在此处支持可视化修改增值计算系数（如材质系数、弯曲半径系数、低温/脱脂参数等）、维护框架表底盘字典、并提供日志与文件审计历史追溯功能。
          </p>
          <button className="btn btn-primary" style={{ marginTop: '2.5rem', background: 'var(--text-muted)', cursor: 'not-allowed', boxShadow: 'none' }} disabled>
            🚀 模块建设中 (Coming Soon)
          </button>
        </div>
      </div>
    )
  }

  // ==========================================
  // 4. 左右分栏 Dashboard 骨架渲染
  // ==========================================
  return (
    <div className="container">
      {/* 统一页面居中顶部标题栏 */}
      <header className="page-header">
        {activeTab === 'matching' && (
          <>
            <h1>
              <span className="header-icon">🏷️</span> 对焊管件价格匹配及查询系统
            </h1>
            <p className="subtitle">目前仅限镇海基地框架不锈钢有缝管件部分</p>
            
            <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'center' }}>
              {dataSource === 'd1_database' ? (
                <span className="db-badge db-badge-success">
                  🟢 数据库联接正常 (test_sample)
                </span>
              ) : (
                <span className="db-badge db-badge-warning">
                  本地模拟环境（未绑定云端 D1 数据库）
                </span>
              )}
            </div>
          </>
        )}

        {activeTab === 'query' && (
          <>
            <h1>
              <span className="header-icon">📊</span> 管道配件联合核价查询系统
            </h1>
            <p className="subtitle">通过联接 tbl_ss_smls 与 tbl_ss_smls_price，跨表精确筛选各厂商报价</p>
            
            <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'center' }}>
              {dataSourceQuery === 'd1_database' ? (
                <span className="db-badge db-badge-success">
                  🟢 已联接 D1 数据库：tbl_ss_smls ➕ tbl_ss_smls_price
                </span>
              ) : (
                <span className="db-badge db-badge-warning">
                  🟡 模拟演示数据（请确认本地服务已连接 D1）
                </span>
              )}
            </div>
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
          </nav>

          <div className="sidebar-footer">
            <button className="theme-toggle-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={toggleTheme} title="切换主题">
              {theme === 'dark' ? '☀️ 浅色模式' : '🌙 深色模式'}
            </button>
            {currentUser && (
              <span style={{ 
                fontSize: '0.72rem', 
                color: 'var(--text-secondary)', 
                textAlign: 'center', 
                display: 'block', 
                background: 'var(--input-bg)', 
                padding: '0.45rem 0.5rem', 
                borderRadius: '6px', 
                border: '1px solid var(--card-border)', 
                wordBreak: 'break-all',
                marginTop: '0.4rem'
              }} title={`当前登录用户: ${currentUser}`}>
                👤 {currentUser}
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', display: 'block', marginTop: '0.4rem' }}>
              镇海基地不锈钢有缝管件 v2.0
            </span>
          </div>
        </aside>

        {/* 右侧主视口内容 */}
        <main className="main-content">
          {activeTab === 'matching' && renderMatchingView()}
          {activeTab === 'query' && renderQueryView()}
          {activeTab === 'admin' && renderAdminView()}
        </main>
      </div>
    </div>
  )
}
