from __future__ import annotations
import strawberry
from typing import Optional, List
from resolvers import material as mat_res
from resolvers import bom as bom_res
from resolvers import routing as rou_res
from resolvers import planner as plan_res
from resolvers import scrap as scrap_res
from resolvers import dashboard as dash_res


# ── Types ────────────────────────────────────────────────────────────────────

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
class FinalProduct:
    material: str
    description: Optional[str]
    material_type: Optional[str]
    status: Optional[str]
    total_ordered: int
    total_scrap: int
    scrap_rate_pct: float
    routing_op_count: int


@strawberry.type
class FinalProductsResult:
    items: List[FinalProduct]
    total: int


@strawberry.type
class RawMaterial:
    material: str
    description: Optional[str]
    material_type: Optional[str]
    used_in_bom_count: int


@strawberry.type
class RawMaterialsResult:
    items: List[RawMaterial]
    total: int


@strawberry.type
class ScrapStat:
    material: str
    description: Optional[str]
    material_type: Optional[str]
    total_ordered: int
    total_scrap: int
    total_delivered: int
    scrap_rate_pct: float


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


# ── Helpers ──────────────────────────────────────────────────────────────────

def _to_material(d) -> MaterialType:
    return MaterialType(**d)


def _to_bom_item(d) -> BomItem:
    return BomItem(**d)


def _to_explosion_item(d) -> BomExplosionItem:
    return BomExplosionItem(**d)


def _to_routing_op(d) -> RoutingOperation:
    return RoutingOperation(**d)


def _to_plan_component(d) -> ProductionPlanComponent:
    return ProductionPlanComponent(**d)


def _to_final_product(d) -> FinalProduct:
    return FinalProduct(**d)


def _to_raw_material(d) -> RawMaterial:
    return RawMaterial(**d)


def _to_scrap_stat(d) -> ScrapStat:
    return ScrapStat(**d)


# ── Query ────────────────────────────────────────────────────────────────────

@strawberry.type
class Query:

    @strawberry.field
    def search_materials(
        self,
        query: str = "",
        limit: int = 20,
        offset: int = 0,
    ) -> MaterialSearchResult:
        result = mat_res.search_materials(query, limit, offset)
        return MaterialSearchResult(
            items=[_to_material(m) for m in result["items"]],
            total=result["total"],
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
    def final_products(
        self, limit: int = 50, offset: int = 0, search: str = ""
    ) -> FinalProductsResult:
        result = mat_res.get_final_products(limit, offset, search)
        return FinalProductsResult(
            items=[_to_final_product(r) for r in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    def raw_materials(
        self, limit: int = 50, offset: int = 0, search: str = ""
    ) -> RawMaterialsResult:
        result = mat_res.get_raw_materials(limit, offset, search)
        return RawMaterialsResult(
            items=[_to_raw_material(r) for r in result["items"]],
            total=result["total"],
        )

    @strawberry.field
    def scrap_stats(self, limit: int = 100, offset: int = 0) -> List[ScrapStat]:
        return [_to_scrap_stat(r) for r in scrap_res.get_scrap_stats(limit, offset)]

    @strawberry.field
    def material_scrap(self, material_id: str) -> Optional[ScrapStat]:
        r = scrap_res.get_material_scrap(material_id)
        return _to_scrap_stat(r) if r else None

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


schema = strawberry.Schema(query=Query)
