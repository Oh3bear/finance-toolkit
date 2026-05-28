// ========== 银企对账引擎 ==========
// 纯函数，无副作用，在浏览器主线程运行。

// ---- 类型定义 ----

/** 银行流水单笔交易 */
export interface BankTransaction {
  account: string;
  date: Date;
  amount: number;           // 收入为正，支出为负
  direction: '收入' | '支出';
  rawRow: Record<string, string>;   // 原始行所有列
}

/** 企业银行存款明细账单笔交易 */
export interface EnterpriseTransaction {
  account: string;
  date: Date;
  /** 有符号金额：正=资金流入（借方正数/贷方冲销），负=资金流出（贷方负数/借方冲销） */
  amount: number;
  /** 原始账务方向（借方/贷方），配合 amount 符号可判断是否为冲销 */
  direction: '借方' | '貸方';
  rawRow: Record<string, string>;
}

/** 一笔配对 */
export interface BankMatchPair {
  bank: BankTransaction;
  enterprise: EnterpriseTransaction;
  /** 是否来自快速对符通道（求和一致） */
  quickMatch?: boolean;
}

/** M:N 配对组（多笔银行流水 ↔ 多笔企业账，可能为合并处理） */
export interface MNMatchGroup {
  bankItems: BankTransaction[];
  enterpriseItems: EnterpriseTransaction[];
  bankSum: number;
  enterpriseSum: number;
}

/** 诊断信息：快速通道各方向求和结果 */
export interface ReconDebugInfo {
  bankIncomeCount: number;
  bankIncomeSum: number;
  bankExpenseCount: number;
  bankExpenseSum: number;
  entDebitCount: number;
  entDebitSum: number;
  entCreditCount: number;
  entCreditSum: number;
  /** 快速通道 收入↔借方 是否触发 */
  fastTrackIncomeTriggered: boolean;
  /** 快速通道 支出↔贷方 是否触发 */
  fastTrackExpenseTriggered: boolean;
  /** 收入-借方 差额（分），0=完美匹配 */
  incomeDiffCents: number;
  /** 支出-贷方 差额（分），0=完美匹配 */
  expenseDiffCents: number;
  /** 1:1 逐笔匹配对数 */
  oneToOneMatched: number;
  /** M:N 匹配组数 */
  mnGroupsFound: number;
  /** 银行剩余未对符 signed sum（元） */
  bankUnmatchedSignedSum: number;
  /** 企业剩余未对符 signed sum（元） */
  entUnmatchedSignedSum: number;
}

/** 单个账户的核对结果 */
export interface AccountResult {
  account: string;
  matched: BankMatchPair[];
  mnMatched: MNMatchGroup[];        // M:N 匹配（可能合并处理）
  unmatchedBank: BankTransaction[];
  unmatchedEnterprise: EnterpriseTransaction[];
  /** 快速对符匹配对数（收入借方或支出贷方求和一致，全量标记） */
  quickMatched: number;
  totalBank: number;
  totalEnterprise: number;
  /** 预处理阶段从企业账内部清除的冲销配对数（同方向正负抵消） */
  reversalPairsRemoved: number;
  /** 后处理：剩余未匹配项的 signed sum 均为 0 → 全是冲销残留 */
  remainingAreReversals: boolean;
  /** 诊断信息：各阶段中间值，用于排查为什么快速通道未触发 */
  debugInfo: ReconDebugInfo;
}

/** 整体核对结果 */
export interface BankReconResult {
  accounts: AccountResult[];
  summary: BankReconSummary;
}

export interface BankReconSummary {
  totalAccounts: number;
  fullyMatched: number;
  hasUnmatched: number;
  totalUnmatchedBank: number;
  totalUnmatchedEnterprise: number;
  totalMNMatched: number;           // M:N 匹配组数
  quickMatchedAccounts: number;     // 通过快速对符完全对符的账户数
  // 诊断信息
  bankTxCount: number;
  enterpriseTxCount: number;
  bankAccounts: string[];
  enterpriseAccounts: string[];
  overlapAccounts: string[];
  skippedBankOnly: string[];        // 银行独有、被跳过的账户
  skippedEntOnly: string[];         // 企业独有、被跳过的账户
  /** 诊断警告（如账号完全不匹配） */
  warning: string | null;
}

// ---- 辅助函数 ----

/** Excel 序号日期转为 Date */
function excelSerialToDate(serial: number): Date {
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 86400000;
  return new Date(excelEpoch.getTime() + serial * msPerDay);
}

/** 尝试将任意值解析为 Date */
function parseDate(val: unknown): Date | null {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number' && val > 30000 && val < 100000) {
    return excelSerialToDate(val);
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    // 1. 标准 ISO / 斜杠格式
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // 2. dd/mm/yyyy 或 yyyy/mm/dd
    let parts = s.split(/[/]/);
    if (parts.length === 3) {
      const y = parseInt(parts[0]) > 31 ? parts[0] : parts[2];
      const m = parts[1];
      const d2 = parseInt(parts[0]) > 31 ? parts[2] : parts[0];
      const nd = new Date(`${y}-${m}-${d2}`);
      if (!isNaN(nd.getTime())) return nd;
    }
    // 3. "DD Mon YYYY HH:MM GMT+N" 银行流水常见格式
    //    例: "30 Apr 2026 00:31 GMT+8"
    const bankMatch = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})/);
    if (bankMatch) {
      const months: Record<string, number> = {
        jan:0,feb:1,mar:2,apr:3,may:4,jun:5,
        jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
      };
      const m = months[bankMatch[2].toLowerCase()];
      if (m !== undefined) {
        return new Date(
          parseInt(bankMatch[3]), m, parseInt(bankMatch[1]),
          parseInt(bankMatch[4]), parseInt(bankMatch[5])
        );
      }
    }
    // 4. yyyymmdd 纯数字
    if (/^\d{8}$/.test(s)) {
      const nd = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
      if (!isNaN(nd.getTime())) return nd;
    }
  }
  return null;
}

