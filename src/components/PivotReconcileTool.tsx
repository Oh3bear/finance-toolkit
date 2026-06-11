import { useState, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Play,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ArrowUpDown,
  Table2,
  Table,
  RotateCw,
  Trash2,
} from 'lucide-react';
import {
  parseFlatTable,
  unpivot,
  reconcile,
  normalizeValue,
  exportReconciliationResult,
} from '@/engine/pivotReconciliation';
import type {
  PivotTableData,
  FlatTableData,
  ReconciliationResult,
  ReconciliationRow,
  ReconciliationStats,
} from '@/engine/pivotReconciliation';
import { formatSize } from '@/utils/shared';

// ============ 辅助组件 ============

/** 文件拖拽上传区 */
function DropZone({
  file,
  onFile,
  accept,
  label,
  hint,
}: {
  file: File | null;
  onFile: (f: File) => void;
  accept: string;
  label: string;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  if (file) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 bg-amber-50/60 border border-amber-200 rounded-xl dark:bg-amber-950/20 dark:border-amber-800/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => {
            onFile(null as any);
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${
        dragging
          ? 'border-primary/50 bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-primary/5'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-float" />
      <p className="text-base text-foreground font-medium">{label}</p>
      <p className="text-sm text-muted-foreground mt-2">{hint}</p>
    </div>
  );
}

/** 统计摘要卡片 */
function StatsCard({ stats }: { stats: ReconciliationStats }) {
  const items = [
    { label: '一致', value: stats.consistent, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
    { label: '不一致', value: stats.inconsistent, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40' },
    { label: '仅二维表', value: stats.onlyInPivot, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' },
    { label: '仅一维表', value: stats.onlyInFlat, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className={`${item.bg} rounded-xl p-3 text-center`}>
          <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

/** 状态标签 */
function StatusBadge({ status }: { status: ReconciliationRow['status'] }) {
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    '一致': { color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> },
    '不一致': { color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800', icon: <XCircle className="w-3 h-3" /> },
    '仅在二维表': { color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800', icon: <AlertTriangle className="w-3 h-3" /> },
    '仅在一维表': { color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800', icon: <Info className="w-3 h-3" /> },
  };
  const c = config[status] || config['一致'];
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs font-normal ${c.color}`}>
      {c.icon}
      {status}
    </Badge>
  );
}

// ============ 主组件 ============

type Step = 'upload-pivot' | 'config-pivot' | 'upload-flat' | 'config-flat' | 'reconcile' | 'result';

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: 'upload-pivot', label: '上传二维表', icon: <Table2 className="w-4 h-4" /> },
  { id: 'config-pivot', label: '配置二维表', icon: <ArrowUpDown className="w-4 h-4" /> },
  { id: 'upload-flat', label: '上传一维表(可选)', icon: <Table className="w-4 h-4" /> },
  { id: 'config-flat', label: '配置一维表', icon: <ArrowUpDown className="w-4 h-4" /> },
  { id: 'reconcile', label: '执行核对', icon: <Play className="w-4 h-4" /> },
  { id: 'result', label: '核对结果', icon: <CheckCircle2 className="w-4 h-4" /> },
];

export default function PivotReconcileTool() {
  const [step, setStep] = useState<Step>('upload-pivot');

  // 二维表状态
  const [pivotFile, setPivotFile] = useState<File | null>(null);
  const [pivotTable, setPivotTable] = useState<PivotTableData | null>(null);
  const [pivotRawData, setPivotRawData] = useState<any[][] | null>(null);
  const [pivotRowKeyIndices, setPivotRowKeyIndices] = useState<number[]>([0]);
  const [pivotColStartIdx, setPivotColStartIdx] = useState(1);
  const [pivotColEndIdx, setPivotColEndIdx] = useState(-1);
  const [pivotRowKeyCols, setPivotRowKeyCols] = useState<string[]>([]);

  // 一维表状态
  const [flatFile, setFlatFile] = useState<File | null>(null);
  const [flatTable, setFlatTable] = useState<FlatTableData | null>(null);
  const [flatRowKeyIndices, setFlatRowKeyIndices] = useState<number[]>([0]);
  const [flatColKeyIndex, setFlatColKeyIndex] = useState<number>(1);
  const [flatValueIndex, setFlatValueIndex] = useState<number>(2);

  // 跳过一维表（仅做逆透视）
  const [skipFlat, setSkipFlat] = useState(false);

  // 核对结果
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // 错误
  const [error, setError] = useState('');

  // ============ 解析二维表 ============
  const handlePivotFile = useCallback(async (file: File) => {
    setPivotFile(file);
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        setError('文件格式不正确，至少需要表头行和一行数据');
        return;
      }

      setPivotRawData(jsonData);

      // 默认：第 1 列为行标识，其余为列标识+值
      const headerRow = jsonData[0] as any[];
      const colHeaders = headerRow.slice(1).map((h: any) => String(h ?? '').trim());

      const rows: Record<string, any>[] = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        const rowObj: Record<string, any> = {};
        rowObj['__rowKey__'] = String(row[0] ?? '').trim();
        for (let j = 1; j < row.length && j - 1 < colHeaders.length; j++) {
          rowObj[colHeaders[j - 1]] = row[j];
        }
        if (rowObj['__rowKey__']) rows.push(rowObj);
      }

      setPivotTable({
        columnHeaders: colHeaders,
        rows,
        allColumns: ['__rowKey__', ...colHeaders],
      });

      setPivotRowKeyIndices([0]);
      setPivotColStartIdx(1);
      setPivotColEndIdx(-1);
      setStep('config-pivot');
    } catch (e: any) {
      setError(`解析文件失败: ${e.message}`);
    }
  }, []);

  // ============ 确认二维表配置 ============
  const confirmPivotConfig = useCallback(() => {
    if (!pivotFile || !pivotRawData) return;
    setError('');

    const headerRow = pivotRawData[0] as any[];

    // 行标识列名
    const rowKeyCols = pivotRowKeyIndices.map((i) =>
      String(headerRow[i] ?? `列${i + 1}`).trim()
    );
    setPivotRowKeyCols(rowKeyCols);

    // 重新解析
    const endIdx = pivotColEndIdx === -1 ? headerRow.length : pivotColEndIdx;
    const colKeyHeaders: string[] = [];
    const rowKeySet = new Set(pivotRowKeyIndices);
    for (let j = pivotColStartIdx; j < endIdx && j < headerRow.length; j++) {
      if (!rowKeySet.has(j)) {
        colKeyHeaders.push(String(headerRow[j] ?? '').trim());
      }
    }

    const rows: Record<string, any>[] = [];
    for (let i = 1; i < pivotRawData.length; i++) {
      const row = pivotRawData[i];
      if (!row || row.length === 0) continue;
      const rowObj: Record<string, any> = {};
      for (const idx of pivotRowKeyIndices) {
        rowObj[rowKeyCols[pivotRowKeyIndices.indexOf(idx)]] = String(row[idx] ?? '').trim();
      }
      for (let j = pivotColStartIdx; j < endIdx && j < row.length; j++) {
        if (!rowKeySet.has(j)) {
          rowObj[String(headerRow[j] ?? '').trim()] = row[j];
        }
      }
      if (rowKeyCols.some((c) => rowObj[c])) {
        rows.push(rowObj);
      }
    }

    setPivotTable({
      columnHeaders: colKeyHeaders,
      rows,
      allColumns: [...rowKeyCols, ...colKeyHeaders],
    });

    setStep('upload-flat');
  }, [pivotFile, pivotRawData, pivotRowKeyIndices, pivotColStartIdx, pivotColEndIdx]);

  // ============ 跳过一维表（仅逆透视） ============
  const handleSkipFlat = useCallback(() => {
    setSkipFlat(true);
    setFlatFile(null);
    setFlatTable(null);
    setStep('reconcile');
  }, []);

  // ============ 解析一维表 ============
  const handleFlatFile = useCallback(async (file: File) => {
    setFlatFile(file);
    setSkipFlat(false);
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      const data = parseFlatTable(buffer, XLSX);
      if (data.headers.length === 0) {
        setError('一维表格式不正确');
        return;
      }
      setFlatTable(data);

      // 默认：第 1 列为行标识，第 2 列为列标识，第 3 列为值
      setFlatRowKeyIndices([0]);
      setFlatColKeyIndex(Math.min(1, data.headers.length - 2));
      setFlatValueIndex(Math.min(2, data.headers.length - 1));

      setStep('config-flat');
    } catch (e: any) {
      setError(`解析一维表失败: ${e.message}`);
    }
  }, []);

  // ============ 确认一维表配置 ============
  const confirmFlatConfig = useCallback(() => {
    setStep('reconcile');
  }, []);

  // ============ 执行核对 ============
  const executeReconcile = useCallback(() => {
    if (!pivotTable) return;
    setError('');

    // 逆透视二维表
    const unpivotedRows = unpivot(pivotTable, pivotRowKeyCols, pivotTable.columnHeaders);

    if (skipFlat || !flatTable) {
      // 仅逆透视，不核对
      const details: ReconciliationRow[] = unpivotedRows.map((r) => ({
        rowKey: r.rowKey,
        colKey: r.colKey,
        pivotValue: normalizeValue(r.value),
        flatValue: null,
        diff: null,
        status: '仅在二维表' as const,
      }));

      setResult({
        details,
        stats: {
          totalMatched: 0,
          consistent: 0,
          inconsistent: 0,
          onlyInPivot: details.length,
          onlyInFlat: 0,
        },
        pivotRowKeyColumns: pivotRowKeyCols,
        flatRowKeyColumns: [],
        pivotColKeyColumn: '',
        flatColKeyColumn: '',
        pivotValueColumn: '',
        flatValueColumn: '',
      });
      setStep('result');
      return;
    }

    // 一维表的行标识列名
    const flatRowKeyCols = flatRowKeyIndices.map((i) => flatTable.headers[i]);
    const flatColKeyCol = flatTable.headers[flatColKeyIndex];
    const flatValueCol = flatTable.headers[flatValueIndex];

    const res = reconcile(
      unpivotedRows,
      flatTable,
      flatRowKeyCols,
      flatColKeyCol,
      flatValueCol
    );

    res.pivotRowKeyColumns = pivotRowKeyCols;
    res.pivotColKeyColumn = '列标识';
    res.pivotValueColumn = '值';
    res.flatRowKeyColumns = flatRowKeyCols;
    res.flatColKeyColumn = flatColKeyCol;
    res.flatValueColumn = flatValueCol;

    setResult(res);
    setStep('result');
  }, [pivotTable, pivotRowKeyCols, skipFlat, flatTable, flatRowKeyIndices, flatColKeyIndex, flatValueIndex]);

  // ============ 筛选结果 ============
  const filteredDetails = useMemo(() => {
    if (!result) return [];
    let list = result.details;
    if (filterStatus !== 'all') {
      list = list.filter((d) => d.status === filterStatus);
    }
    if (searchTerm.trim()) {
      const s = searchTerm.trim().toLowerCase();
      list = list.filter(
        (d) => d.rowKey.toLowerCase().includes(s) || d.colKey.toLowerCase().includes(s)
      );
    }
    return list;
  }, [result, filterStatus, searchTerm]);

  // ============ 导出结果 ============
  const handleExport = useCallback(() => {
    if (!result) return;
    const buffer = exportReconciliationResult(result, XLSX);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `逆透视核对结果_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  // ============ 仅导出逆透视结果 ============
  const handleExportUnpivot = useCallback(() => {
    if (!result) return;
    const wb = XLSX.utils.book_new();
    const data = result.details
      .filter((d) => d.status === '仅在二维表')
      .map((d) => ({
        行标识: d.rowKey,
        列标识: d.colKey,
        值: d.pivotValue,
      }));
    if (data.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, '逆透视结果');
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `逆透视结果_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [result]);

  // ============ 重置 ============
  const handleReset = useCallback(() => {
    setPivotFile(null);
    setPivotTable(null);
    setPivotRawData(null);
    setPivotRowKeyIndices([0]);
    setPivotColStartIdx(1);
    setPivotColEndIdx(-1);
    setPivotRowKeyCols([]);
    setFlatFile(null);
    setFlatTable(null);
    setFlatRowKeyIndices([0]);
    setFlatColKeyIndex(1);
    setFlatValueIndex(2);
    setSkipFlat(false);
    setResult(null);
    setFilterStatus('all');
    setSearchTerm('');
    setError('');
    setStep('upload-pivot');
  }, []);

  // ============ 渲染：步骤导航 ============
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex;
        return (
          <div key={s.id} className="flex items-center gap-1 shrink-0">
            <div
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/25 scale-[1.03]'
                  : isDone
                  ? 'bg-amber-50 text-amber-800 border border-amber-300'
                  : 'bg-gray-100 text-gray-400 border border-gray-200'
              }`}
            >
              {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight className={`w-3 h-3 shrink-0 ${i < stepIndex ? 'text-amber-400' : 'text-gray-300'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ============ 渲染：上传二维表 ============
  const renderUploadPivot = () => (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="w-5 h-5 text-amber-600" />
          上传二维交叉表
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          请上传 Excel 格式的二维交叉表文件。例如：行标题为"姓名"，列标题为"1月、2月…"，交叉处为数值。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <DropZone
          file={pivotFile}
          onFile={handlePivotFile}
          accept=".xlsx,.xls"
          label="拖拽或点击上传二维表"
          hint="支持 .xlsx / .xls 格式"
        />
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
        {pivotFile && (
          <div className="flex justify-end">
            <Button onClick={() => setStep('config-pivot')} className="gap-1.5">
              下一步：配置字段 <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ============ 渲染：配置二维表 ============
  const renderConfigPivot = () => {
    if (!pivotRawData) return null;
    const headerRow = pivotRawData[0] as any[];
    const totalCols = headerRow.length;

    const toggleRowKeyIndex = (idx: number) => {
      setPivotRowKeyIndices((prev) => {
        if (prev.includes(idx)) {
          if (prev.length <= 1) return prev; // 至少保留一个
          return prev.filter((i) => i !== idx);
        }
        return [...prev, idx].sort((a, b) => a - b);
      });
    };

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">配置二维表字段映射</CardTitle>
            <p className="text-sm text-muted-foreground">
              指定哪些列是"行标识"（如姓名），哪些是"列标识"（如月份）和"值"区域。
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 行标识列选择 */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                行标识列（可多选，如"姓名+部门"联合标识）
              </Label>
              <div className="flex flex-wrap gap-2">
                {headerRow.map((h: any, i: number) => {
                  const isSelected = pivotRowKeyIndices.includes(i);
                  const isInColRange = !isSelected && i >= pivotColStartIdx && (pivotColEndIdx === -1 || i < pivotColEndIdx);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleRowKeyIndex(i)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-300'
                          : isInColRange
                          ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-amber-200'
                      }`}
                    >
                      列{i + 1}: {String(h ?? '').trim() || `(空)`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 列标识范围 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">列标识起始列</Label>
                <Input
                  type="number"
                  min={1}
                  max={totalCols}
                  value={pivotColStartIdx + 1}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) - 1;
                    if (!isNaN(v) && v >= 0 && v < totalCols && !pivotRowKeyIndices.includes(v)) {
                      setPivotColStartIdx(v);
                    }
                  }}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  表头: {String(headerRow[pivotColStartIdx] ?? '').trim() || '(空)'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">
                  列标识结束列 <span className="text-muted-foreground font-normal">(-1=到末尾)</span>
                </Label>
                <Input
                  type="number"
                  min={-1}
                  max={totalCols}
                  value={pivotColEndIdx === -1 ? -1 : pivotColEndIdx}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= -1 && v <= totalCols) {
                      setPivotColEndIdx(v === -1 ? -1 : v);
                    }
                  }}
                  className="h-9"
                />
              </div>
            </div>

            {/* 预览 */}
            {pivotTable && (
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  数据预览（前 5 行）
                </Label>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        {pivotTable.allColumns.slice(0, 10).map((col, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-r last:border-r-0">
                            {col}
                          </th>
                        ))}
                        {pivotTable.allColumns.length > 10 && (
                          <th className="px-3 py-2 text-left text-muted-foreground">+{pivotTable.allColumns.length - 10}列</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pivotTable.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          {pivotTable.allColumns.slice(0, 10).map((col, j) => (
                            <td key={j} className="px-3 py-1.5 whitespace-nowrap border-r last:border-r-0">
                              {String(row[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload-pivot')} className="gap-1.5">
                <ArrowRight className="w-4 h-4 rotate-180" /> 返回
              </Button>
              <Button onClick={confirmPivotConfig} className="gap-1.5">
                确认配置，下一步 <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============ 渲染：上传一维表 ============
  const renderUploadFlat = () => (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Table className="w-5 h-5 text-blue-500" />
          上传一维流水表（可选）
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          如需核对，请上传一维流水表。列包括"行标识"（如姓名）、"列标识"（如月份）、"值"（如销售额）。
          如果仅需要将二维表逆透视为一维表，可跳过此步骤。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <DropZone
          file={flatFile}
          onFile={handleFlatFile}
          accept=".xlsx,.xls"
          label="拖拽或点击上传一维表"
          hint="支持 .xlsx / .xls 格式"
        />
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => setStep('config-pivot')} className="gap-1.5">
            <ArrowRight className="w-4 h-4 rotate-180" /> 返回
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSkipFlat} className="gap-1.5">
              跳过，仅逆透视 <ArrowRight className="w-4 h-4" />
            </Button>
            {flatFile && (
              <Button onClick={() => setStep('config-flat')} className="gap-1.5">
                下一步：配置字段 <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ============ 渲染：配置一维表 ============
  const renderConfigFlat = () => {
    if (!flatTable) return null;

    const toggleFlatRowKey = (idx: number) => {
      setFlatRowKeyIndices((prev) => {
        if (prev.includes(idx)) {
          if (prev.length <= 1) return prev;
          return prev.filter((i) => i !== idx);
        }
        return [...prev, idx].sort((a, b) => a - b);
      });
    };

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">配置一维表字段映射</CardTitle>
            <p className="text-sm text-muted-foreground">
              指定一维表中哪些列对应"行标识"、"列标识"、"值"。
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 行标识列 */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                行标识列（可多选联合标识）
              </Label>
              <div className="flex flex-wrap gap-2">
                {flatTable.headers.map((h, i) => {
                  const isRowKey = flatRowKeyIndices.includes(i);
                  const isColKey = i === flatColKeyIndex;
                  const isValue = i === flatValueIndex;
                  return (
                    <button
                      key={i}
                      onClick={() => toggleFlatRowKey(i)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isRowKey
                          ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-300'
                          : isColKey
                          ? 'bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-400'
                          : isValue
                          ? 'bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-amber-200'
                      }`}
                    >
                      {h || `列${i + 1}`}
                      {isRowKey && <span className="ml-1 text-[10px]">(行标识)</span>}
                      {isColKey && <span className="ml-1 text-[10px]">(列标识)</span>}
                      {isValue && <span className="ml-1 text-[10px]">(值)</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 列标识列 */}
            <div>
              <Label className="text-sm font-medium mb-1.5 block">列标识列（如"月份"）</Label>
              <select
                value={flatColKeyIndex}
                onChange={(e) => setFlatColKeyIndex(parseInt(e.target.value))}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {flatTable.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `列${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 值列 */}
            <div>
              <Label className="text-sm font-medium mb-1.5 block">值列（如"销售额"）</Label>
              <select
                value={flatValueIndex}
                onChange={(e) => setFlatValueIndex(parseInt(e.target.value))}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {flatTable.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `列${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 预览 */}
            <div>
              <Label className="text-sm font-medium mb-2 block">数据预览（前 5 行）</Label>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      {flatTable.headers.map((h, i) => (
                        <th key={i} className={`px-3 py-2 text-left font-medium whitespace-nowrap border-r last:border-r-0 ${
                          flatRowKeyIndices.includes(i)
                            ? 'text-amber-600 dark:text-amber-400'
                            : i === flatColKeyIndex
                            ? 'text-purple-600 dark:text-purple-400'
                            : i === flatValueIndex
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-muted-foreground'
                        }`}>
                          {h || `列${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flatTable.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        {flatTable.headers.map((h, j) => (
                          <td key={j} className="px-3 py-1.5 whitespace-nowrap border-r last:border-r-0">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload-flat')} className="gap-1.5">
                <ArrowRight className="w-4 h-4 rotate-180" /> 返回
              </Button>
              <Button onClick={confirmFlatConfig} className="gap-1.5">
                确认配置，执行核对 <Play className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============ 渲染：核对确认页 ============
  const renderReconcile = () => (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCw className="w-5 h-5 text-amber-600" />
          执行逆透视{skipFlat ? '' : '与核对'}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {skipFlat
            ? '将二维交叉表逆透视转换为一维表格式。'
            : '将二维表逆透视后与一维表进行核对，匹配不一致项和缺失项。'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 配置摘要 */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-amber-600" />
            <span className="font-medium">二维表</span>
            <span className="text-muted-foreground">{pivotFile?.name}</span>
          </div>
          <div className="text-xs text-muted-foreground ml-6">
            行标识: {pivotRowKeyCols.join(' + ')} | 列标识: {pivotTable?.columnHeaders.length || 0} 列
          </div>
          {!skipFlat && flatFile && (
            <>
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-blue-500" />
                <span className="font-medium">一维表</span>
                <span className="text-muted-foreground">{flatFile.name}</span>
              </div>
              <div className="text-xs text-muted-foreground ml-6">
                行标识: {flatRowKeyIndices.map((i) => flatTable?.headers[i]).join(' + ')} |
                列标识: {flatTable?.headers[flatColKeyIndex]} |
                值: {flatTable?.headers[flatValueIndex]}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(skipFlat ? 'upload-flat' : 'config-flat')} className="gap-1.5">
            <ArrowRight className="w-4 h-4 rotate-180" /> 返回
          </Button>
          <Button onClick={executeReconcile} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
            <Play className="w-4 h-4" /> 开始{skipFlat ? '转换' : '核对'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // ============ 渲染：结果页 ============
  const renderResult = () => {
    if (!result) return null;

    const statusCounts: Record<string, number> = {
      all: result.details.length,
      '一致': result.stats.consistent,
      '不一致': result.stats.inconsistent,
      '仅在二维表': result.stats.onlyInPivot,
      '仅在一维表': result.stats.onlyInFlat,
    };

    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* 统计摘要 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-amber-600" />
              核对结果摘要
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatsCard stats={result.stats} />
          </CardContent>
        </Card>

        {/* 明细表 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">核对明细</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> 导出全部
                </Button>
                {skipFlat && result.stats.onlyInPivot > 0 && (
                  <Button variant="outline" size="sm" onClick={handleExportUnpivot} className="gap-1.5">
                    <Download className="w-3.5 h-3.5" /> 导出逆透视
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 筛选栏 */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      filterStatus === status
                        ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-300'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-amber-200'
                    }`}
                  >
                    {status === 'all' ? '全部' : status} ({count})
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[150px]">
                <Input
                  placeholder="搜索行标识或列标识..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* 表格 */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">行标识</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">列标识</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">二维表值</th>
                    {!skipFlat && (
                      <>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">一维表值</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">差异</th>
                      </>
                    )}
                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetails.length === 0 ? (
                    <tr>
                      <td colSpan={skipFlat ? 4 : 6} className="px-4 py-8 text-center text-muted-foreground">
                        无匹配记录
                      </td>
                    </tr>
                  ) : (
                    filteredDetails.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t hover:bg-muted/30 transition-colors ${
                          row.status === '不一致' ? 'bg-red-50/50 dark:bg-red-950/10' : ''
                        }`}
                      >
                        <td className="px-4 py-2 whitespace-nowrap font-medium">{row.rowKey}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{row.colKey}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                          {row.pivotValue !== null ? row.pivotValue.toLocaleString() : '-'}
                        </td>
                        {!skipFlat && (
                          <>
                            <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                              {row.flatValue !== null ? row.flatValue.toLocaleString() : '-'}
                            </td>
                            <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums font-medium ${
                              row.diff !== null && row.diff !== 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                            }`}>
                              {row.diff !== null
                                ? (row.diff > 0 ? '+' : '') + row.diff.toLocaleString()
                                : '-'}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-2 text-center whitespace-nowrap">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 显示条数 */}
            <p className="text-xs text-muted-foreground">
              显示 {filteredDetails.length} / {result.details.length} 条记录
            </p>
          </CardContent>
        </Card>

        {/* 操作 */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={handleReset} className="gap-1.5">
            <RotateCw className="w-4 h-4" /> 重新开始
          </Button>
        </div>
      </div>
    );
  };

  // ============ 主渲染 ============
  return (
    <div className="min-h-full bg-background">
      {/* 步骤导航 — sticky 顶部 */}
      <div className="bg-card border-b border-border/60 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3">
          {renderStepIndicator()}
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-6xl mx-auto px-4 py-6 pb-12">
        {step === 'upload-pivot' && renderUploadPivot()}
        {step === 'config-pivot' && renderConfigPivot()}
        {step === 'upload-flat' && renderUploadFlat()}
        {step === 'config-flat' && renderConfigFlat()}
        {step === 'reconcile' && renderReconcile()}
        {step === 'result' && renderResult()}
      </main>
    </div>
  );
}
