import { useState, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { fmtExportDate, formatDateCell as formatCellValue } from '../utils/dateUtils';
import { colLabel, formatSize } from '../utils/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload,
  FileSpreadsheet,
  X,
  Download,
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Play,
  Search,
  Target,
  Settings2,
  CheckCircle2,
} from 'lucide-react';

// ============ Helpers ============

// ============ Types ============

interface ExtractionRule {
  id: string;
  name: string;
  mode: 'offset' | 'intersection';
  // offset mode
  anchorRow: number;
  anchorCol: number;
  rowOffset: number;
  colOffset: number;
  // intersection mode
  rowKeyword: string;
  colKeyword: string;
  // display
  anchorLabel: string;
  previewValue: string;
}

interface BatchFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

interface ExtractionResult {
  fileName: string;
  ruleName: string;
  value: string;
  status: 'success' | 'error';
  error?: string;
}

type ExtractStep = 'upload' | 'config' | 'batch';

const EXTRACT_STEPS: { id: ExtractStep; label: string; icon: React.ReactNode }[] = [
  { id: 'upload', label: '上传样本', icon: <Upload className="w-4 h-4" /> },
  { id: 'config', label: '配置规则', icon: <Settings2 className="w-4 h-4" /> },
  { id: 'batch', label: '批量提取', icon: <Download className="w-4 h-4" /> },
];

// ============ Component ============

