/**
 * 统一日期处理工具
 *
 * 核心原则：
 * 1. Excel 日期使用 UTC 纪元（1899-12-30），转换后的 Date 对象在 UTC 午夜
 * 2. 所有日期显示使用本地时间方法（getFullYear / getMonth / getDate / toLocaleDateString）
 * 3. 绝不使用 toISOString / getUTCDate 等方法做日期展示（会导致 +8 时区偏移）
 */

/** Excel 序列号转为 JavaScript Date 对象（UTC 午夜基准） */
export function excelSerialToDate(serial: number): Date {
  // 1900 假闰年 bug：序列号 >= 61 需减 1
  const corrected = serial >= 61 ? serial - 1 : serial;
  // Excel 纪元 1899-12-30 → Unix 纪元 1970-01-01 相差 25569 天
  return new Date((corrected - 25569) * 86400000);
}

/** Date → YYYY-MM-DD，使用本地时间避免 UTC 偏移 */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date → 中文日期字符串（如 2026/5/28），使用本地时间 */
export function toLocaleChineseStr(d: Date): string {
  return d.toLocaleDateString('zh-CN');
}

/**
 * 格式化单元格值为字符串（处理日期优先）
 * 支持的输入类型：
 * - Date 对象 → 中文日期
 * - Excel 序列号数字（30000~100000）→ 中文日期
 * - 普通数字 → 保留 2 位小数
 * - 字符串/其他 → 原样返回（截断 20 字符）
 */
export function formatDateCell(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return toLocaleChineseStr(v);
  }
  if (typeof v === 'number') {
    if (v > 30000 && v < 100000) {
      return toLocaleChineseStr(excelSerialToDate(v));
    }
    return String(Math.round(v * 100) / 100);
  }
  if (v == null || v === '') return '';
  const s = String(v).trim();
  return s.length > 20 ? s.slice(0, 20) + '\u2026' : s;
}

/**
 * 格式化任意单元格值为字符串（不截断），用于数据传递而非展示
 * 与 formatDateCell 相同逻辑但不截断字符串
 */
export function formatCellFull(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return toLocalDateStr(v);
  }
  if (typeof v === 'number') {
    if (v > 30000 && v < 100000) {
      return toLocalDateStr(excelSerialToDate(v));
    }
    return String(Math.round(v * 100) / 100);
  }
  if (v == null || v === '') return '';
  return String(v).trim();
}

/**
 * 导出文件名用日期（本地时间 YYYY-MM-DD）
 * 替代 new Date().toISOString().slice(0, 10) 避免 UTC 偏差
 */
export function fmtExportDate(): string {
  return toLocalDateStr(new Date());
}