/** 金额按分取整比较（财务金额均为 0.01 的倍数，消除浮点累加误差） */
function centsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** 日期窗口（天），银行入账与企业记账的合理时间差 */
const DATE_WINDOW_DAYS = 7;

/** 判断两个日期是否在 ±days 窗口内 */
function withinDateWindow(a: Date, b: Date, days: number = DATE_WINDOW_DAYS): boolean {
  const msPerDay = 86400000;
  return Math.abs(a.getTime() - b.getTime()) <= days * msPerDay;
}

/** Date → YYYY-MM-DD 字符串，用于日期分桶（本地时间，避免 UTC 偏移导致日期错位） */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


// ---- 主函数 ----

/**
 * 对剩余未匹配项做 M:N 子集求和匹配，支持双向：
 *   a) 多笔银行流水 → 一笔企业账（银行拆分、企业合并）
 *   b) 一笔银行流水 → 多笔企业账（企业拆分、银行合并）
 *
 * 策略：
 *   1. 从大额开始匹配（优先清理大额，减少后续干扰）
 *   2. 全量候选池：不再渐进截断，避免小匹配蚕食大匹配的条目
 *   3. 按有符号金额匹配：正=流入，负=流出，同符号才能互配
 */
function findMNMatches(
  unmatchedBank: BankTransaction[],
  unmatchedEnterprise: EnterpriseTransaction[],
  maxDepth: number = 12,
): { groups: MNMatchGroup[]; usedBankIdx: Set<number>; usedEntIdx: Set<number> } {
  const groups: MNMatchGroup[] = [];
  const usedBankIdx = new Set<number>();
  const usedEntIdx = new Set<number>();

  // 总条数太少，直接跳过
  const totalRemaining = unmatchedBank.length + unmatchedEnterprise.length;
  if (totalRemaining < 3) return { groups, usedBankIdx, usedEntIdx };

  // 累计 DFS 迭代计数器：所有 findSubsetSum 调用共享，超过上限即停止
  const dfsCounter = { value: 0 };
  const capsReached = () => dfsCounter.value >= DFS_CUMULATIVE_CAP;

  // --- 方向 a: 多笔银行流水 → 一笔企业账（从大到小）---
  const entSorted = unmatchedEnterprise
    .map((ent, i) => ({ ent, i }))
    .sort((a, b) => Math.abs(b.ent.amount) - Math.abs(a.ent.amount));

  for (const { ent, i: ei } of entSorted) {
    if (usedEntIdx.has(ei)) continue;
    if (capsReached()) break;
    const target = ent.amount;

    // 按符号 + 日期窗口筛选候选
    const candidateIdx: number[] = [];
    for (let bi = 0; bi < unmatchedBank.length; bi++) {
      if (usedBankIdx.has(bi)) continue;
      const sameSign = (target > 0) === (unmatchedBank[bi].amount > 0);
      if (!sameSign) continue;
      if (!withinDateWindow(ent.date, unmatchedBank[bi].date)) continue;
      candidateIdx.push(bi);
    }

    // 候选太少无法组合，或太多 DFS 难以命中 → 跳过
    if (candidateIdx.length < 2 || candidateIdx.length > MN_MAX_CANDIDATES) continue;

    const idxSet = findSubsetSum(unmatchedBank, candidateIdx, target, maxDepth, dfsCounter);
    if (idxSet) {
      for (const bi of idxSet) usedBankIdx.add(bi);
      usedEntIdx.add(ei);
      groups.push({
        bankItems: idxSet.map((i) => unmatchedBank[i]),
        enterpriseItems: [ent],
        bankSum: idxSet.reduce((s, i) => s + unmatchedBank[i].amount, 0),
        enterpriseSum: target,
      });
    }
  }

  // --- 方向 b: 一笔银行流水 → 多笔企业账（从大到小）---
  const bankSorted = unmatchedBank
    .map((bank, i) => ({ bank, i }))
    .sort((a, b) => Math.abs(b.bank.amount) - Math.abs(a.bank.amount));

  for (const { bank, i: bi } of bankSorted) {
    if (usedBankIdx.has(bi)) continue;
    if (capsReached()) break;
    const target = bank.amount;

    // 按符号 + 日期窗口筛选候选
    const candidateIdx: number[] = [];
    for (let ei = 0; ei < unmatchedEnterprise.length; ei++) {
      if (usedEntIdx.has(ei)) continue;
      const sameSign = (target > 0) === (unmatchedEnterprise[ei].amount > 0);
      if (!sameSign) continue;
      if (!withinDateWindow(bank.date, unmatchedEnterprise[ei].date)) continue;
      candidateIdx.push(ei);
    }

    // 候选太少无法组合，或太多 DFS 难以命中 → 跳过
    if (candidateIdx.length < 2 || candidateIdx.length > MN_MAX_CANDIDATES) continue;

    const idxSet = findSubsetSum(unmatchedEnterprise, candidateIdx, target, maxDepth, dfsCounter);
    if (idxSet) {
      for (const ei of idxSet) usedEntIdx.add(ei);
      usedBankIdx.add(bi);
      groups.push({
        bankItems: [bank],
        enterpriseItems: idxSet.map((i) => unmatchedEnterprise[i]),
        bankSum: target,
        enterpriseSum: idxSet.reduce((s, i) => s + unmatchedEnterprise[i].amount, 0),
      });
    }
  }

  return { groups, usedBankIdx, usedEntIdx };
}

/**
 * 在 candidates 中寻找子集，使其有符号金额之和等于 target
 * 按分取整比较 — 财务金额天然是分精度，浮点误差无实际意义
 * target 可为正（资金流入）或负（资金流出），candidates 必须同符号
 * 返回第一个匹配的原始索引数组，或 null
 */
/** 单次 DFS 最大迭代次数（防止单次组合爆炸卡死） */
const DFS_MAX_ITERATIONS = 20000;

