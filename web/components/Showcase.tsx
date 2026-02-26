'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ─── Colours ────────────────────────────────────────────────────────────────
const C = {
  black: '#0a0a0a',
  white: '#ffffff',
  offwhite: '#f5f5f3',
  midgrey: '#888884',
  dimgrey: 'rgba(10,10,10,0.4)',
  border: 'rgba(10,10,10,0.1)',
};

// ─── Smooth scroll ───────────────────────────────────────────────────────────
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
    const rp = { x: 0, y: 0 };

    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      gsap.set(dot.current, { x: pos.x, y: pos.y });
    };
    const animate = () => {
      rp.x += (pos.x - rp.x) * 0.12;
      rp.y += (pos.y - rp.y) * 0.12;
      gsap.set(ring.current, { x: rp.x, y: rp.y });
      requestAnimationFrame(animate);
    };
    const onEnter = () => ring.current?.classList.add('hovering');
    const onLeave = () => ring.current?.classList.remove('hovering');

    document.addEventListener('mousemove', onMove);
    document.querySelectorAll('a,button,[data-hover]').forEach(el => {
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '22px 40px',
      transition: 'background 0.4s, border-color 0.4s',
      background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? `1px solid ${C.border}` : '1px solid transparent',
    }}>
      <span style={{
        fontFamily: 'Josefin Sans', fontWeight: 700,
        fontSize: 18, letterSpacing: 6, color: C.black,
      }}>mahi.</span>

      <a href="#waitlist" style={{
        fontFamily: 'Josefin Sans', fontWeight: 600,
        fontSize: 13, letterSpacing: 1.5, color: C.dimgrey,
        textDecoration: 'none', transition: 'color 0.2s',
      }}
        onMouseEnter={e => (e.currentTarget.style.color = C.black)}
        onMouseLeave={e => (e.currentTarget.style.color = C.dimgrey)}
      >
        Contact
      </a>
    </nav>
  );
}


