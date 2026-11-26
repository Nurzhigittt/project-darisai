"use client";

import { Check, ChevronDown, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Logo } from "@/components/ui/logo";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useI18n } from "@/lib/i18n";
import { locales, type Locale } from "@/lib/i18n/dictionaries";
import { isJoinCodeComplete, normalizeJoinCode } from "@/lib/utils";

import { landingCopy } from "./landing-copy";
import styles from "./landing.module.css";

const languageNames: Record<Locale, string> = { en: "EN", ru: "RU", kk: "ҚАЗ" };
const navigationLabels: Record<Locale, string> = { en: "Main navigation", ru: "Основная навигация", kk: "Негізгі навигация" };

function SignalChart({ active = false }: { active?: boolean }) {
  return (
    <svg className={styles.signalChart} viewBox="0 0 400 130" fill="none" aria-hidden="true">
      <path d="M0 28H400M0 68H400M0 108H400" className={styles.chartGrid} />
      <path d="M276 6V118" className={styles.chartMarker} />
      <path
        d={active
          ? "M0 106L22 106L30 102L39 106L74 106L84 94L93 103L110 103L122 88L132 96L150 96L163 77L174 92L190 90L204 70L216 82L231 65L244 45L256 56L267 29L278 42L289 18L300 35L313 24L325 40L340 36L353 55L368 60L385 68L400 68"
          : "M0 106L22 106L30 102L39 106L74 106L84 94L93 103L110 103L122 98L132 103L150 103L163 89L174 103L190 103L204 97L216 103L231 101L244 93L256 103L267 96L278 103L289 88L300 103L313 101L325 103L340 103L353 98L368 103L385 103L400 103"}
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  );
}