/** 累计 DFS 迭代上限（findMNMatches 中所有 DFS 调用合计，防止大数据量下累积阻塞） */
const DFS_CUMULATIVE_CAP = 200000;

/** M:N 候选条目数上限，超过则跳过该 target（候选太多 DFS 命中率低且耗时） */
const MN_MAX_CANDIDATES = 20;

function findSubsetSum<T extends { amount: number }>(
  allItems: T[],
  candidates: number[],
  target: number,
  maxDepth: number = 12,
  extCounter?: { value: number },
): number[] | null {
  const targetCents = Math.round(target * 100);
  const isPositive = targetCents > 0;
  let iterations = 0;
  // 如果提供了外部计数器，检查累计是否已达上限
  const cumulativeCap = extCounter ? DFS_CUMULATIVE_CAP : Infinity;

  // 排序：正值升序（小→大），负值降序（大→小，即从接近0开始逐步更负）
  const sorted = [...candidates].sort((a, b) => {
    const va = allItems[a].amount;
    const vb = allItems[b].amount;
    return isPositive ? va - vb : vb - va;
  });

  let best: number[] | null = null;

  function dfs(start: number, current: number[], currentSumCents: number) {
    iterations++;
    // 单次上限 + 累计上限双重拦截
    if (iterations > DFS_MAX_ITERATIONS) return;
    if (extCounter && extCounter.value >= cumulativeCap) return;

    if (current.length > maxDepth) return;

    if (current.length >= 2 && currentSumCents === targetCents) {
      best = [...current];
      return;
    }
    if (current.length === maxDepth) return;

    for (let j = start; j < sorted.length; j++) {
      const idx = sorted[j];
      const valCents = Math.round(allItems[idx].amount * 100); // 有符号
      const newSumCents = currentSumCents + valCents;

      // 剪枝：正值超出 target 或负值超过 target（更负）
      if (isPositive) {
        if (newSumCents > targetCents) break;
      } else {
        if (newSumCents < targetCents) break;
      }

      dfs(j + 1, [...current, idx], newSumCents);

      if (best !== null) return;
      if (extCounter && extCounter.value >= cumulativeCap) return;
    }
  }

  dfs(0, [], 0);
  // 回写迭代计数到外部计数器
  if (extCounter) extCounter.value += iterations;
  return best;
}

/**
 * 单账户核对：对单个账户执行完整的 Phase 0-3 匹配流水线
 * 纯函数，不修改输入数组
 */
