import { useEffect, useRef, useState } from 'react';
import videoUrl from './HDWork-night-loop.mp4';
import posterUrl from './night-poster.webp';

function Playback() {
  const player = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = player.current;
    if (!video) return;

    let failed = false;
    let attempt = 0;

    function showPoster() {
      if (!video || failed) return;
      failed = true;
      attempt++;
      setPlaying(false);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    function syncPlayback() {
      if (!video || failed) return;
      const current = ++attempt;
      if (document.hidden) {
        video.autoplay = false;
        video.pause();
        return;
      }
      video.autoplay = true;
      if (!video.hasAttribute('src')) video.src = videoUrl;
      void video.play().catch(() => {
        if (current === attempt && !document.hidden) showPoster();
      });
    }

    video.addEventListener('error', showPoster);
    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();
    return () => {
      attempt++;
      video.removeEventListener('error', showPoster);
      document.removeEventListener('visibilitychange', syncPlayback);
      video.autoplay = false;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  return <video ref={player} autoPlay muted loop playsInline preload="none"
    data-playing={playing} className="night-video" onPlaying={() => setPlaying(true)} />;
}

export default function NightVideo() {
  const [reduceMotion, setReduceMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(preference.matches);
    preference.addEventListener('change', sync);
    sync();
    return () => preference.removeEventListener('change', sync);
  }, []);

  return <div className="night-background" aria-hidden="true">
    <img className="night-poster" src={posterUrl} alt="" />
    {!reduceMotion && <Playback />}
  </div>;
}
