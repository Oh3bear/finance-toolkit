/**
 * 二维表逆透视 + 一维表核对引擎
 *
 * 流程：二维表 → 逆透视转为一维 → 与原始一维表基于键值匹配 → 标记差异 → 输出核对结果
 */

// ============ 类型定义 ============

/** 解析后的二维表原始数据 */
export interface PivotTableData {
  /** 表头行（列标识） */
  columnHeaders: string[];
  /** 数据行：{ 行标识: 行标识值, [列名]: 值 } */
  rows: Record<string, any>[];
  /** 所有列名 */
  allColumns: string[];
}

/** 解析后的一维表原始数据 */
export interface FlatTableData {
  headers: string[];
  rows: Record<string, any>[];
}

/** 逆透视后的一维行 */
export interface UnpivotedRow {
  rowKey: string;
  colKey: string;
  value: any;
  rowKeyRaw: Record<string, string>;
}

/** 核对结果单行 */
export interface ReconciliationRow {
  rowKey: string;
  colKey: string;
  pivotValue: number | null;
  flatValue: number | null;
  diff: number | null;
  status: '一致' | '不一致' | '仅在二维表' | '仅在一维表';
}

/** 核对统计 */
export interface ReconciliationStats {
  totalMatched: number;
  consistent: number;
  inconsistent: number;
  onlyInPivot: number;
  onlyInFlat: number;
}

/** 完整核对结果 */
export interface ReconciliationResult {
  details: ReconciliationRow[];
  stats: ReconciliationStats;
  pivotRowKeyColumns: string[];
  flatRowKeyColumns: string[];
  pivotColKeyColumn: string;
  flatColKeyColumn: string;
  pivotValueColumn: string;
  flatValueColumn: string;
}

// ============ 解析二维表 ============

/**
 * 从 Excel ArrayBuffer 解析二维交叉表
 * 假设第 1 行为表头，第 1 列为行标识，其余为列标识+数值
 */
export function parsePivotTable(file: ArrayBuffer, XLSX: any): PivotTableData {
  const workbook = XLSX.read(file, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

  if (jsonData.length < 2) {
    return { columnHeaders: [], rows: [], allColumns: [] };
  }

  // 第一行是表头
  const headerRow = jsonData[0];
  const columnHeaders = headerRow.slice(1).map((h: any) => String(h ?? '').trim());

  // 数据行
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    const rowObj: Record<string, any> = {};
    // 第一列是行标识
    rowObj['__rowKey__'] = String(row[0] ?? '').trim();
    for (let j = 1; j < row.length && j - 1 < columnHeaders.length; j++) {
      const colName = columnHeaders[j - 1];
      rowObj[colName] = row[j];
    }
    if (rowObj['__rowKey__']) {
      rows.push(rowObj);
    }
  }

  const allColumns = ['__rowKey__', ...columnHeaders];

  return { columnHeaders, rows, allColumns };
}

/**
 * 从 Excel ArrayBuffer 解析二维交叉表（支持用户指定行标识列和列标识范围）
 * @param file Excel 文件 ArrayBuffer
 * @param XLSX xlsx 库
 * @param rowKeyColIndex 行标识列索引（从 0 开始，即 Excel 列）
 * @param colKeyStartIndex 列标识起始列索引
 * @param colKeyEndIndex 列标识结束列索引（不包含），-1 表示到最后一列
 */
