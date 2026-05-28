import * as XLSX from 'xlsx';
import type { RawLedgerRow, SubjectMapping, EntityMapping } from '@/types';

// ==================== 解析明细账 ====================
function formatDateCell(v: any): string {
  if (v instanceof Date) {
    return toLocalDateStr(v);
  }
  if (typeof v === 'number') {
    // Excel serial date: convert to JS Date
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + v * 86400000);
    return toLocalDateStr(d);
  }
  return String(v || '');
}

/** Date → YYYY-MM-DD，使用本地时间避免 UTC 偏移 */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLedgerExcel(file: ArrayBuffer): RawLedgerRow[] {
  const workbook = XLSX.read(file, { type: 'array', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<any>(firstSheet, { header: 1 });

  if (jsonData.length < 2) return [];

  // 第一行是表头
  const headers: string[] = jsonData[0];
  const rows = jsonData.slice(1);

  // 查找列索引
  const getColIdx = (keywords: string[]): number => {
    for (const kw of keywords) {
      const idx = headers.findIndex((h) => h && String(h).trim() === kw);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const colIdx = {
    公司代码: getColIdx(['公司代码']),
    会计年度: getColIdx(['会计年度']),
    凭证编号: getColIdx(['凭证编号']),
    行项目: getColIdx(['行项目']),
    期间: getColIdx(['期间']),
    过帐日期: getColIdx(['过帐日期', '过账日期']),
    利润中心: getColIdx(['利润中心']),
    利润中心文本描述: getColIdx(['利润中心文本描述']),
    科目号: getColIdx(['科目号']),
    总账科目长文本: getColIdx(['总账科目长文本']),
    对方科目: getColIdx(['对方科目']),
    对方科目描述: getColIdx(['对方科目描述']),
    文本: getColIdx(['文本']),
    客户: getColIdx(['客户']),
    客户名称: getColIdx(['客户名称']),
    供应商: getColIdx(['供应商']),
    供应商名称: getColIdx(['供应商名称']),
    借方本位币金额: getColIdx(['借方本位币金额']),
    贷方本位币金额: getColIdx(['贷方本位币金额']),
    余额方向: getColIdx(['余额方向-本位币']),
    余额本币: getColIdx(['余额（本币）']),
    本位币: getColIdx(['本位币']),
    净发生: getColIdx(['净发生', '净发生额']),
  };

  // 安全取值
  const getVal = (row: any[], idx: number, defaultVal: any = null) => {
    if (idx < 0 || idx >= row.length) return defaultVal;
    return row[idx] ?? defaultVal;
  };

  const getNum = (row: any[], idx: number, defaultVal: number = 0) => {
    const v = getVal(row, idx, defaultVal);
    const n = Number(v);
    return isNaN(n) ? defaultVal : n;
  };

  return rows
    .filter((row) => row && row.length > 0)
    .map((row, index) => ({
      id: `raw_${index}`,
      公司代码: String(getVal(row, colIdx.公司代码, '')),
      会计年度: getNum(row, colIdx.会计年度, 0),
      凭证编号: String(getVal(row, colIdx.凭证编号, '')),
      行项目: getNum(row, colIdx.行项目, 0),
      期间: getNum(row, colIdx.期间, 0),
      过帐日期: formatDateCell(getVal(row, colIdx.过帐日期, '')),
      利润中心: String(getVal(row, colIdx.利润中心, '')),
      利润中心文本描述: String(getVal(row, colIdx.利润中心文本描述, '')),
      科目号: String(getVal(row, colIdx.科目号, '')),
      总账科目长文本: String(getVal(row, colIdx.总账科目长文本, '')),
      对方科目: String(getVal(row, colIdx.对方科目, '')),
      对方科目描述: String(getVal(row, colIdx.对方科目描述, '')),
      文本: String(getVal(row, colIdx.文本, '')),
      客户: getVal(row, colIdx.客户, null),
      客户名称: getVal(row, colIdx.客户名称, null),
      供应商: getVal(row, colIdx.供应商, null),
      供应商名称: getVal(row, colIdx.供应商名称, null),
      借方本位币金额: getNum(row, colIdx.借方本位币金额, 0),
      贷方本位币金额: getNum(row, colIdx.贷方本位币金额, 0),
      余额方向: String(getVal(row, colIdx.余额方向, '')),
      余额本币: getNum(row, colIdx.余额本币, 0),
      本位币: String(getVal(row, colIdx.本位币, '')),
      净发生: getNum(row, colIdx.净发生, 0),
    }));
}

// ==================== 解析映射表 ====================
// 支持两种格式：
// 1. 单Sheet（科目+客商在一个sheet中，用空行/标题行分割）
// 2. 双Sheet（科目映射 + 客商映射 两个独立sheet）
export function parseMappingExcel(file: ArrayBuffer): {
  subjects: SubjectMapping[];
  entities: EntityMapping[];
} {
  const workbook = XLSX.read(file, { type: 'array' });
  const subjects: SubjectMapping[] = [];
  const entities: EntityMapping[] = [];

  // 遍历所有sheet，按名称匹配
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
    if (jsonData.length < 2) continue;

    const lowerName = sheetName.toLowerCase();

    if (lowerName.includes('科目') || lowerName.includes('subject')) {
      // 解析科目映射 sheet
      for (const row of jsonData) {
        if (!row || row.length < 2) continue;
        const firstCol = String(row[0] || '').trim();
        if (firstCol === '' || firstCol === '科目' || firstCol === '科目编码') {
          continue;
        }
        if (firstCol && row[1]) {
          subjects.push({
            科目编码: String(firstCol).trim(),
            科目名称: String(row[1]).trim(),
          });
        }
      }
    } else if (lowerName.includes('客商') || lowerName.includes('entity') || lowerName.includes('公司')) {
      // 解析客商映射 sheet
      for (const row of jsonData) {
        if (!row || row.length < 1) continue;
        const firstCol = String(row[0] || '').trim();
        if (firstCol === '' || firstCol === '客商名称' || firstCol === '内部公司' || firstCol === '内部公司-標準化') {
          continue;
        }
        if (firstCol) {
          const 编码 = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
          const 利润中心名称 = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : firstCol;
          const 标准化名称 = row[3] !== undefined && row[3] !== null ? String(row[3]).trim() : 利润中心名称;
          entities.push({
            客商名称: firstCol,
            利润中心编码: 编码,
            利润中心名称: 利润中心名称 || firstCol,
            标准化名称: 标准化名称 || 利润中心名称 || firstCol,
          });
        }
      }
    }
  }

  // 如果没按sheet名匹配到，回退到单sheet解析（科目在上，客商在下）
  if (subjects.length === 0 && entities.length === 0 && workbook.SheetNames.length > 0) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

    // 找分割点
    let splitIndex = -1;
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row) continue;
      const firstCol = String(row[0] || '').trim();
      if (firstCol.includes('客商') || firstCol.includes('内部公司') || firstCol === '') {
        splitIndex = i;
        break;
      }
    }

    const subjectRows = splitIndex > 0 ? jsonData.slice(0, splitIndex) : jsonData;
    const entityRows = splitIndex > 0 ? jsonData.slice(splitIndex + 1) : [];

    for (const row of subjectRows) {
      if (!row || row.length < 2) continue;
      const firstCol = String(row[0] || '').trim();
      if (firstCol === '' || firstCol === '科目' || firstCol === '科目编码') continue;
      if (firstCol && row[1]) {
        subjects.push({
          科目编码: String(firstCol).trim(),
          科目名称: String(row[1]).trim(),
        });
      }
    }

    for (const row of entityRows) {
      if (!row || row.length < 1) continue;
      const firstCol = String(row[0] || '').trim();
      if (firstCol === '' || firstCol === '客商名称' || firstCol === '内部公司') continue;
      if (firstCol) {
        const 编码 = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
        const 利润中心名称 = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : firstCol;
        const 标准化名称 = row[3] !== undefined && row[3] !== null ? String(row[3]).trim() : 利润中心名称;
        entities.push({
          客商名称: firstCol,
          利润中心编码: 编码,
          利润中心名称: 利润中心名称 || firstCol,
          标准化名称: 标准化名称 || 利润中心名称 || firstCol,
        });
      }
    }
  }

  return { subjects, entities };
}

