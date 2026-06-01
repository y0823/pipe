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
  // 状态变量
  const [file, setFile] = useState(null)
  const [csvPreview, setCsvPreview] = useState([])
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [dragActive, setDragActive] = useState(false)

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
  
  // 数据库现有数据状态
  const [dbData, setDbData] = useState([])
  const [loadingDb, setLoadingDb] = useState(false)
  const [dataSource, setDataSource] = useState('mock_data')
  
  // 确认对话框开关
  const [showConfirm, setShowConfirm] = useState(false)

  // 复制价格状态反馈
  const [copied, setCopied] = useState(false)

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

  // 1. 加载数据库现有数据
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
        // 如果列数没变，就不去改写用户的拖拽宽度
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

  // 2. 解析所选择的 CSV 文件，在前端进行前 5 行预览
  const handleFile = (selectedFile) => {
    if (!selectedFile) return
    
    // 验证文件类型
    if (!selectedFile.name.endsWith('.csv')) {
      setErrorMsg('文件类型错误：仅支持上传 .csv 格式的文件。')
      setFile(null)
      setCsvPreview([])
      return
    }

    setFile(selectedFile)
    setErrorMsg('')
    setSuccessMsg('')

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      // 简单分行（支持 \n 和 \r\n）
      const lines = text.split(/\r?\n/)
      
      const parsedPreview = []
      // 读取最多 6 行（第 1 行是标题，后面 5 行是预览内容）
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
    reader.readAsText(selectedFile, 'UTF-8')
  }

  // 拖拽相关事件处理
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

  // 文件选择按钮事件
  const onButtonClick = () => {
    fileInputRef.current.click()
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  // 3. 执行数据清除与批量上传导入操作
  const startUpload = async () => {
    if (!file) return
    setUploading(true)
    setErrorMsg('')
    setSuccessMsg('')
    setShowConfirm(false)

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const text = e.target.result
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: text,
            headers: {
              'Content-Type': 'text/csv'
            }
          })

          const result = await res.json()
          if (!res.ok) {
            throw new Error(result.error || '服务器导入发生异常')
          }

          if (result.success) {
            setSuccessMsg(result.message || '导入成功！')
            setFile(null)
            setCsvPreview([])
            // 重新刷新数据列表
            fetchDbData()
          } else {
            throw new Error(result.error || '上传导入失败')
          }
        } catch (uploadErr) {
          setErrorMsg(uploadErr.message)
        } finally {
          setUploading(false)
        }
      }
      reader.readAsText(file, 'UTF-8')
    } catch (err) {
      setErrorMsg(err.message)
      setUploading(false)
    }
  }

  // 取消当前选中的文件
  const cancelSelection = () => {
    setFile(null)
    setCsvPreview([])
    setErrorMsg('')
    setSuccessMsg('')
  }

  // 复制“最终核价”价格到剪贴板
  const handleCopyPrices = async () => {
    if (dbData.length === 0) {
      alert("当前没有可复制的价格数据。")
      return
    }
    
    // 提取“最终核价”列的价格并用换行符连接，方便粘贴到 Excel 列中
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

  // 过滤后的数据库数据
  const filteredDbData = dbData

  // 导出 final_price_table 到 Excel
  const handleExportExcel = () => {
    if (filteredDbData.length === 0) {
      alert("当前筛选状态下无可导出的数据记录。");
      return;
    }
    
    try {
      // 1. 创建工作表和工作簿
      const worksheet = window.XLSX.utils.json_to_sheet(filteredDbData);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "核价计算结果");
      
      // 2. 生成二进制文件并触发浏览器下载（浏览器会根据设置选择自动下载或询问保存位置）
      window.XLSX.writeFile(workbook, "final_price_table.xlsx");
    } catch (err) {
      console.error(err);
      alert("导出 Excel 文件时发生异常: " + err.message);
    }
  };

  return (
    <div className="container">
      <div className="theme-toggle-container">
        <button className="theme-toggle-btn" onClick={toggleTheme} title="切换主题">
          {theme === 'dark' ? '☀️ 浅色模式' : '🌙 深色模式'}
        </button>
      </div>
      <header>
        <h1>📤 D1 数据库 CSV 导入控制台</h1>
        <p className="subtitle">上传并覆写数据库表 `test_sample`（物料号码、物料长描述、数量）</p>
        
        {/* 数据源标签 */}
        <div style={{ marginTop: '1.2rem' }}>
          {dataSource === 'd1_database' ? (
            <span style={{
              background: 'hsla(145, 80%, 45%, 0.15)',
              color: 'hsl(145, 80%, 45%)',
              padding: '0.4rem 1rem',
              borderRadius: '20px',
              border: '1px solid hsla(145, 80%, 45%, 0.3)',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              🟢 数据库联接正常 (test_sample)
            </span>
          ) : (
            <span style={{
              background: 'hsla(35, 90%, 50%, 0.15)',
              color: 'hsl(35, 90%, 55%)',
              padding: '0.4rem 1rem',
              borderRadius: '20px',
              border: '1px solid hsla(35, 90%, 50%, 0.3)',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              本地模拟环境（未绑定云端 D1 数据库）
            </span>
          )}
        </div>
      </header>

      {/* 第一部分：文件上传区 */}
      <section className="panel">
        {/* 全局错误与成功提示 banner */}
        {errorMsg && <div className="alert alert-error">❌ {errorMsg}</div>}
        {successMsg && <div className="alert alert-success">✅ {successMsg}</div>}

        {!file ? (
          // 未选择文件：拖拽组件
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
              accept=".csv"
              onChange={handleFileChange}
            />
            <div className="dropzone-icon">📄</div>
            <h3>拖拽 CSV 文件至此处，或点击选择文件</h3>
            <p>支持格式：.csv 格式表格文件 (限定第一列物料号码、第二列物料长描述、第三列数量)</p>
          </div>
        ) : (
          // 已选择文件：确认上传与预览面板
          <div>
            <div className="alert alert-warning" style={{ margin: '0 0 1.5rem 0' }}>
              <div>
                <strong>⚠️ 注意：</strong> 开始导入后，系统将<strong>自动清空（清零）</strong>表 <code>test_sample</code> 中的所有现有记录，并被此 CSV 文件内容所覆写。数据清空不可撤销！
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

            {/* CSV 数据预览表格 */}
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
                            <th 
                              key={idx} 
                              style={{ 
                                width: `${w}px`,
                                position: 'relative'
                              }}
                            >
                              <div style={{ 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: 'nowrap',
                                paddingRight: '12px'
                              }} title={header}>
                                {header || `列 ${idx + 1}`}
                              </div>
                              <div 
                                className="col-resizer" 
                                onMouseDown={(e) => startResize(e, idx, 'csv')}
                              />
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
                              <td 
                                key={cellIdx}
                                style={{
                                  width: `${w}px`,
                                  maxWidth: `${w}px`,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                                title={cell}
                              >
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

            {/* 确认操作区 */}
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

      {/* 第二部分：当前数据库表格预览 */}
      <section className="panel" style={{ marginTop: '2.5rem' }}>
        <div className="section-title">
          <div className="section-title-left">
            <span>📊 数据库当前数据列表</span>
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
    </div>
  )
}
