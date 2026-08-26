import Link from 'next/link';
import { UsersPanel } from '@/components/UsersPanel';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';

export default function ConfigPage() {
  return (
    <main className="shell">
      <header className="now">
        <div className="now-main">
          <h1 className="eyebrow">Configuração</h1>
        </div>
        <div className="now-aside">
          <Link className="btn" href="/">
            Voltar ao painel
          </Link>
        </div>
      </header>

      <div className="columns">
        <div className="col">
          <IntegrationsPanel />
        </div>
        <div className="col">
          <UsersPanel />
        </div>
      </div>
    </main>
  );
}
