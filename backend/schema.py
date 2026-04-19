from __future__ import annotations
import strawberry
from typing import Optional, List
from resolvers import material as mat_res
from resolvers import bom as bom_res
from resolvers import routing as rou_res
from resolvers import planner as plan_res
from resolvers import scrap as scrap_res
from resolvers import dashboard as dash_res
from resolvers import data_manager as dm_res
from resolvers import material_catalog as mc_res


# ── Material catalog types ────────────────────────────────────────────────────

@strawberry.type
class MaterialCatalogRow:
    material: str
    description: Optional[str]
    mrp_controller: Optional[str]
    material_type: Optional[str]
    total_ordered: Optional[int]
    total_units_produced: Optional[int]
    avg_throughput_min: Optional[float]
    scrap_rate_pct: Optional[float]
    total_scrap_cost: Optional[float]


@strawberry.type
class MaterialCatalogResult:
    rows: List[MaterialCatalogRow]
    total: int


# ── Core material types ───────────────────────────────────────────────────────

@strawberry.type
class MaterialType:
    material: str
    description: Optional[str]
    material_type: Optional[str]
    material_group: Optional[str]
    status: Optional[str]
    weight_kg: Optional[float]
    plant: Optional[str]
    mrp_controller: Optional[str]
    has_bom: bool
    has_routing: bool


@strawberry.type
class MaterialSearchResult:
    items: List[MaterialType]
    total: int


@strawberry.type
class MaterialCatalogFilters:
    material_types: List[str]
    mrp_controllers: List[str]


@strawberry.type
class BomItem:
    parent: str
    component: str
    description: Optional[str]
    material_type: Optional[str]
    status: Optional[str]
    unit: str
    quantity: float
    item_category: str
    has_children: bool
    scrap_rate_pct: Optional[float]
    total_scrap_cost: Optional[float]


@strawberry.type
class BomExplosionItem:
    parent: str
    component: str
    description: Optional[str]
    material_type: Optional[str]
    material_group: Optional[str]
    mrp_controller: Optional[str]
    unit: str
    qty_per_parent: float
    total_quantity: float
    scrap_rate_pct: Optional[float]
    adjusted_total_quantity: float
    depth: int
    path_str: str
    total_machine_min: float
    total_labor_min: float


@strawberry.type
class RoutingOperation:
    material: str
    sequence: int
    description: Optional[str]
    wc_id: Optional[str]
    work_center: Optional[str]
    crtl_key: Optional[str]
    machine_min: Optional[float]
    labor_min: Optional[float]
    setup_min: Optional[float]
    machine_unit: Optional[str]
    labor_unit: Optional[str]
    setup_unit: Optional[str]


@strawberry.type
class ProductionPlanComponent:
    component: str
    description: Optional[str]
    material_type: Optional[str]
    material_group: Optional[str]
    unit: str
    total_quantity: float
    depth: int
    total_machine_min: float
    total_labor_min: float


@strawberry.type
class ProductionPlan:
    root_material: str
    root_description: Optional[str]
    requested_quantity: float
    components: List[ProductionPlanComponent]
    total_machine_min: float
    total_labor_min: float
    max_depth_reached: int


@strawberry.type
class ScrapStat:
    material: str
    description: Optional[str]
    material_type: Optional[str]
    total_ordered: int
    total_scrap: int
    total_delivered: int
    scrap_rate_pct: float
    avg_std_price: Optional[float]
    total_scrap_cost: Optional[float]
    avg_throughput_min: Optional[float]


@strawberry.type
class MonthlyScrapPoint:
    year: int
    month: int
    total_ordered: int
    total_scrap: int
    confirmed_yield: int
    scrap_rate_pct: float
    scrap_cost: float


@strawberry.type
class DailyScrapPoint:
    date: str
    total_ordered: int
    total_scrap: int
    scrap_rate_pct: float


@strawberry.type
class ScrapReasonItem:
    reason: str
    count: int
    units_scrapped: float


@strawberry.type
class MaterialScrapTimeSeries:
    available_years: List[int]
    year: Optional[int]
    total_scrap_cost: float
    total_scrap: int
    total_ordered: int
    scrap_rate_pct: float
    monthly_data: List[MonthlyScrapPoint]
    daily_data: List[DailyScrapPoint]
    scrap_reasons: List[ScrapReasonItem]


@strawberry.type
class TypeDistribution:
    material_type: str
    count: int


@strawberry.type
class TopMaterial:
    material: str
    description: Optional[str]
    component_count: int


@strawberry.type
class TopScrapMaterial:
    material: str
    description: Optional[str]
    total_ordered: int
    total_scrap: int
    scrap_rate_pct: float


