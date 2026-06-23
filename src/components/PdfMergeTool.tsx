import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as PDFLib from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, Trash2, GripVertical, FileText, ArrowDown, ChevronDown, ChevronRight, CheckSquare, Square } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';

const { PDFDocument, rgb, StandardFonts } = PDFLib;

interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pages: number;
  thumbUrl?: string;
  thumbStatus: 'idle' | 'loading' | 'done' | 'error';
  arrayBuffer: ArrayBuffer;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 分隔符预设
const DELIMITER_PRESETS = [
  { label: '_ (下划线)', value: '_' },
  { label: '- (短横线)', value: '-' },
  { label: '空格', value: ' ' },
  { label: '自定义...', value: '__custom__' },
];

// ============ 样例推断逻辑 ============

/**
 * 将用户输入的真实文件名样例转换为正则表达式。
 * 推断规则：
 *   连续纯数字  →  \d+
 *   连续大写字母 → [A-Z]+
 *   连续小写字母 → [a-z]+
 *   连续大小写混合字母 → [A-Za-z]+
 *   连续数字+字母 → [A-Za-z0-9]+
 *   特殊符号（非字母数字）→ 原样转义
 *
 * 第一段连续字母/数字默认加捕获组，作为分组键。
 */
function inferPatternFromExample(example: string): { pattern: string; error: string } {
  if (!example.trim()) return { pattern: '', error: '' };

  // 将字符串切分为"token"序列，每个 token 是连续同类字符
  const tokens: Array<{ type: 'digits' | 'upper' | 'lower' | 'mixed_alpha' | 'alnum' | 'special'; raw: string }> = [];
  let i = 0;
  while (i < example.length) {
    const ch = example[i];
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < example.length && /[0-9]/.test(example[j])) j++;
      tokens.push({ type: 'digits', raw: example.slice(i, j) });
      i = j;
    } else if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < example.length && /[A-Za-z0-9]/.test(example[j])) j++;
      const seg = example.slice(i, j);
      // 判断字母数字混合情况
      const hasDigit = /[0-9]/.test(seg);
      const hasUpper = /[A-Z]/.test(seg);
      const hasLower = /[a-z]/.test(seg);
      let type: typeof tokens[0]['type'];
      if (hasDigit) type = 'alnum';
      else if (hasUpper && !hasLower) type = 'upper';
      else if (!hasUpper && hasLower) type = 'lower';
      else type = 'mixed_alpha';
      tokens.push({ type, raw: seg });
      i = j;
    } else {
      // 特殊字符一个一个处理
      tokens.push({ type: 'special', raw: ch });
      i++;
    }
  }

  // 生成 pattern 片段
  const parts = tokens.map((t) => {
    switch (t.type) {
      case 'digits': return `\\d+`;
      case 'upper': return `[A-Z]+`;
      case 'lower': return `[a-z]+`;
      case 'mixed_alpha': return `[A-Za-z]+`;
      case 'alnum': return `[A-Za-z0-9]+`;
      case 'special': return t.raw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }
  });

  // 第一个非特殊 token 加捕获组（用于提取分组键）
  const firstNonSpecial = parts.findIndex((_, idx) => tokens[idx].type !== 'special');
  if (firstNonSpecial >= 0) {
    parts[firstNonSpecial] = `(${parts[firstNonSpecial]})`;
  }

  return { pattern: parts.join(''), error: '' };
}

/** 用正则从文件名中提取分组键，取第一个捕获组；若无捕获组则取整个匹配 */
function applyPattern(baseName: string, pattern: string): string | null {
  try {
    const re = new RegExp(pattern, 'i');
    const m = baseName.match(re);
    if (!m) return null;
    // 优先用第一个捕获组，否则用整个匹配
    return (m[1] !== undefined ? m[1] : m[0]) || null;
  } catch {
    return null;
  }
}

// 生成单个文件缩略图，同时返回页数（复用 pdfjsLib 的解析结果，避免二次 PDFDocument.load）
async function genThumb(item: PdfFile): Promise<{ url: string | null; pages: number }> {
  try {
    // pdfjs 会 transfer（detach）传入的 ArrayBuffer，必须先 slice 复制一份，
    // 否则合并时 item.arrayBuffer 已是 detached 状态，导致 pdf-lib 报错
    const pdf = await pdfjsLib.getDocument({ data: item.arrayBuffer.slice(0) }).promise;
    const pages = pdf.numPages;
    const page = await pdf.getPage(1);
    const scale = 200 / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    pdf.destroy();
    return { url: dataUrl, pages };
  } catch {
    return { url: null, pages: 0 };
  }
}