// ─── Animated waves ───────────────────────────────────────────────────────────
function AnimatedWaves() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const paths = svgRef.current?.querySelectorAll('path');
    if (!paths) return;
    paths.forEach((path, i) => {
      const len = path.getTotalLength();
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 2.4,
        ease: 'power2.inOut',
        delay: 0.3 + i * 0.2,
      });
    });
  }, []);

  return (
    <svg ref={svgRef} viewBox="0 0 1600 600" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
      <path d="M-100 200 C 100 80, 300 340, 500 200 S 900 60, 1100 200 S 1400 340, 1700 200"
        stroke={C.black} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.07" />
      <path d="M-100 240 C 150 100, 350 380, 580 230 S 950 80, 1150 240 S 1450 380, 1700 230"
        stroke={C.black} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.04" />
      <path d="M-100 380 C 120 500, 380 220, 620 380 S 1000 520, 1220 370 S 1480 220, 1700 380"
        stroke={C.black} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.07" />
      <path d="M-100 420 C 160 540, 400 260, 640 410 S 1040 550, 1260 400 S 1500 250, 1700 420"
        stroke={C.black} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.04" />
    </svg>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroSection() {
  const headRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.1 });
    tl.from(headRef.current, { y: 60, duration: 0.9, ease: 'power4.out' })
      .from(subRef.current, { y: 24, duration: 0.6, ease: 'power3.out' }, '-=0.5')
      .from(formRef.current, { y: 20, duration: 0.6, ease: 'power3.out' }, '-=0.4')
      .from(avatarRef.current, { y: 14, duration: 0.5, ease: 'power3.out' }, '-=0.3');
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setJoined(true);
  };

  return (
    <section style={{
      minHeight: 'auto', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '100px 40px 60px', position: 'relative', overflow: 'hidden',
      background: C.white,
    }}>
      {/* Wave accents — animated draw */}
      <AnimatedWaves />

      {/* Text content */}
      <div style={{ textAlign: 'center', maxWidth: 640, position: 'relative', zIndex: 1 }}>
        <div ref={headRef}>
          <h1 style={{
            fontFamily: 'Josefin Sans', fontWeight: 700,
            fontSize: 'clamp(52px, 9vw, 100px)',
            lineHeight: 0.95, letterSpacing: -2,
            color: C.black, marginBottom: 0,
          }}>
            Work out.<br />
            <span style={{
              display: 'inline-block',
              WebkitTextStroke: `1.5px ${C.black}`,
              color: 'transparent',
            }}>Show up.</span>
          </h1>
        </div>

        <p ref={subRef} style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic',
          fontSize: 16, color: 'rgba(10,10,10,0.65)',
          lineHeight: 1.8, marginTop: 24, maxWidth: 420, margin: '24px auto 0',
        }}>
          Ushering the next era of fitness accountability.
        </p>

        {/* Email form */}
        <div ref={formRef} id="waitlist" style={{ marginTop: 36, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {joined ? (
            <div style={{
              fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 14,
              color: C.black, letterSpacing: 1, padding: '16px 32px',
              background: C.offwhite, borderRadius: 50, border: `1px solid rgba(10,10,10,0.2)`,
            }}>
              You're on the list ✓
            </div>
          ) : (
            <form onSubmit={handleJoin} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                required
                style={{
                  fontFamily: 'Josefin Sans', fontSize: 14, letterSpacing: 0.5,
                  padding: '16px 24px', borderRadius: 50,
                  border: `1.5px solid rgba(10,10,10,0.25)`,
                  background: C.offwhite, color: C.black,
                  outline: 'none', width: 240,
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target.style.borderColor = C.black)}
                onBlur={e => (e.target.style.borderColor = 'rgba(10,10,10,0.25)')}
              />
              <button type="submit" style={{
                fontFamily: 'Josefin Sans', fontWeight: 700,
                fontSize: 13, letterSpacing: 1.5,
                padding: '16px 28px', borderRadius: 50,
                background: C.black, color: C.white, border: 'none',
                cursor: 'pointer', transition: 'opacity 0.2s',
                whiteSpace: 'nowrap',
              }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                Join the waitlist
              </button>
            </form>
          )}
        </div>

        {/* Join count */}
        <div ref={avatarRef} style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <span style={{
            fontFamily: 'Josefin Sans', fontStyle: 'italic',
            fontSize: 13, color: 'rgba(10,10,10,0.5)',
          }}>Join +600 others on the waitlist</span>
        </div>
      </div>


      {/* Copyright line */}
      <div style={{
        position: 'absolute', bottom: 28, right: 40,
        fontFamily: 'Josefin Sans', fontStyle: 'italic',
        fontSize: 11, color: C.dimgrey,
      }}>© Mahi 2026</div>
    </section>
  );
}

// ─── Marquee strip ────────────────────────────────────────────────────────────
function MarqueeStrip() {
  const items = [
    'ACCOUNTABILITY', 'STRENGTH', 'CARDIO', 'SQUAD GOALS', 'PROOF OF WORK',
    'CONSISTENCY', 'LIVE CAMERA', 'REAL RESULTS', 'TOGETHER', 'MAHI',
  ];
  const doubled = [...items, ...items];

  return (
    <div style={{
      overflow: 'hidden', padding: '18px 0',
      borderTop: `1px solid ${C.border}`,
      borderBottom: `1px solid ${C.border}`,
      background: C.offwhite,
    }}>
      <div className="marquee-track" style={{ display: 'flex', gap: 60, whiteSpace: 'nowrap' }}>
        {doubled.map((item, i) => (
          <span key={i} style={{
            fontFamily: 'Josefin Sans', fontWeight: 600,
            fontSize: 11, letterSpacing: 4,
            color: i % 2 === 0 ? C.black : C.midgrey,
            display: 'flex', alignItems: 'center', gap: 60,
          }}>
            {item}
            <span style={{
              width: 4, height: 4, borderRadius: '50%',
              background: C.black, display: 'inline-block', marginLeft: -44, opacity: 0.3,
            }} />
          </span>
        ))}
      </div>
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
    gsap.set(el, { opacity: 0, y: 40 });
    const trigger = ScrollTrigger.create({
      trigger: el, start: 'top 88%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay }),
    });
    return () => trigger.kill();
  }, [delay]);

  return (
    <div ref={ref} style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 20, padding: '32px 28px',
      transition: 'border-color 0.2s, background 0.2s',
      cursor: 'default',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = C.black;
        (e.currentTarget as HTMLElement).style.background = C.offwhite;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = C.border;
        (e.currentTarget as HTMLElement).style.background = C.white;
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 18 }}>{icon}</div>
      <div style={{
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 16,
        color: C.black, letterSpacing: 0.5, marginBottom: 10,
      }}>{title}</div>
      <div style={{
        fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 13,
        color: C.midgrey, lineHeight: 1.8,
      }}>{desc}</div>
    </div>
  );
}

