import { notFound } from 'next/navigation';
import { ENTITY_INDEX } from '@/lib/entities';
import { EntityListPage } from '@/components/entity/entity-list-page';

export function generateStaticParams() {
  return [];
}

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
