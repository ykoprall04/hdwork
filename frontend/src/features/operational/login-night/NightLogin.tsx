import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NightVideo from './NightVideo';
import './night-login.css';

export default function NightLogin({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <div className="night-login">
    <NightVideo />
    <header className="night-nav">
      <ThemeToggle compact />
    </header>
    <main className="night-entrance">
      <h1>HD Work <span>2.0</span></h1>
      <button type="button" className="night-enter" onClick={() => dialog.current?.showModal()}>
        Masuk Workspace <ArrowRight size={17} aria-hidden="true" />
      </button>
    </main>
    <footer className="night-footer">
      <Link to="/preview/login">Buka lingkungan DEMO <ArrowRight size={14} aria-hidden="true" /></Link>
    </footer>
    <dialog ref={dialog} className="night-dialog" aria-label="Masuk ke HD Work 2.0">
      <button type="button" className="night-close" aria-label="Tutup formulir login" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
      {children}
    </dialog>
  </div>;
}