// ─── Features section ─────────────────────────────────────────────────────────
function FeaturesSection() {
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 40 });
    ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }),
    });
  }, []);

  return (
    <section id="features" style={{ padding: '120px 80px', background: C.white, position: 'relative' }}>
      <div ref={headRef} style={{ textAlign: 'center', marginBottom: 72 }}>
        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 11,
          letterSpacing: 4, color: C.midgrey, marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <span style={{ width: 20, height: 1, background: C.midgrey, display: 'inline-block' }} />
          WHAT MAHI DOES
          <span style={{ width: 20, height: 1, background: C.midgrey, display: 'inline-block' }} />
        </div>
        <h2 style={{
          fontFamily: 'Josefin Sans', fontWeight: 700,
          fontSize: 'clamp(32px, 5vw, 60px)', color: C.black,
          letterSpacing: -1, lineHeight: 1.05,
        }}>
          Built for the<br />
          <span style={{ WebkitTextStroke: `1.5px ${C.black}`, color: 'transparent' }}>
            serious ones.
          </span>
        </h2>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 20, maxWidth: 1100, margin: '0 auto',
      }}>
        <FeatureCard icon="📸" delay={0} title="LIVE CAMERA SESSIONS"
          desc="Start a workout and your camera goes live. Real-time proof that you're actually doing the work." />
        <FeatureCard icon="🔗" delay={0.08} title="SQUAD ACCOUNTABILITY"
          desc="Invite your crew. They see when you skip. Social pressure is the best gym partner." />
        <FeatureCard icon="⚡" delay={0.16} title="INSTANT VERIFICATION"
          desc="OTP-secured sessions mean every workout is verified and cryptographically yours." />
        <FeatureCard icon="🎯" delay={0.24} title="GOAL TRACKING"
          desc="Set your goals on signup and every session maps back to them automatically." />
        <FeatureCard icon="📅" delay={0.32} title="FLEXIBLE SCHEDULES"
          desc="Choose your days. Your schedule, your rules, zero judgment." />
        <FeatureCard icon="🏅" delay={0.40} title="STREAK SYSTEM"
          desc="Consecutive sessions build streaks. Simple, brutal, effective." />
      </div>
    </section>
  );
}

// ─── Stats section ────────────────────────────────────────────────────────────
function StatItem({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      onEnter: () => {
        gsap.to({ val: 0 }, {
          val: value, duration: 2, ease: 'power3.out',
          onUpdate: function () {
            if (el) el.textContent = Math.round(this.targets()[0].val).toLocaleString() + suffix;
          },
        });
      },
    });
  }, [value, suffix]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 52, color: C.black, lineHeight: 1 }}>
        <span ref={ref}>0{suffix}</span>
      </div>
      <div style={{ fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 13, color: C.midgrey, marginTop: 8 }}>
        {label}
      </div>
    </div>
  );
}

