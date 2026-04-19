export interface Material {
  material: string;
  description?: string | null;
  materialType?: string | null;
  materialGroup?: string | null;
  status?: string | null;
  weightKg?: number | null;
  plant?: string | null;
  mrpController?: string | null;
  hasBom: boolean;
  hasRouting: boolean;
}

export interface MaterialSearchResult {
  items: Material[];
  total: number;
}

export interface MaterialCatalogFilters {
  materialTypes: string[];
  mrpControllers: string[];
}

export interface BomItem {
  parent: string;
  component: string;
  description?: string | null;
  materialType?: string | null;
  status?: string | null;
  unit: string;
  quantity: number;
  itemCategory: string;
  hasChildren: boolean;
  scrapRatePct?: number | null;
  totalScrapCost?: number | null;
}

export interface BomExplosionItem {
  parent: string;
  component: string;
  description?: string | null;
  materialType?: string | null;
  materialGroup?: string | null;
  mrpController?: string | null;
  unit: string;
  qtyPerParent: number;
  totalQuantity: number;
  scrapRatePct?: number | null;
  adjustedTotalQuantity: number;
  depth: number;
  pathStr: string;
  totalMachineMin: number;
  totalLaborMin: number;
}

export interface RoutingOperation {
  material: string;
  sequence: number;
  description?: string | null;
  wcId?: string | null;
  workCenter?: string | null;
  crtlKey?: string | null;
  machineMin?: number | null;
  laborMin?: number | null;
  setupMin?: number | null;
  machineUnit?: string | null;
  laborUnit?: string | null;
  setupUnit?: string | null;
}

export interface ProductionPlanComponent {
  component: string;
  description?: string | null;
  materialType?: string | null;
  materialGroup?: string | null;
  unit: string;
  totalQuantity: number;
  depth: number;
  totalMachineMin: number;
  totalLaborMin: number;
}

export interface ProductionPlan {
  rootMaterial: string;
  rootDescription?: string | null;
  requestedQuantity: number;
  components: ProductionPlanComponent[];
  totalMachineMin: number;
  totalLaborMin: number;
  maxDepthReached: number;
}

export interface ScrapStat {
  material: string;
  description?: string | null;
  materialType?: string | null;
  totalOrdered: number;
  totalScrap: number;
  totalDelivered: number;
  scrapRatePct: number;
  avgStdPrice?: number | null;
  totalScrapCost?: number | null;
  avgThroughputMin?: number | null;
}

export interface MonthlyScrapPoint {
  year: number;
  month: number;
  totalOrdered: number;
  totalScrap: number;
  confirmedYield?: number | null;
  scrapRatePct: number;
  scrapCost: number;
}

export interface DailyScrapPoint {
  date: string;
  totalOrdered: number;
  totalScrap: number;
  scrapRatePct: number;
}

export interface ScrapReasonItem {
  reason: string;
  count: number;
  unitsScrapped: number;
}

export interface MaterialScrapTimeSeries {
  availableYears: number[];
  year?: number | null;
  totalScrapCost: number;
  totalScrap: number;
  totalOrdered: number;
  scrapRatePct: number;
  monthlyData: MonthlyScrapPoint[];
  dailyData: DailyScrapPoint[];
  scrapReasons: ScrapReasonItem[];
}

export interface TypeDistribution {
  materialType: string;
  count: number;
}

export interface TopMaterial {
  material: string;
  description?: string | null;
  componentCount: number;
}

export interface TopScrapMaterial {
  material: string;
  description?: string | null;
  totalOrdered: number;
  totalScrap: number;
  scrapRatePct: number;
}

export interface DashboardStats {
  totalMaterials: number;
  materialsWithBom: number;
  materialsWithRouting: number;
  totalBomRows: number;
  typeDistribution: TypeDistribution[];
  topComplexMaterials: TopMaterial[];
  topScrapMaterials: TopScrapMaterial[];
}

export interface ScrapChainItem {
  component: string;
  description?: string | null;
  depth: number;
  pathStr: string;
  qtyPerScrappedUnit: number;
  totalQtyWasted: number;
  machineMinWasted: number;
  laborMinWasted: number;
  estimatedCost?: number | null;
}

export interface SankeyNode {
  id: string;
  label: string;
  value: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface ScrapSankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface DbTable {
  name: string;
  rowCount: number;
  columns: string[];
}

export interface TablePreview {
  tableName: string;
  columns: string[];
  rows: string[][];
  total: number;
}

export interface ImportedDataset {
  name: string;
  sourceFile: string;
  tableName: string;
  rowCount: number;
  importedAt: string;
}

export interface MaterialCatalogRow {
  material: string;
  description?: string | null;
  mrpController?: string | null;
  materialType?: string | null;
  totalOrdered?: number | null;
  totalUnitsProduced?: number | null;
  avgThroughputMin?: number | null;
  scrapRatePct?: number | null;
  totalScrapCost?: number | null;
}

export interface MaterialCatalogResult {
  rows: MaterialCatalogRow[];
  total: number;
}

export interface ImportResult {
  name: string;
  tableName: string;
  rowCount: number;
}

export interface MRPTimeSeriesPoint {
  month: string;
  unitsProduced: number;
  scrapUnits: number;
  scrapRatePct: number;
}

export interface MRPWorkCenterScrap {
  workCenter: string;
  scrapCost: number;
  scrapUnits: number;
}

export interface MRPMaterialUsage {
  material: string;
  description?: string | null;
  totalQty: number;
  scrapQty: number;
  scrapRatePct: number;
}

export interface MRPMaterialCost {
  material: string;
  description?: string | null;
  totalScrapCost: number;
  scrapUnits: number;
}

export interface MRPClippyInsight {
  type: string;
  message: string;
  severity: string;
}

export interface MRPReport {
  mrpController: string;
  hasProductionData: boolean;
  totalUnitsProduced: number;
  totalScrapUnits: number;
  scrapRatePct: number;
  totalScrapCost: number;
  timeSeries: MRPTimeSeriesPoint[];
  workCenterScrap: MRPWorkCenterScrap[];
  topMaterialsByQty: MRPMaterialUsage[];
  topMaterialsByCost: MRPMaterialCost[];
  clippyInsights: MRPClippyInsight[];
}
