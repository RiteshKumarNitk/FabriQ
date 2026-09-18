'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Construction, Package, Lock, Settings2, Workflow, ArrowLeft, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { titleCase } from '@/lib/utils';

const SECTIONS: Record<string, { title: string; icon: React.ElementType; blurb: string }> = {
  subscriptions: {
    title: 'Subscription Plans',
    icon: Package,
    blurb: 'Plan catalog, pricing tiers and per-tenant subscriptions. Ships with the billing module.',
  },
  licenses: {
    title: 'Licenses',
    icon: Lock,
    blurb: 'Seat licensing, usage and entitlement management across tenants. Ships with the billing module.',
  },
  settings: {
    title: 'Platform Settings',
    icon: Settings2,
    blurb: 'Global platform-level configuration, defaults and branding.',
  },
  config: {
    title: 'System Configuration',
    icon: Workflow,
    blurb: 'System-wide operational configuration, feature flags and integrations.',
  },
};

export default function PlatformSectionPage() {
  const params = useParams<{ section: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();

  const valid = Boolean(SECTIONS[params.section]);

  useEffect(() => {
    if (!loading && (!user?.isPlatformAdmin || !valid)) {
      router.replace('/dashboard');
    }
  }, [loading, user, router, valid]);

  if (loading || !user?.isPlatformAdmin || !valid) {
    return null;
  }

  const section = SECTIONS[params.section];
  const Icon = section.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <p className="text-sm text-muted-foreground">Platform administration · {titleCase(params.section)}</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Icon className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">Post-V1</h3>
          <p className="max-w-sm text-sm text-muted-foreground">{section.blurb}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground/70">
            <Construction className="h-3.5 w-3.5" />
            This section is reserved in navigation so the module can drop in without restructuring the sidebar.
          </div>
          <Link href="/dashboard" className="mt-2 inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <LayoutDashboard className="h-4 w-4" /> Back to Platform Overview
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