function StatsSection() {
  return (
    <section style={{ padding: '100px 80px', background: C.offwhite }}>
      <div style={{
        maxWidth: 900, margin: '0 auto',
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
function StepCard({ number, title, desc }: { number: string; title: string; desc: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, x: -30 });
    ScrollTrigger.create({
      trigger: el, start: 'top 87%',
      onEnter: () => gsap.to(el, { opacity: 1, x: 0, duration: 0.7, ease: 'power3.out' }),
    });
  }, []);

  return (
    <div ref={ref} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{
        minWidth: 50, height: 50, borderRadius: '50%',
        border: `1.5px solid ${C.black}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 16, color: C.black,
      }}>{number}</div>
      <div>
        <div style={{
          fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 18,
          color: C.black, letterSpacing: 0.3, marginBottom: 6,
        }}>{title}</div>
        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 13,
          color: C.midgrey, lineHeight: 1.8,
        }}>{desc}</div>
      </div>
    </div>
  );
}

function HowItWorksSection() {
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 40 });
    ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }),
    });
  }, []);

  return (
    <section id="how-it-works" style={{ padding: '120px 80px', background: C.white, position: 'relative' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
        <div>
          <div ref={headRef}>
            <div style={{
              fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 11,
              letterSpacing: 4, color: C.midgrey, marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ width: 20, height: 1, background: C.midgrey, display: 'inline-block' }} />
              HOW IT WORKS
            </div>
            <h2 style={{
              fontFamily: 'Josefin Sans', fontWeight: 700,
              fontSize: 'clamp(32px, 4vw, 52px)', color: C.black,
              letterSpacing: -0.5, lineHeight: 1.05, marginBottom: 56,
            }}>
              Four steps<br />to unstoppable.
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            <StepCard number="01" title="Create your account"
              desc="Sign up with email. Verify with OTP. Set your fitness goals and schedule." />
            <StepCard number="02" title="Invite your squad"
              desc="Add your gym partner or crew. They'll see when you train — or when you don't." />
            <StepCard number="03" title="Start a camera session"
              desc="Tap record. Mahi activates the camera. Your live session is logged as proof." />
            <StepCard number="04" title="Build your streak"
              desc="Every consecutive day builds your streak. Your squad watches it grow." />
          </div>
        </div>

        {/* Right — two phones stacked */}
        <div style={{ position: 'relative', height: 560, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', left: '8%', top: 20, transform: 'rotate(-5deg)', zIndex: 1 }}>
            <div className="phone-bezel" style={{ width: 220, height: 450, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 64, height: 20, background: '#0a0a0a', borderRadius: 16, zIndex: 10 }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: 44, overflow: 'hidden', background: '#1C1C19', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
                <div style={{ fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 32, letterSpacing: 8, color: '#E8E8E3' }}>MAHI</div>
                <div style={{ fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 10, color: 'rgba(232,232,227,0.45)', textAlign: 'center' }}>The fitness accountability app</div>
                <div style={{ marginTop: 20, width: '80%', padding: '12px 0', borderRadius: 50, background: '#E8E8E3', textAlign: 'center', fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 10, color: '#111' }}>Create an account</div>
                <div style={{ width: '80%', padding: '12px 0', borderRadius: 50, border: '1.5px solid rgba(232,232,227,0.4)', textAlign: 'center', fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 10, color: '#E8E8E3' }}>Log in</div>
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', right: '6%', top: 0, transform: 'rotate(5deg)', zIndex: 0 }}>
            <div className="phone-bezel" style={{ width: 220, height: 450, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 64, height: 20, background: '#0a0a0a', borderRadius: 16, zIndex: 10 }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: 44, overflow: 'hidden', background: '#1C1C19', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
                <div style={{ fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 14, color: '#E8E8E3', letterSpacing: 2 }}>VERIFY EMAIL</div>
                <div style={{ fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 9, color: 'rgba(232,232,227,0.45)', textAlign: 'center' }}>We sent a 6-digit code to your email</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {['3', '7', '4', '', '', ''].map((d, i) => (
                    <div key={i} style={{
                      width: 26, height: 32, borderRadius: 6,
                      background: d ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${d ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 13, color: '#E8E8E3',
                    }}>{d}</div>
                  ))}
                </div>
                <div style={{ marginTop: 12, width: '80%', padding: '10px 0', borderRadius: 50, background: '#E8E8E3', textAlign: 'center', fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 10, color: '#111' }}>CONTINUE</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Community ────────────────────────────────────────────────────────────────
function CommunitySection() {
  const quotes = [
    { text: "I haven't missed a Monday in 3 months. My squad won't let me.", name: 'Jamie T.', goal: 'Weight loss' },
    { text: "The camera thing is wild. You literally cannot lie to yourself.", name: 'Marcus R.', goal: 'Muscle building' },
    { text: "My PT loves it. She can see my form live without being there.", name: 'Priya K.', goal: 'Sports performance' },
  ];

  return (
    <section id="community" style={{ padding: '120px 80px', background: C.offwhite }}>
      <div style={{ textAlign: 'center', marginBottom: 64 }}>
        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 11,
          letterSpacing: 4, color: C.midgrey, marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <span style={{ width: 20, height: 1, background: C.midgrey, display: 'inline-block' }} />
          COMMUNITY
          <span style={{ width: 20, height: 1, background: C.midgrey, display: 'inline-block' }} />
        </div>
        <h2 style={{
          fontFamily: 'Josefin Sans', fontWeight: 700,
          fontSize: 'clamp(32px, 5vw, 60px)', color: C.black,
          letterSpacing: -1, lineHeight: 1.05,
        }}>
          Proof from<br />
          <span style={{ WebkitTextStroke: `1.5px ${C.black}`, color: 'transparent' }}>
            the community.
          </span>
        </h2>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20, maxWidth: 1000, margin: '0 auto',
      }}>
        {quotes.map((q, i) => {
          const ref = useRef<HTMLDivElement>(null);
          useEffect(() => {
            const el = ref.current;
            if (!el) return;
            gsap.set(el, { opacity: 0, y: 36 });
            ScrollTrigger.create({
              trigger: el, start: 'top 88%',
              onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: i * 0.12 }),
            });
          }, []);

          return (
            <div ref={ref} key={i} style={{
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: 20, padding: 32,
            }}>
              <div style={{ fontSize: 28, color: C.black, marginBottom: 16, fontFamily: 'Georgia, serif', opacity: 0.25 }}>"</div>
              <p style={{
                fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 14,
                color: C.black, lineHeight: 1.8, marginBottom: 24,
              }}>{q.text}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 12, color: C.black, letterSpacing: 1 }}>
                  {q.name}
                </div>
                <div style={{
                  fontFamily: 'Josefin Sans', fontSize: 10, color: C.midgrey,
                  background: C.offwhite, padding: '4px 10px', borderRadius: 20,
                  letterSpacing: 1, border: `1px solid ${C.border}`,
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
  const innerRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 50 });
    ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.9, ease: 'power4.out' }),
    });
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setJoined(true);
  };

  return (
    <section style={{ padding: '120px 80px', background: C.white }}>
      <div ref={innerRef} style={{
        maxWidth: 840, margin: '0 auto', textAlign: 'center',
        background: C.black, borderRadius: 40, padding: '90px 60px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle grain on dark bg */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
          opacity: 0.04, pointerEvents: 'none', borderRadius: 40,
        }} />

        <div style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 11,
          letterSpacing: 4, color: 'rgba(255,255,255,0.4)', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <span style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.3)', display: 'inline-block' }} />
          EARLY ACCESS
          <span style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.3)', display: 'inline-block' }} />
        </div>

        <h2 style={{
          fontFamily: 'Josefin Sans', fontWeight: 700,
          fontSize: 'clamp(38px, 6vw, 72px)', color: C.white,
          letterSpacing: -2, lineHeight: 0.95, marginBottom: 24, position: 'relative',
        }}>
          Ready to prove<br />it to yourself?
        </h2>

        <p style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 15,
          color: 'rgba(255,255,255,0.5)', maxWidth: 420, margin: '0 auto 40px', lineHeight: 1.9,
        }}>
          Join thousands of people who are done making excuses and starting making proof.
        </p>

        {joined ? (
          <div style={{
            display: 'inline-block',
            fontFamily: 'Josefin Sans', fontWeight: 600, fontSize: 14,
            color: C.black, letterSpacing: 1, padding: '16px 36px',
            background: C.white, borderRadius: 50,
          }}>
            You're on the list ✓
          </div>
        ) : (
          <form onSubmit={handleJoin} style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              style={{
                fontFamily: 'Josefin Sans', fontSize: 14,
                padding: '16px 24px', borderRadius: 50,
                border: '1.5px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.07)', color: C.white,
                outline: 'none', width: 240,
                transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.5)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
            />
            <button type="submit" style={{
              fontFamily: 'Josefin Sans', fontWeight: 700,
              fontSize: 13, letterSpacing: 1.5,
              padding: '16px 28px', borderRadius: 50,
              background: C.white, color: C.black, border: 'none',
              cursor: 'pointer', transition: 'opacity 0.2s',
              whiteSpace: 'nowrap',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Join the waitlist
            </button>
          </form>
        )}

        <p style={{
          fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
          color: 'rgba(255,255,255,0.3)', marginTop: 18,
        }}>Free to join · No credit card required</p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{
      padding: '48px 80px',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: C.white,
    }}>
      <div style={{
        fontFamily: 'Josefin Sans', fontWeight: 700, fontSize: 18,
        letterSpacing: 6, color: C.black,
      }}>mahi.</div>

      <div style={{
        fontFamily: 'Josefin Sans', fontStyle: 'italic', fontSize: 12,
        color: C.midgrey,
      }}>© 2026 Mahi. The fitness accountability app.</div>

      <div style={{ display: 'flex', gap: 24 }}>
        {['Instagram', 'TikTok', 'Twitter'].map(s => (
          <a key={s} href="#" style={{
            fontFamily: 'Josefin Sans', fontSize: 11, letterSpacing: 2,
            color: C.midgrey, textDecoration: 'none', transition: 'color 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = C.black)}
            onMouseLeave={e => (e.currentTarget.style.color = C.midgrey)}
          >
            {s.toUpperCase()}
          </a>
        ))}
      </div>
    </footer>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Showcase() {
  useLenis();

  return (
    <>
      <Cursor />
      <Nav />

      <main>
        <HeroSection />
        <MarqueeStrip />
        <FeaturesSection />
        <StatsSection />
        <HowItWorksSection />
        <CommunitySection />
        <CTASection />
      </main>

      <Footer />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.4); }
        }
        input::placeholder { color: rgba(10,10,10,0.35); }
      `}</style>
    </>
  );
}
