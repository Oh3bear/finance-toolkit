import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertCircle, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { BankAmountMode, ColumnConfig } from '../engine/bankReconciliation';
import { formatDateCell } from '../utils/dateUtils';

interface Props {
  type: 'bank' | 'enterprise';
  onConfirm: (data: { rows: any[][]; config: ColumnConfig; fileName: string }) => void;
}

type StepState = 'upload' | 'config' | 'done';

function colLabel(i: number): string {
  let s = '';
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  }
  return s;
}

/** 统一日期格式化 — 委托给 dateUtils.formatDateCell */
function formatCell(v: unknown): string {
  return formatDateCell(v);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * 银行流水 / 企业账 上传步骤组件
 * 共用组件，通过 type prop 区分两种模式
 */
export default function BankUploadStep({ type, onConfirm }: Props) {
  const [state, setState] = useState<StepState>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<any[][]>([]);
  const [error, setError] = useState('');
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 列配置
  const [accountCol, setAccountCol] = useState<number | null>(null);
  const [dateCol, setDateCol] = useState<number | null>(null);
  const [amount1Col, setAmount1Col] = useState<number | null>(null); // 银行:收入/金额 / 企业:借方
  const [amount2Col, setAmount2Col] = useState<number | null>(null); // 银行:支出 / 企业:贷方

  // 银行流水专用：单列模式
  const [bankAmountMode, setBankAmountMode] = useState<BankAmountMode>('split');
  const [directionCol, setDirectionCol] = useState<number | null>(null);
  const [drValue, setDrValue] = useState<string>('DR');

  const isBank = type === 'bank';
  const title = isBank ? '银行流水明细账' : '企业银行明细账';
  const isCombined = isBank && bankAmountMode === 'combined';
  const amount1Label = isBank ? (isCombined ? '金额列' : '收入列') : '借方列';
  const amount2Label = isBank ? '支出列' : '贷方列';

  const headers = rows.length > 0 ? rows[0] : [];
  const previewRows = rows.slice(1, 21); // 前 20 行预览

  const selectedCols = new Set([
    accountCol,
    dateCol,
    amount1Col,
    ...(isCombined ? [directionCol] : [amount2Col]),
  ].filter((c): c is number => c !== null));

  const canConfirm =
    accountCol !== null &&
    dateCol !== null &&
    amount1Col !== null &&
    (isCombined ? directionCol !== null : amount2Col !== null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('仅支持 .xlsx 或 .xls 格式');
      return;
    }
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        setRows(data);
        setState('config');
      } catch {
        setError('文件解析失败，请确认文件格式正确');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      rows,
      config: {
        accountCol: accountCol!,
        dateCol: dateCol!,
        amount1Col: amount1Col!,
        amount2Col: amount2Col ?? -1,
        ...(isBank && {
          bankAmountMode,
          ...(isCombined && {
            directionCol: directionCol!,
            drValue: drValue.trim() || 'DR',
          }),
        }),
      },
      fileName,
    });
    setState('done');
  };

  const handleReset = () => {
    setState('upload');
    setFileName('');
    setRows([]);
    setAccountCol(null);
    setDateCol(null);
    setAmount1Col(null);
    setAmount2Col(null);
    setBankAmountMode('split');
    setDirectionCol(null);
    setDrValue('DR');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-foreground">
        {state === 'upload' && `上传${title}`}
        {state === 'config' && `配置${title}列`}
        {state === 'done' && `${title}已配置`}
      </h2>

      {/* 上传区域 */}
      {state === 'upload' && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragover
              ? 'border-primary/50 bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-background'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-float" />
          <p className="text-muted-foreground mb-2">拖拽或点击上传 {title} Excel 文件</p>
          <p className="text-muted-foreground text-sm">支持 .xlsx / .xls 格式</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFile(e.target.files[0]);
            }}
          />
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 列配置区域 */}
      {state === 'config' && (
        <>
          {/* 文件信息 */}
          <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <span className="font-medium text-primary/80">{fileName}</span>
            <span className="text-primary/70 text-sm">
              {formatSize(JSON.stringify(rows).length)} · {rows.length - 1} 行数据 · {headers.length} 列
            </span>
            <button
              onClick={handleReset}
              className="ml-auto text-primary hover:text-primary/80 text-sm underline"
            >
              重新上传
            </button>
          </div>

          {/* 列选择 */}
          <div className="p-5 bg-card border rounded-xl shadow-sm space-y-4">
            {/* 银行流水专属：金额格式切换 */}
            {isBank && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">金额列格式</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bankAmountMode"
                      value="split"
                      checked={bankAmountMode === 'split'}
                      onChange={() => setBankAmountMode('split')}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">双列（独立收入列 + 支出列）</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bankAmountMode"
                      value="combined"
                      checked={bankAmountMode === 'combined'}
                      onChange={() => setBankAmountMode('combined')}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">单列（金额列 + DR/CR 方向列）</span>
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">账号列</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-card focus:ring-2 focus:ring-primary focus:border-primary/60"
                  value={accountCol ?? ''}
                  onChange={(e) => setAccountCol(e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">请选择</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {colLabel(i)}列: {String(h || '(空)')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">日期列</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-card focus:ring-2 focus:ring-primary focus:border-primary/60"
                  value={dateCol ?? ''}
                  onChange={(e) => setDateCol(e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">请选择</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {colLabel(i)}列: {String(h || '(空)')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${isBank ? 'bg-primary/50' : 'bg-primary/50'} mr-1`} />
                  {amount1Label}
                </label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-card focus:ring-2 focus:ring-primary focus:border-primary/60"
                  value={amount1Col ?? ''}
                  onChange={(e) => setAmount1Col(e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">请选择</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {colLabel(i)}列: {String(h || '(空)')}
                    </option>
                  ))}
                </select>
              </div>

              {/* combined 模式：方向列 + DR标识 */}
              {isCombined ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />
                      方向列（DR/CR）
                    </label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-card focus:ring-2 focus:ring-primary focus:border-primary/60"
                      value={directionCol ?? ''}
                      onChange={(e) => setDirectionCol(e.target.value === '' ? null : Number(e.target.value))}
                    >
                      <option value="">请选择</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {colLabel(i)}列: {String(h || '(空)')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      支出/扣账 标识符（默认 DR）
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={drValue}
                        onChange={(e) => setDrValue(e.target.value)}
                        placeholder="DR"
                        className="w-40 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary/60"
                      />
                      <span className="text-xs text-muted-foreground">其余值均视为收入（CR）</span>
                    </div>
                  </div>
                </>
              ) : (
                /* split 模式：独立支出列 */
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />
                    {amount2Label}
                  </label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-card focus:ring-2 focus:ring-primary focus:border-primary/60"
                    value={amount2Col ?? ''}
                    onChange={(e) => setAmount2Col(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">请选择</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {colLabel(i)}列: {String(h || '(空)')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* 数据预览 */}
          {headers.length > 0 && (
            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
              <div className="p-3 bg-background border-b text-sm font-medium text-muted-foreground">
                数据预览（前 20 行，共 {rows.length - 1} 行）
              </div>
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted">
                      <th className="border px-2 py-1.5 text-muted-foreground w-10">#</th>
                      {headers.slice(0, 26).map((h, i) => {
                        const isAmount1 = i === amount1Col;
                        const isAmount2 = i === amount2Col;
                        const isDirection = isCombined && i === directionCol;
                        let bg = 'bg-muted';
                        if (isAmount1) bg = 'bg-primary/10';
                        else if (isDirection) bg = 'bg-orange-100';
                        else if (isAmount2) bg = 'bg-red-100';
                        else if (selectedCols.has(i)) bg = 'bg-primary/10';
                        return (
                          <th
                            key={i}
                            className={`border px-2 py-1.5 text-muted-foreground font-medium whitespace-nowrap ${bg}`}
                          >
                            <span className="text-muted-foreground mr-1">{colLabel(i)}</span>
                            {String(h || '')}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-background">
                        <td className="border px-2 py-1 text-muted-foreground text-center">{ri + 1}</td>
                        {headers.slice(0, 26).map((_, ci) => {
                          const isAmount1 = ci === amount1Col;
                          const isAmount2 = ci === amount2Col;
                          const isDirection = isCombined && ci === directionCol;
                          let bg = '';
                          if (isAmount1) bg = 'bg-primary/5';
                          else if (isDirection) bg = 'bg-orange-50';
                          else if (isAmount2) bg = 'bg-red-50';
                          else if (selectedCols.has(ci)) bg = 'bg-primary/5';
                          return (
                            <td
                              key={ci}
                              className={`border px-2 py-1 whitespace-nowrap ${bg}`}
                            >
                              {formatCell(row[ci])}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {headers.length > 26 && (
                <div className="p-2 text-center text-xs text-muted-foreground bg-background border-t">
                  仅显示前 26 列（共 {headers.length} 列）
                </div>
              )}
            </div>
          )}

          {/* 确认按钮 */}
          <div className="flex justify-end">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                canConfirm
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              确认，下一步
            </button>
          </div>
        </>
      )}

      {/* 已完成状态 */}
      {state === 'done' && (
        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <Check className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium text-primary/80">{title}已配置完成</p>
            <p className="text-primary text-sm">
              {fileName} · 账号列={colLabel(accountCol!)} · 日期列={colLabel(dateCol!)}
              {isBank && isCombined
                ? ` · 金额列=${colLabel(amount1Col!)} · 方向列=${directionCol != null ? colLabel(directionCol) : '?'} · DR标识="${drValue}"`
                : ` · ${amount1Label}=${colLabel(amount1Col!)} · ${amount2Label}=${amount2Col != null ? colLabel(amount2Col) : '?'}`
              }
            </p>
          </div>
          <button
            onClick={handleReset}
            className="ml-auto text-primary hover:text-primary/80 text-sm underline"
          >
            重新配置
          </button>
        </div>
      )}
    </div>
  );
}
