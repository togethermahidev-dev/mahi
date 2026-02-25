'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { TextPlugin } from 'gsap/TextPlugin';

gsap.registerPlugin(ScrollTrigger, TextPlugin);

// ─── Colours ────────────────────────────────────────────────────────────────
const C = {
  offblack: '#1A1A17',
  offwhite: '#E8E8E3',
  bgdark: '#1C1C19',
  green: '#5DB075',
  amber: '#D4963A',
  dim: 'rgba(232,232,227,0.45)',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function useLenis() {
  useEffect(() => {
    let lenis: any;
    import('lenis').then(({ default: Lenis }) => {
      lenis = new Lenis({ lerp: 0.08, smoothWheel: true, syncTouch: false });
      const raf = (time: number) => {
        lenis.raf(time);
        ScrollTrigger.update();
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    });
    return () => lenis?.destroy();
  }, []);
}

// ─── Custom cursor ───────────────────────────────────────────────────────────
function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pos = { x: 0, y: 0 };
    const ring_pos = { x: 0, y: 0 };

    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      gsap.set(dot.current, { x: pos.x, y: pos.y });
    };

    const animate = () => {
      ring_pos.x += (pos.x - ring_pos.x) * 0.12;
      ring_pos.y += (pos.y - ring_pos.y) * 0.12;
      gsap.set(ring.current, { x: ring_pos.x, y: ring_pos.y });
      requestAnimationFrame(animate);
    };

    const onEnter = () => ring.current?.classList.add('hovering');
    const onLeave = () => ring.current?.classList.remove('hovering');

    document.addEventListener('mousemove', onMove);
    document.querySelectorAll('a, button, [data-hover]').forEach(el => {
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    });
    requestAnimationFrame(animate);

    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <>
      <div ref={dot} className="cursor" />
      <div ref={ring} className="cursor-follower" />
    </>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  const navRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      ref={navRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 40px',
        transition: 'background 0.4s ease, backdrop-filter 0.4s ease',
        background: scrolled ? 'rgba(28,28,25,0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(24px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(232,232,227,0.06)' : '1px solid transparent',
      }}
    >
      <span style={{
        fontFamily: 'Josefin Sans',
        fontWeight: 700,
        fontSize: 22,
        letterSpacing: 8,
        color: C.offwhite,
      }}>MAHI</span>

      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        {['Features', 'How it works', 'Community'].map(item => (
          <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`}
            style={{
              color: C.dim,
              fontFamily: 'Josefin Sans',
              fontSize: 13,
              letterSpacing: 2,
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.offwhite)}
            onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
          >
            {item.toUpperCase()}
          </a>
        ))}
        <button style={{
          background: C.offwhite,
          color: C.offblack,
          border: 'none',
          borderRadius: 50,
          padding: '12px 28px',
          fontFamily: 'Josefin Sans',
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: 1.5,
          cursor: 'pointer',
          transition: 'opacity 0.2s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          GET EARLY ACCESS
        </button>
      </div>
    </nav>
  );
}

// ─── Phone mockup ────────────────────────────────────────────────────────────
function PhoneMockup({ screen }: { screen: 'welcome' | 'camera' | 'otp' }) {
  return (
    <div className="phone-bezel" style={{ width: 280, height: 580, position: 'relative' }}>
      {/* Notch */}
      <div style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        width: 90, height: 28, background: '#111', borderRadius: 20, zIndex: 10,
      }} />

      {/* Screen content */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 50,
        overflow: 'hidden', background: '#111',
      }}>
        {screen === 'welcome' && <WelcomeScreenMock />}
        {screen === 'camera' && <CameraScreenMock />}
        {screen === 'otp' && <OtpScreenMock />}
      </div>
    </div>
  );
}

function WelcomeScreenMock() {
  return (
    <div style={{ height: '100%', background: '#111', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 1, background: '#1C1C19', borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 40, letterSpacing: 10, color: C.offwhite, marginBottom: 8 }}>MAHI</div>
        <div style={{ fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 11, color: C.dim, textAlign: 'center' }}>The fitness accountability app</div>
        <div style={{
          marginTop: 40, width: '72%', padding: '14px 0', borderRadius: 50,
          background: C.offwhite, textAlign: 'center',
          fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 12, color: '#111',
        }}>Create an account</div>
      </div>
      <div style={{ height: 40 }} />
      <div style={{
        flex: 1, background: '#1C1C19', borderTopLeftRadius: 32, borderTopRightRadius: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: '72%', padding: '14px 0', borderRadius: 50,
          border: `1.5px solid ${C.offwhite}`, textAlign: 'center',
          fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 12, color: C.offwhite,
        }}>Login</div>
      </div>
    </div>
  );
}

function CameraScreenMock() {
  const [time, setTime] = useState('00:00');
  useEffect(() => {
    let secs = 0;
    const t = setInterval(() => {
      secs++;
      const m = String(Math.floor(secs / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      setTime(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ height: '100%', position: 'relative', background: '#0a0a0a' }}>
      {/* Fake camera grid */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.15 }}>
        {[...Array(9)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${(i % 3) * 33.3}%`, top: `${Math.floor(i / 3) * 33.3}%`,
            width: '33.3%', height: '33.3%',
            border: '0.5px solid rgba(255,255,255,0.3)',
          }} />
        ))}
      </div>
      {/* Viewfinder corners */}
      {[
        { top: '20%', left: '10%', borderTop: '2px solid #fff', borderLeft: '2px solid #fff' },
        { top: '20%', right: '10%', borderTop: '2px solid #fff', borderRight: '2px solid #fff' },
        { bottom: '20%', left: '10%', borderBottom: '2px solid #fff', borderLeft: '2px solid #fff' },
        { bottom: '20%', right: '10%', borderBottom: '2px solid #fff', borderRight: '2px solid #fff' },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 18, height: 18, ...s as any }} />
      ))}
      {/* Timer */}
      <div style={{
        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 24, color: '#fff',
        letterSpacing: 4,
      }}>{time}</div>
      {/* Recording dot */}
      <div style={{
        position: 'absolute', top: 65, right: 24,
        width: 8, height: 8, borderRadius: '50%', background: '#FF3B30',
        animation: 'pulse 1s ease-in-out infinite',
        boxShadow: '0 0 8px #FF3B30',
      }} />
      {/* Shutter */}
      <div style={{
        position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
        width: 56, height: 56, borderRadius: '50%',
        border: '3px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff' }} />
      </div>
    </div>
  );
}

