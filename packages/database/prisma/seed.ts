import { AdminRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const BRANCH_SEEDS = [
  {
    name: "Nişantaşı Şubesi",
    timezone: "Europe/Istanbul",
    slotIntervalMinutes: 10,
    cancellationCutoffHours: 24,
    cancellationOverrideAllowed: true,
  },
  {
    name: "Kadıköy Şubesi",
    timezone: "Europe/Istanbul",
    slotIntervalMinutes: 10,
    cancellationCutoffHours: 24,
    cancellationOverrideAllowed: false,
  },
] as const;

const SERVICE_SEEDS = [
  {
    name: "Saç Kesimi",
    durationMinutes: 45,
    bufferMinutes: 10,
    active: true,
  },
  {
    name: "Sakal Tıraşı",
    durationMinutes: 20,
    bufferMinutes: 5,
    active: true,
  },
  {
    name: "Saç Yıkama",
    durationMinutes: 15,
    bufferMinutes: 0,
    active: true,
  },
] as const;

type AdminUserSeed = {
  name: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  branchName?: string;
};

const ADMIN_USER_SEEDS: AdminUserSeed[] = [
  {
    name: "System Super Admin",
    email: "superadmin@culturespark.local",
    passwordHash: DEFAULT_ADMIN_PASSWORD,
    role: AdminRole.SUPER_ADMIN,
  },
  {
    name: "Nişantaşı Branch Admin",
    email: "nisantasi.admin@culturespark.local",
    passwordHash: DEFAULT_ADMIN_PASSWORD,
    role: AdminRole.BRANCH_ADMIN,
    branchName: "Nişantaşı Şubesi",
  },
  {
    name: "Kadıköy Branch Admin",
    email: "kadikoy.admin@culturespark.local",
    passwordHash: DEFAULT_ADMIN_PASSWORD,
    role: AdminRole.BRANCH_ADMIN,
    branchName: "Kadıköy Şubesi",
  },
];

const STAFF_SEEDS = [
  {
    branchName: "Nişantaşı Şubesi",
    name: "Ahmet Yılmaz",
    phone: "+905301112233",
  },
  {
    branchName: "Nişantaşı Şubesi",
    name: "Mert Demir",
    phone: "+905304445566",
  },
  {
    branchName: "Kadıköy Şubesi",
    name: "Can Kaya",
    phone: "+905302223344",
  },
  {
    branchName: "Kadıköy Şubesi",
    name: "Emre Koç",
    phone: "+905307778899",
  },
] as const;

const STAFF_WORKING_HOUR_SEEDS = [
  { dayOfWeek: 1, startMinuteOfDay: 10 * 60, endMinuteOfDay: 19 * 60 },
  { dayOfWeek: 2, startMinuteOfDay: 10 * 60, endMinuteOfDay: 19 * 60 },
  { dayOfWeek: 3, startMinuteOfDay: 10 * 60, endMinuteOfDay: 19 * 60 },
  { dayOfWeek: 4, startMinuteOfDay: 10 * 60, endMinuteOfDay: 19 * 60 },
  { dayOfWeek: 5, startMinuteOfDay: 10 * 60, endMinuteOfDay: 19 * 60 },
  { dayOfWeek: 6, startMinuteOfDay: 10 * 60, endMinuteOfDay: 18 * 60 },
] as const;

async function seedBranches() {
  const branchIdsByName = new Map<string, string>();

  for (const branch of BRANCH_SEEDS) {
    const savedBranch = await prisma.branch.upsert({
      where: { name: branch.name },
      update: {
        active: true,
        timezone: branch.timezone,
        slotIntervalMinutes: branch.slotIntervalMinutes,
        cancellationCutoffHours: branch.cancellationCutoffHours,
        cancellationOverrideAllowed: branch.cancellationOverrideAllowed,
      },
      create: branch,
      select: {
        id: true,
      },
    });

    branchIdsByName.set(branch.name, savedBranch.id);
  }

  return branchIdsByName;
}

async function seedServices() {
  const serviceIdsByName = new Map<string, string>();

  for (const service of SERVICE_SEEDS) {
    const savedService = await prisma.service.upsert({
      where: { name: service.name },
      update: {
        active: service.active,
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes,
      },
      create: service,
      select: {
        id: true,
      },
    });

    serviceIdsByName.set(service.name, savedService.id);
  }

  return serviceIdsByName;
}

async function seedAdminUsers(branchIdsByName: Map<string, string>) {
  for (const adminUser of ADMIN_USER_SEEDS) {
    let branchId: string | null = null;
    if (adminUser.branchName) {
      const resolvedBranchId = branchIdsByName.get(adminUser.branchName);
      if (!resolvedBranchId) {
        throw new Error(
          `Branch not found for admin seed: ${adminUser.branchName}`,
        );
      }
      branchId = resolvedBranchId;
    }

    await prisma.adminUser.upsert({
      where: {
        email: adminUser.email,
      },
      update: {
        name: adminUser.name,
        passwordHash: adminUser.passwordHash,
        role: adminUser.role,
        branchId,
        active: true,
      },
      create: {
        name: adminUser.name,
        email: adminUser.email,
        passwordHash: adminUser.passwordHash,
        role: adminUser.role,
        branchId,
      },
    });
  }
}

async function seedStaff(
  branchIdsByName: Map<string, string>,
  serviceIdsByName: Map<string, string>,
) {
  const serviceIds = Array.from(serviceIdsByName.values());

  for (const staffSeed of STAFF_SEEDS) {
    const branchId = branchIdsByName.get(staffSeed.branchName);
    if (!branchId) {
      throw new Error(
        `Branch not found for staff seed: ${staffSeed.branchName}`,
      );
    }

    const existingStaff = await prisma.staff.findFirst({
      where: {
        branchId,
        name: staffSeed.name,
      },
      select: {
        id: true,
      },
    });

    const staff = existingStaff
      ? await prisma.staff.update({
          where: {
            id: existingStaff.id,
          },
          data: {
            phone: staffSeed.phone,
            active: true,
          },
          select: {
            id: true,
          },
        })
      : await prisma.staff.create({
          data: {
            branchId,
            name: staffSeed.name,
            phone: staffSeed.phone,
          },
          select: {
            id: true,
          },
        });

    await prisma.staffService.createMany({
      data: serviceIds.map((serviceId) => ({
        staffId: staff.id,
        serviceId,
      })),
      skipDuplicates: true,
    });

    await prisma.staffWorkingHour.createMany({
      data: STAFF_WORKING_HOUR_SEEDS.map((entry) => ({
        staffId: staff.id,
        dayOfWeek: entry.dayOfWeek,
        startMinuteOfDay: entry.startMinuteOfDay,
        endMinuteOfDay: entry.endMinuteOfDay,
      })),
      skipDuplicates: true,
    });
  }
}

async function main() {
  const branchIdsByName = await seedBranches();
  const serviceIdsByName = await seedServices();
  await seedAdminUsers(branchIdsByName);
  await seedStaff(branchIdsByName, serviceIdsByName);
  console.log(
    "Seed data applied: branches, services, admin_users, staff, staff_services, staff_working_hours",
  );
  console.log(
    `Admin user password set to "${DEFAULT_ADMIN_PASSWORD}" (override with SEED_ADMIN_PASSWORD).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
