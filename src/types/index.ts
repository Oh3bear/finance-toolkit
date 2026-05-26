// ==================== 原始明细账数据 ====================
export interface RawLedgerRow {
  id: string; // 唯一标识
  公司代码: string;
  会计年度: number;
  凭证编号: string;
  行项目: number;
  期间: number;
  过帐日期: string;
  利润中心: string; // 如 "LF6D800001"
  利润中心文本描述: string; // 如 "深圳海旭绿碳科技有限公司"
  科目号: string; // 如 "1122180000"
  总账科目长文本: string; // 如 "应收账款\\外币评估"
  对方科目: string;
  对方科目描述: string;
  文本: string;
  客户: string | null; // 客户编码
  客户名称: string | null; // 如 "中國建築工程（香港）有限公司"
  供应商: string | null; // 供应商编码
  供应商名称: string | null; // 如 "中國建築機電工程有限公司"
  借方本位币金额: number;
  贷方本位币金额: number;
  余额方向: string;
  余额本币: number;
  本位币: string; // CNY/HKD
  净发生: number; // 已计算好的净额
}

// ==================== 清洗后的数据 ====================
export interface CleanedRow {
  id: string;
  公司代码: string;
  凭证编号: string;
  过帐日期: string;
  利润中心: string;
  利润中心名称: string;
  科目号: string;
  科目名称: string;
  客商: string; // 合并后的客商名称（客户名称或供应商名称）
  客商编码: string | null;
  文本: string;
  借方: number;
  贷方: number;
  净额: number;
  本位币: string;
  方向: '借' | '贷'; // 根据净额正负判断
}

// ==================== 映射表 ====================
export interface SubjectMapping {
  科目编码: string;
  科目名称: string;
}

export interface EntityMapping {
  客商名称: string;
  利润中心编码: string; // 映射到的利润中心编码
  利润中心名称: string; // 映射到的利润中心名称
  标准化名称: string; // 用于分组的统一名称
}

// ==================== 分组核对 ====================
export interface ReconGroup {
  id: string; // 分组ID: "PC_A|PC_B"
  利润中心A: string; // 如 "LF73700003"
  利润中心A名称: string;
  利润中心B: string; // 如 "LF71800001"
  利润中心B名称: string;
  行: CleanedRow[];
  合计净额: number;
  状态: '未核对' | '对符' | '未对符';
  匹配链: MatchChain[]; // 匹配成功的明细链
}

// ==================== 匹配链 ====================
export interface MatchChain {
  id: string;
  匹配类型: '1:1' | '1:N' | 'M:N' | '汇总零值';
  借方行: CleanedRow[];
  贷方行: CleanedRow[];
  借方合计: number;
  贷方合计: number;
  差异: number;
}

// ==================== 核对结果 ====================
export interface ReconResult {
  groups: ReconGroup[];
  对符明细: ReconGroup[];
  未对符明细: ReconGroup[];
  统计: {
    总组数: number;
    对符组数: number;
    未对符组数: number;
    总交易数: number;
    对符交易数: number;
    未对符交易数: number;
    总差异金额: number;
  };
}

// ==================== 应用状态 ====================
export type AppStep = '导入' | '映射' | '核对' | '结果';

export interface AppState {
  step: AppStep;
  rawData: RawLedgerRow[];
  cleanedData: CleanedRow[];
  subjectMappings: SubjectMapping[];
  entityMappings: EntityMapping[];
  reconResult: ReconResult | null;
  isProcessing: boolean;
  progress: number;
  
  // Actions
  setStep: (step: AppStep) => void;
  setRawData: (data: RawLedgerRow[]) => void;
  setCleanedData: (data: CleanedRow[]) => void;
  setSubjectMappings: (data: SubjectMapping[]) => void;
  setEntityMappings: (data: EntityMapping[]) => void;
  setReconResult: (result: ReconResult | null) => void;
  setIsProcessing: (v: boolean) => void;
  setProgress: (p: number) => void;
  reset: () => void;
}
