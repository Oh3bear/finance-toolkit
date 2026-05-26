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


// ---- 主函数 ----

/** M:N 子集求和：渐进式候选上限（从小到大，边匹配边缩减池子） */
const MN_CANDIDATE_PASSES = [10, 20, 30, 40, 50, 80, Infinity];

/**
 * 对剩余未匹配项做 M:N 子集求和匹配，支持双向：
 *   a) 多笔银行流水 → 一笔企业账（银行拆分、企业合并）
 *   b) 一笔银行流水 → 多笔企业账（企业拆分、银行合并）
 *
 * 策略：
 *   1. 从大额开始匹配（优先清理大额，减少后续干扰）
 *   2. 渐进式候选上限：10→20→30→...→无限制，每轮匹配后池子缩小
 *   3. 按有符号金额匹配：正=流入，负=流出，同符号才能互配
 */
function findMNMatches(
  unmatchedBank: BankTransaction[],
  unmatchedEnterprise: EnterpriseTransaction[]
): { groups: MNMatchGroup[]; usedBankIdx: Set<number>; usedEntIdx: Set<number> } {
  const groups: MNMatchGroup[] = [];
  const usedBankIdx = new Set<number>();
  const usedEntIdx = new Set<number>();

  // 总条数太少，直接跳过
  const totalRemaining = unmatchedBank.length + unmatchedEnterprise.length;
  if (totalRemaining < 3) return { groups, usedBankIdx, usedEntIdx };

  for (const maxCandidates of MN_CANDIDATE_PASSES) {
    // --- 方向 a: 多笔银行流水 → 一笔企业账（从大到小）---
    const entSorted = unmatchedEnterprise
      .map((ent, i) => ({ ent, i }))
      .filter(({ i }) => !usedEntIdx.has(i))
      .sort((a, b) => Math.abs(b.ent.amount) - Math.abs(a.ent.amount));

    for (const { ent, i: ei } of entSorted) {
      if (usedEntIdx.has(ei)) continue;
      const target = ent.amount; // 有符号：正=流入，负=流出

      // 按符号筛选：同符号的银行流水才能匹配
      const candidates: { idx: number; dist: number }[] = [];
      for (let bi = 0; bi < unmatchedBank.length; bi++) {
        if (usedBankIdx.has(bi)) continue;
        const sameSign = (target > 0) === (unmatchedBank[bi].amount > 0);
        if (sameSign) {
          candidates.push({ idx: bi, dist: Math.abs(Math.abs(unmatchedBank[bi].amount) - Math.abs(target)) });
        }
      }

      if (candidates.length < 2) continue;

      let selectedIdx: number[];
      if (candidates.length > maxCandidates) {
        candidates.sort((a, b) => a.dist - b.dist);
        selectedIdx = candidates.slice(0, maxCandidates).map((c) => c.idx);
      } else {
        selectedIdx = candidates.map((c) => c.idx);
      }

      const idxSet = findSubsetSum(unmatchedBank, selectedIdx, target);
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
      .filter(({ i }) => !usedBankIdx.has(i))
      .sort((a, b) => Math.abs(b.bank.amount) - Math.abs(a.bank.amount));

    for (const { bank, i: bi } of bankSorted) {
      if (usedBankIdx.has(bi)) continue;
      const target = bank.amount; // 有符号

      // 按符号筛选：同符号的企业账才能匹配
      const candidates: { idx: number; dist: number }[] = [];
      for (let ei = 0; ei < unmatchedEnterprise.length; ei++) {
        if (usedEntIdx.has(ei)) continue;
        const sameSign = (target > 0) === (unmatchedEnterprise[ei].amount > 0);
        if (sameSign) {
          candidates.push({ idx: ei, dist: Math.abs(Math.abs(unmatchedEnterprise[ei].amount) - Math.abs(target)) });
        }
      }

      if (candidates.length < 2) continue;

      let selectedIdx: number[];
      if (candidates.length > maxCandidates) {
        candidates.sort((a, b) => a.dist - b.dist);
        selectedIdx = candidates.slice(0, maxCandidates).map((c) => c.idx);
      } else {
        selectedIdx = candidates.map((c) => c.idx);
      }

      const idxSet = findSubsetSum(unmatchedEnterprise, selectedIdx, target);
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
  }

  return { groups, usedBankIdx, usedEntIdx };
}

/**
 * 在 candidates 中寻找子集，使其有符号金额之和等于 target
 * 按分取整比较 — 财务金额天然是分精度，浮点误差无实际意义
 * target 可为正（资金流入）或负（资金流出），candidates 必须同符号
 * 返回第一个匹配的原始索引数组，或 null
 */
function findSubsetSum<T extends { amount: number }>(
  allItems: T[],
  candidates: number[],
  target: number
): number[] | null {
  const targetCents = Math.round(target * 100);
  const isPositive = targetCents > 0;

  // 排序：正值升序（小→大），负值降序（大→小，即从接近0开始逐步更负）
  const sorted = [...candidates].sort((a, b) => {
    const va = allItems[a].amount;
    const vb = allItems[b].amount;
    return isPositive ? va - vb : vb - va;
  });

  let best: number[] | null = null;

  function dfs(start: number, current: number[], currentSumCents: number) {
    if (current.length > 5) return;

    if (current.length >= 2 && currentSumCents === targetCents) {
      best = [...current];
      return;
    }
    if (current.length === 5) return;

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
    }
  }

  dfs(0, [], 0);
  return best;
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
    // 2a. 筛选该账号的银行流水
    let bankList = bankTxns.filter(
      (t) => t.account === account
    );
    // 2b. 筛选该账号的企业账
    let entList = enterpriseTxns.filter(
      (t) => t.account === account
    );

    // 2c. 按日期升序排序
    bankList = bankList.sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    entList = entList.sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    // ---- Phase 0: 冲销预处理 ----
    // 在企业账同方向内部清除正负抵消的冲销配对（净效果=0）
    // 冲销成对出现的条目不参与后续与银行流水的匹配
    const origEntCount = entList.length;
    const entReversalUsed = new Set<number>();
    let reversalPairCount = 0;

    // 借方冲销配对：正数(原始) ↔ 负数(冲销)，金额相等
    for (let i = 0; i < entList.length; i++) {
      if (entReversalUsed.has(i)) continue;
      if (entList[i].direction !== '借方') continue;
      const a = entList[i].amount;
      if (a === 0) continue;
      for (let j = i + 1; j < entList.length; j++) {
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

    // 貸方冲销配对：正数(冲销) ↔ 负数(原始)，金额相等
    for (let i = 0; i < entList.length; i++) {
      if (entReversalUsed.has(i)) continue;
      if (entList[i].direction !== '貸方') continue;
      const a = entList[i].amount;
      if (a === 0) continue;
      for (let j = i + 1; j < entList.length; j++) {
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

    // 从企业账中移除冲销配对
    if (reversalPairCount > 0) {
      entList = entList.filter((_, i) => !entReversalUsed.has(i));
    }

    // 2d. 匹配
    const matched: BankMatchPair[] = [];
    const bankUsed = new Array(bankList.length).fill(false);
    const entUsed = new Array(entList.length).fill(false);

    // 2d-1. 快速对符通道：银行收入合计 = 企业借方合计 → 全部收入/借方标记对符
    //         银行支出合计 = 企业贷方合计 → 全部支出/贷方标记对符
    const bankIncome = bankList.filter((t) => t.direction === '收入');
    const bankExpense = bankList.filter((t) => t.direction === '支出');
    const entDebit = entList.filter((t) => t.direction === '借方');
    const entCredit = entList.filter((t) => t.direction === '貸方');

    // 诊断：各方向求和
    const bankIncomeSum = bankIncome.reduce((s, t) => s + t.amount, 0);
    const bankExpenseSum = bankExpense.reduce((s, t) => s + t.amount, 0);
    const entDebitSum = entDebit.reduce((s, t) => s + t.amount, 0);
    const entCreditSum = entCredit.reduce((s, t) => s + t.amount, 0);

    let fastTrackIncomeTriggered = false;
    let fastTrackExpenseTriggered = false;

    // 收入 ↔ 借方 快速对符
    // 语义：总额一致 → 全部对符，条数无需关心
    if (bankIncome.length > 0 && entDebit.length > 0) {
      if (centsEqual(bankIncomeSum, entDebitSum)) {
        fastTrackIncomeTriggered = true;
        // 生成展示用配对（按顺序 1:1，不管条数差异）
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
        // 全部标记已使用——不受配对数量影响
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

    // 2e. 逐笔匹配：按有符号金额直接比较（正=流入，负=流出）
    // 无需判断方向——符号本身已编码经济含义
    for (let bi = 0; bi < bankList.length; bi++) {
      if (bankUsed[bi]) continue;
      const bank = bankList[bi];

      for (let ei = 0; ei < entList.length; ei++) {
        if (entUsed[ei]) continue;
        const ent = entList[ei];
        if (centsEqual(bank.amount, ent.amount)) {
          matched.push({ bank, enterprise: ent });
          bankUsed[bi] = true;
          entUsed[ei] = true;
          break;
        }
      }
    }

    // 2f. 收集1:1未匹配项
    let unmatchedBank = bankList.filter((_, i) => !bankUsed[i]);
    let unmatchedEnterprise = entList.filter((_, i) => !entUsed[i]);

    // 2g. M:N 匹配（对剩余未匹配项尝试子集求和）
    const mnResult = findMNMatches(unmatchedBank, unmatchedEnterprise);

    // 从剩余未匹配中移除 M:N 已用项
    if (mnResult.groups.length > 0) {
      // 重建未匹配列表（排除 M:N 已用的）
      const mnUsedBank = mnResult.usedBankIdx;
      const mnUsedEnt = mnResult.usedEntIdx;
      unmatchedBank = unmatchedBank.filter((_, i) => !mnUsedBank.has(i));
      unmatchedEnterprise = unmatchedEnterprise.filter((_, i) => !mnUsedEnt.has(i));
    }

    // 1:1 匹配前的 matched 计数 = 快速通道对数
    const quickMatchCount = matched.filter((p) => p.quickMatch).length;
    const oneToOneBefore = matched.length;

    // ---- Phase 3: 后处理验证 ----
    // 剩余未匹配 signed sum = 0 → 全是冲销残留（成对抵消，不影响余额）
    const remainingBankSum = unmatchedBank.reduce((s, t) => s + t.amount, 0);
    const remainingEntSum = unmatchedEnterprise.reduce((s, t) => s + t.amount, 0);
    const remainingAreReversals =
      (unmatchedBank.length > 0 || unmatchedEnterprise.length > 0) &&
      centsEqual(remainingBankSum, 0) && centsEqual(remainingEntSum, 0);

    // 诊断：计算差额（分）
    const incomeDiffCents = Math.round(bankIncomeSum * 100) - Math.round(entDebitSum * 100);
    const expenseDiffCents = Math.round(bankExpenseSum * 100) - Math.round(entCreditSum * 100);

    accountResults.push({
      account,
      matched,
      mnMatched: mnResult.groups,
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
        mnGroupsFound: mnResult.groups.length,
        bankUnmatchedSignedSum: remainingBankSum,
        entUnmatchedSignedSum: remainingEntSum,
      },
    });
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
      // 贷方正常为资金流出（负），冲销（贷方正数）为资金流入（正）
      // -credit: 正常贷方 +500 → -500（流出）；冲销贷方 -200 → +200（流入）
      amount = -credit;
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
