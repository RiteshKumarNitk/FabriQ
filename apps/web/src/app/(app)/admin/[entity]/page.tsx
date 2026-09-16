import { notFound } from 'next/navigation';
import { ENTITY_INDEX } from '@/lib/entities';
import { EntityListPage } from '@/components/entity/entity-list-page';

// This is tenant-scoped, permission-gated admin data — never statically
// optimized. An empty generateStaticParams() previously made Next.js build
// this route with no server-rendered fallback, so any real entity value
// 500'd in production (next dev never exercises static optimization, which
// is why this only showed up on Vercel).
export const dynamic = 'force-dynamic';

export default function EntityListRoute({
  params,
  searchParams,
}: {
  params: { entity: string };
  searchParams: { edit?: string };
}) {
  const config = ENTITY_INDEX[params.entity];
  if (!config) notFound();
  // Icons are functions and cannot cross the server→client boundary.
  const { icon: _icon, ...safeConfig } = config;
  return <EntityListPage config={safeConfig} editId={searchParams.edit} />;
}