export function LandingScreen() {
  const { locale, setLocale, t } = useI18n();
  const copy = landingCopy[locale];
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (!isJoinCodeComplete(normalized)) {
      setError(t("join.invalid.body"));
      codeInput.current?.focus();
      return;
    }
    setError(null);
    router.push(`/join/${normalized}`);
  }

  function focusJoin() {
    setMenuOpen(false);
    requestAnimationFrame(() => {
      codeInput.current?.focus({ preventScroll: true });
    });
  }

  const nav = [
    { href: "#how", label: copy.nav.how },
    { href: "#teachers", label: copy.nav.teachers },
    { href: "#questions", label: copy.nav.questions },
  ];

  return (
    <div className={styles.page}>
      <header
        className={styles.header}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            event.preventDefault();
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Logo className={styles.logo} />
          <nav className={styles.desktopNav} aria-label={navigationLabels[locale]}>
            {nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>
          <div className={styles.headerActions}>
            <label className={styles.language}>
              <span className="sr-only">{t("language.label")}</span>
              <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                {locales.map((item) => <option key={item} value={item}>{languageNames[item]}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <span className={styles.themeSwitch}><ThemeSwitcher /></span>
            <Link href="/login" className={styles.headerLogin}>{copy.nav.login}</Link>
            <button
              ref={menuButton} type="button" className={styles.menuButton}
              aria-label={menuOpen ? copy.nav.close : copy.nav.menu}
              aria-expanded={menuOpen} aria-controls="landing-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="landing-navigation" className={styles.mobileNav} aria-label={navigationLabels[locale]}
          >
            {nav.map((item) => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
            <a href="#join" onClick={focusJoin}>{copy.nav.students}</a>
            <Link href="/login">{copy.nav.login}</Link>
          </nav>
        )}
      </header>

      <main id="main">
        <section id="join" className={styles.joinStrip} aria-label={copy.join.label}>
          <div className={`${styles.container} ${styles.joinInner}`}>
            <p>{copy.join.label}</p>
            <form onSubmit={handleJoin} noValidate className={styles.joinForm}>
              <label className="sr-only" htmlFor="lecture-code">{t("join.codeLabel")}</label>
              <input
                ref={codeInput} id="lecture-code" name="code" value={code}
                onChange={(event) => { setCode(normalizeJoinCode(event.target.value)); setError(null); }}
                placeholder={copy.join.placeholder} autoComplete="off" autoCapitalize="characters"
                spellCheck={false} maxLength={6} aria-invalid={Boolean(error)}
                aria-describedby={error ? "code-error" : "code-hint"}
              />
              <button type="submit">{copy.join.button}</button>
            </form>
            <p id="code-hint" className={styles.joinHint}>{copy.join.hint}</p>
          </div>
          {error && <p id="code-error" role="alert" className={`${styles.container} ${styles.joinError}`}>{error}</p>}
        </section>

        <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{copy.hero.eyebrow}</p>
            <h1 id="hero-title">{copy.hero.title} <span>{copy.hero.accent}</span></h1>
            <p className={styles.heroBody}>{copy.hero.body}</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/login">{copy.hero.teacherCta}</Link>
              <a className={styles.textLink} href="#join" onClick={focusJoin}>{copy.hero.studentCta}</a>
            </div>
            <p className={styles.heroNote}>{copy.hero.note}</p>
          </div>

          <figure className={styles.demo}>
            <div className={styles.demoHeading}><span>{copy.demo.label}</span><span>DärisAI</span></div>
            <div className={styles.lectureWindow}>
              <div className={styles.lectureHeader}>
                <span>{copy.demo.teacher}</span>
                <span className={styles.demoTime}>18:24</span>
              </div>
              <div className={styles.lectureBody}>
                <p className={styles.course}>{copy.demo.course}</p>
                <h2>{copy.demo.topic}</h2>
                <div className={styles.chartCaption}><span>{t("landing.illustration.room")}</span><span>{copy.demo.timer}</span></div>
                <SignalChart active />
                <div className={styles.chartAxis}><span>00:00</span><span>09:00</span><span>18:24</span></div>
                <p className={`${styles.roomStatus} ${styles.roomStatusActive}`}>
                  <span aria-hidden="true" className={styles.statusMark} />
                  {copy.demo.after}
                </p>
              </div>
            </div>
            <div className={styles.studentWindow}>
              <div><span className={styles.studentLabel}>{copy.demo.student}</span><span className={styles.studentDevice}>DärisAI</span></div>
              <p>{copy.demo.topic}</p>
              <button
                type="button" onClick={() => setDemoActive(!demoActive)}
                aria-pressed={demoActive}
                aria-describedby="demo-caption"
                title={demoActive ? copy.demo.reset : undefined}
                className={styles.signalButton}
              >
                {demoActive ? <Check size={20} aria-hidden="true" /> : <span aria-hidden="true" className={styles.signalSymbol}>?</span>}
                {demoActive ? copy.demo.signalSent : copy.demo.signal}
              </button>
            </div>
            <figcaption id="demo-caption">{copy.demo.caption}</figcaption>
          </figure>
        </section>

        <section className={`${styles.container} ${styles.statement}`}>
          <p className={styles.eyebrow}>{copy.statement.eyebrow}</p>
          <div><h2>{copy.statement.title}</h2><p>{copy.statement.body}</p></div>
        </section>

        <section className={styles.roles}>
          <div className={`${styles.container} ${styles.rolesGrid}`}>
            <article id="students" className={styles.studentRole}>
              <p className={styles.eyebrow}>{copy.roles.studentLabel}</p>
              <h2>{copy.roles.studentTitle}</h2>
              <p className={styles.roleBody}>{copy.roles.studentBody}</p>
              <ul>{copy.roles.studentPoints.map((point) => <li key={point}><Check size={17} aria-hidden="true" />{point}</li>)}</ul>
              <a href="#join" onClick={focusJoin} className={styles.textLink}>{copy.hero.studentCta}</a>
            </article>
            <article id="teachers" className={styles.teacherRole}>
              <p className={styles.eyebrow}>{copy.roles.teacherLabel}</p>
              <h2>{copy.roles.teacherTitle}</h2>
              <p className={styles.roleBody}>{copy.roles.teacherBody}</p>
              <ul>{copy.roles.teacherPoints.map((point) => <li key={point}><Check size={17} aria-hidden="true" />{point}</li>)}</ul>
              <Link href="/login" className={styles.textLink}>{copy.hero.teacherCta}</Link>
            </article>
          </div>
        </section>

        <section id="how" className={`${styles.container} ${styles.process}`}>
          <p className={styles.eyebrow}>{copy.process.eyebrow}</p>
          <h2>{copy.process.title}</h2>
          <div className={styles.steps}>
            {copy.process.steps.map((step, index) => (
              <article key={step.title}>
                <div className={styles.stepVisual} aria-hidden="true">
                  {index === 0 ? <div className={styles.codeVisual}>{"ABC123".split("").map((char) => <span key={char}>{char}</span>)}</div>
                    : index === 1 ? <div className={styles.signalVisual}><span>?</span><span className={styles.visualLine} /><span>✓</span></div>
                      : <SignalChart active />}
                </div>
                <h3>{step.title}</h3><p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="questions" className={`${styles.container} ${styles.faq}`}>
          <h2>{copy.faq.title}</h2>
          <div>{copy.faq.items.map((item) => (
            <details key={item.question}>
              <summary>{item.question}<Plus size={20} aria-hidden="true" /></summary>
              <p>{item.answer}</p>
            </details>
          ))}</div>
        </section>

        <section className={styles.closing}>
          <div className={`${styles.container} ${styles.closingInner}`}>
            <div><h2>{copy.closing.title}</h2><p>{copy.closing.body}</p></div>
            <div className={styles.closingActions}>
              <Link href="/login" className={styles.lightButton}>{copy.closing.teacherCta}</Link>
              <a href="#join" onClick={focusJoin}>{copy.closing.studentCta}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerTop}`}>
          <div><Logo className={styles.logo} /><p>{copy.footer.tagline}</p></div>
          <nav aria-label={t("footer.product")}>
            <Link href="/privacy">{copy.footer.privacy}</Link>
            <Link href="/status">{copy.footer.status}</Link>
            <a href="https://github.com/Nurzhigittt/project-darisai" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
        <div className={`${styles.container} ${styles.footerBottom}`}><span>© {new Date().getFullYear()} DärisAI</span><span>{copy.footer.copyright}</span></div>
      </footer>
    </div>
  );
}