export function reconcileOneAccount(
  account: string,
  bankTxns: BankTransaction[],
  enterpriseTxns: EnterpriseTransaction[],
): AccountResult {
  // 筛选该账号的交易
  let bankList = bankTxns.filter((t) => t.account === account);
  let entList = enterpriseTxns.filter((t) => t.account === account);

  // 按日期升序排序
  bankList = bankList.sort((a, b) => a.date.getTime() - b.date.getTime());
  entList = entList.sort((a, b) => a.date.getTime() - b.date.getTime());

  // 保存原始计数（冲销/快速通道前的总数）
  const origEntCount = entList.length;

  // 匹配状态
  const matched: BankMatchPair[] = [];
  const bankUsed = new Array(bankList.length).fill(false);
  const entUsed = new Array(entList.length).fill(false);

  // ---- Phase 0: 快速对符通道（优先执行，快速踢出大面积匹配）----
  const bankIncome = bankList.filter((t) => t.direction === '收入');
  const bankExpense = bankList.filter((t) => t.direction === '支出');
  const entDebit = entList.filter((t) => t.direction === '借方');
  const entCredit = entList.filter((t) => t.direction === '貸方');

  const bankIncomeSum = bankIncome.reduce((s, t) => s + t.amount, 0);
  const bankExpenseSum = bankExpense.reduce((s, t) => s + t.amount, 0);
  const entDebitSum = entDebit.reduce((s, t) => s + t.amount, 0);
  const entCreditSum = entCredit.reduce((s, t) => s + t.amount, 0);

  let fastTrackIncomeTriggered = false;
  let fastTrackExpenseTriggered = false;

  // 收入 ↔ 借方 快速对符
  if (bankIncome.length > 0 && entDebit.length > 0) {
    if (centsEqual(bankIncomeSum, entDebitSum)) {
      fastTrackIncomeTriggered = true;
      const maxLen = Math.max(bankIncome.length, entDebit.length);
      for (let k = 0; k < maxLen; k++) {
        const bankItem = bankIncome[k % bankIncome.length];
        const entItem = entDebit[k % entDebit.length];
        const bk = bankList.indexOf(bankItem);
        const ek = entList.indexOf(entItem);
        if (bk >= 0 && ek >= 0) {
          matched.push({ bank: bankList[bk], enterprise: entList[ek], quickMatch: true });
        }
      }
      for (const item of bankIncome) {
        const idx = bankList.indexOf(item);
        if (idx >= 0) bankUsed[idx] = true;
      }
      for (const item of entDebit) {
        const idx = entList.indexOf(item);
        if (idx >= 0) entUsed[idx] = true;
      }
    }
  }

  // 支出 ↔ 贷方 快速对符
  if (bankExpense.length > 0 && entCredit.length > 0) {
    if (centsEqual(bankExpenseSum, entCreditSum)) {
      fastTrackExpenseTriggered = true;
      const maxLen = Math.max(bankExpense.length, entCredit.length);
      for (let k = 0; k < maxLen; k++) {
        const bankItem = bankExpense[k % bankExpense.length];
        const entItem = entCredit[k % entCredit.length];
        const bk = bankList.indexOf(bankItem);
        const ek = entList.indexOf(entItem);
        if (bk >= 0 && ek >= 0) {
          matched.push({ bank: bankList[bk], enterprise: entList[ek], quickMatch: true });
        }
      }
      for (const item of bankExpense) {
        const idx = bankList.indexOf(item);
        if (idx >= 0) bankUsed[idx] = true;
      }
      for (const item of entCredit) {
        const idx = entList.indexOf(item);
        if (idx >= 0) entUsed[idx] = true;
      }
    }
  }

  // ---- Phase 1: 冲销预处理（仅扫描快速通道剩余的未匹配企业账）----
  const entReversalUsed = new Set<number>();
  let reversalPairCount = 0;

  for (let i = 0; i < entList.length; i++) {
    if (entUsed[i]) continue;
    if (entReversalUsed.has(i)) continue;
    if (entList[i].direction !== '借方') continue;
    const a = entList[i].amount;
    if (a === 0) continue;
    for (let j = i + 1; j < entList.length; j++) {
      if (entUsed[j]) continue;
      if (entReversalUsed.has(j)) continue;
      if (entList[j].direction !== '借方') continue;
      const b = entList[j].amount;
      if ((a > 0) !== (b > 0) && centsEqual(a, -b)) {
        entReversalUsed.add(i);
        entReversalUsed.add(j);
        reversalPairCount++;
        break;
      }
    }
  }

  for (let i = 0; i < entList.length; i++) {
    if (entUsed[i]) continue;
    if (entReversalUsed.has(i)) continue;
    if (entList[i].direction !== '貸方') continue;
    const a = entList[i].amount;
    if (a === 0) continue;
    for (let j = i + 1; j < entList.length; j++) {
      if (entUsed[j]) continue;
      if (entReversalUsed.has(j)) continue;
      if (entList[j].direction !== '貸方') continue;
      const b = entList[j].amount;
      if ((a > 0) !== (b > 0) && centsEqual(a, -b)) {
        entReversalUsed.add(i);
        entReversalUsed.add(j);
        reversalPairCount++;
        break;
      }
    }
  }

  for (const i of entReversalUsed) {
    entUsed[i] = true;
  }

  // ---- Phase 2: 1:1 逐笔匹配（哈希表 + 日期窗口） ----
  // 步骤 1: 建哈希表 — 金额(分) → [{日期, 企业索引}]
  const entAmountMap = new Map<number, { date: Date; idx: number }[]>();
  for (let ei = 0; ei < entList.length; ei++) {
    if (entUsed[ei]) continue;
    const cents = Math.round(entList[ei].amount * 100);
    let bucket = entAmountMap.get(cents);
    if (!bucket) {
      bucket = [];
      entAmountMap.set(cents, bucket);
    }
    bucket.push({ date: entList[ei].date, idx: ei });
  }

  // 步骤 2: 查哈希表 — 银行逐笔 O(1) 查找，日期窗口过滤
  for (let bi = 0; bi < bankList.length; bi++) {
    if (bankUsed[bi]) continue;
    const bank = bankList[bi];
    const cents = Math.round(bank.amount * 100);
    const bucket = entAmountMap.get(cents);
    if (!bucket || bucket.length === 0) continue;

    // 优先匹配日期窗口内的；窗口外但金额一致的也行（兜底）
    let bestEi = -1;
    for (let k = bucket.length - 1; k >= 0; k--) {
      if (entUsed[bucket[k].idx]) {
        bucket.splice(k, 1); // 清理已用条目
        continue;
      }
      if (withinDateWindow(bank.date, bucket[k].date)) {
        bestEi = bucket[k].idx;
        bucket.splice(k, 1);
        break;
      }
    }
    // 日期窗口没命中，兜底拿第一个未用（金额依然一致）
    if (bestEi < 0) {
      for (let k = bucket.length - 1; k >= 0; k--) {
        if (entUsed[bucket[k].idx]) {
          bucket.splice(k, 1);
          continue;
        }
        bestEi = bucket[k].idx;
        bucket.splice(k, 1);
        break;
      }
    }

    if (bestEi >= 0) {
      matched.push({ bank, enterprise: entList[bestEi] });
      bankUsed[bi] = true;
      entUsed[bestEi] = true;
    }
  }

  // ---- Phase 2.5: 日期分桶快速通道 ----
  // 思路：Phase 2 (1:1) 之后，将剩余未匹配条目按日期分桶，
  //       同日内银行合计 == 企业合计（分方向）直接整批匹配。
  //       大幅压缩 Phase 3 DFS 的候选规模，让 1:5+ 匹配成为可能。
  const dateBucketMatched: MNMatchGroup[] = [];
  {
    const bankByDate = new Map<string, number[]>();
    const entByDate = new Map<string, number[]>();

    for (let i = 0; i < bankList.length; i++) {
      if (bankUsed[i]) continue;
      const dk = toDateKey(bankList[i].date);
      let b = bankByDate.get(dk);
      if (!b) { b = []; bankByDate.set(dk, b); }
      b.push(i);
    }
    for (let i = 0; i < entList.length; i++) {
      if (entUsed[i]) continue;
      const dk = toDateKey(entList[i].date);
      let b = entByDate.get(dk);
      if (!b) { b = []; entByDate.set(dk, b); }
      b.push(i);
    }

    for (const [dateKey, bankIdx] of bankByDate) {
      const entIdx = entByDate.get(dateKey);
      if (!entIdx || entIdx.length === 0) continue;

      // 收入方向
      const bInc = bankIdx.filter((i) => bankList[i].amount > 0);
      const eDeb = entIdx.filter((i) => entList[i].amount > 0 && entList[i].direction === '借方');
      if (bInc.length > 0 && eDeb.length > 0) {
        const bSum = bInc.reduce((s, i) => s + bankList[i].amount, 0);
        const eSum = eDeb.reduce((s, i) => s + entList[i].amount, 0);
        if (centsEqual(bSum, eSum)) {
          for (const i of bInc) bankUsed[i] = true;
          for (const i of eDeb) entUsed[i] = true;
          dateBucketMatched.push({
            bankItems: bInc.map((i) => bankList[i]),
            enterpriseItems: eDeb.map((i) => entList[i]),
            bankSum: bSum,
            enterpriseSum: eSum,
          });
        }
      }

      // 支出方向
      const bExp = bankIdx.filter((i) => bankList[i].amount < 0);
      const eCre = entIdx.filter((i) => entList[i].amount < 0 && entList[i].direction === '貸方');
      if (bExp.length > 0 && eCre.length > 0) {
        const bSum = bExp.reduce((s, i) => s + bankList[i].amount, 0);
        const eSum = eCre.reduce((s, i) => s + entList[i].amount, 0);
        if (centsEqual(bSum, eSum)) {
          for (const i of bExp) bankUsed[i] = true;
          for (const i of eCre) entUsed[i] = true;
          dateBucketMatched.push({
            bankItems: bExp.map((i) => bankList[i]),
            enterpriseItems: eCre.map((i) => entList[i]),
            bankSum: bSum,
            enterpriseSum: eSum,
          });
        }
      }
    }
  }

  // ---- Phase 3: M:N 迭代匹配 ----
  // 不断缩小池子：每轮找到匹配后剔除已用条目，重跑直到无新匹配
  let unmatchedBank = bankList.filter((_, i) => !bankUsed[i]);
  let unmatchedEnterprise = entList.filter((_, i) => !entUsed[i]);
  const allMNGroups: MNMatchGroup[] = [...dateBucketMatched];
  let mnPassCount = 0;
  const MN_MAX_PASSES = 5; // 最多迭代 5 轮，防止大数据量下无限循环

  while (mnPassCount < MN_MAX_PASSES) {
    const mnResult = findMNMatches(unmatchedBank, unmatchedEnterprise);
    if (mnResult.groups.length === 0) break;

    mnPassCount++;
    allMNGroups.push(...mnResult.groups);

    // 从当前池子中剔除已匹配条目
    const usedB = mnResult.usedBankIdx;
    const usedE = mnResult.usedEntIdx;
    unmatchedBank = unmatchedBank.filter((_, i) => !usedB.has(i));
    unmatchedEnterprise = unmatchedEnterprise.filter((_, i) => !usedE.has(i));

    // 池子太小就无法做 M:N（至少需要 1+2=3 条）
    if (unmatchedBank.length + unmatchedEnterprise.length < 3) break;
  }

  // ---- Phase 3.5: 方向整体匹配（兜底 + 日期窗口） ----
  // 思路：1:N 迭代后，按方向（收入/支出）取较小方汇总作为 target，
  //       在大方中找子集匹配。日期窗口交叉过滤进一步缩小候选池。
  // 仅当剩余未匹配条目 ≤30 时执行（大数据量下兜底 DFS 性价比低）
  {
    const wholeUsedB = new Set<number>();
    const wholeUsedE = new Set<number>();

    if (unmatchedBank.length + unmatchedEnterprise.length <= 30) {

    // 方向索引（未过滤日期）
    const rawBankIncomeIdx = unmatchedBank.map((t, i) => (t.amount > 0 ? i : -1)).filter((i) => i >= 0);
    const rawEntDebitIdx = unmatchedEnterprise.map((t, i) => (t.amount > 0 && t.direction === '借方' ? i : -1)).filter((i) => i >= 0);
    const rawBankExpenseIdx = unmatchedBank.map((t, i) => (t.amount < 0 ? i : -1)).filter((i) => i >= 0);
    const rawEntCreditIdx = unmatchedEnterprise.map((t, i) => (t.amount < 0 && t.direction === '貸方' ? i : -1)).filter((i) => i >= 0);

    // 日期交叉过滤：只保留至少与对方一趟交易在 ±7 天内的条目
    function dateFilter(
      aIdx: number[], aItems: { date: Date }[],
      bIdx: number[], bItems: { date: Date }[],
    ): number[] {
      if (bIdx.length === 0) return aIdx;
      const bDates = bIdx.map((i) => bItems[i].date);
      return aIdx.filter((i) => bDates.some((d) => withinDateWindow(aItems[i].date, d)));
    }

    const bankIncomeIdx = dateFilter(rawBankIncomeIdx, unmatchedBank, rawEntDebitIdx, unmatchedEnterprise);
    const entDebitIdx = dateFilter(rawEntDebitIdx, unmatchedEnterprise, rawBankIncomeIdx, unmatchedBank);
    const bankExpenseIdx = dateFilter(rawBankExpenseIdx, unmatchedBank, rawEntCreditIdx, unmatchedEnterprise);
    const entCreditIdx = dateFilter(rawEntCreditIdx, unmatchedEnterprise, rawBankExpenseIdx, unmatchedBank);

    // 收入方向
    if (bankIncomeIdx.length >= 2 && entDebitIdx.length >= 2) {
      if (bankIncomeIdx.length <= entDebitIdx.length) {
        const target = bankIncomeIdx.reduce((s, i) => s + unmatchedBank[i].amount, 0);
        const result = findSubsetSum(unmatchedEnterprise, entDebitIdx, target);
        if (result) {
          for (const bi of bankIncomeIdx) wholeUsedB.add(bi);
          for (const ei of result) wholeUsedE.add(ei);
          allMNGroups.push({
            bankItems: bankIncomeIdx.map((i) => unmatchedBank[i]),
            enterpriseItems: result.map((i) => unmatchedEnterprise[i]),
            bankSum: target,
            enterpriseSum: result.reduce((s, i) => s + unmatchedEnterprise[i].amount, 0),
          });
        }
      } else {
        const target = entDebitIdx.reduce((s, i) => s + unmatchedEnterprise[i].amount, 0);
        const result = findSubsetSum(unmatchedBank, bankIncomeIdx, target);
        if (result) {
          for (const bi of result) wholeUsedB.add(bi);
          for (const ei of entDebitIdx) wholeUsedE.add(ei);
          allMNGroups.push({
            bankItems: result.map((i) => unmatchedBank[i]),
            enterpriseItems: entDebitIdx.map((i) => unmatchedEnterprise[i]),
            bankSum: result.reduce((s, i) => s + unmatchedBank[i].amount, 0),
            enterpriseSum: target,
          });
        }
      }
    }

    // 支出方向
    if (bankExpenseIdx.length >= 2 && entCreditIdx.length >= 2) {
      if (bankExpenseIdx.length <= entCreditIdx.length) {
        const target = bankExpenseIdx.reduce((s, i) => s + unmatchedBank[i].amount, 0);
        const result = findSubsetSum(unmatchedEnterprise, entCreditIdx, target);
        if (result) {
          for (const bi of bankExpenseIdx) wholeUsedB.add(bi);
          for (const ei of result) wholeUsedE.add(ei);
          allMNGroups.push({
            bankItems: bankExpenseIdx.map((i) => unmatchedBank[i]),
            enterpriseItems: result.map((i) => unmatchedEnterprise[i]),
            bankSum: target,
            enterpriseSum: result.reduce((s, i) => s + unmatchedEnterprise[i].amount, 0),
          });
        }
      } else {
        const target = entCreditIdx.reduce((s, i) => s + unmatchedEnterprise[i].amount, 0);
        const result = findSubsetSum(unmatchedBank, bankExpenseIdx, target);
        if (result) {
          for (const bi of result) wholeUsedB.add(bi);
          for (const ei of entCreditIdx) wholeUsedE.add(ei);
          allMNGroups.push({
            bankItems: result.map((i) => unmatchedBank[i]),
            enterpriseItems: entCreditIdx.map((i) => unmatchedEnterprise[i]),
            bankSum: result.reduce((s, i) => s + unmatchedBank[i].amount, 0),
            enterpriseSum: target,
          });
        }
      }
    }

    // 剔除整体匹配已用的条目
    if (wholeUsedB.size > 0 || wholeUsedE.size > 0) {
      unmatchedBank = unmatchedBank.filter((_, i) => !wholeUsedB.has(i));
      unmatchedEnterprise = unmatchedEnterprise.filter((_, i) => !wholeUsedE.has(i));
    }
    } // end if (unmatched <= 30)
  }

  // ---- Phase 4: 后处理验证 ----
  const quickMatchCount = matched.filter((p) => p.quickMatch).length;
  const oneToOneBefore = matched.length;
  const remainingBankSum = unmatchedBank.reduce((s, t) => s + t.amount, 0);
  const remainingEntSum = unmatchedEnterprise.reduce((s, t) => s + t.amount, 0);
  const remainingAreReversals =
    (unmatchedBank.length > 0 || unmatchedEnterprise.length > 0) &&
    centsEqual(remainingBankSum, 0) && centsEqual(remainingEntSum, 0);

  const incomeDiffCents = Math.round(bankIncomeSum * 100) - Math.round(entDebitSum * 100);
  const expenseDiffCents = Math.round(bankExpenseSum * 100) - Math.round(entCreditSum * 100);

  return {
    account,
    matched,
    mnMatched: allMNGroups,
    unmatchedBank,
    unmatchedEnterprise,
    quickMatched: quickMatchCount,
    totalBank: bankList.length,
    totalEnterprise: origEntCount,
    reversalPairsRemoved: reversalPairCount,
    remainingAreReversals,
    debugInfo: {
      bankIncomeCount: bankIncome.length,
      bankIncomeSum,
      bankExpenseCount: bankExpense.length,
      bankExpenseSum,
      entDebitCount: entDebit.length,
      entDebitSum,
      entCreditCount: entCredit.length,
      entCreditSum,
      fastTrackIncomeTriggered,
      fastTrackExpenseTriggered,
      incomeDiffCents,
      expenseDiffCents,
      oneToOneMatched: oneToOneBefore - quickMatchCount,
      mnGroupsFound: allMNGroups.length,
      bankUnmatchedSignedSum: remainingBankSum,
      entUnmatchedSignedSum: remainingEntSum,
    },
  };
}

