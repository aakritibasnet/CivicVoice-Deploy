import type { GQLContext } from "../context";
import { getWardHappinessMetrics } from "@/src/lib/reportWorkflowEnforcer";

type WardMetricsRow = {
  id: string;
  name: string;
  ward_code: string;
  contact_email: string | null;
  contact_phone: string | null;
  boundary_geojson: unknown | null;
  center_lat: number | null;
  center_lng: number | null;
  report_count: number;
  pending_reports: number;
  in_progress_reports: number;
  completed_reports: number;
  invalid_reports: number;
  returned_reports: number;
  escalated_reports: number;
  overdue_reports: number;
  total_upvotes: number;
  published_post_count: number;
  total_ratings: number;
  rating_score_total: number;
  average_public_rating: number;
  ward_officer_count: number;
  last_report_at: Date | null;
  last_post_at: Date | null;
};

type OfficerCountRow = {
  type: "ward_officer" | "municipality_officer";
  count: number;
};

type WardOfficerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  ward_id: string;
  department_name: string;
  assigned_report_count: number;
  active_report_count: number;
  completed_report_count: number;
};

type ReportPointRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  ward_id: string;
  ward_name: string;
  ward_code: string;
  upvote_count: number;
  location_lat: number;
  location_lng: number;
  address_text: string | null;
  assigned_level: string;
  escalated_to_municipality: boolean;
  created_at: Date;
  updated_at: Date;
};

function requireMunicipalityViewer(user: GQLContext["user"]) {
  if (!user) {
    throw new Error("Not authenticated");
  }

  if (!["municipality", "admin"].includes(user.role)) {
    throw new Error("Only municipality and admin users can access this view");
  }

  return user;
}

