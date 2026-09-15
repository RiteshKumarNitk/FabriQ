/**
 * FabriQ — platform seed.
 *
 * Idempotent: safe to run repeatedly. Creates:
 *   1. Permission catalog (synced from @fabriq/shared — single source of truth)
 *   2. System roles: PLATFORM_ADMIN (platform) + tenant roles
 *   3. A demo tenant ("ACME") with company, factory, warehouses, org tree,
 *      users, master data, settings and a sample workflow definition
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PERMISSIONS,
  ROLE_CODES,
  DEFAULT_TENANT_SETTINGS,
  WarehouseType,
  ProductionLineStatus,
  EntityStatus,
  UserStatus,
  TenantStatus,
  Priority,
  RequisitionStatus,
  PurchaseOrderStatus,
  Unit,
} from '@fabriq/shared';

const prisma = new PrismaClient();

import { provisionTenantRoles, provisionTenantSettings } from '../src/tenant-provision';

const PLATFORM_ADMIN_PASSWORD = 'Admin@123';
const DEMO_PASSWORD = 'Demo@123';

async function seedPermissions() {
  let created = 0;
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: p.module, name: p.name, description: p.description },
      update: { module: p.module, name: p.name, description: p.description },
    });
    created++;
  }
  console.log(`✔ permissions: ${created} synced from catalog`);
}

async function seedRole(code: string, name: string, description: string, tenantId: string | null) {
  // Compound-unique where inputs cannot express null tenantId (platform roles),
  // so resolve by findFirst + create/update instead of upsert.
  const existing = await prisma.role.findFirst({ where: { code, tenantId } });
  if (existing) {
    return prisma.role.update({ where: { id: existing.id }, data: { name, description } });
  }
  return prisma.role.create({ data: { tenantId, code, name, description, isSystem: true } });
}

/**
 * Keeps the DocumentSequence counters in sync with directly-seeded document
 * numbers so the next generated number never collides with seeded data.
 * Never rewinds an already-advanced counter.
 */
async function ensureSequence(tenantId: string, prefix: string, year: number, seededCount: number) {
  const key = `${prefix}-${year}`;
  const existing = await prisma.documentSequence.findUnique({ where: { tenantId_key: { tenantId, key } } });
  if (!existing) {
    await prisma.documentSequence.create({ data: { tenantId, key, prefix, year, lastNumber: seededCount } });
  } else if (existing.lastNumber < seededCount) {
    await prisma.documentSequence.update({ where: { id: existing.id }, data: { lastNumber: seededCount } });
  }
}

async function seedUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  tenantId: string | null;
  companyId?: string;
  factoryId?: string;
  status?: UserStatus;
  isPlatformAdmin?: boolean;
  roleCodes: string[];
}) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.upsert({
    where: { email: data.email },
    create: {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      passwordHash,
      tenantId: data.tenantId,
      companyId: data.companyId,
      factoryId: data.factoryId,
      status: data.status ?? UserStatus.ACTIVE,
      isPlatformAdmin: data.isPlatformAdmin ?? false,
    },
    update: {
      tenantId: data.tenantId,
      companyId: data.companyId,
      factoryId: data.factoryId,
      status: data.status ?? UserStatus.ACTIVE,
      isPlatformAdmin: data.isPlatformAdmin ?? false,
    },
  });
  for (const code of data.roleCodes) {
    const role = await prisma.role.findFirst({ where: { code, tenantId: data.tenantId } });
    if (!role) {
      console.warn(`  ! role ${code} not found for tenant ${data.tenantId ?? 'platform'} — skipping`);
      continue;
    }
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }
  return user;
}