// ==================== 导出结果 ====================
export function exportReconResult(
  result: { 对符明细: any[]; 未对符明细: any[]; 统计: any }
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // 1. 汇总统计
  const summaryData = [
    ['核对结果汇总'],
    [],
    ['指标', '数值'],
    ['总组数', result.统计.总组数],
    ['对符组数', result.统计.对符组数],
    ['未对符组数', result.统计.未对符组数],
    ['总交易数', result.统计.总交易数],
    ['对符交易数', result.统计.对符交易数],
    ['未对符交易数', result.统计.未对符交易数],
    ['总差异金额', result.统计.总差异金额],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, '汇总统计');

  // 2. 对符明细
  const matchedRows: any[] = [];
  for (const group of result.对符明细) {
    for (const chain of group.匹配链) {
      for (const row of [...chain.借方行, ...chain.贷方行]) {
        matchedRows.push({
          分组ID: group.id,
          利润中心A: group.利润中心A名称,
          利润中心B: group.利润中心B名称,
          匹配类型: chain.匹配类型,
          匹配链ID: chain.id,
          凭证编号: row.凭证编号,
          过帐日期: row.过帐日期,
          利润中心: row.利润中心名称,
          科目号: row.科目号,
          科目名称: row.科目名称,
          客商: row.客商,
          文本: row.文本,
          借方: row.借方,
          贷方: row.贷方,
          净额: row.净额,
          本位币: row.本位币,
          状态: '对符',
        });
      }
    }
  }
  if (matchedRows.length > 0) {
    const wsMatched = XLSX.utils.json_to_sheet(matchedRows);
    XLSX.utils.book_append_sheet(wb, wsMatched, '对符明细');
  }

  // 3. 未对符明细
  const unmatchedRows: any[] = [];
  for (const group of result.未对符明细) {
    // 先添加已匹配的部分
    for (const chain of group.匹配链) {
      for (const row of [...chain.借方行, ...chain.贷方行]) {
        unmatchedRows.push({
          分组ID: group.id,
          利润中心A: group.利润中心A名称,
          利润中心B: group.利润中心B名称,
          匹配类型: chain.匹配类型,
          匹配链ID: chain.id,
          凭证编号: row.凭证编号,
          过帐日期: row.过帐日期,
          利润中心: row.利润中心名称,
          科目号: row.科目号,
          科目名称: row.科目名称,
          客商: row.客商,
          文本: row.文本,
          借方: row.借方,
          贷方: row.贷方,
          净额: row.净额,
          本位币: row.本位币,
          状态: '已匹配',
        });
      }
    }
    // 再添加未匹配的行
    // 需要重新计算未匹配行
    const matchedIds = new Set<string>();
    for (const chain of group.匹配链) {
      for (const row of [...chain.借方行, ...chain.贷方行]) {
        matchedIds.add(row.id);
      }
    }
    const umRows = group.行.filter((r: any) => !matchedIds.has(r.id));
    for (const row of umRows) {
      unmatchedRows.push({
        分组ID: group.id,
        利润中心A: group.利润中心A名称,
        利润中心B: group.利润中心B名称,
        匹配类型: '未匹配',
        匹配链ID: '',
        凭证编号: row.凭证编号,
        过帐日期: row.过帐日期,
        利润中心: row.利润中心名称,
        科目号: row.科目号,
        科目名称: row.科目名称,
        客商: row.客商,
        文本: row.文本,
        借方: row.借方,
        贷方: row.贷方,
        净额: row.净额,
        本位币: row.本位币,
        状态: '未对符',
      });
    }
  }
  if (unmatchedRows.length > 0) {
    const wsUnmatched = XLSX.utils.json_to_sheet(unmatchedRows);
    XLSX.utils.book_append_sheet(wb, wsUnmatched, '未对符明细');
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}