function getScopedMunicipalityId(
  user: NonNullable<GQLContext["user"]>,
  requestedMunicipalityId?: string | null,
) {
  if (user.role === "municipality") {
    if (!user.municipalityId) {
      throw new Error("Municipality account is missing municipality scope");
    }

    if (
      requestedMunicipalityId &&
      requestedMunicipalityId !== user.municipalityId
    ) {
      throw new Error("You can only access your assigned municipality");
    }

    return user.municipalityId;
  }

  return requestedMunicipalityId ?? null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function round(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function latestDate(...dates: Array<Date | null | undefined>) {
  return dates
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function buildWardOfficerMap(rows: WardOfficerRow[]) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();

  for (const officer of rows) {
    const wardOfficers = grouped.get(officer.ward_id) ?? [];
    wardOfficers.push({
      id: officer.id,
      first_name: officer.first_name,
      last_name: officer.last_name,
      email: officer.email,
      phone_number: officer.phone_number,
      department_name: officer.department_name,
      assigned_report_count: toNumber(officer.assigned_report_count),
      active_report_count: toNumber(officer.active_report_count),
      completed_report_count: toNumber(officer.completed_report_count),
    });
    grouped.set(officer.ward_id, wardOfficers);
  }

  return grouped;
}

async function getWardMetrics(prisma: GQLContext["prisma"], municipalityId?: string | null) {
  // If municipality_id is provided, scope to that municipality's wards
  if (municipalityId) {
    return prisma.$queryRawUnsafe<WardMetricsRow[]>(`
      SELECT
        w.id, w.name, w.ward_code, w.contact_email, w.contact_phone,
        CASE WHEN w.boundary IS NOT NULL THEN ST_AsGeoJSON(ST_SimplifyPreserveTopology(w.boundary, 0.0001))::jsonb ELSE NULL END AS boundary_geojson,
        COALESCE((w.boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
        COALESCE((w.boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id) AS report_count,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'incoming') AS pending_reports,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'in_progress') AS in_progress_reports,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'completed') AS completed_reports,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'invalid') AS invalid_reports,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'returned') AS returned_reports,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.escalated_to_municipality = true) AS escalated_reports,
        (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.ward_deadline_at IS NOT NULL AND r.ward_deadline_at < NOW() AND r.status NOT IN ('completed', 'invalid')) AS overdue_reports,
        (SELECT COALESCE(SUM(r.upvote_count), 0)::int FROM reports r WHERE r.ward_id = w.id) AS total_upvotes,
        (SELECT COUNT(*)::int FROM report_posts rp WHERE rp.ward_id = w.id) AS published_post_count,
        (SELECT COALESCE(SUM(rp.rating_count), 0)::int FROM report_posts rp WHERE rp.ward_id = w.id) AS total_ratings,
        (SELECT COALESCE(SUM(rp.rating_average * rp.rating_count), 0)::double precision FROM report_posts rp WHERE rp.ward_id = w.id) AS rating_score_total,
        (SELECT COALESCE(ROUND((SUM(rp.rating_average * rp.rating_count) / NULLIF(SUM(rp.rating_count), 0))::numeric, 1), 0)::double precision FROM report_posts rp WHERE rp.ward_id = w.id) AS average_public_rating,
        (SELECT COUNT(*)::int FROM officers o WHERE o.deleted_at IS NULL AND o.type = 'ward_officer' AND o.ward_id = w.id) AS ward_officer_count,
        (SELECT MAX(r.updated_at) FROM reports r WHERE r.ward_id = w.id) AS last_report_at,
        (SELECT MAX(rp.updated_at) FROM report_posts rp WHERE rp.ward_id = w.id) AS last_post_at
      FROM wards w
      WHERE w.is_active = true AND w.municipality_id = $1::uuid
      ORDER BY w.ward_code ASC
    `, municipalityId);
  }

  return prisma.$queryRaw<WardMetricsRow[]>`
    SELECT
      w.id, w.name, w.ward_code, w.contact_email, w.contact_phone,
      CASE WHEN w.boundary IS NOT NULL THEN ST_AsGeoJSON(ST_SimplifyPreserveTopology(w.boundary, 0.0001))::jsonb ELSE NULL END AS boundary_geojson,
      COALESCE((w.boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
      COALESCE((w.boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id) AS report_count,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'incoming') AS pending_reports,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'in_progress') AS in_progress_reports,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'completed') AS completed_reports,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'invalid') AS invalid_reports,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.status = 'returned') AS returned_reports,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.escalated_to_municipality = true) AS escalated_reports,
      (SELECT COUNT(*)::int FROM reports r WHERE r.ward_id = w.id AND r.ward_deadline_at IS NOT NULL AND r.ward_deadline_at < NOW() AND r.status NOT IN ('completed', 'invalid')) AS overdue_reports,
      (SELECT COALESCE(SUM(r.upvote_count), 0)::int FROM reports r WHERE r.ward_id = w.id) AS total_upvotes,
      (SELECT COUNT(*)::int FROM report_posts rp WHERE rp.ward_id = w.id) AS published_post_count,
      (SELECT COALESCE(SUM(rp.rating_count), 0)::int FROM report_posts rp WHERE rp.ward_id = w.id) AS total_ratings,
      (SELECT COALESCE(SUM(rp.rating_average * rp.rating_count), 0)::double precision FROM report_posts rp WHERE rp.ward_id = w.id) AS rating_score_total,
      (SELECT COALESCE(ROUND((SUM(rp.rating_average * rp.rating_count) / NULLIF(SUM(rp.rating_count), 0))::numeric, 1), 0)::double precision FROM report_posts rp WHERE rp.ward_id = w.id) AS average_public_rating,
      (SELECT COUNT(*)::int FROM officers o WHERE o.deleted_at IS NULL AND o.type = 'ward_officer' AND o.ward_id = w.id) AS ward_officer_count,
      (SELECT MAX(r.updated_at) FROM reports r WHERE r.ward_id = w.id) AS last_report_at,
      (SELECT MAX(rp.updated_at) FROM report_posts rp WHERE rp.ward_id = w.id) AS last_post_at
    FROM wards w
    WHERE w.is_active = true
    ORDER BY w.ward_code ASC
  `;
}

async function getOfficerCounts(
  prisma: GQLContext["prisma"],
  municipalityId?: string | null,
) {
  if (municipalityId) {
    return prisma.$queryRawUnsafe<OfficerCountRow[]>(
      `
      SELECT o.type::text AS type, COUNT(*)::int AS count
      FROM officers o
      LEFT JOIN wards w ON w.id = o.ward_id
      WHERE o.deleted_at IS NULL
        AND (
          (o.type = 'ward_officer' AND w.municipality_id = $1::uuid)
          OR (o.type = 'municipality_officer')
        )
      GROUP BY o.type
    `,
      municipalityId,
    );
  }

  return prisma.$queryRaw<OfficerCountRow[]>`
    SELECT o.type::text AS type, COUNT(*)::int AS count
    FROM officers o
    WHERE o.deleted_at IS NULL
    GROUP BY o.type
  `;
}

async function getWardOfficers(
  prisma: GQLContext["prisma"],
  municipalityId?: string | null,
) {
  if (municipalityId) {
    return prisma.$queryRawUnsafe<WardOfficerRow[]>(
      `
      SELECT
        o.id,
        o.first_name,
        o.last_name,
        o.email,
        o.phone_number,
        o.ward_id,
        d.name AS department_name,
        (
          SELECT COUNT(*)::int
          FROM reports r
          WHERE r.assigned_field_officer_id = o.id
        ) AS assigned_report_count,
        (
          SELECT COUNT(*)::int
          FROM reports r
          WHERE r.assigned_field_officer_id = o.id
            AND r.status IN ('incoming', 'in_progress', 'returned')
        ) AS active_report_count,
        (
          SELECT COUNT(*)::int
          FROM reports r
          WHERE r.assigned_field_officer_id = o.id
            AND r.status = 'completed'
        ) AS completed_report_count
      FROM officers o
      INNER JOIN officer_departments d
        ON d.id = o.department_id
      INNER JOIN wards w
        ON w.id = o.ward_id
      WHERE o.deleted_at IS NULL
        AND o.type = 'ward_officer'
        AND o.ward_id IS NOT NULL
        AND w.municipality_id = $1::uuid
      ORDER BY o.ward_id ASC, o.last_name ASC, o.first_name ASC
    `,
      municipalityId,
    );
  }

  return prisma.$queryRaw<WardOfficerRow[]>`
    SELECT
      o.id,
      o.first_name,
      o.last_name,
      o.email,
      o.phone_number,
      o.ward_id,
      d.name AS department_name,
      (
        SELECT COUNT(*)::int
        FROM reports r
        WHERE r.assigned_field_officer_id = o.id
      ) AS assigned_report_count,
      (
        SELECT COUNT(*)::int
        FROM reports r
        WHERE r.assigned_field_officer_id = o.id
          AND r.status IN ('incoming', 'in_progress', 'returned')
      ) AS active_report_count,
      (
        SELECT COUNT(*)::int
        FROM reports r
        WHERE r.assigned_field_officer_id = o.id
          AND r.status = 'completed'
      ) AS completed_report_count
    FROM officers o
    INNER JOIN officer_departments d
      ON d.id = o.department_id
    WHERE o.deleted_at IS NULL
      AND o.type = 'ward_officer'
      AND o.ward_id IS NOT NULL
    ORDER BY o.ward_id ASC, o.last_name ASC, o.first_name ASC
  `;
}

async function getReportPoints(
  prisma: GQLContext["prisma"],
  municipalityId?: string | null,
) {
  if (municipalityId) {
    return prisma.$queryRawUnsafe<ReportPointRow[]>(
      `
      SELECT
        r.id,
        r.title,
        r.category,
        r.status::text AS status,
        r.priority::text AS priority,
        r.ward_id,
        w.name AS ward_name,
        w.ward_code,
        r.upvote_count,
        r.location_lat,
        r.location_lng,
        r.address_text,
        r.assigned_level::text AS assigned_level,
        r.escalated_to_municipality,
        r.created_at,
        r.updated_at
      FROM reports r
      INNER JOIN wards w
        ON w.id = r.ward_id
      WHERE w.is_active = true
        AND w.municipality_id = $1::uuid
        AND r.location_lat IS NOT NULL
        AND r.location_lng IS NOT NULL
      ORDER BY r.updated_at DESC
    `,
      municipalityId,
    );
  }

  return prisma.$queryRaw<ReportPointRow[]>`
    SELECT
      r.id,
      r.title,
      r.category,
      r.status::text AS status,
      r.priority::text AS priority,
      r.ward_id,
      w.name AS ward_name,
      w.ward_code,
      r.upvote_count,
      r.location_lat,
      r.location_lng,
      r.address_text,
      r.assigned_level::text AS assigned_level,
      r.escalated_to_municipality,
      r.created_at,
      r.updated_at
    FROM reports r
    INNER JOIN wards w
      ON w.id = r.ward_id
    WHERE w.is_active = true
      AND r.location_lat IS NOT NULL
      AND r.location_lng IS NOT NULL
    ORDER BY r.updated_at DESC
  `;
}

async function getMunicipalityBoundary(prisma: GQLContext["prisma"], municipalityId?: string | null) {
  // If municipality_id is provided, use stored municipality boundary
  if (municipalityId) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ municipality_boundary_geojson: unknown | null }>
    >(
      `SELECT
        CASE WHEN boundary IS NOT NULL
          THEN ST_AsGeoJSON(ST_SimplifyPreserveTopology(boundary, 0.0001))::jsonb
          ELSE NULL
        END AS municipality_boundary_geojson
      FROM municipalities
      WHERE id = $1::uuid AND is_active = true`,
      municipalityId,
    );
    return rows[0]?.municipality_boundary_geojson ?? null;
  }

  // Fallback: compute from all ward boundaries (legacy behavior)
  const rows = await prisma.$queryRaw<
    Array<{ municipality_boundary_geojson: unknown | null }>
  >`
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN NULL
        ELSE ST_AsGeoJSON(ST_ConvexHull(ST_Collect(boundary)))::jsonb
      END AS municipality_boundary_geojson
    FROM wards
    WHERE is_active = true
      AND boundary IS NOT NULL
  `;

  return rows[0]?.municipality_boundary_geojson ?? null;
}

