import type {
  RawLedgerRow,
  CleanedRow,
  ReconGroup,
  ReconResult,
  MatchChain,
  SubjectMapping,
  EntityMapping,
} from '@/types';

// ========== 1. 数据清洗 ==========
export function cleanData(raw: RawLedgerRow[]): CleanedRow[] {
  return raw.map((row, index) => {
    const 借方 = Number(row.借方本位币金额) || 0;
    const 贷方 = Number(row.贷方本位币金额) || 0;
    // 优先用 Excel 中已有的"净发生"列；若缺失/为0则用 借方-贷方 计算
    const netFromCol = Number(row.净发生);
    // SAP 导出贷方已为负数，故净发生额 = 借方 + 贷方
    const 净额 = (!netFromCol || isNaN(netFromCol)) ? (借方 + 贷方) : netFromCol;
    // 判断方向：净额>0为借方，<0为贷方
    const 方向 = 净额 > 0 ? '借' : '贷';
    // 客商名称：优先取客户名称，否则供应商名称
    const 客商 = row.客户名称 || row.供应商名称 || '未知客商';
    const 客商编码 = row.客户 || row.供应商 || null;

    return {
      id: `row_${index}_${row.凭证编号}_${row.行项目}`,
      公司代码: row.公司代码,
      凭证编号: row.凭证编号,
      过帐日期: row.过帐日期,
      利润中心: row.利润中心,
      利润中心名称: row.利润中心文本描述,
      科目号: row.科目号,
      科目名称: row.总账科目长文本,
      客商,
      客商编码,
      文本: row.文本,
      借方,
      贷方,
      净额,
      本位币: row.本位币,
      方向,
    };
  });
}

// ========== 2. 映射过滤 ==========
export function filterByMappings(
  data: CleanedRow[],
  subjectMappings: SubjectMapping[],
  entityMappings: EntityMapping[]
): CleanedRow[] {
  const subjectSet = new Set(subjectMappings.map((s) => s.科目编码));
  const entitySet = new Set(entityMappings.map((e) => e.客商名称));

  return data.filter((row) => {
    const subjectMatch = subjectSet.has(row.科目号);
    const entityMatch = entitySet.has(row.客商);
    return subjectMatch && entityMatch;
  });
}

// ========== 3. 构建利润中心映射 & 分组 ==========
export function buildEntityToProfitCenterMap(
  entityMappings: EntityMapping[]
): Map<string, { 利润中心编码: string; 利润中心名称: string; 标准化名称: string }> {
  const map = new Map();
  for (const em of entityMappings) {
    map.set(em.客商名称, {
      利润中心编码: em.利润中心编码,
      利润中心名称: em.利润中心名称,
      标准化名称: em.标准化名称 || em.利润中心名称 || em.客商名称,
    });
  }
  return map;
}

