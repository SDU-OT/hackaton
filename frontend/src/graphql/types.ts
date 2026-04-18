export interface Material {
  material: string;
  description?: string | null;
  materialType?: string | null;
  materialGroup?: string | null;
  status?: string | null;
  weightKg?: number | null;
  plant?: string | null;
  hasBom: boolean;
  hasRouting: boolean;
}

export interface MaterialSearchResult {
  items: Material[];
  total: number;
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
}

export interface BomExplosionItem {
  parent: string;
  component: string;
  description?: string | null;
  materialType?: string | null;
  unit: string;
  qtyPerParent: number;
  totalQuantity: number;
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
  ctrlKey?: string | null;
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

export interface FinalProductsResult {
  items: FinalProduct[];
  total: number;
}

export interface RawMaterialsResult {
  items: RawMaterial[];
  total: number;
}

export interface FinalProduct {
  material: string;
  description?: string | null;
  materialType?: string | null;
  status?: string | null;
  totalOrdered: number;
  totalScrap: number;
  scrapRatePct: number;
  routingOpCount: number;
}

export interface RawMaterial {
  material: string;
  description?: string | null;
  materialType?: string | null;
  usedInBomCount: number;
}

export interface ScrapStat {
  material: string;
  description?: string | null;
  materialType?: string | null;
  totalOrdered: number;
  totalScrap: number;
  totalDelivered: number;
  scrapRatePct: number;
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