function OtpScreenMock() {
  return (
    <div style={{
      height: '100%', background: '#1C1C19', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16,
    }}>
      <div style={{ fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 18, color: C.offwhite, letterSpacing: 2 }}>VERIFY EMAIL</div>
      <div style={{ fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 10, color: C.dim, textAlign: 'center' }}>
        We sent a 6-digit code to your email
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {['3', '7', '4', '', '', ''].map((d, i) => (
          <div key={i} style={{
            width: 32, height: 40, borderRadius: 8,
            background: d ? 'rgba(93,176,117,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${d ? C.green : 'rgba(255,255,255,0.1)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 16, color: C.offwhite,
          }}>{d}</div>
        ))}
      </div>
      <div style={{
        marginTop: 16, width: '80%', padding: '12px 0', borderRadius: 50,
        background: C.green, textAlign: 'center',
        fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 11, color: '#fff',
      }}>CONTINUE</div>
    </div>
  );
}

// ─── Marquee strip ────────────────────────────────────────────────────────────
function Marquee() {
  const items = [
    'ACCOUNTABILITY', 'STRENGTH', 'CARDIO', 'SQUAD GOALS', 'PROOF OF WORK',
    'CONSISTENCY', 'LIVE CAMERA', 'REAL RESULTS', 'TOGETHER', 'MAHI',
  ];
  const doubled = [...items, ...items];
  return (
    <div style={{
      overflow: 'hidden',
      padding: '20px 0',
      borderTop: '1px solid rgba(232,232,227,0.06)',
      borderBottom: '1px solid rgba(232,232,227,0.06)',
    }}>
      <div className="marquee-track" style={{ display: 'flex', gap: 60, whiteSpace: 'nowrap' }}>
        {doubled.map((item, i) => (
          <span key={i} style={{
            fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 12,
            letterSpacing: 4, color: i % 2 === 0 ? C.offwhite : C.dim,
            display: 'flex', alignItems: 'center', gap: 60,
          }}>
            {item}
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.green, display: 'inline-block', marginLeft: -44 }} />
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Stats ───────────────────────────────────────────────────────────────────
function StatItem({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: () => {
        gsap.to({ val: 0 }, {
          val: value,
          duration: 2.2,
          ease: 'power3.out',
          onUpdate: function () {
            if (el) el.textContent = Math.round(this.targets()[0].val).toLocaleString() + suffix;
          },
        });
      },
    });
    return () => trigger.kill();
  }, [value, suffix]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 56, color: C.offwhite, lineHeight: 1,
      }}>
        <span ref={ref}>0{suffix}</span>
      </div>
      <div style={{
        fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 13,
        color: C.dim, marginTop: 8, letterSpacing: 1,
      }}>{label}</div>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay = 0 }: {
  icon: string; title: string; desc: string; delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 50 });
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay }),
    });
    return () => trigger.kill();
  }, [delay]);

  return (
    <div ref={ref} style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(232,232,227,0.07)',
      borderRadius: 24,
      padding: '36px 32px',
      backdropFilter: 'blur(12px)',
      transition: 'border-color 0.3s, background 0.3s',
      cursor: 'default',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(93,176,117,0.25)';
        (e.currentTarget as HTMLElement).style.background = 'rgba(93,176,117,0.04)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(232,232,227,0.07)';
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)';
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 20 }}>{icon}</div>
      <div style={{
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 18,
        color: C.offwhite, letterSpacing: 1, marginBottom: 12,
      }}>{title}</div>
      <div style={{
        fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 13,
        color: C.dim, lineHeight: 1.8,
      }}>{desc}</div>
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function StepCard({ number, title, desc }: { number: string; title: string; desc: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, x: -40 });
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out' }),
    });
    return () => trigger.kill();
  }, []);

  return (
    <div ref={ref} style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
      <div style={{
        minWidth: 56, height: 56, borderRadius: '50%',
        border: `1.5px solid ${C.green}`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 18, color: C.green,
      }}>{number}</div>
      <div>
        <div style={{
          fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 20,
          color: C.offwhite, letterSpacing: 0.5, marginBottom: 8,
        }}>{title}</div>
        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 13,
          color: C.dim, lineHeight: 1.8,
        }}>{desc}</div>
      </div>
    </div>
  );
}

