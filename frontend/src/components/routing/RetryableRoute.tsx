import { Component, lazy, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
class RouteBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-xl border bg-card p-6 text-card-foreground"><h1 className="text-xl font-semibold">Halaman gagal dimuat</h1><p className="text-sm text-muted-foreground">Periksa koneksi lalu coba lagi. Jika versi aplikasi berubah, muat ulang halaman ini.</p><div className="flex flex-wrap gap-3"><button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={this.props.retry}>Coba lagi</button><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => window.location.reload()}>Muat ulang halaman</button></div></div>;
  }
}
type Loader = () => Promise<{ default: ComponentType }>;
const initialPages = new WeakMap<Loader, LazyExoticComponent<ComponentType>>();
function initialRoute(load: Loader) {
  let Page = initialPages.get(load);
  if (!Page) { Page = lazy(load); initialPages.set(load, Page); }
  return { Page, attempt: 0 };
}
function createRoute(load: Loader, attempt: number) { return { Page: lazy(load), attempt }; }
export default function RetryableRoute({ load }: { load: Loader }) {
  const [route, setRoute] = useState(() => initialRoute(load));
  // A rejected lazy type must be replaced explicitly, never during a normal render.
  const Page = route.Page;
  return <RouteBoundary key={route.attempt} retry={() => setRoute(previous => createRoute(load, previous.attempt + 1))}><Page /></RouteBoundary>;
}