export function parsePivotTableAdvanced(
  file: ArrayBuffer,
  XLSX: any,
  rowKeyColIndices: number[],
  colKeyStartIndex: number,
  colKeyEndIndex: number
): { table: PivotTableData; rowKeyCols: string[] } {
  const workbook = XLSX.read(file, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

  if (jsonData.length < 2) {
    return { table: { columnHeaders: [], rows: [], allColumns: [] }, rowKeyCols: [] };
  }

  const headerRow = jsonData[0];

  // 行标识列名
  const rowKeyCols = rowKeyColIndices.map((i) => String(headerRow[i] ?? `列${i + 1}`).trim());
  const rowKeyColSet = new Set(rowKeyCols);

  // 列标识范围
  const endIdx = colKeyEndIndex === -1 ? headerRow.length : colKeyEndIndex;
  const colKeyHeaders: string[] = [];
  for (let j = colKeyStartIndex; j < endIdx && j < headerRow.length; j++) {
    const h = String(headerRow[j] ?? '').trim();
    // 排除行标识列
    if (!rowKeyColSet.has(h) && !rowKeyColIndices.includes(j)) {
      colKeyHeaders.push(h);
    }
  }

  // 数据行
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    const rowObj: Record<string, any> = {};
    for (const idx of rowKeyColIndices) {
      const colName = rowKeyCols[rowKeyColIndices.indexOf(idx)];
      rowObj[colName] = String(row[idx] ?? '').trim();
    }
    for (let j = colKeyStartIndex; j < endIdx && j < row.length; j++) {
      const colName = String(headerRow[j] ?? '').trim();
      if (!rowKeyColSet.has(colName) && !rowKeyColIndices.includes(j)) {
        rowObj[colName] = row[j];
      }
    }
    // 检查是否所有行标识都有值
    const hasRowKey = rowKeyCols.some((c) => rowObj[c]);
    if (hasRowKey) {
      rows.push(rowObj);
    }
  }

  const allColumns = [...rowKeyCols, ...colKeyHeaders];

  return {
    table: { columnHeaders: colKeyHeaders, rows, allColumns },
    rowKeyCols,
  };
}

// ============ 解析一维表 ============

/**
 * 从 Excel ArrayBuffer 解析一维流水表
 */