export default function PdfMergeTool({ sidebarCollapsed = false }: { sidebarCollapsed?: boolean }) {
  // --- 文件状态 ---
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, text: '' });

  // --- 合并选项 ---
  const [autoGroup, setAutoGroup] = useState(true);
  const [insertDivider, setInsertDivider] = useState(false);
  const [addPageNum, setAddPageNum] = useState(true);

  // --- 分组配置 ---
  const [configExpanded, setConfigExpanded] = useState(false);
  const [groupMode, setGroupMode] = useState<'delimiter' | 'fixedLength' | 'pattern'>('delimiter');
  const [delimiterPreset, setDelimiterPreset] = useState('_');
  const [customDelimiter, setCustomDelimiter] = useState('');
  const [fixedLength, setFixedLength] = useState(6);
  const [fixedStart, setFixedStart] = useState(0);   // 固定长度模式的起始位置（字符索引，从0开始）
  const [selectedSegment, setSelectedSegment] = useState(0);
  // --- 命名来源（独立于分组规则）---
  const [nameSourceMode, setNameSourceMode] = useState<'groupKey' | 'fixedPos' | 'delimiterSeg'>('groupKey');
  const [nameFixedStart, setNameFixedStart] = useState(0);       // 命名截取起始位置
  const [nameFixedEnd, setNameFixedEnd] = useState(6);           // 命名截取结束位置（不含）
  const [nameDelimiterSeg, setNameDelimiterSeg] = useState(0);   // 命名用第几段（分隔符模式）
  const [nameTemplate, setNameTemplate] = useState('{group}_合并_{count}文件');
  const [checkedGroups, setCheckedGroups] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);

  // --- 正则/样例模式 ---
  const [patternExample, setPatternExample] = useState('');         // 用户输入样例
  const [patternRegex, setPatternRegex] = useState('');             // 推断或手动输入的正则
  const [patternManual, setPatternManual] = useState(false);        // 是否手动编辑了正则
  const [patternError, setPatternError] = useState('');             // 正则语法错误提示

  // --- toast ---
  const [toast, setToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  }, []);

  // 实际使用的分隔符
  const effectiveDelimiter = delimiterPreset === '__custom__' ? customDelimiter : delimiterPreset;

  // 计算文件的分组键（根据当前分组配置）
  const computeGroup = useCallback((name: string): string => {
    const baseName = name.replace(/\.pdf$/i, '');
    if (groupMode === 'fixedLength') {
      const result = baseName.slice(fixedStart, fixedStart + fixedLength);
      return result || '其他';
    }
    if (groupMode === 'pattern') {
      if (!patternRegex) return baseName || '其他';
      const result = applyPattern(baseName, patternRegex);
      return result || '未匹配';
    }
    // delimiter mode
    if (!effectiveDelimiter) return baseName || '其他';
    const segments = baseName.split(effectiveDelimiter).filter(s => s.length > 0);
    if (segments.length === 0) return '其他';
    return segments[selectedSegment] || segments[0] || '其他';
  }, [groupMode, fixedLength, fixedStart, effectiveDelimiter, selectedSegment, patternRegex]);

  // 根据命名来源规则，从文件名中提取命名值（用于输出文件名）
  const computeNameSource = useCallback((name: string): string => {
    const baseName = name.replace(/\.pdf$/i, '');
    if (nameSourceMode === 'fixedPos') {
      // 固定位置截取 [start, end)
      const s = Math.min(nameFixedStart, nameFixedEnd);
      const e = Math.max(nameFixedStart, nameFixedEnd);
      const result = baseName.slice(s, e);
      return result || '未命名';
    }
    if (nameSourceMode === 'delimiterSeg') {
      if (!effectiveDelimiter) return baseName || '未命名';
      const segments = baseName.split(effectiveDelimiter).filter(s => s.length > 0);
      return segments[nameDelimiterSeg] || segments[0] || '未命名';
    }
    // groupKey 模式：返回空，由调用方使用 groupKey
    return '';
  }, [nameSourceMode, nameFixedStart, nameFixedEnd, nameDelimiterSeg, effectiveDelimiter]);

  // 计算分组键列表（排序后）
  const groupKeys = useMemo(() => {
    if (!autoGroup || files.length === 0) return [];
    const map: Record<string, PdfFile[]> = {};
    files.forEach(f => {
      const k = computeGroup(f.name);
      if (!map[k]) map[k] = [];
      map[k].push(f);
    });
    return Object.keys(map).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [files, autoGroup, computeGroup]);

  // 分组键变化时，自动全选
  const prevGroupKeysRef = useRef<string>('');
  useEffect(() => {
    const currentKeys = groupKeys.join(',');
    if (currentKeys !== prevGroupKeysRef.current) {
      prevGroupKeysRef.current = currentKeys;
      setCheckedGroups(new Set(groupKeys));
    }
  }, [groupKeys]);

  // 切换分组的选中状态
  const toggleGroup = useCallback((key: string) => {
    setCheckedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleAllGroups = useCallback(() => {
    if (checkedGroups.size === groupKeys.length) {
      setCheckedGroups(new Set());
    } else {
      setCheckedGroups(new Set(groupKeys));
    }
  }, [checkedGroups.size, groupKeys]);

  // 切分预览（仅分隔符模式）
  const splitPreview = useMemo(() => {
    if (groupMode !== 'delimiter' || !effectiveDelimiter) return [];
    return files.map(f => {
      const baseName = f.name.replace(/\.pdf$/i, '');
      return { name: f.name, segments: baseName.split(effectiveDelimiter) };
    });
  }, [files, effectiveDelimiter, groupMode]);

  // 最大段数
  const maxSegments = useMemo(() => {
    return Math.max(0, ...splitPreview.map(s => s.segments.length));
  }, [splitPreview]);

  // 选中的分组数
  const checkedCount = checkedGroups.size;
  const totalGroupCount = groupKeys.length;

  // --- useEffect: 驱动缩略图生成 ---
  useEffect(() => {
    const pending = files.filter(
      (f) => f.thumbStatus === 'idle' && !genRef.current.has(f.id)
    );
    if (pending.length === 0) return;

    pending.forEach((p) => genRef.current.add(p.id));

    setFiles((prev) =>
      prev.map((f) =>
        pending.some((p) => p.id === f.id) ? { ...f, thumbStatus: 'loading' as const } : f
      )
    );

    pending.forEach(async (item) => {
      const { url, pages: actualPages } = await genThumb(item);
      genRef.current.delete(item.id);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                thumbUrl: url || undefined,
                thumbStatus: url ? ('done' as const) : ('error' as const),
                pages: actualPages > 0 ? actualPages : f.pages,
              }
            : f
        )
      );
    });
  }, [files]);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const pdfFiles = Array.from(fileList).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (!pdfFiles.length) { showToast('请选择 PDF 文件'); return; }

    const newFiles: PdfFile[] = [];
    for (const file of pdfFiles) {
      const id = 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const ab = await file.arrayBuffer();
      // 页数由缩略图生成时一并获取（pdfjsLib），避免在此处用 PDFDocument.load 做二次解析
      newFiles.push({
        id, file, name: file.name, size: file.size, pages: 0,
        thumbStatus: 'idle', arrayBuffer: ab,
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);
    showToast(`已添加 ${pdfFiles.length} 个文件`);
  }, [showToast]);

  const removeFile = useCallback((id: string) => {
    genRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    if (!files.length) return;
    if (!confirm('确定清除所有文件？')) return;
    genRef.current.clear();
    setFiles([]);
    showToast('已清除全部文件');
  }, [files.length, showToast]);

  const sortByName = useCallback(() => {
    setFiles((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    showToast('已按文件名排序');
  }, [showToast]);

  const handleDragStart = useCallback((idx: number) => {
    setDragSrcIdx(idx);
  }, []);

  const handleDrop = useCallback((dropIdx: number) => {
    if (dragSrcIdx === null || dragSrcIdx === dropIdx) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragSrcIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setDragSrcIdx(null);
  }, [dragSrcIdx]);

  // 合并 PDF（支持分组、命名模板、批量选择）
  const mergePdfs = useCallback(async (downloadAll: boolean = false) => {
    if (files.length < 1) { showToast('请至少添加一个文件'); return; }

    // 确定要处理的分组
    let groupsToProcess = groupKeys;
    if (autoGroup && !downloadAll) {
      groupsToProcess = groupKeys.filter(k => checkedGroups.has(k));
      if (groupsToProcess.length === 0) {
        showToast('请至少勾选一个分组');
        return;
      }
    }

    setMerging(true);
    setProgress({ pct: 0, text: '' });

    try {
      // 按分组键构建分组
      const groups: Record<string, PdfFile[]> = {};
      for (const f of files) {
        const key = autoGroup ? computeGroup(f.name) : '_all';
        if (!groupsToProcess.includes(key) && autoGroup) continue;
        if (!groups[key]) groups[key] = [];
        groups[key].push(f);
      }

      const orderedKeys = Object.keys(groups).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
      let totalFilesProcessed = 0;
      const totalFiles = orderedKeys.reduce((sum, k) => sum + groups[k].length, 0);

      for (let gi = 0; gi < orderedKeys.length; gi++) {
        const groupKey = orderedKeys[gi];
        const groupFiles = groups[groupKey];
        const merged = await PDFDocument.create();
        const helvetica = await merged.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await merged.embedFont(StandardFonts.HelveticaBold);

        for (let fi = 0; fi < groupFiles.length; fi++) {
          const item = groupFiles[fi];
          if (insertDivider && fi > 0) {
            const divPage = merged.addPage();
            const { width: pw, height: ph } = divPage.getSize();
            divPage.drawText(item.name.match(/^([0-9]+[A-Za-z]*)/)?.[1] || item.name, {
              x: pw / 2 - 80, y: ph / 2 + 10, size: 20,
              font: helveticaBold, color: rgb(0.5, 0.5, 0.5)
            });
            divPage.drawText('（续）', {
              x: pw / 2 - 25, y: ph / 2 - 20, size: 14,
              font: helvetica, color: rgb(0.6, 0.6, 0.6)
            });
          }
          const pdf = await PDFDocument.load(item.arrayBuffer);
          const pages = await merged.copyPages(pdf, pdf.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
          totalFilesProcessed++;
        }

        if (addPageNum) {
          const allPages = merged.getPages();
          const total = allPages.length;
          allPages.forEach((page, idx) => {
            const { width } = page.getSize();
            page.drawText(`${idx + 1} / ${total}`, {
              x: width - 80, y: 20, size: 9,
              font: helvetica, color: rgb(0.4, 0.4, 0.4)
            });
          });
        }

        const bytes = await merged.save();
        const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // 用命名模板生成文件名
        // 命名来源：优先使用独立命名规则（取每组第一个文件），否则使用分组键
        const displayName = nameSourceMode !== 'groupKey'
          ? computeNameSource(groupFiles[0].name)
          : groupKey;
        let fileName = nameTemplate
          .replace(/\{group\}/g, displayName || groupKey)
          .replace(/\{count\}/g, String(groupFiles.length));
        if (!fileName.toLowerCase().endsWith('.pdf')) {
          fileName += '.pdf';
        }

        // 延迟下载，防止浏览器拦截（固定 300ms 间隔，避免累计递增）
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            resolve();
          }, gi === 0 ? 0 : 300);
        });

        const pct = Math.round((totalFilesProcessed / totalFiles) * 100);
        setProgress({ pct, text: `组 ${gi + 1}/${orderedKeys.length}` });
      }
      showToast(`已完成 ${orderedKeys.length} 组合并`);
    } catch (err: any) {
      console.error(err);
      showToast('合并失败：' + (err.message || '未知错误'));
    } finally {
      setMerging(false);
      setProgress({ pct: 0, text: '' });
    }
  }, [files, autoGroup, groupKeys, checkedGroups, computeGroup, computeNameSource, insertDivider, addPageNum, nameTemplate, nameSourceMode, showToast]);

  const totalPages = files.reduce((s, f) => s + f.pages, 0);

  // 渲染文件卡片
  const renderFileCard = (item: PdfFile, idx: number) => (
    <Card
      key={item.id}
      draggable
      onDragStart={() => handleDragStart(idx)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => handleDrop(idx)}
      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
          <span className="text-sm font-medium truncate flex-1" title={item.name}>{item.name}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(item.id)}>
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
          </Button>
        </div>
        <div className="aspect-[1/1.414] bg-background rounded border flex items-center justify-center overflow-hidden">
          {item.thumbUrl ? (
            <img src={item.thumbUrl} className="w-full h-full object-contain" alt="预览" />
          ) : item.thumbStatus === 'loading' ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-border border-t-blue-500 rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">生成中...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <FileText className="w-8 h-8" />
              <span className="text-xs">预览失败</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{item.pages} 页 · {formatSize(item.size)}</span>
          {autoGroup && <Badge variant="outline" className="text-xs">{computeGroup(item.name)}</Badge>}
        </div>
      </CardContent>
    </Card>
  );

  // 渲染文件列表
  const renderFileList = () => {
    if (autoGroup) {
      const groupMap: Record<string, PdfFile[]> = {};
      files.forEach((f) => {
        const k = computeGroup(f.name);
        if (!groupMap[k]) groupMap[k] = [];
        groupMap[k].push(f);
      });
      const sortedPrefixes = Object.keys(groupMap).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
      return sortedPrefixes.map((prefix) => (
        <div key={prefix}>
          <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground font-medium">
            {/* 复选框 */}
            <button
              onClick={() => toggleGroup(prefix)}
              className="text-muted-foreground hover:text-primary/70 transition-colors shrink-0"
              title={checkedGroups.has(prefix) ? '取消选中' : '选中'}
            >
              {checkedGroups.has(prefix) ? (
                <CheckSquare className="w-5 h-5 text-primary/70" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
            <div className="flex-1 h-px bg-muted" />
            <span>分组：{prefix}</span>
            <span className="text-xs text-muted-foreground">({groupMap[prefix].length} 个文件)</span>
            <div className="flex-1 h-px bg-muted" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groupMap[prefix].map((item) => renderFileCard(item, files.indexOf(item)))}
          </div>
        </div>
      ));
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {files.map((item, idx) => renderFileCard(item, idx))}
      </div>
    );
  };

  // 渲染分组配置面板
  const renderGroupConfig = () => {
    if (!configExpanded) return null;

    // 正则模式预览数据
    const patternPreviewRows = groupMode === 'pattern' && patternRegex
      ? files.slice(0, 10).map(f => {
          const baseName = f.name.replace(/\.pdf$/i, '');
          const matched = applyPattern(baseName, patternRegex);
          return { name: f.name, matched };
        })
      : [];

    return (
      <div className="mt-3 p-4 bg-background rounded-lg border border-border space-y-4">
        {/* 分组方式选择 */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">分组方式</label>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="groupMode"
                checked={groupMode === 'delimiter'}
                onChange={() => setGroupMode('delimiter')}
                className="text-primary"
              />
              <span className="text-sm">按分隔符切割</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="groupMode"
                checked={groupMode === 'fixedLength'}
                onChange={() => setGroupMode('fixedLength')}
                className="text-primary"
              />
              <span className="text-sm">按固定长度</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="groupMode"
                checked={groupMode === 'pattern'}
                onChange={() => setGroupMode('pattern')}
                className="text-primary"
              />
              <span className="text-sm">按样例/正则</span>
            </label>
          </div>
        </div>

        {/* 分隔符模式配置 */}
        {groupMode === 'delimiter' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground whitespace-nowrap">分隔符:</label>
              <select
                value={delimiterPreset}
                onChange={(e) => setDelimiterPreset(e.target.value)}
                className="text-sm border rounded px-2 py-1 bg-card"
              >
                {DELIMITER_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {delimiterPreset === '__custom__' && (
                <input
                  type="text"
                  value={customDelimiter}
                  onChange={(e) => setCustomDelimiter(e.target.value)}
                  placeholder="输入分隔符"
                  className="text-sm border rounded px-2 py-1 w-24"
                />
              )}
            </div>

            {/* 分组字段选择 */}
            {maxSegments > 0 && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground whitespace-nowrap">分组字段:</label>
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(Number(e.target.value))}
                  className="text-sm border rounded px-2 py-1 bg-card"
                >
                  {Array.from({ length: maxSegments }, (_, i) => (
                    <option key={i} value={i}>第{i + 1}段</option>
                  ))}
                </select>
                {splitPreview.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (例: {splitPreview[0]?.segments[selectedSegment] || '-'})
                  </span>
                )}
              </div>
            )}

            {/* 切分预览 */}
            {splitPreview.length > 0 && (
              <div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  {showPreview ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  切分预览
                </button>
                {showPreview && (
                  <div className="mt-2 overflow-x-auto border rounded bg-card">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-muted">
                          <th className="text-left p-2 border-r">文件名</th>
                          {Array.from({ length: maxSegments }, (_, i) => (
                            <th key={i} className={`text-left p-2 ${i < maxSegments - 1 ? 'border-r' : ''} ${i === selectedSegment ? 'bg-primary/5 text-primary' : ''}`}>
                              第{i + 1}段{i === selectedSegment ? ' ✓' : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {splitPreview.slice(0, 10).map((row, ri) => (
                          <tr key={ri} className="border-t hover:bg-background">
                            <td className="p-2 border-r truncate max-w-[200px]" title={row.name}>{row.name}</td>
                            {Array.from({ length: maxSegments }, (_, i) => (
                              <td key={i} className={`p-2 ${i < maxSegments - 1 ? 'border-r' : ''} ${i === selectedSegment ? 'bg-primary/5 font-medium' : ''}`}>
                                {row.segments[i] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {splitPreview.length > 10 && (
                      <p className="text-xs text-muted-foreground p-2 text-center">
                        仅显示前 10 条，共 {splitPreview.length} 个文件
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 固定长度模式配置 */}
        {groupMode === 'fixedLength' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-muted-foreground whitespace-nowrap">起始位置:</label>
              <input
                type="number"
                value={fixedStart}
                onChange={(e) => setFixedStart(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                min={0}
                max={100}
                className="text-sm border rounded px-2 py-1 w-20"
              />
              <label className="text-sm text-muted-foreground whitespace-nowrap">截取长度:</label>
              <input
                type="number"
                value={fixedLength}
                onChange={(e) => setFixedLength(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                min={1}
                max={50}
                className="text-sm border rounded px-2 py-1 w-20"
              />
              <span className="text-sm text-muted-foreground">个字符</span>
            </div>
            {files.length > 0 && (
              <div className="p-2 bg-card border rounded text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-muted-foreground mb-1">分组预览（前5个文件）</p>
                {files.slice(0, 5).map((f, i) => {
                  const base = f.name.replace(/\.pdf$/i, '');
                  const group = base.slice(fixedStart, fixedStart + fixedLength) || '(空)';
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground truncate max-w-[180px]" title={f.name}>{f.name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium text-primary bg-primary/5 px-1.5 py-0.5 rounded">{group}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 正则/样例模式配置 */}
        {groupMode === 'pattern' && (
          <div className="space-y-3">
            {/* 样例输入 + 推断 */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                输入文件名样例
                <span className="text-muted-foreground ml-1 font-normal">（系统将自动推断匹配规则）</span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={patternExample}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPatternExample(val);
                    if (!patternManual) {
                      const { pattern } = inferPatternFromExample(val);
                      setPatternRegex(pattern);
                    }
                  }}
                  placeholder="例: 871-05BMK"
                  className="text-sm border rounded px-2 py-1.5 flex-1 font-mono"
                />
                <button
                  onClick={() => {
                    const { pattern } = inferPatternFromExample(patternExample);
                    setPatternRegex(pattern);
                    setPatternManual(false);
                  }}
                  className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 whitespace-nowrap"
                >
                  重新推断
                </button>
              </div>
            </div>

            {/* 推断结果 / 手动编辑正则 */}
            {(patternRegex || patternExample) && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  正则表达式
                  <span className="text-muted-foreground ml-1 font-normal">（可手动修改，括号内为分组键）</span>
                </label>
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-muted-foreground font-mono">/</span>
                  <input
                    type="text"
                    value={patternRegex}
                    onChange={(e) => {
                      setPatternRegex(e.target.value);
                      setPatternManual(true);
                      // 验证正则
                      try {
                        new RegExp(e.target.value);
                        setPatternError('');
                      } catch (err: any) {
                        setPatternError(err.message);
                      }
                    }}
                    placeholder="自动生成或手动输入正则"
                    className={`text-sm border rounded px-2 py-1.5 flex-1 font-mono ${patternError ? 'border-red-400 bg-red-50' : 'border-border'}`}
                  />
                  <span className="text-sm text-muted-foreground font-mono">/i</span>
                </div>
                {patternError && (
                  <p className="text-xs text-red-500 mt-1">{patternError}</p>
                )}
                {!patternError && patternRegex && (
                  <p className="text-xs text-muted-foreground mt-1">
                    提示：用括号 <code className="bg-muted px-1 rounded">( )</code> 包围要用作分组键的部分，无括号则取整个匹配
                  </p>
                )}
              </div>
            )}

            {/* 匹配预览 */}
            {patternRegex && !patternError && files.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">匹配预览（前10个文件）</p>
                <div className="overflow-x-auto border rounded bg-card">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left p-2 border-r">文件名</th>
                        <th className="text-left p-2">分组键</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patternPreviewRows.map((row, i) => (
                        <tr key={i} className="border-t hover:bg-background">
                          <td className="p-2 border-r truncate max-w-[240px] font-mono" title={row.name}>{row.name}</td>
                          <td className="p-2">
                            {row.matched != null
                              ? <span className="font-medium text-primary bg-primary/5 px-1.5 py-0.5 rounded">{row.matched}</span>
                              : <span className="text-orange-500">未匹配</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {files.length > 10 && (
                    <p className="text-xs text-muted-foreground p-2 text-center">仅显示前 10 条，共 {files.length} 个文件</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 命名来源（独立于分组规则）*/}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">命名来源</label>
            <p className="text-xs text-muted-foreground mb-2">合并后的 PDF 文件名从哪里提取？可独立于分组规则。</p>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nameSourceMode"
                  checked={nameSourceMode === 'groupKey'}
                  onChange={() => setNameSourceMode('groupKey')}
                  className="text-primary"
                />
                <span className="text-sm">使用分组名</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nameSourceMode"
                  checked={nameSourceMode === 'fixedPos'}
                  onChange={() => setNameSourceMode('fixedPos')}
                  className="text-primary"
                />
                <span className="text-sm">按固定位置截取</span>
              </label>
              {groupMode === 'delimiter' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="nameSourceMode"
                    checked={nameSourceMode === 'delimiterSeg'}
                    onChange={() => setNameSourceMode('delimiterSeg')}
                    className="text-primary"
                  />
                  <span className="text-sm">按分隔符段提取</span>
                </label>
              )}
            </div>
          </div>

          {/* 固定位置截取配置 */}
          {nameSourceMode === 'fixedPos' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-muted-foreground whitespace-nowrap">起始位置:</label>
                <input
                  type="number"
                  value={nameFixedStart}
                  onChange={(e) => setNameFixedStart(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  min={0}
                  max={100}
                  className="text-sm border rounded px-2 py-1 w-20"
                />
                <label className="text-sm text-muted-foreground whitespace-nowrap">结束位置:</label>
                <input
                  type="number"
                  value={nameFixedEnd}
                  onChange={(e) => setNameFixedEnd(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  min={0}
                  max={100}
                  className="text-sm border rounded px-2 py-1 w-20"
                />
                <span className="text-xs text-muted-foreground">（截取 [起始, 结束) 区间，从每组第一个文件名提取）</span>
              </div>
              {files.length > 0 && (
                <div className="p-2 bg-card border rounded text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-muted-foreground mb-1">命名预览（各分组第一个文件）</p>
                  {(() => {
                    // 展示每个分组的第一个文件的命名提取结果
                    const previewMap: Record<string, string> = {};
                    const seenGroups = new Set<string>();
                    for (const f of files) {
                      const gk = computeGroup(f.name);
                      if (!seenGroups.has(gk)) {
                        seenGroups.add(gk);
                        previewMap[gk] = computeNameSource(f.name);
                      }
                      if (seenGroups.size >= 5) break;
                    }
                    return Object.entries(previewMap).map(([gk, ns], i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-muted-foreground">分组「{gk}」</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium text-primary bg-primary/5 px-1.5 py-0.5 rounded">{ns}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 分隔符段配置 */}
          {nameSourceMode === 'delimiterSeg' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground whitespace-nowrap">使用第几段:</label>
                <select
                  value={nameDelimiterSeg}
                  onChange={(e) => setNameDelimiterSeg(Number(e.target.value))}
                  className="text-sm border rounded px-2 py-1 bg-card"
                >
                  {Array.from({ length: maxSegments }, (_, i) => (
                    <option key={i} value={i}>第{i + 1}段</option>
                  ))}
                </select>
                {splitPreview.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (例: {splitPreview[0]?.segments[nameDelimiterSeg] || '-'})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 命名模板 */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground whitespace-nowrap">命名模板:</label>
          <input
            type="text"
            value={nameTemplate}
            onChange={(e) => setNameTemplate(e.target.value)}
            className="text-sm border rounded px-2 py-1 flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {'{group}'}={nameSourceMode === 'groupKey' ? '分组名' : '命名提取值'} {'{count}'}=文件数
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6 pb-24">
      {/* 上传区域 */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
          dragOver ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-background'
        }`}
      >
        <Upload className={`w-12 h-12 mx-auto mb-3 animate-float ${dragOver ? 'text-primary/70' : 'text-muted-foreground'}`} />
        <h3 className="text-base font-medium text-foreground mb-1">拖放 PDF 文件至此，或点击选择</h3>
        <p className="text-sm text-muted-foreground">支持多文件、多选、拖拽排序。所有处理均在浏览器本地完成。</p>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <>
          {/* 工具栏 */}
          <div className="p-4 bg-card rounded-lg border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={sortByName}>
                  <ArrowDown className="w-3.5 h-3.5 mr-1" />
                  按名称排序
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={clearAll}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  清除全部
                </Button>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGroup}
                    onChange={(e) => setAutoGroup(e.target.checked)}
                    className="rounded"
                  />
                  <span>启用分组</span>
                </label>
                {autoGroup && (
                  <button
                    onClick={() => setConfigExpanded(!configExpanded)}
                    className="flex items-center gap-1 text-primary text-sm hover:text-primary/80"
                  >
                    {configExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    分组配置
                  </button>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={insertDivider} onChange={(e) => setInsertDivider(e.target.checked)} className="rounded" />
                  <span>插入分隔页</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={addPageNum} onChange={(e) => setAddPageNum(e.target.checked)} className="rounded" />
                  <span>添加页码</span>
                </label>
              </div>
            </div>

            {/* 分组配置面板 */}
            {autoGroup && renderGroupConfig()}

            {/* 全选/取消全选 */}
            {autoGroup && groupKeys.length > 0 && (
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <button
                  onClick={toggleAllGroups}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  {checkedGroups.size === groupKeys.length ? '取消全选' : '全选'}
                </button>
                <span className="text-xs text-muted-foreground">
                  已选 {checkedCount}/{totalGroupCount} 组
                </span>
              </div>
            )}
          </div>

          {renderFileList()}
        </>
      )}

      {files.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60 animate-float" />
          <p className="text-sm">暂无文件，请拖放或选择 PDF</p>
        </div>
      )}

      {/* 底部操作条 */}
      {files.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className={`flex items-center justify-between gap-4 p-4 bg-card border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)] ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
            <span className="text-sm text-muted-foreground">
              已选 <strong className="text-foreground">{files.length}</strong> 个文件，共 <strong className="text-foreground">{totalPages}</strong> 页
              {autoGroup && <> · <strong className="text-foreground">{checkedCount}</strong>/<strong className="text-foreground">{totalGroupCount}</strong> 组</>}
            </span>
            {merging && (
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <Progress value={progress.pct} className="flex-1" />
                <span className="text-xs text-muted-foreground min-w-[80px] text-right">{progress.text}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              {autoGroup && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => mergePdfs(false)}
                  disabled={merging || files.length === 0 || checkedCount === 0}
                >
                  {merging ? '合并中...' : `下载选中组 (${checkedCount})`}
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => mergePdfs(true)}
                disabled={merging || files.length === 0}
              >
                {merging ? '合并中...' : autoGroup ? '全部下载' : '合并下载'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm shadow-lg z-[60]">
          {toast}
        </div>
      )}
    </div>
  );
}