/**
 * 银企对账主入口
 * @param bankTxns 银行流水交易列表
 * @param enterpriseTxns 企业银行明细账交易列表
 * @returns 核对结果
 */
export function reconcile(
  bankTxns: BankTransaction[],
  enterpriseTxns: EnterpriseTransaction[]
): BankReconResult {
  // 1. 提取不重复账号
  const bankAcctSet = new Set<string>();
  for (const t of bankTxns) {
    if (t.account) bankAcctSet.add(t.account);
  }
  const entAcctSet = new Set<string>();
  for (const t of enterpriseTxns) {
    if (t.account) entAcctSet.add(t.account);
  }

  const bankAccounts = Array.from(bankAcctSet).sort();
  const enterpriseAccounts = Array.from(entAcctSet).sort();

  // 账号交集 — 只核对两边都有的账户
  const overlapAccounts = bankAccounts.filter((a) => entAcctSet.has(a));
  // 银行独有
  const skippedBankOnly = bankAccounts.filter((a) => !entAcctSet.has(a));
  // 企业独有
  const skippedEntOnly = enterpriseAccounts.filter((a) => !bankAcctSet.has(a));

  // 只核对交集账户
  const reconcileAccounts = overlapAccounts;

  // 诊断警告
  let warning: string | null = null;
  if (bankTxns.length === 0) {
    warning = '未能从银行流水中提取到任何交易，请检查列配置是否正确。';
  } else if (enterpriseTxns.length === 0) {
    warning = '未能从企业账中提取到任何交易，请检查列配置是否正确。';
  } else if (overlapAccounts.length === 0 && bankAccounts.length > 0 && enterpriseAccounts.length > 0) {
    warning = `银行流水账号（${bankAccounts.join('、')}）与企业账账号（${enterpriseAccounts.join('、')}）完全不匹配，请检查账号列选择是否正确。`;
  } else if (reconcileAccounts.length === 0) {
    warning = '银行流水与企业账没有共同的账号，无法进行核对。';
  }

  const accountResults: AccountResult[] = [];

  for (const account of reconcileAccounts) {
    accountResults.push(reconcileOneAccount(account, bankTxns, enterpriseTxns));
  }

  // 3. 汇总统计
  const summary: BankReconSummary = {
    totalAccounts: accountResults.length,
    fullyMatched: accountResults.filter(
      (r) => r.unmatchedBank.length === 0 && r.unmatchedEnterprise.length === 0 && r.totalBank > 0
    ).length,
    hasUnmatched: accountResults.filter(
      (r) => r.unmatchedBank.length > 0 || r.unmatchedEnterprise.length > 0
    ).length,
    totalUnmatchedBank: accountResults.reduce(
      (s, r) => s + r.unmatchedBank.length, 0
    ),
    totalUnmatchedEnterprise: accountResults.reduce(
      (s, r) => s + r.unmatchedEnterprise.length, 0
    ),
    totalMNMatched: accountResults.reduce(
      (s, r) => s + r.mnMatched.length, 0
    ),
    quickMatchedAccounts: accountResults.filter(
      (r) => r.quickMatched > 0 && r.unmatchedBank.length === 0 && r.unmatchedEnterprise.length === 0
    ).length,
    bankTxCount: bankTxns.length,
    enterpriseTxCount: enterpriseTxns.length,
    bankAccounts,
    enterpriseAccounts,
    overlapAccounts,
    skippedBankOnly,
    skippedEntOnly,
    warning,
  };

  return { accounts: accountResults, summary };
}