export function parseFlatTable(file: ArrayBuffer, XLSX: any): FlatTableData {
  const workbook = XLSX.read(file, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

  if (jsonData.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = (jsonData[0] as any[]).map((h) => String(h ?? '').trim());
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    const rowObj: Record<string, any> = {};
    for (let j = 0; j < headers.length && j < row.length; j++) {
      rowObj[headers[j]] = row[j];
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}

// ============ 逆透视 ============

/**
 * 将二维表逆透视为一维表
 * @param table 二维表数据
 * @param rowKeyCols 行标识列名数组（支持多列联合）
 * @param colKeyHeaders 列标识头列表（哪些列头是列标识）
 * @returns 一维行数组
 */
export function unpivot(
  table: PivotTableData,
  rowKeyCols: string[],
  colKeyHeaders: string[]
): UnpivotedRow[] {
  const result: UnpivotedRow[] = [];

  for (const row of table.rows) {
    // 构建行标识组合键
    const rowKeyParts = rowKeyCols.map((c) => normalizeKey(row[c]));
    const rowKey = rowKeyParts.join('|');

    const rowKeyRaw: Record<string, string> = {};
    for (const c of rowKeyCols) {
      rowKeyRaw[c] = normalizeKey(row[c]);
    }

    for (const colHeader of colKeyHeaders) {
      const value = row[colHeader];
      if (value === undefined || value === null) continue;

      result.push({
        rowKey,
        colKey: normalizeKey(colHeader),
        value,
        rowKeyRaw: { ...rowKeyRaw },
      });
    }
  }

  return result;
}

// ============ 标准化 ============

/** 标准化键值（转字符串 + 去空格） */
export function normalizeKey(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** 标准化数值 */
export function normalizeValue(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const s = String(value).trim();
  if (s === '' || s === '-' || s === '—' || s === 'NA' || s === 'N/A') return null;
  // 移除千位分隔符
  const cleaned = s.replace(/[,，]/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

// ============ 核对 ============

/**
 * 执行核对：全外连接 + 差异计算
 */
export function reconcile(
  unpivotedRows: UnpivotedRow[],
  flatTable: FlatTableData,
  flatRowKeyCols: string[],
  flatColKeyCol: string,
  flatValueCol: string,
  tolerance: number = 0.001
): ReconciliationResult {
  // 构建二维表映射: "rowKey|colKey" → value
  const pivotMap = new Map<string, number | null>();
  const pivotKeys = new Set<string>();
  for (const row of unpivotedRows) {
    const key = `${row.rowKey}|||${row.colKey}`;
    pivotMap.set(key, normalizeValue(row.value));
    pivotKeys.add(key);
  }

  // 构建一维表映射
  const flatMap = new Map<string, number | null>();
  const flatKeys = new Set<string>();
  for (const row of flatTable.rows) {
    const rowKeyParts = flatRowKeyCols.map((c) => normalizeKey(row[c]));
    const rowKey = rowKeyParts.join('|');
    const colKey = normalizeKey(row[flatColKeyCol]);
    const key = `${rowKey}|||${colKey}`;
    const val = normalizeValue(row[flatValueCol]);
    flatMap.set(key, val);
    flatKeys.add(key);
  }

  // 全外连接
  const allKeys = new Set([...pivotKeys, ...flatKeys]);
  const details: ReconciliationRow[] = [];

  for (const key of allKeys) {
    const [rowKey, colKey] = key.split('|||');
    const pivotVal = pivotMap.get(key) ?? null;
    const flatVal = flatMap.get(key) ?? null;

    let status: ReconciliationRow['status'];
    let diff: number | null = null;

    if (pivotVal !== null && flatVal !== null) {
      diff = pivotVal - flatVal;
      status = Math.abs(diff) <= tolerance ? '一致' : '不一致';
    } else if (pivotVal !== null) {
      status = '仅在二维表';
    } else {
      status = '仅在一维表';
    }

    details.push({
      rowKey,
      colKey,
      pivotValue: pivotVal,
      flatValue: flatVal,
      diff,
      status,
    });
  }

  // 排序：先按状态（不一致排前面），再按行标识、列标识
  details.sort((a, b) => {
    const statusOrder: Record<string, number> = { '不一致': 0, '仅在二维表': 1, '仅在一维表': 2, '一致': 3 };
    const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (so !== 0) return so;
    const rk = a.rowKey.localeCompare(b.rowKey);
    if (rk !== 0) return rk;
    return a.colKey.localeCompare(b.colKey);
  });

  // 统计
  const stats: ReconciliationStats = {
    totalMatched: details.filter((d) => d.status === '一致' || d.status === '不一致').length,
    consistent: details.filter((d) => d.status === '一致').length,
    inconsistent: details.filter((d) => d.status === '不一致').length,
    onlyInPivot: details.filter((d) => d.status === '仅在二维表').length,
    onlyInFlat: details.filter((d) => d.status === '仅在一维表').length,
  };

  return {
    details,
    stats,
    pivotRowKeyColumns: [],
    flatRowKeyColumns: flatRowKeyCols,
    pivotColKeyColumn: '',
    flatColKeyColumn: flatColKeyCol,
    pivotValueColumn: '',
    flatValueColumn: flatValueCol,
  };
}

// ============ 导出结果 ============

/**
 * 导出核对结果为 Excel ArrayBuffer
 */
export function exportReconciliationResult(
  result: ReconciliationResult,
  XLSX: any
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // 1. 汇总统计
  const summaryData = [
    ['核对结果汇总'],
    [],
    ['指标', '数值'],
    ['一致记录数', result.stats.consistent],
    ['不一致记录数', result.stats.inconsistent],
    ['仅在二维表', result.stats.onlyInPivot],
    ['仅在一维表', result.stats.onlyInFlat],
    ['两边都有记录数', result.stats.totalMatched],
    ['总记录数', result.details.length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, '汇总统计');

  // 2. 核对明细
  const detailData = result.details.map((d) => ({
    行标识: d.rowKey,
    列标识: d.colKey,
    二维表值: d.pivotValue,
    一维表值: d.flatValue,
    差异: d.diff,
    核对状态: d.status,
  }));
  const wsDetail = XLSX.utils.json_to_sheet(detailData);
  XLSX.utils.book_append_sheet(wb, wsDetail, '核对明细');

  // 3. 仅不一致项
  const inconsistentData = detailData.filter((d) => d['核对状态'] !== '一致');
  if (inconsistentData.length > 0) {
    const wsDiff = XLSX.utils.json_to_sheet(inconsistentData);
    XLSX.utils.book_append_sheet(wb, wsDiff, '差异项');
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}
