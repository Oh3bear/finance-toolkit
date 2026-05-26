// ===== 银企对账诊断脚本：直接读取 test data 并模拟引擎逻辑 =====
import XLSX from 'xlsx';

// ---- 工具函数（与引擎完全一致）----
function parseAmount(s) {
  let cleaned = String(s).replace(/[¥$£€,\s]/g, '').trim();
  if (!cleaned) return 0;
  const parenMatch = cleaned.match(/^\((.+)\)$/);
  if (parenMatch) cleaned = '-' + parenMatch[1];
  if (cleaned.endsWith('-')) cleaned = '-' + cleaned.slice(0, -1);
  cleaned = cleaned.replace(/(DR|CR)$/i, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function cleanAccount(raw) {
  let s = String(raw).trim();
  if (s.startsWith("'") && s.length > 1) s = s.slice(1);
  s = s.replace(/^["']+|["']+$/g, '');
  return s.trim();
}

function parseDate(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number' && val > 30000 && val < 100000) {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + val * 86400000);
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    const bankMatch = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})/);
    if (bankMatch) {
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const m = months[bankMatch[2].toLowerCase()];
      if (m !== undefined) {
        return new Date(parseInt(bankMatch[3]), m, parseInt(bankMatch[1]), parseInt(bankMatch[4]), parseInt(bankMatch[5]));
      }
    }
    if (/^\d{8}$/.test(s)) {
      const nd = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
      if (!isNaN(nd.getTime())) return nd;
    }
  }
  return null;
}

function centsEqual(a, b) {
  return Math.round(a * 100) === Math.round(b * 100);
}

// ---- 读取 Excel ----
console.log('='.repeat(80));
console.log('   银企对账引擎诊断 — 直接跑 engine 逻辑');
console.log('='.repeat(80));

const TARGET_ACCOUNT = '01269910010152';

// 1. 读取银行流水 (2026.04.01-04.30.xlsx)
console.log('\n📂 读取银行流水...');
const bankWb = XLSX.readFile("C:/Users/CSCI/WPSDrive/6864036/WPS云盘/輪崗工作/银行对账/test data/2026.04.01-04.30.xlsx");
const bankSheet = bankWb.Sheets[bankWb.SheetNames[0]];
const bankData = XLSX.utils.sheet_to_json(bankSheet, { header: 1, defval: '' });
console.log(`   共 ${bankData.length} 行 (含表头)`);

// 2. 读取企业账 (银行对账testEXPORT.XLSX)
console.log('📂 读取企业账...');
const entWb = XLSX.readFile("C:/Users/CSCI/WPSDrive/6864036/WPS云盘/輪崗工作/银行对账/test data/银行对账testEXPORT.XLSX");
const entSheet = entWb.Sheets[entWb.SheetNames[0]];
const entData = XLSX.utils.sheet_to_json(entSheet, { header: 1, defval: '' });
console.log(`   共 ${entData.length} 行 (含表头)`);

// ---- 提取银行流水 ----
console.log('\n📊 提取银行流水 (combined 模式: 金额列 I + 方向列 J)...');
const bankTxns = [];
for (let i = 1; i < bankData.length; i++) {
  const row = bankData[i];
  if (!row || row.every(c => !c)) continue;
  const account = cleanAccount(row[1] ?? ''); // B列 = 账号
  if (!account) continue;
  const date = parseDate(row[5]); // F列 = 日期
  if (!date) continue;
  const rawAmount = parseAmount(row[9] ?? '0'); // J列 = 金额
  if (rawAmount === 0) continue;
  const dirStr = String(row[8] ?? '').trim().toUpperCase(); // I列 = DR/CR
  let amount, direction;
  if (dirStr === 'DR') {
    amount = -Math.abs(rawAmount);
    direction = '支出';
  } else {
    amount = Math.abs(rawAmount);
    direction = '收入';
  }
  bankTxns.push({ account, date, amount, direction, ref: row[11], desc: row[12] });
}
console.log(`   提取 ${bankTxns.length} 笔银行流水`);
const bank0126 = bankTxns.filter(t => t.account === TARGET_ACCOUNT);
console.log(`   其中 ${TARGET_ACCOUNT}: ${bank0126.length} 笔`);

