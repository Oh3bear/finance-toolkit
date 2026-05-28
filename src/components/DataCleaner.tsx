import { useState, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Upload,
  FileSpreadsheet,
  X,
  Plus,
  Play,
  Columns3,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { formatDateCell as formatCellValue } from '../utils/dateUtils';
import { colLabel, formatSize } from '../utils/shared';

// ============ Clean Rules ============

type CleanOp =
  | 'trim'
  | 'upper'
  | 'lower'
  | 'capitalize'
  | 'extractNumber'
  | 'removeSymbols'
  | 'findReplace';

interface CleanRule {
  id: string;
  colIndex: number;
  colName: string;
  op: CleanOp;
  // findReplace params
  findStr: string;
  replaceStr: string;
  useRegex: boolean;
}

// Apply a single clean op to a cell value
function applyCleanOp(value: unknown, rule: CleanRule): string {
  let s = String(value ?? '');

  switch (rule.op) {
    case 'trim':
      return s.trim();

    case 'upper':
      return s.toUpperCase();

    case 'lower':
      return s.toLowerCase();

    case 'capitalize':
      return s.replace(/\b\w/g, c => c.toUpperCase());

    case 'extractNumber': {
      // Remove all non-digit/non-dot/non-minus, then parse
      const m = s.match(/[-+]?\d*\.?\d+/);
      return m ? m[0] : '';
    }

    case 'removeSymbols':
      // Remove currency symbols, commas, spaces around numbers
      return s.replace(/[¥$£€,\s]/g, '');

    case 'findReplace': {
      const find = rule.findStr;
      const repl = rule.replaceStr;
      if (!find) return s;
      try {
        if (rule.useRegex) {
          const re = new RegExp(find, 'g');
          return s.replace(re, repl);
        }
        return s.split(find).join(repl);
      } catch {
        return s; // invalid regex, return original
      }
    }

    default:
      return s;
  }
}

const OP_LABELS: Record<CleanOp, string> = {
  trim: '去除首尾空格',
  upper: '转大写',
  lower: '转小写',
  capitalize: '首字母大写',
  extractNumber: '提取数字',
  removeSymbols: '去除符号 (¥$,等)',
  findReplace: '查找替换',
};

// ============ Types ============

interface BatchFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

interface CleanResult {
  fileName: string;
  colLabel: string;
  colHeader: string;
  ruleName: string;
  changedCount: number;
  totalCount: number;
  status: 'success' | 'error';
  error?: string;
}

// ============ Component ============

export default function DataCleaner() {
  // --- Sample state ---
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleData, setSampleData] = useState<string[][]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [allSheets, setAllSheets] = useState<Map<string, string[][]>>(new Map());
  const sampleInputRef = useRef<HTMLInputElement>(null);

  // --- Column selection ---
  const [selectedCol, setSelectedCol] = useState<number | null>(null);

  // --- Rules ---
  const [rules, setRules] = useState<CleanRule[]>([]);
  const [currentOp, setCurrentOp] = useState<CleanOp>('trim');
  const [findStr, setFindStr] = useState('');
  const [replaceStr, setReplaceStr] = useState('');
  const [useRegex, setUseRegex] = useState(false);

  // --- Preview comparison ---
  const [showPreview, setShowPreview] = useState(false);
  const [previewCol, setPreviewCol] = useState<number | null>(null);

  // --- Batch state ---
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<CleanResult[]>([]);
  const [processing, setProcessing] = useState(false);

  // --- Toast ---
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  }, []);

  // --- Derived ---
  const maxCols = useMemo(() => Math.max(0, ...sampleData.map(r => r.length)), [sampleData]);
  const maxRows = sampleData.length;
  const previewRows = useMemo(() => sampleData.slice(0, 51), [sampleData]);

  const getColHeader = useCallback((ci: number): string => {
    if (sampleData.length === 0) return '';
    const h = sampleData[0]?.[ci];
    return h ? String(h) : colLabel(ci);
  }, [sampleData]);

  // --- Sample upload ---
  const handleSampleUpload = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const names = wb.SheetNames;
      const sheetsMap = new Map<string, string[][]>();

      for (const name of names) {
        const raw = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1 });
        const cleaned = raw.map(row =>
          Array.isArray(row) ? row.map(c => (c == null ? '' : formatCellValue(c))) : []
        );
        sheetsMap.set(name, cleaned);
      }

      setSampleFile(file);
      setAllSheets(sheetsMap);
      setSheetNames(names);
      setActiveSheet(names[0]);
      setSampleData(sheetsMap.get(names[0]) || []);
      setSelectedCol(null);
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

  // --- Sheet switch ---
  const handleSheetSwitch = useCallback((name: string) => {
    setActiveSheet(name);
    setSampleData(allSheets.get(name) || []);
    setSelectedCol(null);
  }, [allSheets]);

  // --- Add rule ---
  const handleAddRule = useCallback(() => {
    if (selectedCol == null) {
      showToast('请先点击列头选中一列');
      return;
    }
    if (currentOp === 'findReplace' && !findStr) {
      showToast('查找替换模式需要填写查找内容');
      return;
    }

    const newRule: CleanRule = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      colIndex: selectedCol,
      colName: getColHeader(selectedCol),
      op: currentOp,
      findStr,
      replaceStr,
      useRegex,
    };

    setRules(prev => [...prev, newRule]);

    // Reset find/replace fields
    if (currentOp === 'findReplace') {
      setFindStr('');
      setReplaceStr('');
    }

    showToast(`已添加规则: ${getColHeader(selectedCol)} → ${OP_LABELS[currentOp]}`);
  }, [selectedCol, currentOp, findStr, replaceStr, useRegex, getColHeader, showToast]);

  const handleDeleteRule = useCallback((id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  // --- Preview cleaned column ---
  const previewCleanedCol = useMemo(() => {
    if (previewCol == null) return [];
    const colRules = rules.filter(r => r.colIndex === previewCol);
    if (colRules.length === 0) return [];

    // Apply all rules on this column
    return sampleData.slice(1).map((row, ri) => {
      let val = String(row[previewCol] ?? '');
      for (const rule of colRules) {
        val = applyCleanOp(val, rule);
      }
      return {
        rowIdx: ri + 1,
        original: String(sampleData[ri + 1]?.[previewCol] ?? ''),
        cleaned: val,
        changed: val !== String(sampleData[ri + 1]?.[previewCol] ?? ''),
      };
    });
  }, [previewCol, rules, sampleData]);

  const changedCount = previewCleanedCol.filter(r => r.changed).length;

  // --- Batch process ---
  const handleProcessBatch = useCallback(async () => {
    if (rules.length === 0) { showToast('请先配置至少一条清洗规则'); return; }
    if (batchFiles.length === 0) { showToast('请先上传待处理文件'); return; }

    setProcessing(true);
    const allResults: CleanResult[] = [];

    for (const bf of batchFiles) {
      try {
        const buffer = await bf.file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

        // Determine target sheet
        const targetSheetName = wb.SheetNames.includes(activeSheet)
          ? activeSheet
          : wb.SheetNames[0];

        const ws = wb.Sheets[targetSheetName];
        const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
        const data: string[][] = raw.map(row =>
          Array.isArray(row) ? row.map(c => (c == null ? '' : String(c))) : []
        );

        // Group rules by column
        const rulesByCol = new Map<number, CleanRule[]>();
        for (const rule of rules) {
          if (!rulesByCol.has(rule.colIndex)) rulesByCol.set(rule.colIndex, []);
          rulesByCol.get(rule.colIndex)!.push(rule);
        }

        // Apply rules to data in memory
        for (const [colIdx, colRules] of rulesByCol) {
          let changed = 0;
          const total = data.length - 1; // exclude header

          for (let r = 1; r < data.length; r++) {
            let val = String(data[r]?.[colIdx] ?? '');
            const original = val;
            for (const rule of colRules) {
              val = applyCleanOp(val, rule);
            }
            if (!data[r]) data[r] = [];
            data[r][colIdx] = val;
            if (val !== original) changed++;
          }

          allResults.push({
            fileName: bf.name,
            colLabel: colLabel(colIdx),
            colHeader: data[0]?.[colIdx] ?? colLabel(colIdx),
            ruleName: colRules.map(r => OP_LABELS[r.op]).join(' + '),
            changedCount: changed,
            totalCount: total,
            status: 'success' as const,
          });
        }

        // Write back to workbook
        const newWs = XLSX.utils.aoa_to_sheet(data);
        wb.Sheets[targetSheetName] = newWs;

        // Generate output file
        const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = bf.name.replace(/\.xlsx?$/i, '_清洗后.xlsx');
        a.click();
        URL.revokeObjectURL(url);

      } catch {
        // Add error results for each rule
        for (const rule of rules) {
          allResults.push({
            fileName: bf.name,
            colLabel: colLabel(rule.colIndex),
            colHeader: rule.colName,
            ruleName: OP_LABELS[rule.op],
            changedCount: 0,
            totalCount: 0,
            status: 'error' as const,
            error: '文件处理失败',
          });
        }
      }
    }

    setResults(allResults);
    setProcessing(false);

    const successCount = allResults.filter(r => r.status === 'success').length;
    showToast(`处理完成: ${successCount}/${allResults.length} 条规则执行成功`);
  }, [rules, batchFiles, activeSheet, showToast]);

  // ============ Render ============

  const renderSampleUpload = () => (
    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
      onClick={() => sampleInputRef.current?.click()}
      onDrop={e => handleFileDrop(e, handleSampleUpload)}
      onDragOver={e => e.preventDefault()}
    >
      <Upload className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">拖拽或点击上传<strong className="text-blue-600">Excel 样本</strong></p>
      <p className="text-xs text-muted-foreground mt-1">支持 .xlsx / .xls 格式</p>
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
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">工作表:</span>
        {sheetNames.map(name => (
          <button
            key={name}
            onClick={() => handleSheetSwitch(name)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              name === activeSheet
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'bg-muted text-muted-foreground hover:bg-muted'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    );
  };

  const renderTable = () => {
    if (!sampleFile) return null;
    const displayCols = Math.min(maxCols, 26);

    return (
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="overflow-auto max-h-[420px]">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-muted border border-border px-2 py-1 w-10 min-w-10 text-center text-muted-foreground font-medium">#</th>
                {Array.from({ length: displayCols }).map((_, ci) => {
                  const isSelected = selectedCol === ci;
                  const hasRule = rules.some(r => r.colIndex === ci);
                  return (
                    <th
                      key={ci}
                      onClick={() => setSelectedCol(ci)}
                      className={`sticky top-0 z-10 border border-border px-2 py-1 min-w-[80px] max-w-[120px] text-center font-medium cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-500 text-white'
                          : hasRule
                          ? 'bg-green-50 text-green-700'
                          : 'bg-muted text-muted-foreground hover:bg-blue-100'
                      }`}
                      title="点击选中此列"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <Columns3 className="w-3 h-3" />
                        {colLabel(ci)}
                      </div>
                      <div className="text-[10px] font-normal truncate mt-0.5">
                        {getColHeader(ci) || '(空)'}
                      </div>
                      {hasRule && !isSelected && (
                        <Badge className="mt-0.5 h-4 text-[9px] px-1 bg-green-500 hover:bg-green-500">
                          {rules.filter(r => r.colIndex === ci).length}条规则
                        </Badge>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri}>
                  <td className="sticky left-0 z-10 bg-background border border-border px-2 py-1 text-center text-muted-foreground font-mono w-10 min-w-10">
                    {ri + 1}
                  </td>
                  {Array.from({ length: displayCols }).map((_, ci) => {
                    const isSelected = selectedCol === ci;
                    const cellValue = row[ci] ?? '';
                    const display = String(cellValue).length > 15
                      ? String(cellValue).slice(0, 15) + '…'
                      : cellValue;
                    return (
                      <td
                        key={ci}
                        className={`border border-border px-2 py-1 max-w-[120px] truncate ${
                          isSelected ? 'bg-blue-50' : ''
                        }`}
                        title={String(cellValue)}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(maxRows > 50 || maxCols > 26) && (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-background border-t border-border">
            仅显示前 50 行 × 26 列（共 {maxRows} 行 × {maxCols} 列）
          </div>
        )}
      </div>
    );
  };

  const renderRulePanel = () => {
    if (selectedCol == null) {
      return (
        <div className="text-center py-8 text-muted-foreground text-xs">
          ← 点击上方预览表的<strong>列头</strong>选中一列<br/>然后在此配置清洗规则
        </div>
      );
    }

    const colRules = rules.filter(r => r.colIndex === selectedCol);
    const headerName = getColHeader(selectedCol);

    return (
      <div className="space-y-3">
        {/* Selected column indicator */}
        <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
          <Columns3 className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-800">
            当前列: {colLabel(selectedCol)}
            {headerName && ` (${headerName})`}
          </span>
        </div>

        {/* Operation selector */}
        <div>
          <Label className="text-xs text-muted-foreground">选择清洗操作</Label>
          <div className="mt-1 space-y-1">
            {(Object.keys(OP_LABELS) as CleanOp[]).map(op => (
              <button
                key={op}
                onClick={() => setCurrentOp(op)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  currentOp === op
                    ? 'bg-blue-500 text-white font-medium'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {OP_LABELS[op]}
              </button>
            ))}
          </div>
        </div>

        {/* Find/Replace extra fields */}
        {currentOp === 'findReplace' && (
          <div className="space-y-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
            <div>
              <Label className="text-xs text-muted-foreground">查找内容</Label>
              <Input
                value={findStr}
                onChange={e => setFindStr(e.target.value)}
                placeholder="支持正则"
                className="h-7 text-xs mt-0.5"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">替换为</Label>
              <Input
                value={replaceStr}
                onChange={e => setReplaceStr(e.target.value)}
                placeholder="替换内容"
                className="h-7 text-xs mt-0.5"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={e => setUseRegex(e.target.checked)}
                className="rounded"
              />
              使用正则表达式
            </label>
          </div>
        )}

        {/* Add rule button */}
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={handleAddRule}
          disabled={currentOp === 'findReplace' && !findStr}
        >
          <Plus className="w-3 h-3 mr-1" />
          添加规则到当前列
        </Button>

        {/* Rules for this column */}
        {colRules.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">已添加规则</div>
            {colRules.map((rule, idx) => (
              <div key={rule.id} className="flex items-center gap-1.5 px-2 py-1 bg-card rounded border border-border text-xs">
                <span className="text-muted-foreground w-4 text-right">{idx + 1}.</span>
                <Badge variant="outline" className="text-[10px] h-5 px-1">
                  {OP_LABELS[rule.op]}
                </Badge>
                {rule.op === 'findReplace' && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    "{rule.findStr}"→"{rule.replaceStr}"
                  </span>
                )}
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="ml-auto text-muted-foreground hover:text-red-500 shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Preview button */}
            <Button
              size="sm"
              variant="outline"
              className="w-full h-6 text-[10px] mt-1"
              onClick={() => { setPreviewCol(selectedCol); setShowPreview(true); }}
            >
              预览清洗效果
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderAllRules = () => {
    if (rules.length === 0) return null;

    // Group by column
    const byCol = new Map<number, CleanRule[]>();
    for (const r of rules) {
      if (!byCol.has(r.colIndex)) byCol.set(r.colIndex, []);
      byCol.get(r.colIndex)!.push(r);
    }

    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          <Play className="w-3 h-3" />
          全部清洗规则 ({rules.length} 条)
        </div>
        {Array.from(byCol.entries()).map(([colIdx, colRules]) => (
          <div key={colIdx} className="px-2 py-1.5 bg-card rounded border border-border">
            <div className="text-xs font-medium text-foreground mb-1">
              {colLabel(colIdx)}列 {colRules[0].colName && `(${colRules[0].colName})`}
            </div>
            <div className="flex flex-wrap gap-1">
              {colRules.map(rule => (
                <Badge key={rule.id} variant="outline" className="text-[10px] h-5 px-1">
                  {OP_LABELS[rule.op]}
                  {rule.op === 'findReplace' && ` "${rule.findStr}"→"${rule.replaceStr}"`}
                  <button onClick={() => handleDeleteRule(rule.id)} className="ml-1 hover:text-red-500">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderPreviewModal = () => {
    if (!showPreview || previewCol == null) return null;

    const rows = previewCleanedCol;
    const display = rows.slice(0, 50);

    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setShowPreview(false)}>
        <div className="bg-card rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-sm font-bold text-foreground">
              清洗预览: {colLabel(previewCol)}列 ({getColHeader(previewCol)})
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs">
                {changedCount}/{rows.length} 行有变化
              </Badge>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-auto max-h-[60vh] p-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-background">
                  <th className="text-left px-3 py-2 border-b border-border w-12">行</th>
                  <th className="text-left px-3 py-2 border-b border-border">清洗前</th>
                  <th className="w-8 px-1 py-2 border-b border-border text-center"><ArrowRight className="w-3 h-3 inline" /></th>
                  <th className="text-left px-3 py-2 border-b border-border">清洗后</th>
                  <th className="w-12 px-3 py-2 border-b border-border text-center">状态</th>
                </tr>
              </thead>
              <tbody>
                {display.map((r, i) => (
                  <tr key={i} className={r.changed ? 'bg-yellow-50/50' : ''}>
                    <td className="px-3 py-1 text-muted-foreground font-mono">{r.rowIdx}</td>
                    <td className="px-3 py-1 text-muted-foreground max-w-[200px] truncate">{r.original || '(空)'}</td>
                    <td className="px-1 py-1 text-center text-muted-foreground/60"><ArrowRight className="w-3 h-3" /></td>
                    <td className={`px-3 py-1 max-w-[200px] truncate ${r.changed ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                      {r.cleaned || '(空)'}
                    </td>
                    <td className="px-3 py-1 text-center">
                      {r.changed
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
                        : <XCircle className="w-3.5 h-3.5 text-muted-foreground/60 mx-auto" />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <div className="text-center text-xs text-muted-foreground py-2">
                仅显示前 50 行（共 {rows.length} 行）
              </div>
            )}
          </div>
        </div>
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
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
          onClick={() => batchInputRef.current?.click()}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files) {
              const newFiles: BatchFile[] = Array.from(e.dataTransfer.files).map(f => ({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                file: f,
                name: f.name,
                size: f.size,
              }));
              setBatchFiles(prev => [...prev, ...newFiles]);
            }
          }}
          onDragOver={e => e.preventDefault()}
        >
          <Upload className="w-6 h-6 text-muted-foreground/60 mx-auto mb-1" />
          <p className="text-sm text-muted-foreground">上传待处理的 Excel 文件（支持多选）</p>
          <input
            ref={batchInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) {
                const newFiles: BatchFile[] = Array.from(e.target.files).map(f => ({
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  file: f,
                  name: f.name,
                  size: f.size,
                }));
                setBatchFiles(prev => [...prev, ...newFiles]);
              }
              e.target.value = '';
            }}
          />
        </div>

        {/* File list */}
        {batchFiles.length > 0 && (
          <div className="space-y-1 max-h-[150px] overflow-y-auto">
            {batchFiles.map(bf => (
              <div key={bf.id} className="flex items-center gap-2 px-3 py-1.5 bg-card rounded border border-border text-xs">
                <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-foreground">{bf.name}</span>
                <span className="text-muted-foreground shrink-0">{formatSize(bf.size)}</span>
                <button onClick={() => setBatchFiles(prev => prev.filter(f => f.id !== bf.id))} className="text-muted-foreground hover:text-red-500 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Process button */}
        {batchFiles.length > 0 && (
          <Button onClick={handleProcessBatch} className="h-8 text-xs" disabled={processing}>
            <Play className="w-3.5 h-3.5 mr-1" />
            {processing ? '处理中...' : `开始清洗 (${batchFiles.length} 个文件)`}
          </Button>
        )}
      </div>
    );
  };

  const renderResults = () => {
    if (results.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold text-foreground">
          处理结果
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            {results.filter(r => r.status === 'success').length}/{results.length} 成功
          </span>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="overflow-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-background">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b">文件名</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b">列</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b">规则</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground border-b">变更行数</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground border-b w-16">状态</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={r.status === 'error' ? 'bg-red-50/50' : 'hover:bg-background'}>
                    <td className="px-3 py-1.5 text-foreground max-w-[180px] truncate" title={r.fileName}>{r.fileName}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.colLabel} {r.colHeader && `(${r.colHeader})`}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.ruleName}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.status === 'success' ? `${r.changedCount}/${r.totalCount}` : '-'}</td>
                    <td className="px-3 py-1.5 text-center">
                      {r.status === 'success'
                        ? <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-green-600 border-green-300">成功</Badge>
                        : <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-red-600 border-red-300">失败</Badge>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground">
          每个文件会自动下载清洗后的版本（原文件不变）
        </div>
      </div>
    );
  };

  // ============ Main Render ============

  return (
    <div className="min-h-full bg-background">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Preview modal */}
      {renderPreviewModal()}

      {/* Sample upload or main content */}
      {!sampleFile ? (
        <div className="flex flex-col items-center justify-center py-20">
          {renderSampleUpload()}
          <div className="mt-6 grid grid-cols-3 gap-4 max-w-lg">
            <div className="text-center p-3 bg-card rounded-lg border border-border">
              <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-1 text-sm font-bold">1</div>
              <p className="text-xs text-muted-foreground">上传 Excel 样本</p>
            </div>
            <div className="text-center p-3 bg-card rounded-lg border border-border">
              <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-1 text-sm font-bold">2</div>
              <p className="text-xs text-muted-foreground">选中列 + 配置规则</p>
            </div>
            <div className="text-center p-3 bg-card rounded-lg border border-border">
              <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-1 text-sm font-bold">3</div>
              <p className="text-xs text-muted-foreground">批量清洗导出</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-6 pt-4 pb-8 space-y-4">
          {/* Sample file info */}
          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
            <FileSpreadsheet className="w-8 h-8 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{sampleFile.name}</div>
              <div className="text-xs text-muted-foreground">{formatSize(sampleFile.size)} · {sheetNames.length} 个工作表 · {maxRows} 行 × {maxCols} 列</div>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
              setSampleFile(null);
              setSampleData([]);
              setSelectedCol(null);
              setRules([]);
              setResults([]);
              setBatchFiles([]);
            }}>
              更换样本
            </Button>
          </div>

          {/* Sheet tabs */}
          {renderSheetTabs()}

          {/* Main: Table + Rule Panel */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Left: Table */}
            <div className="flex-1 min-w-0">
              {renderTable()}
            </div>

            {/* Right: Rule Panel */}
            <div className="w-full lg:w-64 shrink-0">
              <div className="bg-card rounded-lg border border-border p-3 space-y-3">
                <div className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Columns3 className="w-3.5 h-3.5" />
                  清洗规则配置
                </div>
                {renderRulePanel()}
              </div>

              {/* All rules summary */}
              {renderAllRules()}
            </div>
          </div>

          {/* Batch + Results */}
          {renderBatchSection()}
          {renderResults()}
        </div>
      )}
    </div>
  );
}
