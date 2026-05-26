export interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  component: string;
}

export type ToolId = 'interco-reconcile' | 'pdf-merge';