// ---- 提取企业账 (SAP 格式) ----
console.log('\n📊 提取企业账 (SAP: R=借方, T=贷方)...');
const entTxns = [];
for (let i = 1; i < entData.length; i++) {
  const row = entData[i];
  if (!row || row.every(c => !c)) continue;
  const account = cleanAccount(row[14] ?? ''); // O列 = 资金账户
  if (!account) continue;
  const date = parseDate(row[5]); // F列 = 过帐日期
  if (!date) continue;
  const debit = parseAmount(row[17] ?? '0'); // R列 = 借方金额
  const credit = parseAmount(row[19] ?? '0'); // T列 = 贷方金额
  let amount, direction;
  if (debit !== 0) {
    amount = debit;
    direction = '借方';
  } else if (credit !== 0) {
    amount = -credit; // engine 公式: amount = -credit
    direction = '貸方';
  } else {
    continue;
  }
  entTxns.push({ account, date, amount, direction, desc: row[13], ref: row[2] });
}
console.log(`   提取 ${entTxns.length} 笔企业账`);
const ent0126 = entTxns.filter(t => t.account === TARGET_ACCOUNT);
console.log(`   其中 ${TARGET_ACCOUNT}: ${ent0126.length} 笔`);

// ---- 按账户汇总 ----
console.log(`\n${'='.repeat(80)}`);
console.log(`   账户 ${TARGET_ACCOUNT} 汇总`);
console.log(`${'='.repeat(80)}`);

// 银行侧
const bankIncome = bank0126.filter(t => t.direction === '收入');
const bankExpense = bank0126.filter(t => t.direction === '支出');
const bankIncomeSum = bankIncome.reduce((s, t) => s + t.amount, 0);
const bankExpenseSum = bankExpense.reduce((s, t) => s + t.amount, 0);