@strawberry.type
class DashboardStats:
    total_materials: int
    materials_with_bom: int
    materials_with_routing: int
    total_bom_rows: int
    type_distribution: List[TypeDistribution]
    top_complex_materials: List[TopMaterial]
    top_scrap_materials: List[TopScrapMaterial]


# ── Scrap chain / Sankey types ────────────────────────────────────────────────

@strawberry.type
class ScrapChainItem:
    component: str
    description: Optional[str]
    depth: int
    path_str: str
    qty_per_scrapped_unit: float
    total_qty_wasted: float
    machine_min_wasted: float
    labor_min_wasted: float
    estimated_cost: Optional[float]


@strawberry.type
class SankeyNode:
    id: str
    label: str
    value: float


@strawberry.type
class SankeyLink:
    source: str
    target: str
    value: float


@strawberry.type
class ScrapSankeyData:
    nodes: List[SankeyNode]
    links: List[SankeyLink]


# ── Database browser types ────────────────────────────────────────────────────

@strawberry.type
class DbTable:
    name: str
    row_count: int
    columns: List[str]


@strawberry.type
class TablePreview:
    table_name: str
    columns: List[str]
    rows: List[List[str]]
    total: int


@strawberry.type
class ImportedDataset:
    name: str
    source_file: str
    table_name: str
    row_count: int
    imported_at: str


@strawberry.type
class ImportResult:
    name: str
    table_name: str
    row_count: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_material(d) -> MaterialType:
    return MaterialType(**d)

def _to_bom_item(d) -> BomItem:
    return BomItem(**d)

def _to_explosion_item(d) -> BomExplosionItem:
    return BomExplosionItem(**d)

def _to_routing_op(d) -> RoutingOperation:
    return RoutingOperation(**d)

def _to_plan_component(d) -> ProductionPlanComponent:
    return ProductionPlanComponent(
        component=d["component"],
        description=d.get("description"),
        material_type=d.get("material_type"),
        material_group=d.get("material_group"),
        unit=d.get("unit", ""),
        total_quantity=d.get("total_quantity", 0.0),
        depth=d.get("depth", 0),
        total_machine_min=d.get("total_machine_min", 0.0),
        total_labor_min=d.get("total_labor_min", 0.0),
    )

def _to_scrap_stat(d) -> ScrapStat:
    return ScrapStat(**d)

def _to_scrap_chain_item(d) -> ScrapChainItem:
    return ScrapChainItem(**d)


# ── Query ────────────────────────────────────────────────────────────────────

