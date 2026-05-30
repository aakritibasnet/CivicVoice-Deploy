import { Prisma } from "@/app/generated/prisma/client";
import { GQLContext } from "../context";
import { hashPassword } from "@/src/lib/auth";
import {
  FIXED_DEPARTMENT_SLUGS,
  sortDepartmentsByCatalog,
} from "@/src/features/departments/catalog";

type DashboardUser = NonNullable<GQLContext["user"]>;
type OfficerAccessLevel = "manageable" | "read_only" | "hidden";
const OFFICER_ACTIVE_NAME_UNIQUE_INDEX = "idx_officers_active_name_unique";

interface CreateOfficerInput {
  first_name: string;
  last_name: string;
  phone_number?: string | null;
  profile_image_url?: string | null;
  department_id: string;
  type: "ward_officer" | "municipality_officer";
  ward_id?: string | null;
}

interface UpdateOfficerInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  profile_image_url?: string | null;
  department_id?: string | null;
  type?: "ward_officer" | "municipality_officer" | null;
  ward_id?: string | null;
}

const officerInclude = {
  officer_departments: true,
  wards: {
    select: {
      id: true,
      name: true,
      ward_code: true,
    },
  },
} satisfies Prisma.officersInclude;

type OfficerRecord = Prisma.officersGetPayload<{
  include: typeof officerInclude;
}>;

function requireAuth(user: GQLContext["user"]) {
  if (!user) {
    throw new Error("Not authenticated");
  }

  if (!["ward", "municipality", "admin"].includes(user.role)) {
    throw new Error("Not authorized");
  }

  return user;
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();

  if (!trimmed) {
    throw new Error("Email is required");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(trimmed)) {
    throw new Error("Enter a valid email address");
  }

  return trimmed;
}