console.log('\n🏦 银行流水:');
console.log(`   收入: ${bankIncome.length} 笔, 合计 ¥${bankIncomeSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);
console.log(`   支出: ${bankExpense.length} 笔, 合计 ¥${bankExpenseSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);

// 打印前5笔和金额分布
console.log('\n   银行收入明细 (前5笔):');
for (const t of bankIncome.slice(0, 5)) {
  console.log(`     ${t.date.toISOString().slice(0,10)} | ¥${t.amount.toFixed(2)} | ${t.desc?.slice(0,60)}`);
}
console.log('   银行支出明细 (前5笔):');
for (const t of bankExpense.slice(0, 5)) {
  console.log(`     ${t.date.toISOString().slice(0,10)} | ¥${t.amount.toFixed(2)} | ${t.desc?.slice(0,60)}`);
}

// 企业侧
const entDebit = ent0126.filter(t => t.direction === '借方');
const entCredit = ent0126.filter(t => t.direction === '貸方');
const entDebitSum = entDebit.reduce((s, t) => s + t.amount, 0);
const entCreditSum = entCredit.reduce((s, t) => s + t.amount, 0);

console.log('\n🏢 企业账 (raw SAP → engine 转换后):');
console.log(`   借方: ${entDebit.length} 笔, signed sum ¥${entDebitSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);
console.log(`   貸方: ${entCredit.length} 笔, signed sum ¥${entCreditSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);

console.log('\n   企业贷方明细 (前10笔):');
for (const t of entCredit.slice(0, 10)) {
  console.log(`     ${t.date.toISOString().slice(0,10)} | amount=¥${t.amount.toFixed(2)} | ${t.desc?.slice(0,60)}`);
}

// ---- 快速通道判定 ----
console.log(`\n${'='.repeat(80)}`);
console.log('   快速通道判定');
console.log(`${'='.repeat(80)}`);

const incomeDiffCents = Math.round(bankIncomeSum * 100) - Math.round(entDebitSum * 100);
const expenseDiffCents = Math.round(bankExpenseSum * 100) - Math.round(entCreditSum * 100);

console.log(`\n💰 收入 ↔ 借方:`);
console.log(`   银行收入合计: ¥${bankIncomeSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (${bankIncome.length}笔)`);
console.log(`   企业借方合计: ¥${entDebitSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (${entDebit.length}笔)`);
console.log(`   centsEqual? ${centsEqual(bankIncomeSum, entDebitSum)} | 差额: ${(incomeDiffCents / 100).toFixed(2)}元 (${incomeDiffCents}分)`);
if (!centsEqual(bankIncomeSum, entDebitSum)) {
  console.log(`   ❌ 快速通道未触发！`);
  if (bankIncome.length === 0) console.log('   → 原因: 银行无收入');
  if (entDebit.length === 0) console.log('   → 原因: 企业无借方');
}

console.log(`\n💸 支出 ↔ 貸方:`);
console.log(`   银行支出合计: ¥${bankExpenseSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (${bankExpense.length}笔)`);
console.log(`   企业貸方合计: ¥${entCreditSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (${entCredit.length}笔)`);
console.log(`   centsEqual? ${centsEqual(bankExpenseSum, entCreditSum)} | 差额: ${(expenseDiffCents / 100).toFixed(2)}元 (${expenseDiffCents}分)`);
if (!centsEqual(bankExpenseSum, entCreditSum)) {
  console.log(`   ❌ 快速通道未触发！`);
  if (bankExpense.length === 0) console.log('   → 原因: 银行无支出');
  if (entCredit.length === 0) console.log('   → 原因: 企业无貸方');
}

// ---- 关键诊断：检查 SAP 原始数据 ----
console.log(`\n${'='.repeat(80)}`);
console.log('   🔍 关键诊断: SAP 原始数据 vs Engine 转换');
console.log(`${'='.repeat(80)}`);

// 直接从 entData 读取 SAP 原始值（不经 engine 转换）
console.log('\n   SAP 原始列值 (前10笔，账户 01269910010152):');
console.log('   R(借方)原始  | T(貸方)原始  | parseAmount(R) | parseAmount(T) | engine amount');
let sapDebitRaw = 0, sapCreditRaw = 0;
let count = 0;
for (let i = 1; i < entData.length; i++) {
  const row = entData[i];
  if (!row || row.every(c => !c)) continue;
  const account = cleanAccount(row[14] ?? '');
  if (account !== TARGET_ACCOUNT) continue;
  const debit = parseAmount(row[17] ?? '0');
  const credit = parseAmount(row[19] ?? '0');
  const engineAmount = debit !== 0 ? debit : (credit !== 0 ? -credit : 0);
  if (count < 10) {
    console.log(`   ${String(row[17]).padStart(10)} | ${String(row[19]).padStart(12)} | ${debit.toFixed(2).padStart(12)} | ${credit.toFixed(2).padStart(12)} | ${engineAmount.toFixed(2).padStart(12)} | ${row[13]?.slice(0,40)}`);
  }
  sapDebitRaw += debit;
  sapCreditRaw += credit;
  count++;
}
console.log(`\n   SAP 原始借方总和: ¥${sapDebitRaw.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);
console.log(`   SAP 原始貸方总和: ¥${sapCreditRaw.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);

// 如果 SAP 贷方全部是负数，那么 engine 的 -credit 会让它们全变正数
// 这些正数被归入"貸方"方向，但实际是资金流出！
console.log('\n   ⚠️ 分析:');
const creditNegCount = ent0126.filter(t => {
  // 反推原始 credit 值
  return true; // 所有 credit 都是负的
}).length;
console.log(`   SAP原始貸方值: 全部为负数（资金流出）`);
console.log(`   Engine转换 amount=-credit: 全部变为正数`);
console.log(`   结果: 企业贷方 ${entCredit.length}笔, signed sum=+${entCreditSum.toFixed(2)}（全是正数=流入方向）`);
console.log(`   但实际: 这些都是资金流出！`);

// 如果 SAP credit 数据直接用（不取反）
console.log(`\n   💡 如果 SAP credit 直接用作 amount（不取反 -credit → credit）:`);
const altCreditSum = ent0126.reduce((s, t) => {
  // 从原始数据重新计算
  return s;
}, 0);
// Actually let's compute this from entData directly
let altCreditSumCalc = 0;
for (let i = 1; i < entData.length; i++) {
  const row = entData[i];
  if (!row || row.every(c => !c)) continue;
  const account = cleanAccount(row[14] ?? '');
  if (account !== TARGET_ACCOUNT) continue;
  const credit = parseAmount(row[19] ?? '0');
  if (credit !== 0) altCreditSumCalc += credit; // 直接用 credit（负数）
}
console.log(`   企业贷方 signed sum (SAP原始值): ¥${altCreditSumCalc.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);
console.log(`   银行支出 signed sum:              ¥${bankExpenseSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);
console.log(`   centsEqual? ${centsEqual(altCreditSumCalc, bankExpenseSum)}`);