/** 流式核对事件类型 */
export type ReconStreamEvent =
  | { type: 'account'; result: AccountResult; accountIndex: number; totalAccounts: number }
  | { type: 'summary'; result: BankReconResult };

/**
 * 银企对账流式入口（异步生成器）
 * 逐账户 yield 结果，账户间让出主线程以保持 UI 响应
 * @param bankTxns 银行流水交易列表
 * @param enterpriseTxns 企业银行明细账交易列表
 */
export async function* reconcileStream(
  bankTxns: BankTransaction[],
  enterpriseTxns: EnterpriseTransaction[],
): AsyncGenerator<ReconStreamEvent> {
  // 1. 提取不重复账号（与 reconcile 相同的预处理）
  const bankAcctSet = new Set<string>();
  for (const t of bankTxns) {
    if (t.account) bankAcctSet.add(t.account);
  }
  const entAcctSet = new Set<string>();
  for (const t of enterpriseTxns) {
    if (t.account) entAcctSet.add(t.account);
  }

  const bankAccounts = Array.from(bankAcctSet).sort();
  const enterpriseAccounts = Array.from(entAcctSet).sort();
  const overlapAccounts = bankAccounts.filter((a) => entAcctSet.has(a));
  const skippedBankOnly = bankAccounts.filter((a) => !entAcctSet.has(a));
  const skippedEntOnly = enterpriseAccounts.filter((a) => !bankAcctSet.has(a));
  const reconcileAccounts = overlapAccounts;

  let warning: string | null = null;
  if (bankTxns.length === 0) {
    warning = '未能从银行流水中提取到任何交易，请检查列配置是否正确。';
  } else if (enterpriseTxns.length === 0) {
    warning = '未能从企业账中提取到任何交易，请检查列配置是否正确。';
  } else if (overlapAccounts.length === 0 && bankAccounts.length > 0 && enterpriseAccounts.length > 0) {
    warning = `银行流水账号（${bankAccounts.join('、')}）与企业账账号（${enterpriseAccounts.join('、')}）完全不匹配，请检查账号列选择是否正确。`;
  } else if (reconcileAccounts.length === 0) {
    warning = '银行流水与企业账没有共同的账号，无法进行核对。';
  }

  // 2. 逐账户核对，流式 yield
  const accountResults: AccountResult[] = [];
  const total = reconcileAccounts.length;

  for (let i = 0; i < reconcileAccounts.length; i++) {
    const account = reconcileAccounts[i];
    const result = reconcileOneAccount(account, bankTxns, enterpriseTxns);
    accountResults.push(result);
    yield { type: 'account', result, accountIndex: i, totalAccounts: total };
    // 让出主线程，保持 UI 响应
    await new Promise((r) => setTimeout(r, 0));
  }

  // 3. 汇总统计
  const summary: BankReconSummary = {
    totalAccounts: accountResults.length,
    fullyMatched: accountResults.filter(
      (r) => r.unmatchedBank.length === 0 && r.unmatchedEnterprise.length === 0 && r.totalBank > 0
    ).length,
    hasUnmatched: accountResults.filter(
      (r) => r.unmatchedBank.length > 0 || r.unmatchedEnterprise.length > 0
    ).length,
    totalUnmatchedBank: accountResults.reduce((s, r) => s + r.unmatchedBank.length, 0),
    totalUnmatchedEnterprise: accountResults.reduce((s, r) => s + r.unmatchedEnterprise.length, 0),
    totalMNMatched: accountResults.reduce((s, r) => s + r.mnMatched.length, 0),
    quickMatchedAccounts: accountResults.filter(
      (r) => r.quickMatched > 0 && r.unmatchedBank.length === 0 && r.unmatchedEnterprise.length === 0
    ).length,
    bankTxCount: bankTxns.length,
    enterpriseTxCount: enterpriseTxns.length,
    bankAccounts,
    enterpriseAccounts,
    overlapAccounts,
    skippedBankOnly,
    skippedEntOnly,
    warning,
  };

  yield { type: 'summary', result: { accounts: accountResults, summary } };
}

