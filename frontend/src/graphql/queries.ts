import { gql } from "@apollo/client";

export const SEARCH_MATERIALS = gql`
  query SearchMaterials(
    $query: String
    $limit: Int
    $offset: Int
    $materialType: String
    $mrpController: String
  ) {
    searchMaterials(
      query: $query
      limit: $limit
      offset: $offset
      materialType: $materialType
      mrpController: $mrpController
    ) {
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

export const GET_MATERIAL_CATALOG_FILTERS = gql`
  query GetMaterialCatalogFilters {
    materialCatalogFilters {
      materialTypes
      mrpControllers
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
      materialGroup
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
      avgStdPrice
      totalScrapCost
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

export const GET_SCRAP_CHAIN = gql`
  query GetScrapChain($materialId: String!) {
    scrapChain(materialId: $materialId) {
      component
      description
      depth
      pathStr
      qtyPerScrappedUnit
      totalQtyWasted
      machineMinWasted
      laborMinWasted
      estimatedCost
    }
  }
`;

export const GET_AGGREGATE_SCRAP_SANKEY = gql`
  query GetAggregateScrapSankey {
    aggregateScrapSankey {
      nodes {
        id
        label
        value
      }
      links {
        source
        target
        value
      }
    }
  }
`;

export const GET_DB_TABLES = gql`
  query GetDbTables {
    dbTables {
      name
      rowCount
      columns
    }
  }
`;

export const GET_TABLE_PREVIEW = gql`
  query GetTablePreview($tableName: String!, $limit: Int, $offset: Int) {
    tablePreview(tableName: $tableName, limit: $limit, offset: $offset) {
      tableName
      columns
      rows
      total
    }
  }
`;

export const GET_IMPORTED_DATASETS = gql`
  query GetImportedDatasets {
    importedDatasets {
      name
      sourceFile
      tableName
      rowCount
      importedAt
    }
  }
`;

export const IMPORT_DATASET = gql`
  mutation ImportDataset($name: String!, $csvContent: String!, $targetTable: String!, $columnMapping: String) {
    importDataset(name: $name, csvContent: $csvContent, targetTable: $targetTable, columnMapping: $columnMapping) {
      name
      tableName
      rowCount
    }
  }
`;

export const REMOVE_DATASET = gql`
  mutation RemoveDataset($name: String!) {
    removeDataset(name: $name)
  }
`;

export const MATERIAL_CATALOG = gql`
  query MaterialCatalog(
    $query: String
    $materialType: String
    $mrpController: String
    $dateFrom: String
    $dateTo: String
    $sortBy: String
    $sortDir: String
    $limit: Int
    $offset: Int
  ) {
    materialCatalog(
      query: $query
      materialType: $materialType
      mrpController: $mrpController
      dateFrom: $dateFrom
      dateTo: $dateTo
      sortBy: $sortBy
      sortDir: $sortDir
      limit: $limit
      offset: $offset
    ) {
      total
      rows {
        material
        description
        mrpController
        materialType
        totalOrdered
        totalUnitsProduced
        avgThroughputMin
        scrapRatePct
        totalScrapCost
      }
    }
  }
`;

export const GET_MATERIAL_SCRAP = gql`
  query GetMaterialScrap($materialId: String!) {
    materialScrap(materialId: $materialId) {
      material
      totalOrdered
      totalScrap
      totalDelivered
      scrapRatePct
      avgStdPrice
      totalScrapCost
    }
  }
`;
