import { UsersPanel } from '@/components/UsersPanel';
import { LayoutPanel } from '@/components/LayoutPanel';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';
import { AppearancePanel } from '@/components/AppearancePanel';
import { PageHeader } from '@/components/data/PageHeader';

/**
 * No back link and no breadcrumb: the shell's sidebar is the way back, and it is
 * on screen the whole time.
 *
 * Two columns because the topics are independent, not because the viewport is
 * wide — the grid collapses to one below lg.
 */
export default function ConfigPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Configuração"
        description="Conecte os módulos que você usa, gerencie quem entra e ajuste a disposição dos painéis."
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <IntegrationsPanel />
        </div>
        <div className="flex flex-col gap-4">
          <UsersPanel />
          <AppearancePanel />
          <LayoutPanel />
        </div>
      </div>
    </div>
  );
}