// ---- 数据提取辅助函数 ----

/** 银行流水列模式 */
export type BankAmountMode =
  | 'split'    // 双列：独立的收入列 + 支出列
  | 'combined'; // 单列：一列金额 + 一列方向（DR/CR）

/** 列配置 */
export interface ColumnConfig {
  accountCol: number;   // 账号列索引
  dateCol: number;      // 日期列索引
  amount1Col: number;   // 银行(split)：收入列 / 银行(combined)：金额列 / 企业：借方列
  amount2Col: number;   // 银行(split)：支出列 / 企业：贷方列（combined 模式下不使用）
  // 仅 combined 模式使用
  bankAmountMode?: BankAmountMode;  // 默认 'split'
  directionCol?: number;  // 方向列索引（DR/CR 所在列）
  drValue?: string;       // 代表"支出/扣账"的标识，默认 'DR'
}

/**
 * 从二维数组和列配置中提取银行流水交易
 * @param rows 二维数组（第一行为表头）
 * @param config 列配置
 * @returns BankTransaction[]
 */
export function extractBankTransactions(
  rows: string[][],
  config: ColumnConfig
): BankTransaction[] {
  const txns: BankTransaction[] = [];
  // 从第 1 行开始（跳过表头）
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue; // 跳过空行

    const account = cleanAccount(String(row[config.accountCol] ?? ''));
    if (!account) continue;

    const dateVal = row[config.dateCol];
    const date = parseDate(dateVal);
    if (!date) continue; // 无法解析日期则跳过

    let amount: number;
    let direction: '收入' | '支出';

    if (config.bankAmountMode === 'combined') {
      // --- 单列模式：金额列 + 方向列（DR/CR）---
      const rawAmount = parseAmount(String(row[config.amount1Col] ?? '0'));
      if (rawAmount === 0) continue; // 金额为0则跳过
      const dirStr = String(row[config.directionCol ?? -1] ?? '').trim().toUpperCase();
      const drMark = (config.drValue ?? 'DR').toUpperCase();
      // DR（扣账/支出）→ 负值；CR（入账/收入）→ 正值
      if (dirStr === drMark) {
        direction = '支出';
        amount = -Math.abs(rawAmount);
      } else {
        direction = '收入';
        amount = Math.abs(rawAmount);
      }
    } else {
      // --- 双列模式（默认）：独立的收入列 + 支出列 ---
      const incomeStr = String(row[config.amount1Col] ?? '0');
      const expenseStr = String(row[config.amount2Col] ?? '0');
      const income = parseAmount(incomeStr);
      const expense = parseAmount(expenseStr);

      if (income !== 0) {
        amount = income;
        direction = '收入';
      } else if (expense !== 0) {
        amount = -Math.abs(expense);
        direction = '支出';
      } else {
        continue; // 金额为0，跳过
      }
    }

    // 构建原始行映射
    const rawRow: Record<string, string> = {};
    const header = rows[0];
    for (let c = 0; c < row.length; c++) {
      rawRow[header[c] ?? `列${c}`] = String(row[c] ?? '');
    }

    txns.push({ account, date, amount, direction, rawRow });
  }
  return txns;
}

