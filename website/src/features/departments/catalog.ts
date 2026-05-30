export interface FixedDepartmentDefinition {
  slug: string;
  name: string;
  description: string;
}

export const FIXED_DEPARTMENTS: FixedDepartmentDefinition[] = [
  {
    slug: "roads_and_infrastructure",
    name: "Roads and Infrastructure",
    description:
      "Road repairs, drainage structures, footpaths, bridges, and other civic infrastructure work.",
  },
  {
    slug: "sanitation_and_waste_management",
    name: "Sanitation and Waste Management",
    description:
      "Waste collection, illegal dumping, public cleanliness, and sanitation response.",
  },
  {
    slug: "public_utilities_water_and_power",
    name: "Public Utilities Water and Power",
    description:
      "Water supply, leaks, public taps, street power issues, and utility interruptions.",
  },
  {
    slug: "environment_and_parks",
    name: "Environment and Parks",
    description:
      "Parks, greenery, public open spaces, tree maintenance, and environmental upkeep.",
  },
  {
    slug: "traffic_and_transport",
    name: "Traffic and Transport",
    description:
      "Traffic flow, transport support, signage, signals, and mobility-related issues.",
  },
];

export const FIXED_DEPARTMENT_SLUGS = FIXED_DEPARTMENTS.map(
  (department) => department.slug,
);

export const FIXED_DEPARTMENT_NAMES = FIXED_DEPARTMENTS.map(
  (department) => department.name,
);

const departmentOrder = new Map(
  FIXED_DEPARTMENTS.map((department, index) => [department.slug, index]),
);

export function isFixedDepartmentSlug(slug: string) {
  return departmentOrder.has(slug);
}

export function sortDepartmentsByCatalog<T extends { slug: string }>(
  departments: T[],
) {
  return [...departments].sort((left, right) => {
    const leftIndex = departmentOrder.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex =
      departmentOrder.get(right.slug) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex || left.slug.localeCompare(right.slug);
  });
}

export function getDepartmentCategoryNameBySlug(slug: string) {
  return FIXED_DEPARTMENTS.find((department) => department.slug === slug)?.name;
}