// ─── Horizontal scroll reel ──────────────────────────────────────────────────
function HorizontalReel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const wrap = wrapRef.current;
    if (!track || !wrap) return;

    const totalWidth = track.scrollWidth - wrap.offsetWidth;

    const tween = gsap.to(track, {
      x: -totalWidth,
      ease: 'none',
      scrollTrigger: {
        trigger: wrap,
        start: 'top top',
        end: () => `+=${totalWidth + window.innerHeight}`,
        scrub: 1.4,
        pin: true,
        anticipatePin: 1,
      },
    });

    return () => tween.scrollTrigger?.kill();
  }, []);

  const cards = [
    { emoji: '📸', title: 'SNAP YOUR SET', sub: 'Camera proves you showed up' },
    { emoji: '🔥', title: 'STREAK ALIVE', sub: 'Miss a day, lose the streak' },
    { emoji: '👥', title: 'SQUAD WATCHES', sub: 'Live accountability feed' },
    { emoji: '📊', title: 'TRACK GAINS', sub: 'Progress you can see' },
    { emoji: '🏆', title: 'EARN BADGES', sub: 'Real milestones, real flex' },
    { emoji: '⚡', title: 'INSTANT PROOF', sub: 'No excuses, only evidence' },
  ];

  return (
    <div ref={wrapRef} style={{ overflow: 'hidden', width: '100%' }}>
      <div ref={trackRef} style={{ display: 'flex', gap: 24, padding: '100px 80px', width: 'max-content' }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            width: 320, height: 400, borderRadius: 28,
            background: i % 2 === 0
              ? 'linear-gradient(145deg, rgba(93,176,117,0.12) 0%, rgba(28,28,25,0.8) 100%)'
              : 'linear-gradient(145deg, rgba(212,150,58,0.1) 0%, rgba(28,28,25,0.8) 100%)',
            border: '1px solid rgba(232,232,227,0.08)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, flexShrink: 0,
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ fontSize: 64 }}>{c.emoji}</div>
            <div style={{
              fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 22,
              letterSpacing: 3, color: C.offwhite,
            }}>{c.title}</div>
            <div style={{
              fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 13,
              color: C.dim,
            }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Parallax hero text ───────────────────────────────────────────────────────
function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const hero = heroRef.current;
    const title = titleRef.current;
    const sub = subRef.current;
    const phone = phoneRef.current;
    const glow = glowRef.current;
    if (!hero || !title || !sub || !phone || !glow) return;

    // Entrance animation
    const tl = gsap.timeline({ delay: 0.2 });
    tl.from(title.querySelectorAll('.char-row'), {
      y: 120, opacity: 0, stagger: 0.12, duration: 1.0, ease: 'power4.out',
    })
      .from(sub, { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=0.4')
      .from('.hero-cta', { y: 20, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.1 }, '-=0.3')
      .from(phone, { y: 60, opacity: 0, duration: 1.0, ease: 'power4.out' }, '-=0.8')
      .from(glow, { opacity: 0, scale: 0.6, duration: 1.5, ease: 'power3.out' }, '-=1.4');

    // Parallax on scroll
    gsap.to(title, {
      y: -80,
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1.5 },
    });
    gsap.to(phone, {
      y: -40,
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1 },
    });
    gsap.to(glow, {
      y: 60,
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 2 },
    });
  }, [mounted]);

  return (
    <section ref={heroRef} style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', position: 'relative', overflow: 'hidden',
      padding: '120px 80px 60px',
    }}>
      {/* Background glow orbs */}
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div className="glow-orb" style={{
          position: 'absolute', top: '10%', left: '5%',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(93,176,117,0.12) 0%, transparent 70%)',
        }} />
        <div className="glow-orb" style={{
          position: 'absolute', bottom: '0%', right: '-10%',
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(212,150,58,0.08) 0%, transparent 70%)',
        }} />
      </div>

      {/* Left text */}
      <div style={{ flex: 1, maxWidth: 660, zIndex: 1 }}>
        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
          letterSpacing: 4, color: C.green, marginBottom: 28, display: 'flex',
          alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 32, height: 1, background: C.green, display: 'inline-block' }} />
          FITNESS ACCOUNTABILITY
        </div>

        <div ref={titleRef} style={{ overflow: 'hidden' }}>
          {['YOUR', 'CAMERA.', 'YOUR PROOF.'].map((line, i) => (
            <div key={i} className="char-row" style={{
              fontFamily: 'Josefin Sans', fontWeight: 700,
              fontSize: 'clamp(52px, 8vw, 96px)',
              lineHeight: 1.0, letterSpacing: -1,
              display: 'block',
              ...(i === 1
                ? { WebkitTextStroke: `1px ${C.offwhite}`, color: 'transparent' }
                : { color: C.offwhite }),
            }}>{line}</div>
          ))}
        </div>

        <p ref={subRef} style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 16,
          color: C.dim, lineHeight: 1.9, marginTop: 32, maxWidth: 480,
        }}>
          Turn every workout into undeniable evidence. Shared live with your squad.
          No excuses. Only proof.
        </p>

        <div style={{ display: 'flex', gap: 16, marginTop: 48, flexWrap: 'wrap' }}>
          <button className="hero-cta" style={{
            background: C.offwhite, color: C.offblack, border: 'none',
            borderRadius: 50, padding: '18px 40px',
            fontFamily: 'Josefin Sans', fontWeight: 700,
            fontSize: 14, letterSpacing: 2, cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(232,232,227,0.15)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            GET EARLY ACCESS
          </button>
          <button className="hero-cta" style={{
            background: 'transparent', color: C.offwhite,
            border: `1.5px solid rgba(232,232,227,0.2)`,
            borderRadius: 50, padding: '18px 40px',
            fontFamily: 'Josefin Sans', fontWeight: 600,
            fontSize: 14, letterSpacing: 2, cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = C.offwhite}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(232,232,227,0.2)'}
          >
            WATCH DEMO
          </button>
        </div>
      </div>

      {/* Right — phone */}
      <div ref={phoneRef} style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 1, paddingLeft: 40,
      }}>
        <div style={{ position: 'relative' }}>
          {/* Ambient ring */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 360, height: 660,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(93,176,117,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <PhoneMockup screen="camera" />
        </div>
      </div>
    </section>
  );
}

// ─── Features section ─────────────────────────────────────────────────────────
function FeaturesSection() {
  const ref = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 40 });
    const trigger = ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }),
    });
    return () => trigger.kill();
  }, []);

  return (
    <section id="features" ref={ref} style={{ padding: '140px 80px', position: 'relative' }}>
      <div className="glow-orb" style={{
        position: 'absolute', top: '20%', right: '-5%', width: 400, height: 400, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(212,150,58,0.07) 0%, transparent 70%)',
      }} />

      <div ref={headRef} style={{ textAlign: 'center', marginBottom: 80 }}>
        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
          letterSpacing: 4, color: C.green, marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <span style={{ width: 24, height: 1, background: C.green, display: 'inline-block' }} />
          WHAT MAHI DOES
          <span style={{ width: 24, height: 1, background: C.green, display: 'inline-block' }} />
        </div>
        <h2 style={{
          fontFamily: 'Josefin Sans', fontWeight: 700,
          fontSize: 'clamp(36px, 5vw, 64px)', color: C.offwhite,
          letterSpacing: -1, lineHeight: 1.1,
        }}>
          BUILT FOR THE<br />
          <span style={{ WebkitTextStroke: `1px ${C.offwhite}`, color: 'transparent' }}>
            SERIOUS ONES
          </span>
        </h2>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 24, maxWidth: 1200, margin: '0 auto',
      }}>
        <FeatureCard icon="📸" delay={0}
          title="LIVE CAMERA SESSIONS"
          desc="Start a workout and your camera goes live. Real-time proof that you're actually there, actually doing the work." />
        <FeatureCard icon="🔗" delay={0.1}
          title="SQUAD ACCOUNTABILITY"
          desc="Invite your crew. They see when you skip. Social pressure is the most powerful gym partner you'll ever have." />
        <FeatureCard icon="⚡" delay={0.2}
          title="INSTANT VERIFICATION"
          desc="OTP-secured sessions mean every workout is verified to you. Your proof, cryptographically yours." />
        <FeatureCard icon="🎯" delay={0.3}
          title="GOAL TRACKING"
          desc="Set your goals on signup — lose weight, build muscle, endurance — and every session maps back to them." />
        <FeatureCard icon="📅" delay={0.4}
          title="FLEXIBLE SCHEDULES"
          desc="Choose your days. Monday warrior or weekend warrior — your schedule, your rules, zero judgment." />
        <FeatureCard icon="🏅" delay={0.5}
          title="STREAK SYSTEM"
          desc="Consecutive sessions build streaks. Break it and start over. Simple, brutal, effective." />
      </div>
    </section>
  );
}

