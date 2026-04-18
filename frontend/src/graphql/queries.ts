import { gql } from "@apollo/client";

export const SEARCH_MATERIALS = gql`
  query SearchMaterials($query: String!, $limit: Int, $offset: Int) {
    searchMaterials(query: $query, limit: $limit, offset: $offset) {
      total
      items {
        material
        description
        materialType
        materialGroup
        status
        hasBom
        hasRouting
        weightKg
      }
    }
  }
`;

export const GET_MATERIAL = gql`
  query GetMaterial($materialId: String!) {
    material(materialId: $materialId) {
      material
      description
      materialType
      materialGroup
      status
      weightKg
      plant
      mrpController
      hasBom
      hasRouting
    }
  }
`;

export const GET_BOM_CHILDREN = gql`
  query GetBomChildren($materialId: String!) {
    bomChildren(materialId: $materialId) {
      parent
      component
      description
      materialType
      unit
      quantity
      itemCategory
      hasChildren
    }
  }
`;

export const GET_BOM_EXPLOSION = gql`
  query GetBomExplosion($materialId: String!, $quantity: Float, $maxDepth: Int) {
    bomExplosion(materialId: $materialId, quantity: $quantity, maxDepth: $maxDepth) {
      parent
      component
      description
      materialType
      mrpController
      unit
      qtyPerParent
      totalQuantity
      depth
      pathStr
      totalMachineMin
      totalLaborMin
    }
  }
`;

export const GET_ROUTING = gql`
  query GetRouting($materialId: String!) {
    routing(materialId: $materialId) {
      sequence
      description
      wcId
      workCenter
      ctrlKey
      machineMin
      laborMin
      setupMin
      machineUnit
      laborUnit
    }
  }
`;

export const GET_PRODUCTION_PLAN = gql`
  query GetProductionPlan($materialId: String!, $quantity: Float!) {
    productionPlan(materialId: $materialId, quantity: $quantity) {
      rootMaterial
      rootDescription
      requestedQuantity
      totalMachineMin
      totalLaborMin
      maxDepthReached
      components {
        component
        description
        materialType
        materialGroup
        unit
        totalQuantity
        depth
        totalMachineMin
        totalLaborMin
      }
    }
  }
`;

export const GET_FINAL_PRODUCTS = gql`
  query GetFinalProducts($limit: Int, $offset: Int, $search: String) {
    finalProducts(limit: $limit, offset: $offset, search: $search) {
      total
      items {
        material
        description
        materialType
        status
        totalOrdered
        totalScrap
        scrapRatePct
        routingOpCount
      }
    }
  }
`;

export const GET_RAW_MATERIALS = gql`
  query GetRawMaterials($limit: Int, $offset: Int, $search: String) {
    rawMaterials(limit: $limit, offset: $offset, search: $search) {
      total
      items {
        material
        description
        materialType
        usedInBomCount
      }
    }
  }
`;

export const GET_SCRAP_STATS = gql`
  query GetScrapStats($limit: Int) {
    scrapStats(limit: $limit) {
      material
      description
      materialType
      totalOrdered
      totalScrap
      totalDelivered
      scrapRatePct
    }
  }
`;

export const GET_DASHBOARD_STATS = gql`
  query GetDashboardStats {
    dashboardStats {
      totalMaterials
      materialsWithBom
      materialsWithRouting
      totalBomRows
      typeDistribution {
        materialType
        count
      }
      topComplexMaterials {
        material
        description
        componentCount
      }
      topScrapMaterials {
        material
        description
        totalOrdered
        totalScrap
        scrapRatePct
      }
    }
  }
`;