function normalizeNameToken(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildWardSegment(ward: { name: string; ward_code: string }) {
  const wardNumberMatch = ward.ward_code.match(/(\d+)$/);

  if (wardNumberMatch) {
    return `ward${Number(wardNumberMatch[1])}`;
  }

  const wardNameToken =
    normalizeNameToken(ward.name.replace(/\bward\b/gi, "")) || "ward";

  if (/^\d+$/.test(wardNameToken)) {
    return `ward${Number(wardNameToken)}`;
  }

  return wardNameToken;
}

function buildWardOfficerEmail(params: {
  firstName: string;
  lastName: string;
  ward: { name: string; ward_code: string };
}) {
  const firstInitial = normalizeNameToken(params.firstName).charAt(0) || "o";
  const lastNameToken = normalizeNameToken(params.lastName) || "officer";
  const wardSegment = buildWardSegment(params.ward);

  return `${firstInitial}.${lastNameToken}.${wardSegment}.civicvoice@gov.np`;
}

function buildMunicipalityOfficerEmail(params: {
  firstName: string;
  lastName: string;
}) {
  const firstInitial = normalizeNameToken(params.firstName).charAt(0) || "o";
  const lastNameToken = normalizeNameToken(params.lastName) || "officer";

  return `${firstInitial}.${lastNameToken}.municipality.civicvoice@gov.np`;
}

function buildOfficerPassword(params: {
  firstName: string;
  lastName: string;
}) {
  const firstInitial = normalizeNameToken(params.firstName).charAt(0) || "o";
  const lastNameToken = normalizeNameToken(params.lastName) || "officer";
  return `${firstInitial}.${lastNameToken}@123`;
}

function normalizeRequiredString(
  value: string | null | undefined,
  fieldLabel: string,
) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldLabel} is required`);
  }

  return trimmed;
}

function getOfficerAccessLevel(
  officer: Pick<OfficerRecord, "type" | "ward_id">,
  user: DashboardUser,
): OfficerAccessLevel {
  if (user.role === "admin") {
    return "manageable";
  }

  if (user.role === "ward") {
    return officer.ward_id === user.wardId ? "manageable" : "hidden";
  }

  if (user.role === "municipality") {
    return officer.type === "municipality_officer" ? "manageable" : "read_only";
  }

  return "hidden";
}

function formatOfficer(officer: OfficerRecord, user: DashboardUser) {
  const accessLevel = getOfficerAccessLevel(officer, user);

  if (accessLevel === "hidden") {
    return null;
  }

  return {
    id: officer.id,
    first_name: officer.first_name,
    last_name: officer.last_name,
    email: officer.email,
    phone_number: officer.phone_number,
    profile_image_url: officer.profile_image_url,
    department_id: officer.department_id,
    type: officer.type,
    ward_id: officer.ward_id,
    created_at: officer.created_at,
    updated_at: officer.updated_at,
    must_change_password: officer.must_change_password,
    password_changed_at: officer.password_changed_at,
    access_level: accessLevel,
    department: {
      id: officer.officer_departments.id,
      slug: officer.officer_departments.slug,
      name: officer.officer_departments.name,
      description: officer.officer_departments.description,
      created_at: officer.officer_departments.created_at,
      updated_at: officer.officer_departments.updated_at,
    },
    ward: officer.wards
      ? {
          id: officer.wards.id,
          name: officer.wards.name,
          ward_code: officer.wards.ward_code,
        }
      : null,
  };
}

async function ensureDepartmentExists(
  prisma: GQLContext["prisma"],
  departmentId: string,
) {
  const department = await prisma.officer_departments.findFirst({
    where: {
      id: departmentId,
      slug: { in: FIXED_DEPARTMENT_SLUGS },
    },
  });

  if (!department) {
    throw new Error("Department not found in the fixed department catalog");
  }

  return department;
}

async function ensureWardExists(
  prisma: GQLContext["prisma"],
  wardId: string,
) {
  const ward = await prisma.wards.findUnique({
    where: { id: wardId },
  });

  if (!ward) {
    throw new Error("Ward not found");
  }

  return ward;
}

async function resolveUniqueOfficerName(
  prisma: GQLContext["prisma"],
  params: {
    firstName: string;
    lastName: string;
    excludeOfficerId?: string;
  },
) {
  let counter = 0;

  while (true) {
    const candidateLastName =
      counter === 0 ? params.lastName : `${params.lastName}${counter}`;

    const existingOfficer = await prisma.officers.findFirst({
      where: {
        deleted_at: null,
        ...(params.excludeOfficerId
          ? { id: { not: params.excludeOfficerId } }
          : {}),
        first_name: {
          equals: params.firstName,
          mode: "insensitive",
        },
        last_name: {
          equals: candidateLastName,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (!existingOfficer) {
      return {
        firstName: params.firstName,
        lastName: candidateLastName,
      };
    }

    counter += 1;
  }
}

function canEditOfficerEmail(
  officer: Pick<OfficerRecord, "type" | "ward_id">,
  user: DashboardUser,
) {
  if (
    user.role === "ward" &&
    officer.type === "ward_officer" &&
    officer.ward_id === user.wardId
  ) {
    return true;
  }

  return user.role === "municipality" && officer.type === "municipality_officer";
}

function getOfficerEmailEditError(
  officer: Pick<OfficerRecord, "type">,
) {
  return officer.type === "municipality_officer"
    ? "Only municipality can edit this officer email"
    : "Only the owning ward can edit this officer email";
}

function getUniqueConstraintTarget(error: Prisma.PrismaClientKnownRequestError) {
  if (Array.isArray(error.meta?.target)) {
    return error.meta.target.join(",");
  }

  return typeof error.meta?.target === "string" ? error.meta.target : "";
}

function isOfficerNameUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    getUniqueConstraintTarget(error).includes(OFFICER_ACTIVE_NAME_UNIQUE_INDEX)
  );
}

function isOfficerEmailUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    getUniqueConstraintTarget(error).includes("email")
  );
}

function buildOfficerCreateData(input: CreateOfficerInput, user: DashboardUser) {
  const firstName = normalizeRequiredString(input.first_name, "First name");
  const lastName = normalizeRequiredString(input.last_name, "Last name");
  const phoneNumber = normalizeOptionalString(input.phone_number);
  const profileImageUrl = normalizeOptionalString(input.profile_image_url);

  if (user.role === "ward") {
    if (!user.wardId) {
      throw new Error("Ward user is not assigned to a ward");
    }

    return {
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      profile_image_url: profileImageUrl,
      department_id: input.department_id,
      type: "ward_officer" as const,
      ward_id: user.wardId,
    };
  }

  if (user.role === "municipality") {
    return {
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      profile_image_url: profileImageUrl,
      department_id: input.department_id,
      type: "municipality_officer" as const,
      ward_id: null,
    };
  }

  if (input.type === "ward_officer") {
    if (!input.ward_id) {
      throw new Error("Ward is required for ward officers");
    }

    return {
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      profile_image_url: profileImageUrl,
      department_id: input.department_id,
      type: input.type,
      ward_id: input.ward_id,
    };
  }

  return {
    first_name: firstName,
    last_name: lastName,
    phone_number: phoneNumber,
    profile_image_url: profileImageUrl,
    department_id: input.department_id,
    type: "municipality_officer" as const,
    ward_id: null,
  };
}

function buildOfficerUpdateData(
  currentOfficer: OfficerRecord,
  input: UpdateOfficerInput,
  user: DashboardUser,
) {
  const nextType =
    user.role === "ward"
      ? "ward_officer"
      : user.role === "municipality"
        ? "municipality_officer"
        : input.type ?? currentOfficer.type;

  const nextWardId =
    user.role === "ward"
      ? user.wardId
      : user.role === "municipality"
        ? null
        : nextType === "ward_officer"
          ? input.ward_id ?? currentOfficer.ward_id
          : null;

  const firstName =
    input.first_name === undefined
      ? currentOfficer.first_name
      : normalizeRequiredString(input.first_name, "First name");
  const lastName =
    input.last_name === undefined
      ? currentOfficer.last_name
      : normalizeRequiredString(input.last_name, "Last name");

  if (nextType === "ward_officer" && !nextWardId) {
    throw new Error("Ward is required for ward officers");
  }

  return {
    first_name: firstName,
    last_name: lastName,
    email:
      input.email === undefined
        ? currentOfficer.email
        : normalizeEmail(input.email),
    phone_number:
      input.phone_number === undefined
        ? currentOfficer.phone_number
        : normalizeOptionalString(input.phone_number),
    profile_image_url:
      input.profile_image_url === undefined
        ? currentOfficer.profile_image_url
        : normalizeOptionalString(input.profile_image_url),
    department_id: input.department_id ?? currentOfficer.department_id,
    type: nextType,
    ward_id: nextType === "ward_officer" ? nextWardId : null,
    updated_at: new Date(),
  };
}

async function findOfficerForMutation(
  prisma: GQLContext["prisma"],
  officerId: string,
) {
  const officer = await prisma.officers.findUnique({
    where: { id: officerId },
    include: officerInclude,
  });

  if (!officer || officer.deleted_at) {
    throw new Error("Officer not found");
  }

  return officer;
}

function assertManageableOfficer(officer: OfficerRecord, user: DashboardUser) {
  if (getOfficerAccessLevel(officer, user) !== "manageable") {
    throw new Error("Not authorized to manage this officer");
  }
}

async function logOfficerActivity(
  prisma: GQLContext["prisma"],
  user: DashboardUser,
  action: string,
  details: Record<string, unknown>,
) {
  await prisma.activity_log.create({
    data: {
      actor_id: user.id,
      actor_name: user.email,
      action,
      details: details as Prisma.InputJsonValue,
    },
  });
}

export const officerResolvers = {
  Query: {
    officers: async (_: unknown, __: unknown, { prisma, user }: GQLContext) => {
      const authed = requireAuth(user);

      if (authed.role === "ward" && !authed.wardId) {
        return [];
      }

      const where: Prisma.officersWhereInput = {
        deleted_at: null,
        ...(authed.role === "ward" ? { ward_id: authed.wardId } : {}),
      };

      const officers = await prisma.officers.findMany({
        where,
        include: officerInclude,
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      });

      return officers
        .map((officer) => formatOfficer(officer, authed))
        .filter((officer): officer is NonNullable<typeof officer> => Boolean(officer));
    },

    officerDepartments: async (
      _: unknown,
      __: unknown,
      { prisma, user }: GQLContext,
    ) => {
      requireAuth(user);

      const departments = await prisma.officer_departments.findMany({
        where: {
          slug: { in: FIXED_DEPARTMENT_SLUGS },
        },
      });

      return sortDepartmentsByCatalog(departments);
    },
  },

  Mutation: {
    createOfficer: async (
      _: unknown,
      { input }: { input: CreateOfficerInput },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      const data = buildOfficerCreateData(input, authed);

      await ensureDepartmentExists(prisma, data.department_id);
      const ward =
        data.type === "ward_officer" && data.ward_id
          ? await ensureWardExists(prisma, data.ward_id)
          : null;

      let officer: OfficerRecord | null = null;
      let generatedCredentials: { email: string; password: string } | null =
        null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const uniqueName = await resolveUniqueOfficerName(prisma, {
          firstName: data.first_name,
          lastName: data.last_name,
        });

        let generatedEmail: string | null = null;
        let generatedPassword: string | null = null;
        let passwordHash: string | null = null;
        let mustChangePassword = false;

        if (data.type === "ward_officer" && ward) {
          generatedEmail = buildWardOfficerEmail({
            firstName: uniqueName.firstName,
            lastName: uniqueName.lastName,
            ward,
          });
        }

        if (data.type === "municipality_officer") {
          generatedEmail = buildMunicipalityOfficerEmail({
            firstName: uniqueName.firstName,
            lastName: uniqueName.lastName,
          });
        }

        if (generatedEmail) {
          generatedPassword = buildOfficerPassword({
            firstName: uniqueName.firstName,
            lastName: uniqueName.lastName,
          });
          passwordHash = await hashPassword(generatedPassword);
          mustChangePassword = true;
        }

        try {
          officer = await prisma.officers.create({
            data: {
              ...data,
              first_name: uniqueName.firstName,
              last_name: uniqueName.lastName,
              email: generatedEmail,
              password_hash: passwordHash,
              must_change_password: mustChangePassword,
              password_changed_at: null,
            },
            include: officerInclude,
          });
          generatedCredentials =
            generatedEmail && generatedPassword
              ? {
                  email: generatedEmail,
                  password: generatedPassword,
                }
              : null;
          break;
        } catch (error) {
          if (isOfficerNameUniqueConstraintError(error)) {
            continue;
          }

          if (isOfficerEmailUniqueConstraintError(error)) {
            throw new Error("Officer email already exists");
          }

          throw error;
        }
      }

      if (!officer) {
        throw new Error("Failed to generate a unique officer name");
      }

      await logOfficerActivity(prisma, authed, "officer_created", {
        officer_id: officer.id,
        type: officer.type,
        ward_id: officer.ward_id,
        department_id: officer.department_id,
        email: officer.email,
      });

      const formatted = formatOfficer(officer, authed);
      if (!formatted) {
        throw new Error("Officer is not visible");
      }

      return {
        officer: formatted,
        generated_credentials: generatedCredentials,
      };
    },

    updateOfficer: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateOfficerInput },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      const existingOfficer = await findOfficerForMutation(prisma, id);

      assertManageableOfficer(existingOfficer, authed);

      if (
        input.email !== undefined &&
        !canEditOfficerEmail(existingOfficer, authed)
      ) {
        throw new Error(getOfficerEmailEditError(existingOfficer));
      }

      const data = buildOfficerUpdateData(existingOfficer, input, authed);

      await ensureDepartmentExists(prisma, data.department_id);
      if (data.type === "ward_officer" && data.ward_id) {
        await ensureWardExists(prisma, data.ward_id);
      }

      let officer: OfficerRecord | null = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const uniqueName = await resolveUniqueOfficerName(prisma, {
          firstName: data.first_name,
          lastName: data.last_name,
          excludeOfficerId: existingOfficer.id,
        });

        try {
          officer = await prisma.officers.update({
            where: { id },
            data: {
              ...data,
              first_name: uniqueName.firstName,
              last_name: uniqueName.lastName,
            },
            include: officerInclude,
          });
          break;
        } catch (error) {
          if (isOfficerNameUniqueConstraintError(error)) {
            continue;
          }

          if (isOfficerEmailUniqueConstraintError(error)) {
            throw new Error("Officer email already exists");
          }

          throw error;
        }
      }

      if (!officer) {
        throw new Error("Failed to generate a unique officer name");
      }

      await logOfficerActivity(prisma, authed, "officer_updated", {
        officer_id: officer.id,
        type: officer.type,
        ward_id: officer.ward_id,
        department_id: officer.department_id,
        email: officer.email,
      });

      const formatted = formatOfficer(officer, authed);
      if (!formatted) {
        throw new Error("Officer is not visible");
      }

      return formatted;
    },

    resetOfficerPassword: async (
      _: unknown,
      { id }: { id: string },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      const officer = await findOfficerForMutation(prisma, id);
      assertManageableOfficer(officer, authed);

      const tempPassword = buildOfficerPassword({
        firstName: officer.first_name,
        lastName: officer.last_name,
      });
      const hash = await hashPassword(tempPassword);

      const updated = await prisma.officers.update({
        where: { id },
        data: {
          password_hash: hash,
          must_change_password: true,
          password_changed_at: null,
          updated_at: new Date(),
        },
        include: officerInclude,
      });

      await logOfficerActivity(prisma, authed, "officer_password_reset", {
        officer_id: id,
      });

      const formatted = formatOfficer(updated, authed);
      if (!formatted) throw new Error("Officer not visible");

      return { officer: formatted, temp_password: tempPassword };
    },

    deleteOfficer: async (
      _: unknown,
      { id }: { id: string },
      { prisma, user }: GQLContext,
    ) => {
      const authed = requireAuth(user);
      const existingOfficer = await findOfficerForMutation(prisma, id);

      assertManageableOfficer(existingOfficer, authed);

      await prisma.officers.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          updated_at: new Date(),
        },
      });

      await logOfficerActivity(prisma, authed, "officer_deleted", {
        officer_id: id,
      });

      return true;
    },
  },
};