type MunicipalityRow = {
  id: string;
  name: string;
  name_ne: string | null;
  code: string;
  type: string;
  province_id: number | null;
  province_name: string | null;
  district: string | null;
  boundary_geojson: unknown | null;
  center_lat: number | null;
  center_lng: number | null;
  total_wards: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export const municipalityResolvers = {
  Query: {
    municipalities: async (
      _: unknown,
      args: { province_id?: number | null },
      { prisma, user }: GQLContext,
    ) => {
      if (!user) throw new Error("Not authenticated");
      const municipalityId = getScopedMunicipalityId(user, null);

      if (municipalityId) {
        return prisma.$queryRawUnsafe<MunicipalityRow[]>(
          `SELECT id, name, name_ne, code, type, province_id, province_name, district,
                  ST_AsGeoJSON(ST_SimplifyPreserveTopology(boundary, 0.001))::jsonb AS boundary_geojson,
                  COALESCE((boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
                  COALESCE((boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
                  total_wards, is_active, created_at, updated_at
           FROM municipalities
           WHERE is_active = true AND id = $1::uuid
           ORDER BY name ASC`,
          municipalityId,
        );
      }

      if (args.province_id != null) {
        return prisma.$queryRawUnsafe<MunicipalityRow[]>(
          `SELECT id, name, name_ne, code, type, province_id, province_name, district,
                  ST_AsGeoJSON(ST_SimplifyPreserveTopology(boundary, 0.001))::jsonb AS boundary_geojson,
                  COALESCE((boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
                  COALESCE((boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
                  total_wards, is_active, created_at, updated_at
           FROM municipalities
           WHERE is_active = true AND province_id = $1
           ORDER BY name ASC`,
          args.province_id,
        );
      }

      return prisma.$queryRaw<MunicipalityRow[]>`
        SELECT id, name, name_ne, code, type, province_id, province_name, district,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(boundary, 0.001))::jsonb AS boundary_geojson,
               COALESCE((boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
               COALESCE((boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
               total_wards, is_active, created_at, updated_at
        FROM municipalities
        WHERE is_active = true
        ORDER BY name ASC
      `;
    },

    municipality: async (
      _: unknown,
      args: { id?: string | null; code?: string | null },
      { prisma, user }: GQLContext,
    ) => {
      if (!user) throw new Error("Not authenticated");
      const municipalityId = getScopedMunicipalityId(user, args.id ?? null);

      if (municipalityId) {
        const rows = await prisma.$queryRawUnsafe<MunicipalityRow[]>(
          `SELECT id, name, name_ne, code, type, province_id, province_name, district,
                  ST_AsGeoJSON(boundary)::jsonb AS boundary_geojson,
                  COALESCE((boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
                  COALESCE((boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
                  total_wards, is_active, created_at, updated_at
           FROM municipalities
           WHERE id = $1::uuid AND is_active = true
           LIMIT 1`,
          municipalityId,
        );
        return rows[0] ?? null;
      }

      if (args.code) {
        const rows = await prisma.$queryRawUnsafe<MunicipalityRow[]>(
          `SELECT id, name, name_ne, code, type, province_id, province_name, district,
                  ST_AsGeoJSON(boundary)::jsonb AS boundary_geojson,
                  COALESCE((boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
                  COALESCE((boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
                  total_wards, is_active, created_at, updated_at
           FROM municipalities
           WHERE code = $1 AND is_active = true
           LIMIT 1`,
          args.code,
        );
        return rows[0] ?? null;
      }

      return null;
    },

    municipalityTransparencyOverview: async (
      _: unknown,
      args: { municipality_id?: string | null },
      { prisma, user }: GQLContext,
    ) => {
      const viewer = requireMunicipalityViewer(user);
      const municipalityId = getScopedMunicipalityId(
        viewer,
        args.municipality_id ?? null,
      );

      const [wardMetrics, officerCounts, wardOfficerRows, reportRows, boundary] =
        await Promise.all([
          getWardMetrics(prisma, municipalityId),
          getOfficerCounts(prisma, municipalityId),
          getWardOfficers(prisma, municipalityId),
          getReportPoints(prisma, municipalityId),
          getMunicipalityBoundary(prisma, municipalityId),
        ]);

      // Fetch the municipality record if scoped
      let municipalityRecord = null;
      if (municipalityId) {
        const rows = await prisma.$queryRawUnsafe<MunicipalityRow[]>(
          `SELECT id, name, name_ne, code, type, province_id, province_name, district,
                  NULL AS boundary_geojson,
                  COALESCE((boundary_metadata->'center'->>'lat')::double precision, NULL) AS center_lat,
                  COALESCE((boundary_metadata->'center'->>'lng')::double precision, NULL) AS center_lng,
                  total_wards, is_active, created_at, updated_at
           FROM municipalities WHERE id = $1::uuid`,
          municipalityId,
        );
        municipalityRecord = rows[0] ?? null;
      }

      const officersByWard = buildWardOfficerMap(wardOfficerRows);
      const officerCountMap = new Map(
        officerCounts.map((row) => [row.type, toNumber(row.count)]),
      );
      const happinessMetrics = await getWardHappinessMetrics(
        prisma,
        wardMetrics.map((ward) => ward.id),
      );

      const wards = wardMetrics.map((ward) => ({
        id: ward.id,
        name: ward.name,
        ward_code: ward.ward_code,
        contact_email: ward.contact_email,
        contact_phone: ward.contact_phone,
        center_lat: ward.center_lat,
        center_lng: ward.center_lng,
        boundary_geojson: ward.boundary_geojson,
        report_count: toNumber(ward.report_count),
        pending_reports: toNumber(ward.pending_reports),
        in_progress_reports: toNumber(ward.in_progress_reports),
        completed_reports: toNumber(ward.completed_reports),
        invalid_reports: toNumber(ward.invalid_reports),
        returned_reports: toNumber(ward.returned_reports),
        escalated_reports: toNumber(ward.escalated_reports),
        overdue_reports: toNumber(ward.overdue_reports),
        happiness_score:
          happinessMetrics.get(ward.id)?.happinessScore ?? 100,
        happiness_penalty_total:
          happinessMetrics.get(ward.id)?.totalPenaltyPoints ?? 0,
        incoming_not_seen_count:
          happinessMetrics.get(ward.id)?.incomingNotSeenCount ?? 0,
        report_not_seen_escalation_count:
          happinessMetrics.get(ward.id)?.reportNotSeenEscalationCount ?? 0,
        deadline_missed_escalation_count:
          happinessMetrics.get(ward.id)?.deadlineMissedEscalationCount ?? 0,
        total_upvotes: toNumber(ward.total_upvotes),
        average_public_rating: round(toNumber(ward.average_public_rating)),
        total_ratings: toNumber(ward.total_ratings),
        published_post_count: toNumber(ward.published_post_count),
        ward_officer_count: toNumber(ward.ward_officer_count),
        latest_activity_at: latestDate(ward.last_report_at, ward.last_post_at),
        officers: officersByWard.get(ward.id) ?? [],
      }));

      const ratingScoreTotal = wardMetrics.reduce(
        (sum, ward) => sum + toNumber(ward.rating_score_total),
        0,
      );
      const totalRatings = wardMetrics.reduce(
        (sum, ward) => sum + toNumber(ward.total_ratings),
        0,
      );

      const summary = {
        active_wards: wards.length,
        total_reports: wards.reduce((sum, ward) => sum + ward.report_count, 0),
        pending_reports: wards.reduce((sum, ward) => sum + ward.pending_reports, 0),
        in_progress_reports: wards.reduce(
          (sum, ward) => sum + ward.in_progress_reports,
          0,
        ),
        completed_reports: wards.reduce(
          (sum, ward) => sum + ward.completed_reports,
          0,
        ),
        invalid_reports: wards.reduce((sum, ward) => sum + ward.invalid_reports, 0),
        returned_reports: wards.reduce(
          (sum, ward) => sum + ward.returned_reports,
          0,
        ),
        escalated_reports: wards.reduce(
          (sum, ward) => sum + ward.escalated_reports,
          0,
        ),
        overdue_reports: wards.reduce((sum, ward) => sum + ward.overdue_reports, 0),
        average_happiness_score:
          wards.length === 0
            ? 100
            : round(
                wards.reduce((sum, ward) => sum + ward.happiness_score, 0) /
                  wards.length,
              ),
        total_upvotes: wards.reduce((sum, ward) => sum + ward.total_upvotes, 0),
        average_public_rating:
          totalRatings === 0 ? 0 : round(ratingScoreTotal / totalRatings),
        total_ratings: totalRatings,
        published_post_count: wards.reduce(
          (sum, ward) => sum + ward.published_post_count,
          0,
        ),
        ward_officer_count: officerCountMap.get("ward_officer") ?? 0,
        municipality_officer_count:
          officerCountMap.get("municipality_officer") ?? 0,
      };

      return {
        municipality: municipalityRecord,
        summary,
        wards,
        reports: reportRows.map((report) => ({
          id: report.id,
          title: report.title,
          category: report.category,
          status: report.status,
          priority: report.priority,
          ward_id: report.ward_id,
          ward_name: report.ward_name,
          ward_code: report.ward_code,
          upvote_count: toNumber(report.upvote_count),
          location_lat: toNumber(report.location_lat),
          location_lng: toNumber(report.location_lng),
          address_text: report.address_text,
          assigned_level: report.assigned_level,
          escalated_to_municipality: report.escalated_to_municipality,
          created_at: report.created_at,
          updated_at: report.updated_at,
        })),
        municipality_boundary_geojson: boundary,
        generated_at: new Date(),
      };
    },
  },
};