// ─── Stats section ────────────────────────────────────────────────────────────
function StatsSection() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section ref={ref} style={{ padding: '100px 80px', position: 'relative' }}>
      <div style={{
        maxWidth: 1000, margin: '0 auto',
        background: 'linear-gradient(145deg, rgba(93,176,117,0.06) 0%, rgba(28,28,25,0.4) 100%)',
        border: '1px solid rgba(93,176,117,0.12)',
        borderRadius: 40, padding: '80px 60px',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 60,
      }}>
        <StatItem value={10000} suffix="+" label="Users in waitlist" />
        <StatItem value={98} suffix="%" label="Streak completion rate" />
        <StatItem value={3} suffix="x" label="More consistent than solo" />
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 40 });
    const trigger = ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }),
    });
    return () => trigger.kill();
  }, []);

  return (
    <section id="how-it-works" style={{ padding: '140px 80px', position: 'relative' }}>
      <div className="glow-orb" style={{
        position: 'absolute', bottom: '10%', left: '-5%', width: 500, height: 500, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(93,176,117,0.07) 0%, transparent 70%)',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 100, alignItems: 'center' }}>
        {/* Left */}
        <div>
          <div ref={headRef}>
            <div style={{
              fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
              letterSpacing: 4, color: C.green, marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ width: 24, height: 1, background: C.green, display: 'inline-block' }} />
              HOW IT WORKS
            </div>
            <h2 style={{
              fontFamily: 'Josefin Sans', fontWeight: 700,
              fontSize: 'clamp(36px, 4vw, 56px)', color: C.offwhite,
              letterSpacing: -0.5, lineHeight: 1.1, marginBottom: 60,
            }}>
              FOUR STEPS<br />TO UNSTOPPABLE
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            <StepCard number="01"
              title="Create your account"
              desc="Sign up with email. Verify with OTP. Set your fitness goals and your days." />
            <StepCard number="02"
              title="Invite your squad"
              desc="Add your gym partner, your partner, your crew. They'll see when you train — or when you don't." />
            <StepCard number="03"
              title="Start a camera session"
              desc="Tap record. Mahi activates the camera. Your live session is logged as proof." />
            <StepCard number="04"
              title="Build your streak"
              desc="Every consecutive day builds your streak. Your squad watches it grow. No one wants to be the one who breaks it." />
          </div>
        </div>

        {/* Right — phone stack */}
        <div style={{ display: 'flex', gap: -40, justifyContent: 'center', position: 'relative', height: 640 }}>
          <div style={{ position: 'absolute', left: '5%', top: 40, transform: 'rotate(-6deg)', zIndex: 1 }}>
            <PhoneMockup screen="welcome" />
          </div>
          <div style={{ position: 'absolute', right: '5%', top: 0, transform: 'rotate(6deg)', zIndex: 0 }}>
            <PhoneMockup screen="otp" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Community / social proof ─────────────────────────────────────────────────
function CommunitySection() {
  const quotes = [
    { text: 'I haven\'t missed a Monday in 3 months. My squad won\'t let me.', name: 'Jamie T.', goal: 'Weight loss' },
    { text: 'The camera thing is wild. You literally cannot lie to yourself.', name: 'Marcus R.', goal: 'Muscle building' },
    { text: 'My PT loves it. She can see my form live without being there.', name: 'Priya K.', goal: 'Sports performance' },
  ];

  return (
    <section id="community" style={{ padding: '140px 80px', position: 'relative' }}>
      <div style={{ textAlign: 'center', marginBottom: 80 }}>
        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
          letterSpacing: 4, color: C.amber, marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <span style={{ width: 24, height: 1, background: C.amber, display: 'inline-block' }} />
          COMMUNITY
          <span style={{ width: 24, height: 1, background: C.amber, display: 'inline-block' }} />
        </div>
        <h2 style={{
          fontFamily: 'Josefin Sans', fontWeight: 700,
          fontSize: 'clamp(36px, 5vw, 64px)', color: C.offwhite,
          letterSpacing: -1, lineHeight: 1.1,
        }}>
          PROOF FROM THE<br />
          <span style={{ WebkitTextStroke: `1px ${C.offwhite}`, color: 'transparent' }}>
            COMMUNITY
          </span>
        </h2>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 24, maxWidth: 1100, margin: '0 auto',
      }}>
        {quotes.map((q, i) => {
          const ref = useRef<HTMLDivElement>(null);
          useEffect(() => {
            const el = ref.current;
            if (!el) return;
            gsap.set(el, { opacity: 0, y: 40 });
            const trigger = ScrollTrigger.create({
              trigger: el, start: 'top 88%',
              onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: i * 0.15 }),
            });
            return () => trigger.kill();
          }, []);

          return (
            <div ref={ref} key={i} style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(232,232,227,0.07)',
              borderRadius: 24, padding: 36,
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{
                fontSize: 32, color: C.amber, marginBottom: 20,
                fontFamily: 'Georgia, serif', lineHeight: 1,
              }}>"</div>
              <p style={{
                fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 15,
                color: C.offwhite, lineHeight: 1.8, marginBottom: 28,
              }}>{q.text}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 13,
                  color: C.offwhite, letterSpacing: 1,
                }}>{q.name}</div>
                <div style={{
                  fontFamily: 'Josefin Sans', fontSize: 11, color: C.dim,
                  background: 'rgba(255,255,255,0.05)', padding: '4px 12px',
                  borderRadius: 20, letterSpacing: 1,
                }}>{q.goal}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── CTA section ──────────────────────────────────────────────────────────────
function CTASection() {
  const ref = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 60, scale: 0.97 });
    const trigger = ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, scale: 1, duration: 1.0, ease: 'power4.out' }),
    });
    return () => trigger.kill();
  }, []);

  return (
    <section ref={ref} style={{ padding: '140px 80px' }}>
      <div ref={innerRef} style={{
        maxWidth: 900, margin: '0 auto', textAlign: 'center',
        background: 'linear-gradient(145deg, rgba(93,176,117,0.08) 0%, rgba(28,28,25,0.6) 50%, rgba(212,150,58,0.06) 100%)',
        border: '1px solid rgba(93,176,117,0.15)',
        borderRadius: 48, padding: '100px 60px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 400, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(93,176,117,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
          letterSpacing: 4, color: C.green, marginBottom: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <span style={{ width: 24, height: 1, background: C.green, display: 'inline-block' }} />
          EARLY ACCESS
          <span style={{ width: 24, height: 1, background: C.green, display: 'inline-block' }} />
        </div>

        <h2 style={{
          fontFamily: 'Josefin Sans', fontWeight: 700,
          fontSize: 'clamp(40px, 6vw, 80px)', color: C.offwhite,
          letterSpacing: -2, lineHeight: 1.0, marginBottom: 28, position: 'relative',
        }}>
          READY TO PROVE<br />IT TO YOURSELF?
        </h2>

        <p style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 16,
          color: C.dim, maxWidth: 480, margin: '0 auto 48px', lineHeight: 1.9,
        }}>
          Join thousands of people who are done making excuses and starting making proof.
        </p>

        <button style={{
          background: C.offwhite, color: C.offblack, border: 'none',
          borderRadius: 50, padding: '20px 56px',
          fontFamily: 'Josefin Sans', fontWeight: 700,
          fontSize: 15, letterSpacing: 3, cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.3s',
          position: 'relative', zIndex: 1,
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
            (e.currentTarget as HTMLElement).style.boxShadow = `0 20px 60px rgba(93,176,117,0.25)`;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
          }}
        >
          JOIN THE WAITLIST
        </button>

        <p style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
          color: C.dim, marginTop: 20,
        }}>Free to join · No credit card required</p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{
      padding: '60px 80px',
      borderTop: '1px solid rgba(232,232,227,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 20,
        letterSpacing: 8, color: C.offwhite,
      }}>MAHI</div>

      <div style={{
        fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
        color: C.dim,
      }}>
        © 2026 Mahi. The fitness accountability app.
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {['Instagram', 'TikTok', 'Twitter'].map(s => (
          <a key={s} href="#" style={{
            fontFamily: 'Josefin Sans', fontSize: 12, letterSpacing: 2,
            color: C.dim, textDecoration: 'none',
            transition: 'color 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = C.offwhite)}
            onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
          >
            {s.toUpperCase()}
          </a>
        ))}
      </div>
    </footer>
  );
}

// ─── Main Showcase ────────────────────────────────────────────────────────────
export default function Showcase() {
  useLenis();

  return (
    <>
      <Cursor />
      <Nav />

      <main>
        <HeroSection />
        <Marquee />
        <FeaturesSection />
        <StatsSection />

        {/* Horizontal reel section */}
        <section style={{ position: 'relative' }}>
          <div style={{
            textAlign: 'center', padding: '80px 80px 0',
            fontFamily: 'Josefin Sans', fontWeight: 700,
            fontSize: 'clamp(28px, 4vw, 48px)', color: C.offwhite, letterSpacing: -0.5,
          }}>
            SCROLL TO EXPLORE
            <span style={{ display: 'block', WebkitTextStroke: `1px ${C.offwhite}`, color: 'transparent' }}>
              THE MAHI EXPERIENCE
            </span>
          </div>
          <HorizontalReel />
        </section>

        <HowItWorksSection />
        <CommunitySection />
        <CTASection />
      </main>

      <Footer />

      {/* Pulse animation for recording dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
    </>
  );
}