export function groupByProfitCenterPair(
  data: CleanedRow[],
  entityMappings: EntityMapping[]
): Map<string, CleanedRow[]> {
  const entityMap = buildEntityToProfitCenterMap(entityMappings);
  const groups = new Map<string, CleanedRow[]>();

  for (const row of data) {
    const fromPC = row.利润中心; // 本行所属利润中心
    const entityInfo = entityMap.get(row.客商);
    if (!entityInfo) continue; // 无映射的跳过

    const toPC = entityInfo.利润中心编码 || row.客商;
    const toPCName = entityInfo.标准化名称 || entityInfo.利润中心名称 || row.客商;

    // 分组键：按利润中心对排序，确保 A→B 和 B→A 在同一组
    // 使用利润中心编码作为唯一标识
    const keyParts = [fromPC, toPC].sort();
    const key = `${keyParts[0]}|${keyParts[1]}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push({
      ...row,
      // 将映射信息附加到行上
      _对方利润中心: toPC,
      _对方利润中心名称: toPCName,
    } as CleanedRow & { _对方利润中心: string; _对方利润中心名称: string });
  }

  return groups;
}

// ========== 4. M:N 匹配算法（核心） ==========

// 快速零值检查：如果组内所有净额之和≈0，直接对符
function checkZeroSum(rows: CleanedRow[]): boolean {
  const sum = rows.reduce((acc, r) => acc + r.净额, 0);
  return Math.abs(sum) < 0.01;
}

// 寻找子集使得和为0（带剪枝的DFS）
function findSubsetSumZero(
  rows: CleanedRow[],
  used: boolean[]
): { indices: number[]; sum: number } | null {
  // 按绝对值降序，优先匹配大额
  const order = rows
    .map((r, i) => ({ i, abs: Math.abs(r.净额) }))
    .sort((a, b) => b.abs - a.abs)
    .map((x) => x.i);

  const unusedIndices = order.filter((i) => !used[i]);
  if (unusedIndices.length === 0) return null;

  // 目标：找到若干未使用的行，使得净额之和为0
  // 使用回溯法，限制搜索深度和宽度
  const MAX_DEPTH = 15; // 最大匹配深度

  function dfs(
    start: number,
    currentSum: number,
    depth: number,
    path: number[]
  ): number[] | null {
    if (Math.abs(currentSum) < 0.01 && path.length > 0) {
      return [...path];
    }
    if (depth >= MAX_DEPTH) return null;

    for (let idx = start; idx < unusedIndices.length; idx++) {
      const i = unusedIndices[idx];
      if (used[i]) continue;

      const val = rows[i].净额;

      // 剪枝1：如果当前和与同号，且不在第一层，大概率不会帮助归零
      if (
        path.length > 0 &&
        currentSum * val > 0 &&
        Math.abs(currentSum) > Math.abs(val)
      )
        continue;

      // 剪枝2：如果剩余所有金额绝对值之和小于当前差值，无法补齐
      let remainingSum = 0;
      for (let j = idx + 1; j < unusedIndices.length; j++) {
        remainingSum += Math.abs(rows[unusedIndices[j]].净额);
      }
      if (Math.abs(currentSum + val) > remainingSum && depth > 0) continue;

      path.push(i);
      const result = dfs(idx + 1, currentSum + val, depth + 1, path);
      if (result) return result;
      path.pop();
    }
    return null;
  }

  // 尝试从每个未使用的行开始搜索
  for (let startIdx = 0; startIdx < unusedIndices.length; startIdx++) {
    const i = unusedIndices[startIdx];
    if (used[i]) continue;
    const result = dfs(startIdx + 1, rows[i].净额, 1, [i]);
    if (result) {
      return { indices: result, sum: result.reduce((acc, idx) => acc + rows[idx].净额, 0) };
    }
  }

  return null;
}

// 迭代匹配：不断寻找子集直到找不到为止
function iterativeMatch(rows: CleanedRow[]): {
  matchChains: MatchChain[];
  matchedIndices: Set<number>;
} {
  const n = rows.length;
  const used = new Array(n).fill(false);
  const matchChains: MatchChain[] = [];
  let chainId = 0;

  // 第一轮：1:1 精确匹配
  const amountMap = new Map<number, number[]>(); // 金额 -> 索引列表
  for (let i = 0; i < rows.length; i++) {
    if (used[i]) continue;
    const amt = Math.round(rows[i].净额 * 100) / 100;
    const negAmt = -amt;
    if (amountMap.has(negAmt)) {
      const candidates = amountMap.get(negAmt)!;
      for (const ci of candidates) {
        if (!used[ci]) {
          // 找到1:1匹配
          used[i] = true;
          used[ci] = true;
          const debitRow = rows[i].净额 > 0 ? [rows[i]] : [rows[ci]];
          const creditRow = rows[i].净额 > 0 ? [rows[ci]] : [rows[i]];
          matchChains.push({
            id: `chain_${chainId++}`,
            匹配类型: '1:1',
            借方行: debitRow,
            贷方行: creditRow,
            借方合计: Math.abs(rows[i].净额),
            贷方合计: Math.abs(rows[ci].净额),
            差异: 0,
          });
          break;
        }
      }
      if (!used[i]) {
        if (!amountMap.has(amt)) amountMap.set(amt, []);
        amountMap.get(amt)!.push(i);
      }
    } else {
      if (!amountMap.has(amt)) amountMap.set(amt, []);
      amountMap.get(amt)!.push(i);
    }
  }

  // 第二轮：M:N 复杂匹配
  let found = true;
  while (found) {
    found = false;
    const subset = findSubsetSumZero(rows, used);
    if (subset && subset.indices.length >= 2) {
      found = true;
      for (const idx of subset.indices) {
        used[idx] = true;
      }
      const matchedRows = subset.indices.map((i) => rows[i]);
      const debitRows = matchedRows.filter((r) => r.净额 > 0);
      const creditRows = matchedRows.filter((r) => r.净额 < 0);
      const debitSum = debitRows.reduce((s, r) => s + r.净额, 0);
      const creditSum = Math.abs(creditRows.reduce((s, r) => s + r.净额, 0));

      const matchType: '1:N' | 'M:N' =
        subset.indices.length === 2 ? '1:N' : 'M:N';

      matchChains.push({
        id: `chain_${chainId++}`,
        匹配类型: matchType,
        借方行: debitRows,
        贷方行: creditRows,
        借方合计: debitSum,
        贷方合计: creditSum,
        差异: 0,
      });
    }
  }

  const matchedIndices = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (used[i]) matchedIndices.add(i);
  }

  return { matchChains, matchedIndices };
}

// ========== 工具：让渡主线程（避免长任务阻塞 UI） ==========
// 优先用 scheduler.yield（Chrome 129+），降级到 setTimeout(0)
function yieldToMain(): Promise<void> {
  if (typeof (globalThis as any).scheduler?.yield === 'function') {
    return (globalThis as any).scheduler.yield();
  }
  return new Promise<void>((r) => setTimeout(r, 0));
}

// ========== 5. 执行核对（异步，逐组让渡主线程） ==========
export async function reconcile(
  rawData: RawLedgerRow[],
  subjectMappings: SubjectMapping[],
  entityMappings: EntityMapping[],
  onProgress?: (done: number, total: number) => void
): Promise<ReconResult> {
  // Step 1: 清洗
  const cleaned = cleanData(rawData);

  // Step 2: 过滤
  const filtered = filterByMappings(cleaned, subjectMappings, entityMappings);

  // Step 3: 分组
  const groups = groupByProfitCenterPair(filtered, entityMappings);
  const total = groups.size;

  // Step 4: 逐组核对（每组后 yield 一次主线程）
  const reconGroups: ReconGroup[] = [];
  const 对符明细: ReconGroup[] = [];
  const 未对符明细: ReconGroup[] = [];

  let totalProcessed = 0;

  for (const [key, rows] of groups) {
    const [pcA, pcB] = key.split('|');
    const pcAName = rows[0]?.利润中心名称 || pcA;
    const extRow = rows[0] as CleanedRow & { _对方利润中心名称?: string };
    const pcBName = extRow._对方利润中心名称 || pcB;

    const sum = rows.reduce((acc, r) => acc + r.净额, 0);
    totalProcessed++;

    // 快速路径：整组净额之和为零 → 直接对符
    if (checkZeroSum(rows)) {
      const group: ReconGroup = {
        id: key,
        利润中心A: pcA,
        利润中心A名称: pcAName,
        利润中心B: pcB,
        利润中心B名称: pcBName,
        行: rows,
        合计净额: sum,
        状态: '对符',
        匹配链: [
          {
            id: 'chain_all',
            匹配类型: '汇总零值',
            借方行: rows.filter((r) => r.净额 > 0),
            贷方行: rows.filter((r) => r.净额 < 0),
            借方合计: rows.filter((r) => r.净额 > 0).reduce((s, r) => s + r.净额, 0),
            贷方合计: Math.abs(rows.filter((r) => r.净额 < 0).reduce((s, r) => s + r.净额, 0)),
            差异: 0,
          },
        ],
      };
      reconGroups.push(group);
      对符明细.push(group);
    } else {
      // 复杂路径：逐笔 M:N 匹配
      const { matchChains, matchedIndices } = iterativeMatch(rows);
      const matchedCount = matchedIndices.size;

      if (matchedCount === rows.length) {
        const group: ReconGroup = {
          id: key,
          利润中心A: pcA,
          利润中心A名称: pcAName,
          利润中心B: pcB,
          利润中心B名称: pcBName,
          行: rows,
          合计净额: sum,
          状态: '对符',
          匹配链: matchChains,
        };
        reconGroups.push(group);
        对符明细.push(group);
      } else {
        const group: ReconGroup = {
          id: key,
          利润中心A: pcA,
          利润中心A名称: pcAName,
          利润中心B: pcB,
          利润中心B名称: pcBName,
          行: rows,
          合计净额: sum,
          状态: '未对符',
          匹配链: matchChains,
        };
        reconGroups.push(group);
        未对符明细.push(group);
      }
    }

    // 每组处理完后让渡主线程，保持 UI 响应
    onProgress?.(totalProcessed, total);
    await yieldToMain();
  }

  // 统计
  const 总交易数 = filtered.length;
  const 对符交易数 = 对符明细.reduce(
    (acc, g) => acc + (g.状态 === '对符' ? g.行.length : g.匹配链.reduce((s, c) => s + c.借方行.length + c.贷方行.length, 0)),
    0
  );

  return {
    groups: reconGroups,
    对符明细,
    未对符明细,
    统计: {
      总组数: reconGroups.length,
      对符组数: 对符明细.length,
      未对符组数: 未对符明细.length,
      总交易数,
      对符交易数,
      未对符交易数: 总交易数 - 对符交易数,
      总差异金额: 未对符明细.reduce((acc, g) => acc + Math.abs(g.合计净额), 0),
    },
  };
}

// 从组中提取未匹配的行
export function getUnmatchedRows(group: ReconGroup): CleanedRow[] {
  const matchedIds = new Set<string>();
  for (const chain of group.匹配链) {
    for (const row of [...chain.借方行, ...chain.贷方行]) {
      matchedIds.add(row.id);
    }
  }
  return group.行.filter((r) => !matchedIds.has(r.id));
}

// 格式化金额
export function formatAmount(v: number): string {
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