export default function BatchExcelExtractor() {
  const [step, setStep] = useState<ExtractStep>('upload');

  // --- Sample upload state ---
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleSheets, setSampleSheets] = useState<Map<string, string[][]>>(new Map());
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const sampleInputRef = useRef<HTMLInputElement>(null);

  // --- Anchor / mode state ---
  const [mode, setMode] = useState<'offset' | 'intersection'>('offset');
  const [anchorRow, setAnchorRow] = useState<number | null>(null);
  const [anchorCol, setAnchorCol] = useState<number | null>(null);
  const [rowOffset, setRowOffset] = useState(0);
  const [colOffset, setColOffset] = useState(0);

  // --- Intersection mode state ---
  const [rowKeyword, setRowKeyword] = useState('');
  const [colKeyword, setColKeyword] = useState('');
  const [foundRow, setFoundRow] = useState<number | null>(null);
  const [foundCol, setFoundCol] = useState<number | null>(null);

  // --- Rules state ---
  const [rules, setRules] = useState<ExtractionRule[]>([]);
  const [ruleName, setRuleName] = useState('');

  // --- Batch state ---
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [progress, setProgress] = useState({ total: 0, done: 0 });

  // --- Toast ---
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  }, []);

  // --- Current sheet data ---
  const currentData = useMemo(() => {
    return sampleSheets.get(activeSheet) || [];
  }, [sampleSheets, activeSheet]);

  const maxCols = useMemo(() => {
    return Math.max(0, ...currentData.map(r => r.length));
  }, [currentData]);

  // Preview: limit to first 50 rows, 26 cols
  const previewData = useMemo(() => {
    return currentData.slice(0, 50).map(r => r.slice(0, 26));
  }, [currentData]);

  // --- Sample upload handler ---
  const handleSampleUpload = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const names = wb.SheetNames;
      const sheets = new Map<string, string[][]>();
      for (const name of names) {
        // Parse with cellDates for proper date handling
        const display = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1 });
        sheets.set(name, display.map(row =>
          Array.isArray(row) ? row.map(c => (c == null ? '' : formatCellValue(c)).slice(0, 100)) : []
        ));
      }
      setSampleFile(file);
      setSampleSheets(sheets);
      setSheetNames(names);
      setActiveSheet(names[0]);
      setAnchorRow(null);
      setAnchorCol(null);
      setRules([]);
      setResults([]);
      setBatchFiles([]);
      showToast(`已解析 ${names.length} 个工作表`);
    } catch {
      showToast('文件解析失败，请检查文件格式');
    }
  }, [showToast]);

  const handleFileDrop = useCallback((e: React.DragEvent, handler: (f: File) => void) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handler(file);
  }, []);

  // --- Cell click handler ---
  const handleCellClick = useCallback((row: number, col: number) => {
    if (mode !== 'offset') return;
    setAnchorRow(row);
    setAnchorCol(col);
    setRowOffset(0);
    setColOffset(0);
  }, [mode]);

  // --- Preview value computation ---
  const previewValue = useMemo(() => {
    if (mode === 'offset') {
      if (anchorRow == null || anchorCol == null) return '';
      const tr = anchorRow + rowOffset;
      const tc = anchorCol + colOffset;
      if (tr < 0 || tr >= currentData.length) return '(行越界)';
      const rowData = currentData[tr];
      if (!rowData || tc < 0 || tc >= rowData.length) return '(列越界)';
      return formatCellValue(rowData[tc]);
    }
    if (mode === 'intersection') {
      if (foundRow == null || foundCol == null) return '';
      const tr = foundRow;
      const tc = foundCol;
      if (tr < 0 || tr >= currentData.length) return '(行越界)';
      const rowData = currentData[tr];
      if (!rowData || tc < 0 || tc >= rowData.length) return '(列越界)';
      return formatCellValue(rowData[tc]);
    }
    return '';
  }, [mode, anchorRow, anchorCol, rowOffset, colOffset, currentData, foundRow, foundCol]);

  // --- Search intersection ---
  const handleSearchIntersection = useCallback(() => {
    if (!rowKeyword.trim() || !colKeyword.trim()) return;
    const rk = rowKeyword.trim().toLowerCase();
    const ck = colKeyword.trim().toLowerCase();
    let rf: number | null = null;
    let cf: number | null = null;

    for (let r = 0; r < currentData.length; r++) {
      const row = currentData[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cellStr = String(row[c] ?? '').toLowerCase();
        if (cellStr.includes(rk)) { rf = r; break; }
      }
      if (rf != null) break;
    }

    for (let c = 0; c < maxCols; c++) {
      for (let r = 0; r < currentData.length; r++) {
        const row = currentData[r];
        if (!row) continue;
        const cellStr = String(row[c] ?? '').toLowerCase();
        if (cellStr.includes(ck)) { cf = c; break; }
      }
      if (cf != null) break;
    }

    setFoundRow(rf);
    setFoundCol(cf);
    if (rf == null || cf == null) {
      showToast(rf == null ? '未找到匹配行' : '未找到匹配列');
    } else {
      const val = formatCellValue(currentData[rf]?.[cf] ?? '');
      showToast(`定位成功: ${colLabel(cf)}${rf + 1} = ${val}`);
    }
  }, [rowKeyword, colKeyword, currentData, maxCols, showToast]);

  // --- Add rule ---
  const handleAddRule = useCallback(() => {
    if (!ruleName.trim()) {
      showToast('请输入字段名称');
      return;
    }

    let anchorLabel = '';
    let previewVal = '';

    if (mode === 'offset') {
      if (anchorRow == null || anchorCol == null) {
        showToast('请先在预览表中点击一个锚点单元格');
        return;
      }
      anchorLabel = `${colLabel(anchorCol)}${anchorRow + 1}`;
      previewVal = previewValue;
    } else {
      if (foundRow == null || foundCol == null) {
        showToast('请先定位行列交叉点');
        return;
      }
      anchorLabel = `行:${rowKeyword} × 列:${colKeyword}`;
      previewVal = previewValue;
    }

    if (previewVal === '(行越界)' || previewVal === '(列越界)') {
      showToast('提取值越界，请调整偏移量');
      return;
    }

    const newRule: ExtractionRule = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: ruleName.trim(),
      mode,
      anchorRow: anchorRow ?? 0,
      anchorCol: anchorCol ?? 0,
      rowOffset,
      colOffset,
      rowKeyword,
      colKeyword,
      anchorLabel,
      previewValue: previewVal,
    };

    setRules(prev => [...prev, newRule]);
    setRuleName('');

    if (mode === 'offset') {
      // Keep anchor but reset offset for next rule
      setRowOffset(0);
      setColOffset(0);
    } else {
      setRowKeyword('');
      setColKeyword('');
      setFoundRow(null);
      setFoundCol(null);
    }

    showToast(`已添加规则: ${newRule.name}`);
  }, [ruleName, mode, anchorRow, anchorCol, rowOffset, colOffset, rowKeyword, colKeyword, foundRow, foundCol, previewValue, showToast]);

  const handleDeleteRule = useCallback((id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  // --- Batch upload ---
  const handleAddBatchFiles = useCallback((files: FileList | File[]) => {
    const newFiles: BatchFile[] = Array.from(files).map(f => ({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      file: f,
      name: f.name,
      size: f.size,
      status: 'pending' as const,
    }));
    setBatchFiles(prev => [...prev, ...newFiles]);
    setResults([]);
  }, []);

  const handleRemoveBatchFile = useCallback((id: string) => {
    setBatchFiles(prev => prev.filter(f => f.id !== id));
    setResults([]);
  }, []);

  // --- Search helper for intersection ---
  const findIntersectionValue = useCallback((
    data: any[][],
    rowKw: string,
    colKw: string,
    maxC: number
  ): { value: string; error?: string } => {
    const rk = rowKw.trim().toLowerCase();
    const ck = colKw.trim().toLowerCase();
    let rf: number | null = null;
    let cf: number | null = null;

    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (String(row[c] ?? '').toLowerCase().includes(rk)) { rf = r; break; }
      }
      if (rf != null) break;
    }

    for (let c = 0; c < maxC; c++) {
      for (let r = 0; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;
        if (String(row[c] ?? '').toLowerCase().includes(ck)) { cf = c; break; }
      }
      if (cf != null) break;
    }

    if (rf == null || cf == null) {
      return { value: '', error: (rf == null ? `未找到行关键词"${rowKw}"` : `未找到列关键词"${colKw}"`) };
    }

    const v = formatCellValue(data[rf]?.[cf] ?? '');
    return { value: v };
  }, []);

  // --- Process batch ---
  const handleProcessBatch = useCallback(async () => {
    if (rules.length === 0) { showToast('请先配置至少一条提取规则'); return; }
    if (batchFiles.length === 0) { showToast('请先上传待处理文件'); return; }

    const allResults: ExtractionResult[] = [];
    setProgress({ total: batchFiles.length * rules.length, done: 0 });

    for (const bf of batchFiles) {
      try {
        const buffer = await bf.file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        // Use first sheet (or try to match active sheet name)
        const targetSheetName = wb.SheetNames.includes(activeSheet)
          ? activeSheet
          : wb.SheetNames[0];
        const raw = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[targetSheetName], { header: 1 });
        const data: any[][] = raw.map(row =>
          Array.isArray(row) ? row : []
        );

        for (const rule of rules) {
          let value = '';
          let error = '';

          if (rule.mode === 'offset') {
            const tr = rule.anchorRow + rule.rowOffset;
            const tc = rule.anchorCol + rule.colOffset;
            if (tr < 0 || tr >= data.length) {
              error = `行越界 (${tr + 1})`;
            } else {
              const rowData = data[tr];
              if (!rowData || tc < 0 || tc >= rowData.length) {
                error = `列越界 (${colLabel(tc)})`;
              } else {
                value = formatCellValue(rowData[tc]);
              }
            }
          } else {
            const maxC = Math.max(0, ...data.map(r => r.length));
            const result = findIntersectionValue(data, rule.rowKeyword, rule.colKeyword, maxC);
            if (result.error) {
              error = result.error;
            } else {
              value = result.value;
            }
          }

          allResults.push({
            fileName: bf.name,
            ruleName: rule.name,
            value,
            status: error ? 'error' : 'success',
            error,
          });

          setProgress(prev => ({ ...prev, done: prev.done + 1 }));
        }
      } catch {
        // File processing error
        for (const rule of rules) {
          allResults.push({
            fileName: bf.name,
            ruleName: rule.name,
            value: '',
            status: 'error',
            error: '文件解析失败',
          });
        }
        setProgress(prev => ({ ...prev, done: prev.done + rules.length }));
      }
    }

    setResults(allResults);
    setProgress({ total: 0, done: 0 });
    const successCount = allResults.filter(r => r.status === 'success').length;
    showToast(`处理完成: ${successCount}/${allResults.length} 条成功提取`);
  }, [rules, batchFiles, activeSheet, findIntersectionValue, showToast]);

  // --- Export results ---
  const handleExportResults = useCallback(() => {
    if (results.length === 0) { showToast('暂无结果可导出'); return; }

    const exportData: string[][] = [
      ['文件名', '字段名', '提取值', '状态', '错误信息'],
      ...results.map(r => [r.fileName, r.ruleName, r.value, r.status === 'success' ? '成功' : '失败', r.error || '']),
    ];

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    // Set column widths
    ws['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 30 }, { wch: 8 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '提取结果');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `批量提取结果_${fmtExportDate()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('结果已导出');
  }, [results, showToast]);

  // ============ Render Helpers ============

  const renderSampleUpload = () => (
    <div className="max-w-xl w-full mx-auto">
      {!sampleFile ? (
        <div
          className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 border-border hover:border-primary/50 hover:bg-primary/5"
          onClick={() => sampleInputRef.current?.click()}
          onDrop={e => handleFileDrop(e, handleSampleUpload)}
          onDragOver={e => e.preventDefault()}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-float" />
          <p className="text-base text-foreground font-medium">拖拽或点击上传 Excel 样本</p>
          <p className="text-sm text-muted-foreground mt-2">支持 .xlsx / .xls 格式</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 p-4 bg-amber-50/60 border border-amber-200 rounded-xl dark:bg-amber-950/20 dark:border-amber-800/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{sampleFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(sampleFile.size)} · {sheetNames.length} 个工作表</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => { sampleInputRef.current?.click(); }}>
              更换样本
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => { setSampleFile(null); setSampleSheets(new Map()); setSheetNames([]); setActiveSheet(''); setRules([]); setResults([]); }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      <input
        ref={sampleInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleSampleUpload(f); e.target.value = ''; }}
      />
    </div>
  );

  const renderSheetTabs = () => {
    if (sheetNames.length <= 1) return null;
    return (
      <div className="px-6 py-2 flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">工作表:</span>
        {sheetNames.map(name => (
          <button
            key={name}
            onClick={() => { setActiveSheet(name); setAnchorRow(null); setAnchorCol(null); setFoundRow(null); setFoundCol(null); }}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              name === activeSheet
                ? 'bg-primary/10 text-primary font-medium'
                : 'bg-muted text-muted-foreground hover:bg-muted'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    );
  };

  const renderPreview = () => {
    if (!sampleFile) return null;

    return (
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-background border-b border-border">
          <div className="text-xs text-muted-foreground">
            {mode === 'offset'
              ? '点击单元格设为锚点'
              : '输入行列关键词后点击定位'}
          </div>
          {anchorRow != null && anchorCol != null && mode === 'offset' && (
            <Badge variant="secondary" className="text-xs">
              锚点: {colLabel(anchorCol)}{anchorRow + 1}
              {previewValue && ` → ${previewValue}`}
            </Badge>
          )}
          {foundRow != null && foundCol != null && mode === 'intersection' && (
            <Badge variant="secondary" className="text-xs">
              定位: {colLabel(foundCol)}{foundRow + 1} = {previewValue}
            </Badge>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[420px]">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-muted border border-border px-2 py-1 w-10 min-w-10 text-center text-muted-foreground font-medium">
                  #
                </th>
                {Array.from({ length: Math.min(maxCols, 26) }).map((_, c) => (
                  <th
                    key={c}
                    className="sticky top-0 z-10 bg-muted border border-border px-2 py-1 min-w-[80px] max-w-[120px] text-center text-muted-foreground font-medium"
                  >
                    {colLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.map((row, ri) => (
                <tr key={ri}>
                  <td className="sticky left-0 z-10 bg-background border border-border px-2 py-1 text-center text-muted-foreground font-mono w-10 min-w-10">
                    {ri + 1}
                  </td>
                  {Array.from({ length: Math.min(maxCols, 26) }).map((_, ci) => {
                    const cellValue = row[ci] ?? '';
                    const isAnchor = mode === 'offset' && anchorRow === ri && anchorCol === ci;
                    const isTarget = mode === 'offset'
                      && anchorRow != null && anchorCol != null
                      && anchorRow + rowOffset === ri
                      && anchorCol + colOffset === ci
                      && !isAnchor;
                    const isIntersectRow = mode === 'intersection' && foundRow === ri;
                    const isIntersectCol = mode === 'intersection' && foundCol === ci;
                    const isIntersection = isIntersectRow && isIntersectCol;

                    return (
                      <td
                        key={ci}
                        onClick={() => handleCellClick(ri, ci)}
                        className={`border border-border px-2 py-1 max-w-[120px] truncate cursor-default select-none ${
                          isAnchor
                            ? 'bg-primary/50 text-white font-bold'
                            : isTarget
                            ? 'bg-primary/50 text-white font-medium'
                            : isIntersection
                            ? 'bg-yellow-300 font-medium'
                            : isIntersectRow || isIntersectCol
                            ? 'bg-yellow-50'
                            : mode === 'offset'
                            ? 'hover:bg-primary/5 cursor-crosshair'
                            : ''
                        }`}
                        title={String(cellValue)}
                      >
                        {String(cellValue).length > 15
                          ? String(cellValue).slice(0, 15) + '…'
                          : cellValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(currentData.length > 50 || maxCols > 26) && (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-background border-t border-border">
            仅显示前 50 行 × 26 列（共 {currentData.length} 行 × {maxCols} 列）
          </div>
        )}
      </div>
    );
  };

  const renderConfig = () => {
    if (!sampleFile) return null;

    return (
      <div className="space-y-3">
        {/* Mode selector + field name */}
        <div className="flex items-center gap-3">
          <Tabs value={mode} onValueChange={(v) => {
            setMode(v as 'offset' | 'intersection');
            if (v === 'intersection') { setAnchorRow(null); setAnchorCol(null); }
          }}>
            <TabsList className="h-8">
              <TabsTrigger value="offset" className="text-xs px-3 h-7">
                <Target className="w-3 h-3 mr-1" />
                偏移定位
              </TabsTrigger>
              <TabsTrigger value="intersection" className="text-xs px-3 h-7">
                <Search className="w-3 h-3 mr-1" />
                行列搜索
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Offset mode controls */}
        {mode === 'offset' && (
          <div className="space-y-3 p-3 bg-background rounded-lg border border-border">
            <div className="text-xs text-muted-foreground">
              {anchorRow == null || anchorCol == null
                ? '请在左侧预览表中点击单元格设定锚点'
                : `锚点: ${colLabel(anchorCol)}${anchorRow + 1}`
              }
            </div>

            {anchorRow != null && anchorCol != null && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">行偏移</Label>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Button variant="outline" size="sm" className="h-6 w-6 p-0"
                        onClick={() => setRowOffset(v => v - 1)}>
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Input
                        type="number"
                        value={rowOffset}
                        onChange={e => setRowOffset(Number(e.target.value) || 0)}
                        className="h-7 text-xs text-center w-16"
                      />
                      <Button variant="outline" size="sm" className="h-6 w-6 p-0"
                        onClick={() => setRowOffset(v => v + 1)}>
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">列偏移</Label>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Button variant="outline" size="sm" className="h-6 w-6 p-0"
                        onClick={() => setColOffset(v => v - 1)}>
                        <ArrowLeft className="w-3 h-3" />
                      </Button>
                      <Input
                        type="number"
                        value={colOffset}
                        onChange={e => setColOffset(Number(e.target.value) || 0)}
                        className="h-7 text-xs text-center w-16"
                      />
                      <Button variant="outline" size="sm" className="h-6 w-6 p-0"
                        onClick={() => setColOffset(v => v + 1)}>
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-card p-2 rounded border border-border">
                  <div className="text-[11px] text-muted-foreground">目标单元格</div>
                  <div className="text-sm font-mono font-medium">
                    {colLabel(anchorCol + colOffset)}{anchorRow + rowOffset + 1}
                    <span className="mx-2 text-muted-foreground/60">=</span>
                    <span className={previewValue.startsWith('(') ? 'text-red-500' : 'text-primary'}>
                      {previewValue || '(空)'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Intersection mode controls */}
        {mode === 'intersection' && (
          <div className="space-y-3 p-3 bg-background rounded-lg border border-border">
            <div>
              <Label className="text-xs text-muted-foreground">行关键词</Label>
              <div className="flex gap-1 mt-0.5">
                <Input
                  placeholder="例: 合同金额"
                  value={rowKeyword}
                  onChange={e => setRowKeyword(e.target.value)}
                  className="h-7 text-xs flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleSearchIntersection()}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">列关键词</Label>
              <div className="flex gap-1 mt-0.5">
                <Input
                  placeholder="例: 本期发生额"
                  value={colKeyword}
                  onChange={e => setColKeyword(e.target.value)}
                  className="h-7 text-xs flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleSearchIntersection()}
                />
              </div>
            </div>
            <Button size="sm" className="h-7 text-xs w-full" onClick={handleSearchIntersection}>
              <Search className="w-3 h-3 mr-1" />
              定位交叉单元格
            </Button>

            {foundRow != null && foundCol != null && (
              <div className="bg-card p-2 rounded border border-border">
                <div className="text-[11px] text-muted-foreground">定位结果</div>
                <div className="text-sm font-mono font-medium">
                  {colLabel(foundCol)}{foundRow + 1}
                  <span className="mx-2 text-muted-foreground/60">=</span>
                  <span className="text-primary">{previewValue || '(空)'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rule name + Add */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入字段名称..."
            value={ruleName}
            onChange={e => setRuleName(e.target.value)}
            className="h-8 text-xs flex-1"
            onKeyDown={e => e.key === 'Enter' && handleAddRule()}
          />
          <Button
            size="sm"
            className="h-8 text-xs shrink-0"
            onClick={handleAddRule}
            disabled={
              mode === 'offset'
                ? (anchorRow == null || !ruleName.trim())
                : (foundRow == null || !ruleName.trim())
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            添加规则
          </Button>
        </div>
      </div>
    );
  };

  const renderRulesList = () => {
    if (rules.length === 0) return null;

    return (
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          <GripVertical className="w-3 h-3" />
          提取规则 ({rules.length})
        </div>
        {rules.map((rule, idx) => (
          <div key={rule.id} className="flex items-center gap-2 px-2 py-1.5 bg-card rounded border border-border group hover:border-primary/30 transition-colors">
            <Badge variant={rule.mode === 'offset' ? 'default' : 'secondary'} className="h-5 text-[10px] px-1.5 shrink-0">
              {rule.mode === 'offset' ? '偏移' : '搜索'}
            </Badge>
            <span className="text-xs font-medium text-foreground flex-1 truncate">
              {idx + 1}. {rule.name}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">{rule.anchorLabel}</span>
            <span className="text-[10px] text-primary shrink-0 truncate max-w-[80px]" title={rule.previewValue}>
              {rule.previewValue}
            </span>
            <button
              onClick={() => handleDeleteRule(rule.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderBatchSection = () => {
    if (rules.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileSpreadsheet className="w-4 h-4" />
          批量处理
        </div>

        {/* Batch upload */}
        <div
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5/30 transition-colors"
          onClick={() => batchInputRef.current?.click()}
          onDrop={e => {
            e.preventDefault();
            handleAddBatchFiles(e.dataTransfer.files ?? []);
          }}
          onDragOver={e => e.preventDefault()}
        >
          <Upload className="w-6 h-6 text-muted-foreground/60 mx-auto mb-1" />
          <p className="text-sm text-muted-foreground">上传待处理的 Excel 文件</p>
          <p className="text-xs text-muted-foreground mt-0.5">支持多选</p>
          <input
            ref={batchInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) handleAddBatchFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Batch file list */}
        {batchFiles.length > 0 && (
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {batchFiles.map(bf => (
              <div key={bf.id} className="flex items-center gap-2 px-3 py-1.5 bg-card rounded border border-border text-xs">
                <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-foreground">{bf.name}</span>
                <span className="text-muted-foreground shrink-0">{formatSize(bf.size)}</span>
                <button onClick={() => handleRemoveBatchFile(bf.id)} className="text-muted-foreground hover:text-red-500 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Process button */}
        {batchFiles.length > 0 && (
          <div className="flex items-center gap-3">
            <Button onClick={handleProcessBatch} className="h-8 text-xs" disabled={progress.total > 0}>
              <Play className="w-3.5 h-3.5 mr-1" />
              {progress.total > 0 ? `处理中... ${progress.done}/${progress.total}` : `开始处理 (${batchFiles.length} 个文件 × ${rules.length} 条规则)`}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderResults = () => {
    if (results.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            提取结果
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {results.filter(r => r.status === 'success').length}/{results.length} 成功
            </span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExportResults}>
            <Download className="w-3.5 h-3.5 mr-1" />
            导出Excel
          </Button>
        </div>

        {/* Results table */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="overflow-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-background">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-border">文件名</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-border">字段</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-border">提取值</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground border-b border-border w-16">状态</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-border">说明</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={`border-t border-border ${r.status === 'error' ? 'bg-red-50/50' : 'hover:bg-background'}`}>
                    <td className="px-3 py-1.5 text-foreground max-w-[200px] truncate" title={r.fileName}>{r.fileName}</td>
                    <td className="px-3 py-1.5 text-foreground">{r.ruleName}</td>
                    <td className={`px-3 py-1.5 font-mono ${r.status === 'error' ? 'text-red-400' : 'text-primary font-medium'}`}>
                      {r.value || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.status === 'success'
                        ? <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-primary border-primary/30">成功</Badge>
                        : <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-red-600 border-red-300">失败</Badge>
                      }
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{r.error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ============ Main Render ============

  // ============ Step Indicator ============
  const stepIndex = EXTRACT_STEPS.findIndex((s) => s.id === step);

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {EXTRACT_STEPS.map((s, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex;
        return (
          <div key={s.id} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                if (s.id === 'upload') setStep('upload');
                if (s.id === 'config' && sampleFile) setStep('config');
                if (s.id === 'batch' && sampleFile) setStep('batch');
              }}
              disabled={s.id === 'config' && !sampleFile || s.id === 'batch' && !sampleFile}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/25 scale-[1.03]'
                  : isDone
                  ? 'bg-amber-50 text-amber-800 border border-amber-300'
                  : 'bg-gray-100 text-gray-400 border border-gray-200'
              } ${s.id !== 'upload' && !sampleFile ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < EXTRACT_STEPS.length - 1 && (
              <ArrowRight className={`w-3 h-3 shrink-0 ${i < stepIndex ? 'text-amber-400' : 'text-gray-300'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-full bg-background">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg transition-opacity">
          {toast}
        </div>
      )}

      {/* 步骤导航 — sticky 顶部 */}
      <div className="bg-card border-b border-border/60 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3">
          {renderStepIndicator()}
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-6xl mx-auto px-4 py-6 pb-12">
        {step === 'upload' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Upload className="w-5 h-5 text-amber-600" />
                  上传样本
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  请上传一个Excel样本文件，用于配置提取规则。支持 .xlsx / .xls 格式。
                </p>
              </div>
              {renderSampleUpload()}
              {sampleFile && (
                <div className="flex justify-end">
                  <Button onClick={() => setStep('config')} className="gap-1.5">
                    下一步：配置规则 <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'config' && sampleFile && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-amber-600" />
                  配置提取规则
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  在预览表中点击单元格设定锚点，或使用关键词定位行列交叉点，然后添加提取规则。
                </p>
              </div>
              {/* Sheet Tabs */}
              {renderSheetTabs()}

              {/* Main content: Preview + Config */}
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 min-w-0">{renderPreview()}</div>
                <div className="w-full lg:w-72 shrink-0 space-y-4">
                  {renderConfig()}
                  {renderRulesList()}
                </div>
              </div>

              <div className="flex justify-between pt-2 border-t border-border/60">
                <Button variant="outline" onClick={() => setStep('upload')} className="gap-1.5">
                  <ArrowRight className="w-4 h-4 rotate-180" /> 返回
                </Button>
                {rules.length > 0 && (
                  <Button onClick={() => setStep('batch')} className="gap-1.5">
                    下一步：批量提取 <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'batch' && sampleFile && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Download className="w-5 h-5 text-amber-600" />
                  批量处理
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  上传待处理的Excel文件，系统将按已配置的规则批量提取数据。
                </p>
              </div>
              {renderBatchSection()}
              {renderResults()}
              <div className="flex justify-start pt-2 border-t border-border/60">
                <Button variant="outline" onClick={() => setStep('config')} className="gap-1.5">
                  <ArrowRight className="w-4 h-4 rotate-180" /> 返回
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