/**
 * 从二维数组和列配置中提取企业银行明细账交易
 */
export function extractEnterpriseTransactions(
  rows: string[][],
  config: ColumnConfig
): EnterpriseTransaction[] {
  // ---- 第一遍扫描：检测 SAP 贷方列的符号惯例 ----
  // 标准 SAP：贷方存正数（amount = -credit 变负 = 流出）
  // 部分 SAP 导出：贷方存负数（amount = credit 直接保留负号 = 流出）
  let creditNegCount = 0;
  let creditPosCount = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;
    const creditVal = parseAmount(String(row[config.amount2Col] ?? '0'));
    if (creditVal < 0) creditNegCount++;
    else if (creditVal > 0) creditPosCount++;
  }
  // 如果超过一半的非零贷方为负数，说明 SAP 已预存经济符号
  const creditIsSigned = creditNegCount > creditPosCount;

  const txns: EnterpriseTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const account = cleanAccount(String(row[config.accountCol] ?? ''));
    if (!account) continue;

    const dateVal = row[config.dateCol];
    const date = parseDate(dateVal);
    if (!date) continue;

    const debitStr = String(row[config.amount1Col] ?? '0');
    const creditStr = String(row[config.amount2Col] ?? '0');
    const debit = parseAmount(debitStr);
    const credit = parseAmount(creditStr);

    let amount: number;
    let direction: '借方' | '貸方';
    if (debit !== 0) {
      amount = debit;
      direction = '借方';
    } else if (credit !== 0) {
      if (creditIsSigned) {
        // SAP 贷方已存负数（资金流出），直接用原值
        // -66004.6 → amount=-66004.6（流出），冲销贷方 +200 → amount=+200（流入）
        amount = credit;
      } else {
        // 标准 SAP：贷方存正数，需取反表示流出
        // +500 → amount=-500（流出），冲销贷方 -200 → amount=+200（流入）
        amount = -credit;
      }
      direction = '貸方';
    } else {
      continue;
    }

    const rawRow: Record<string, string> = {};
    const header = rows[0];
    for (let c = 0; c < row.length; c++) {
      rawRow[header[c] ?? `列${c}`] = String(row[c] ?? '');
    }

    txns.push({ account, date, amount, direction, rawRow });
  }
  return txns;
}

/** 解析金额字符串（去逗号、去货币符号、处理括号负数、尾随负号） */
function parseAmount(s: string): number {
  let cleaned = s.replace(/[¥$£€,\s]/g, '').trim();
  if (!cleaned) return 0;
  // 括号负数: "(500.00)" → -500
  const parenMatch = cleaned.match(/^\((.+)\)$/);
  if (parenMatch) cleaned = '-' + parenMatch[1];
  // 尾随负号: "500.00-" → -500
  if (cleaned.endsWith('-')) cleaned = '-' + cleaned.slice(0, -1);
  // 尾随 DR/CR 标记（部分银行格式）: "500.00DR" → 500
  cleaned = cleaned.replace(/(DR|CR)$/i, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

/** 清洗账号：去除 Excel 文本格式前导引号、首尾空格、多余引号 */
function cleanAccount(raw: string): string {
  let s = raw.trim();
  // Excel 文本格式前导单引号: "'01234567" → "01234567"
  if (s.startsWith("'") && s.length > 1) s = s.slice(1);
  // 去除两端可能的多余引号
  s = s.replace(/^["']+|["']+$/g, '');
  return s.trim();
}
