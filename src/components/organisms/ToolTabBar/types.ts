export type ToolTab = "ipod" | "files" | "metadata" | "audio" | "duplicates" | "convert" | "health" | "export";

export interface ToolTabDef {
  id: ToolTab;
  label: string;
  description: string;
}

export interface ToolTabGroup {
  label: string;
  tabs: ToolTabDef[];
}
