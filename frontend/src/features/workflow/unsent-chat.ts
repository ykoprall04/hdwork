import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const leaveEvent = 'hdwork2:leave-chat';
export function confirmChatNavigation() {
  return window.dispatchEvent(new Event(leaveEvent, { cancelable: true }));
}

export function useUnsentChatWarning(text: string, sending: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const current = useRef({ text, sending, url: location.pathname + location.search + location.hash });
  useEffect(() => { current.current = { text, sending, url: location.pathname + location.search + location.hash }; }, [text, sending, location]);
  useEffect(() => {
    const warn = () => (!current.current.text.trim() && !current.current.sending) || window.confirm(current.current.sending
      ? 'Pesan masih diproses. Status pengiriman belum pasti; draft tersimpan dan tidak dikirim ulang otomatis. Tetap pindah?'
      : 'Ada draft chat yang belum dikirim. Draft tetap tersimpan untuk order ini. Tetap pindah?');
    const leave = (event: Event) => { if (!warn()) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current.text.trim() || current.current.sending) { event.preventDefault(); event.returnValue = ''; }
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      if (!warn()) { event.preventDefault(); event.stopPropagation(); }
    };
    const back = () => { if (!warn()) navigate(current.current.url, { replace: true }); };
    window.addEventListener(leaveEvent, leave);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('popstate', back);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener(leaveEvent, leave);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('popstate', back);
      document.removeEventListener('click', click, true);
    };
  }, [navigate]);
}
