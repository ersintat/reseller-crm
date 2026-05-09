import { PageHeader } from '../components/ui/Primitives';

export function PageShell({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}
