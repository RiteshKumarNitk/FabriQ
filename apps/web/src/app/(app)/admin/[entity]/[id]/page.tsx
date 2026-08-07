import { notFound } from 'next/navigation';
import { ENTITY_INDEX } from '@/lib/entities';
import { EntityDetailPage } from '@/components/entity/entity-detail-page';

export default function EntityDetailRoute({
  params,
}: {
  params: { entity: string; id: string };
}) {
  const config = ENTITY_INDEX[params.entity];
  if (!config) notFound();
  // Icons are functions and cannot cross the server→client boundary.
  const { icon: _icon, ...safeConfig } = config;
  return <EntityDetailPage config={safeConfig} id={params.id} />;
}
