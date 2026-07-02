import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

const celestial = document.querySelector<HTMLElement>('.celestial');

/**
 * Puntos del arco sol→luna, calculados en px desde el viewport (nunca hardcodeados)
 * para que el recorrido escale y se recalcule en resize. Centros del astro; el
 * centrado real lo hace MotionPath con alignOrigin. Concepto: empieza arriba a la
 * izquierda (tarde, sol alto), sube al pico y desciende al otro lado (noche).
 */
function arcPoints() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return [
    { x: w * 0.14, y: h * 0.18 },
    { x: w * 0.5, y: h * 0.07 },
    { x: w * 0.88, y: h * 0.7 },
  ];
}

/** Lee el valor final del contador desde el DOM (data-* o textContent). */
function counterTarget(el: HTMLElement): number {
  return Math.round(Number(el.dataset.countTo ?? el.textContent ?? '0'));
}

/** Estados finales del marcador (rama reduce / sin tween). */
function setCounterFinal() {
  const filled = document.getElementById('filledNum');
  const bar = document.getElementById('barFill');
  if (filled) filled.textContent = String(counterTarget(filled));
  if (bar) bar.style.width = bar.style.getPropertyValue('--target') || '0%';
}

/** Count-up del marcador + llenado de barra, disparado al entrar en viewport. */
function setupCounter() {
  const board = document.getElementById('board');
  const filled = document.getElementById('filledNum');
  const bar = document.getElementById('barFill');
  if (!board || !filled || !bar) return;

  filled.textContent = '0';
  let done = false;

  const run = () => {
    if (done) return;
    done = true;
    // Lee el objetivo AHORA: Supabase ya habrá fijado data-count-to / --target si respondió.
    const target = counterTarget(filled);
    const pct = bar.style.getPropertyValue('--target') || '0%';
    const counter = { v: 0 };
    gsap.to(counter, {
      v: target,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: () => {
        filled.textContent = String(Math.round(counter.v));
      },
    });
    gsap.to(bar, { width: pct, duration: 1.4, ease: 'power2.out' });
  };

  ScrollTrigger.create({
    trigger: board,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      // Coordinación con Supabase: anima hasta el valor real cuando esté listo.
      if ((window as unknown as { __statsReady?: boolean }).__statsReady) {
        run();
        return;
      }
      document.addEventListener('stats:ready', run, { once: true });
      // Fallback: si Supabase no responde, anima igualmente con el default tras un margen.
      window.setTimeout(run, 1500);
    },
  });
}

/** Pieza 3 — entrada orquestada del hero al cargar. */
function heroIntro() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.fromTo('.hero .eyebrow', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 })
    .fromTo('.hero .word', { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.75 }, '-=0.15')
    .fromTo('.hero .iv', { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.75 }, '-=0.5')
    .fromTo('.hero .lede', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
    .fromTo('.hero .board', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
    .fromTo('.hero .rack', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.7 }, '-=0.55');
}

const mm = gsap.matchMedia();

mm.add(
  {
    reduce: '(prefers-reduced-motion: reduce)',
    full: '(prefers-reduced-motion: no-preference)',
  },
  (context) => {
    // ---- Rama reduce: estados finales, sin ningún ScrollTrigger ----
    if (context.conditions?.reduce) {
      gsap.set('.reveal', { opacity: 1, y: 0 });
      gsap.set('.hero-anim', { opacity: 1, y: 0 });
      gsap.set('.sun', { opacity: 1 });
      gsap.set('.moon', { opacity: 0 });
      gsap.set('.tint-night', { opacity: 0 });
      if (celestial) {
        gsap.set(celestial, {
          xPercent: -50,
          yPercent: -50,
          x: window.innerWidth * 0.2,
          y: window.innerHeight * 0.14,
        });
      }
      setCounterFinal();
      return;
    }

    // ---- Rama no-preference ----

    // Pieza 1 — sol → luna, ligado al scroll de toda la página
    let sky: gsap.core.Timeline | null = null;
    const buildSky = () => {
      if (!celestial) return;
      if (sky) {
        sky.scrollTrigger?.kill();
        sky.kill();
        sky = null;
      }
      sky = gsap.timeline({
        scrollTrigger: {
          trigger: document.body,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.5,
        },
      });
      sky
        .to(
          celestial,
          {
            motionPath: { path: arcPoints(), curviness: 1.25, alignOrigin: [0.5, 0.5] },
            ease: 'none',
            duration: 1,
          },
          0
        )
        .to('.sun', { opacity: 0, ease: 'none', duration: 0.25 }, 0.4)
        .to('.moon', { opacity: 1, ease: 'none', duration: 0.25 }, 0.4)
        .to('.tint-night', { opacity: 1, ease: 'none', duration: 1 }, 0);
    };
    buildSky();

    // Recalcular el arco en resize (puntos dependen de innerWidth/innerHeight)
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        buildSky();
        ScrollTrigger.refresh();
      });
    };
    window.addEventListener('resize', onResize);

    // Pieza 2a — reveals con stagger, una sola vez
    ScrollTrigger.batch('.reveal', {
      start: 'top 88%',
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: 'power2.out',
          overwrite: true,
        }),
      once: true,
    });

    // Pieza 2b — count-up del marcador + barra
    setupCounter();

    // Pieza 3 — entrada del hero
    heroIntro();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }
);

// Las fuentes Anton cambian el layout al cargar y desplazarían los start/end.
if (document.fonts?.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}
window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