@strawberry.type
class Query:

    @strawberry.field
    def search_materials(
        self,
        query: str = "",
        limit: int = 20,
        offset: int = 0,
        material_type: str = "",
        mrp_controller: str = "",
    ) -> MaterialSearchResult:
        result = mat_res.search_materials(
            query,
            limit,
            offset,
            material_type,
            mrp_controller,
        )
        return MaterialSearchResult(
            items=[_to_material(m) for m in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    def material_catalog_filters(self) -> MaterialCatalogFilters:
        f = mat_res.get_material_catalog_filters()
        return MaterialCatalogFilters(
            material_types=f["material_types"],
            mrp_controllers=f["mrp_controllers"],
        )

    @strawberry.field
    def material(self, material_id: str) -> Optional[MaterialType]:
        m = mat_res.get_material(material_id)
        return _to_material(m) if m else None

    @strawberry.field
    def bom_children(self, material_id: str) -> List[BomItem]:
        return [_to_bom_item(r) for r in bom_res.get_children(material_id)]

    @strawberry.field
    def bom_explosion(
        self,
        material_id: str,
        quantity: float = 1.0,
        max_depth: int = 6,
    ) -> List[BomExplosionItem]:
        return [_to_explosion_item(r) for r in bom_res.explode(material_id, quantity, max_depth)]

    @strawberry.field
    def routing(self, material_id: str) -> List[RoutingOperation]:
        return [_to_routing_op(r) for r in rou_res.get_routing(material_id)]

    @strawberry.field
    def production_plan(self, material_id: str, quantity: float) -> ProductionPlan:
        p = plan_res.build_plan(material_id, quantity)
        return ProductionPlan(
            root_material=p["root_material"],
            root_description=p["root_description"],
            requested_quantity=p["requested_quantity"],
            components=[_to_plan_component(c) for c in p["components"]],
            total_machine_min=p["total_machine_min"],
            total_labor_min=p["total_labor_min"],
            max_depth_reached=p["max_depth_reached"],
        )

    @strawberry.field
    def material_catalog(
        self,
        query: str = "",
        material_type: str = "",
        mrp_controller: str = "",
        date_from: str = "",
        date_to: str = "",
        sort_by: str = "material",
        sort_dir: str = "asc",
        min_total_orders: Optional[float] = None,
        max_total_orders: Optional[float] = None,
        min_units_produced: Optional[float] = None,
        max_units_produced: Optional[float] = None,
        min_avg_throughput: Optional[float] = None,
        max_avg_throughput: Optional[float] = None,
        min_scrap_rate: Optional[float] = None,
        max_scrap_rate: Optional[float] = None,
        min_scrap_cost: Optional[float] = None,
        max_scrap_cost: Optional[float] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> MaterialCatalogResult:
        result = mc_res.get_material_catalog(
            query, material_type, mrp_controller, date_from, date_to,
            sort_by, sort_dir,
            min_total_orders, max_total_orders,
            min_units_produced, max_units_produced,
            min_avg_throughput, max_avg_throughput,
            min_scrap_rate, max_scrap_rate,
            min_scrap_cost, max_scrap_cost,
            limit, offset
        )
        rows = [MaterialCatalogRow(**r) for r in result["rows"]]
        return MaterialCatalogResult(rows=rows, total=result["total"])

    @strawberry.field
    def scrap_stats(self, limit: int = 100, offset: int = 0) -> List[ScrapStat]:
        return [_to_scrap_stat(r) for r in scrap_res.get_scrap_stats(limit, offset)]

    @strawberry.field
    def material_scrap(self, material_id: str) -> Optional[ScrapStat]:
        r = scrap_res.get_material_scrap(material_id)
        return _to_scrap_stat(r) if r else None

    @strawberry.field
    def material_scrap_time_series(
        self,
        material_id: str,
        year: Optional[int] = None,
    ) -> Optional[MaterialScrapTimeSeries]:
        d = scrap_res.get_material_scrap_time_series(material_id, year)
        if d is None:
            return None
        return MaterialScrapTimeSeries(
            available_years=d["available_years"],
            year=d["year"],
            total_scrap_cost=d["total_scrap_cost"],
            total_scrap=d["total_scrap"],
            total_ordered=d["total_ordered"],
            scrap_rate_pct=d["scrap_rate_pct"],
            monthly_data=[MonthlyScrapPoint(**m) for m in d["monthly_data"]],
            daily_data=[DailyScrapPoint(**m) for m in d["daily_data"]],
            scrap_reasons=[ScrapReasonItem(**m) for m in d["scrap_reasons"]],
        )

    @strawberry.field
    def dashboard_stats(self) -> DashboardStats:
        d = dash_res.get_stats()
        return DashboardStats(
            total_materials=d["total_materials"],
            materials_with_bom=d["materials_with_bom"],
            materials_with_routing=d["materials_with_routing"],
            total_bom_rows=d["total_bom_rows"],
            type_distribution=[TypeDistribution(**t) for t in d["type_distribution"]],
            top_complex_materials=[TopMaterial(**t) for t in d["top_complex_materials"]],
            top_scrap_materials=[TopScrapMaterial(**t) for t in d["top_scrap_materials"]],
        )

    @strawberry.field
    def scrap_chain(self, material_id: str) -> List[ScrapChainItem]:
        return [_to_scrap_chain_item(r) for r in scrap_res.get_scrap_chain(material_id)]

    @strawberry.field
    def aggregate_scrap_sankey(self) -> ScrapSankeyData:
        d = scrap_res.get_aggregate_scrap_sankey()
        return ScrapSankeyData(
            nodes=[SankeyNode(**n) for n in d["nodes"]],
            links=[SankeyLink(**l) for l in d["links"]],
        )

    @strawberry.field
    def db_tables(self) -> List[DbTable]:
        return [DbTable(**t) for t in dm_res.get_db_tables()]

    @strawberry.field
    def table_preview(
        self,
        table_name: str,
        limit: int = 100,
        offset: int = 0,
    ) -> TablePreview:
        d = dm_res.get_table_preview(table_name, limit, offset)
        return TablePreview(
            table_name=d["table_name"],
            columns=d["columns"],
            rows=d["rows"],
            total=d["total"],
        )

    @strawberry.field
    def imported_datasets(self) -> List[ImportedDataset]:
        return [ImportedDataset(**ds) for ds in dm_res.get_imported_datasets()]


# ── Mutation ──────────────────────────────────────────────────────────────────

@strawberry.type
class Mutation:

    @strawberry.mutation
    def import_dataset(
        self,
        name: str,
        csv_content: str,
        target_table: str,
        column_mapping: str = "{}",
    ) -> ImportResult:
        r = dm_res.do_import_dataset(name, csv_content, target_table, column_mapping)
        return ImportResult(**r)

    @strawberry.mutation
    def remove_dataset(self, name: str) -> bool:
        return dm_res.do_remove_dataset(name)


schema = strawberry.Schema(query=Query, mutation=Mutation)