async function main() {
  console.log('Seeding FabriQ platform…');

  await seedPermissions();

  // ── Platform admin ──────────────────────────────────────────────────────
  const platformAdminRole = await seedRole(
    ROLE_CODES.PLATFORM_ADMIN,
    'Platform Administrator',
    'Full access across the platform (all tenants)',
    null,
  );
  // grant every permission to the platform role
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: platformAdminRole.id, permissionId: perm.id } },
      create: { roleId: platformAdminRole.id, permissionId: perm.id },
      update: {},
    });
  }
  await seedUser({
    email: 'admin@fabriq.local',
    firstName: 'Platform',
    lastName: 'Admin',
    password: PLATFORM_ADMIN_PASSWORD,
    tenantId: null,
    isPlatformAdmin: true,
    roleCodes: [ROLE_CODES.PLATFORM_ADMIN],
  });

  // ── Demo tenant: ACME ───────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { code: 'ACME' },
    create: {
      code: 'ACME',
      name: 'Acme Garments Pvt. Ltd.',
      status: TenantStatus.ACTIVE,
      plan: 'enterprise',
      contactName: 'Ritesh Kumar',
      contactEmail: 'owner@acme.test',
      contactPhone: '+91 90000 00000',
      address: '12, Textile Park',
      city: 'Tiruppur',
      state: 'Tamil Nadu',
      country: 'India',
    },
    update: {},
  });
  console.log(`✔ tenant ACME (${tenant.id})`);

  // tenant roles
  await provisionTenantRoles(prisma, tenant.id);

  const company = await prisma.company.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ACME-HQ' } },
    create: { tenantId: tenant.id, code: 'ACME-HQ', name: 'Acme Garments Pvt. Ltd.', gstin: '33AACCA1234A1Z5', city: 'Tiruppur', state: 'Tamil Nadu', country: 'India', status: EntityStatus.ACTIVE },
    update: {},
  });
  console.log(`✔ company ${company.code}`);

  const factory = await prisma.factory.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'FAC-01' } },
    create: { tenantId: tenant.id, companyId: company.id, code: 'FAC-01', name: 'Acme Factory One', city: 'Tiruppur', state: 'Tamil Nadu', country: 'India', status: EntityStatus.ACTIVE },
    update: {},
  });
  console.log(`✔ factory ${factory.code}`);

  // warehouses
  const warehouses = [
    { code: 'WH-RM', name: 'Raw Material Warehouse', type: WarehouseType.RAW_MATERIAL },
    { code: 'WH-WIP', name: 'WIP Warehouse', type: WarehouseType.WIP },
    { code: 'WH-FG', name: 'Finished Goods Warehouse', type: WarehouseType.FINISHED_GOODS },
  ];
  for (const w of warehouses) {
    await prisma.warehouse.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: w.code } },
      create: { tenantId: tenant.id, companyId: company.id, factoryId: factory.id, code: w.code, name: w.name, type: w.type },
      update: {},
    });
  }
  console.log(`✔ warehouses (${warehouses.length})`);

  // departments / sections / lines
  const deptDefs = [
    { code: 'D-CUT', name: 'Cutting', sections: ['CUT-1', 'CUT-2'], lines: ['L1', 'L2'] },
    { code: 'D-SEW', name: 'Sewing', sections: ['SEW-1', 'SEW-2'], lines: ['L3', 'L4', 'L5'] },
    { code: 'D-FIN', name: 'Finishing', sections: ['FIN-1'], lines: [] },
  ];
  for (const d of deptDefs) {
    const dept = await prisma.department.upsert({
      where: { tenantId_factoryId_code: { tenantId: tenant.id, factoryId: factory.id, code: d.code } },
      create: { tenantId: tenant.id, factoryId: factory.id, code: d.code, name: d.name },
      update: {},
    });
    for (const sc of d.sections) {
      await prisma.section.upsert({
        where: { tenantId_departmentId_code: { tenantId: tenant.id, departmentId: dept.id, code: sc } },
        create: { tenantId: tenant.id, departmentId: dept.id, code: sc, name: `${d.name} Section ${sc}` },
        update: {},
      });
    }
    for (const line of d.lines) {
      await prisma.productionLine.upsert({
        where: { tenantId_factoryId_code: { tenantId: tenant.id, factoryId: factory.id, code: line } },
        create: { tenantId: tenant.id, factoryId: factory.id, departmentId: dept.id, code: line, name: `${d.name} Line ${line}`, capacity: 40, status: ProductionLineStatus.ACTIVE },
        update: {},
      });
    }
  }
  console.log(`✔ org tree (${deptDefs.length} departments)`);

  // tenant users
  await seedUser({
    email: 'owner@acme.test', firstName: 'Ritesh', lastName: 'Kumar',
    password: DEMO_PASSWORD, tenantId: tenant.id, companyId: company.id, factoryId: factory.id,
    roleCodes: [ROLE_CODES.TENANT_ADMIN],
  });
  await seedUser({
    email: 'manager@acme.test', firstName: 'Priya', lastName: 'Sharma',
    password: DEMO_PASSWORD, tenantId: tenant.id, companyId: company.id, factoryId: factory.id,
    roleCodes: [ROLE_CODES.FACTORY_MANAGER],
  });
  await seedUser({
    email: 'supervisor@acme.test', firstName: 'Arun', lastName: 'Nair',
    password: DEMO_PASSWORD, tenantId: tenant.id, companyId: company.id, factoryId: factory.id,
    roleCodes: [ROLE_CODES.SUPERVISOR],
  });
  await seedUser({
    email: 'operator@acme.test', firstName: 'Kavya', lastName: 'Reddy',
    password: DEMO_PASSWORD, tenantId: tenant.id, companyId: company.id, factoryId: factory.id,
    roleCodes: [ROLE_CODES.OPERATOR],
  });
  console.log(`✔ users`);

  // master data
  const categories: Array<{ code: string; name: string; items: string[] }> = [
    { code: 'FABRIC_TYPE', name: 'Fabric Type', items: ['Cotton 100%', 'Cotton Polyester 60/40', 'Polyester 100%', 'Lycra Jersey'] },
    { code: 'COLOR', name: 'Color', items: ['Black', 'White', 'Navy', 'Olive'] },
    { code: 'SIZE', name: 'Size', items: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { code: 'GARMENT_CATEGORY', name: 'Garment Category', items: ['T-Shirt', 'Polo', 'Hoodie', 'Trousers', 'Shorts'] },
  ];
  for (const c of categories) {
    const cat = await prisma.masterDataCategory.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      create: { tenantId: tenant.id, code: c.code, name: c.name, isSystem: true },
      update: {},
    });
    for (const item of c.items) {
      await prisma.masterDataItem.upsert({
        where: { tenantId_categoryId_code: { tenantId: tenant.id, categoryId: cat.id, code: item.toUpperCase().replace(/[^A-Z0-9]/g, '_') } },
        create: { tenantId: tenant.id, categoryId: cat.id, code: item.toUpperCase().replace(/[^A-Z0-9]/g, '_'), name: item, sortOrder: 0 },
        update: {},
      });
    }
  }
  console.log(`✔ master data (${categories.length} categories)`);

  // settings
  await provisionTenantSettings(prisma, tenant.id);
  console.log(`✔ settings (${Object.keys(DEFAULT_TENANT_SETTINGS).length})`);

  // sample workflow definition
  const wf = await prisma.workflowDefinition.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'PR-APPROVAL' } },
    create: {
      tenantId: tenant.id, code: 'PR-APPROVAL', name: 'Purchase Requisition Approval',
      entityType: 'purchase-requisition', description: 'Two-step approval: supervisor then factory manager',
    },
    update: {},
  });
  const stepDefs = [
    { stepOrder: 1, name: 'Supervisor Review', isApproval: true, assigneeRoleCode: ROLE_CODES.SUPERVISOR },
    { stepOrder: 2, name: 'Manager Approval', isApproval: true, assigneeRoleCode: ROLE_CODES.FACTORY_MANAGER },
  ];
  for (const s of stepDefs) {
    await prisma.workflowStep.upsert({
      where: { workflowDefinitionId_stepOrder: { workflowDefinitionId: wf.id, stepOrder: s.stepOrder } },
      create: { tenantId: tenant.id, workflowDefinitionId: wf.id, ...s },
      update: {},
    });
  }
  console.log(`✔ workflow definition ${wf.code}`);

  // ── Phase 2 — Procurement demo data ─────────────────────────────────────
  const suppliers = [
    {
      code: 'SUP-001', name: 'WeaveCraft Textiles', businessName: 'WeaveCraft Textiles Pvt. Ltd.',
      gstin: '33AAACW1234F1Z9', pan: 'AAACW1234F', contactPerson: 'Meena Raman', email: 'sales@weavecraft.example',
      mobile: '+91 98400 12345', officePhone: '+91 421 223 3344', website: 'https://weavecraft.example',
      billingAddress: '22, Powerloom Colony', shippingAddress: '45, Spinning Mill Road', country: 'India',
      state: 'Tamil Nadu', city: 'Coimbatore', pincode: '641011', paymentTerms: '30 days from invoice',
      creditDays: 30, currency: 'INR', bankName: 'HDFC Bank', bankAccountNumber: '50100234567890',
      bankIfsc: 'HDFC0001234', bankBranch: 'Coimbatore RS Puram', status: EntityStatus.ACTIVE,
      contacts: JSON.stringify([
        { name: 'Meena Raman', designation: 'Sales Manager', email: 'meena@weavecraft.example', phone: '+91 98400 12345', isPrimary: true },
        { name: 'Karthik S.', designation: 'Dispatch', email: 'dispatch@weavecraft.example', phone: '+91 98400 99999', isPrimary: false },
      ]),
    },
    {
      code: 'SUP-002', name: 'Prime Knits India', businessName: 'Prime Knits India',
      gstin: '33AABCP6789K1Z4', pan: 'AABCP6789K', contactPerson: 'Natarajan V.', email: 'orders@primeknits.example',
      mobile: '+91 97890 11223', officePhone: '+91 421 555 6677', country: 'India', state: 'Tamil Nadu',
      city: 'Tiruppur', pincode: '641604', paymentTerms: 'Advance + balance on delivery', creditDays: 0,
      currency: 'INR', status: EntityStatus.ACTIVE,
      contacts: JSON.stringify([
        { name: 'Natarajan V.', designation: 'Partner', email: 'natarajan@primeknits.example', phone: '+91 97890 11223', isPrimary: true },
      ]),
    },
    {
      code: 'SUP-003', name: 'Global Fabric Traders', businessName: 'Global Fabric Traders',
      gstin: '27AAECG4567L1Z2', pan: 'AAECG4567L', contactPerson: 'Rohit Mehta', email: 'info@globalfabric.example',
      mobile: '+91 98220 44556', country: 'India', state: 'Maharashtra', city: 'Mumbai', pincode: '400013',
      paymentTerms: '45 days', creditDays: 45, currency: 'INR', status: EntityStatus.INACTIVE, notes: 'On hold — pricing renegotiation.'
    },
  ];
  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: s.code } },
      create: { tenantId: tenant.id, ...s, contacts: s.contacts ? JSON.parse(s.contacts) : null },
      update: {},
    });
  }
  console.log(`✔ suppliers (${suppliers.length})`);

  const requester = await prisma.user.findFirst({ where: { email: 'manager@acme.test' } });
  const cuttingDept = await prisma.department.findFirst({ where: { tenantId: tenant.id, code: 'D-CUT' } });

  // PR-1 APPROVED (convertible to PO) + PR-2 DRAFT (for the live workflow demo)
  const prDefs = [
    {
      number: 'PR-2026-0001', status: RequisitionStatus.APPROVED, priority: Priority.HIGH,
      requestDate: new Date(Date.now() - 3 * 86400000), expectedDate: new Date(Date.now() + 7 * 86400000),
      remarks: 'Bulk cotton for the Q2 cutting plan — approved by factory manager.',
      items: [
        { itemName: 'Cotton 100% — Grey Fabric', description: 'Compact 100% cotton, 40s combed', quantity: 5000, unit: Unit.METERS, remarks: 'For cutting D-CUT' },
        { itemName: 'Navy Dye — Poly/Cotton 60/40', description: 'Single jersey, 180 GSM', quantity: 2500, unit: Unit.METERS },
      ],
    },
    {
      number: 'PR-2026-0002', status: RequisitionStatus.DRAFT, priority: Priority.MEDIUM,
      requestDate: new Date(), expectedDate: new Date(Date.now() + 14 * 86400000),
      remarks: 'Draft requisition — submit to start the approval workflow.',
      items: [
        { itemName: 'Olive Polyester 100%', description: 'Double knit, 220 GSM', quantity: 1200, unit: Unit.METERS },
      ],
    },
  ];
  for (const pr of prDefs) {
    const existing = await prisma.purchaseRequisition.findFirst({
      where: { tenantId: tenant.id, number: pr.number },
    });
    if (existing) continue;
    const created = await prisma.purchaseRequisition.create({
      data: {
        tenantId: tenant.id, number: pr.number, status: pr.status, priority: pr.priority,
        requestDate: pr.requestDate, expectedDate: pr.expectedDate, remarks: pr.remarks,
        requestedById: requester?.id ?? null, departmentId: cuttingDept?.id ?? null,
        createdBy: requester?.id ?? null,
        items: {
          create: pr.items.map((item) => ({ tenantId: tenant.id, ...item })),
        },
      },
    });
    console.log(`✔ ${created.number} (${pr.status})`);
  }

  // PO-1 DRAFT from PR-1
  const pr1 = await prisma.purchaseRequisition.findFirst({ where: { tenantId: tenant.id, number: 'PR-2026-0001' } });
  const sup1 = await prisma.supplier.findFirst({ where: { tenantId: tenant.id, code: 'SUP-001' } });
  if (pr1 && sup1) {
    const poExists = await prisma.purchaseOrder.findFirst({ where: { tenantId: tenant.id, number: 'PO-2026-0001' } });
    if (!poExists) {
      const poItems = [
        { itemName: 'Cotton 100% — Grey Fabric', quantity: 5000, rate: 185, unit: Unit.METERS, gstPercent: 5 },
        { itemName: 'Navy Dye — Poly/Cotton 60/40', quantity: 2500, rate: 220, unit: Unit.METERS, gstPercent: 5 },
      ];
      const subTotal = poItems.reduce((sum, i) => sum + i.quantity * i.rate, 0);
      const taxAmount = poItems.reduce((sum, i) => sum + i.quantity * i.rate * (i.gstPercent / 100), 0);
      await prisma.purchaseOrder.create({
        data: {
          tenantId: tenant.id, number: 'PO-2026-0001', supplierId: sup1.id, requisitionId: pr1.id,
          poDate: new Date(Date.now() - 2 * 86400000), deliveryDate: new Date(Date.now() + 7 * 86400000),
          currency: 'INR', paymentTerms: '30 days from invoice', deliveryTerms: 'Ex-works, buyer arranges transport',
          taxPercent: 5, discountPercent: 0, subTotal, taxAmount, totalAmount: subTotal + taxAmount,
          status: PurchaseOrderStatus.DRAFT, createdBy: requester?.id ?? null,
          items: {
            create: poItems.map((i) => ({
              tenantId: tenant.id, ...i, amount: i.quantity * i.rate, gstAmount: i.quantity * i.rate * (i.gstPercent / 100),
            })),
          },
        },
      });
      console.log('✔ PO-2026-0001 (DRAFT)');
    }
  }

  // Keep the numbering counters ahead of seeded document numbers.
  const year = new Date().getFullYear();
  await ensureSequence(tenant.id, 'PR', year, 2);
  await ensureSequence(tenant.id, 'PO', year, 1);
  await ensureSequence(tenant.id, 'GRN', year, 0);
  await ensureSequence(tenant.id, 'INSP', year, 0);
  await ensureSequence(tenant.id, 'WR', year, 0);
  await ensureSequence(tenant.id, 'R', year, 0); // fabric rolls
  await ensureSequence(tenant.id, 'MK', year, 0); // markers
  await ensureSequence(tenant.id, 'CO', year, 0); // cut orders
  await ensureSequence(tenant.id, 'LP', year, 0); // lay plans
  await ensureSequence(tenant.id, 'CT', year, 0); // cut operations
  console.log('✔ document sequences synced');

  console.log('\n✔ Seed complete.');
  console.log('  Platform admin: admin@fabriq.local / Admin@123');
  console.log('  Tenant admin:   owner@acme.test / Demo@123');
  console.log('  Manager:        manager@acme.test / Demo@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
