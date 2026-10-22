import Link from "next/link";

const metrics = [
  ["1.8–2.4", "Target exit Mach number"],
  ["2,400 fps", "High-speed imaging"],
  ["14.7 kPa", "Measured pressure range"]
];

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">∿</span> NOZZLE<span className="brand-muted">LAB</span></Link>
        <nav><Link className="active" href="/">Overview</Link><Link href="/methodology">Methodology</Link><Link href="/analyzer">Analyzer</Link></nav>
        <Link className="header-link" href="/analyzer">Open analyzer <span>↗</span></Link>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker"><span className="pulse" /> Experimental investigation · 2026</p>
          <h1>Seeing the<br /><em>invisible</em> in flight.</h1>
          <p className="hero-text">An experimental study of supersonic jet flow in a convergent–divergent nozzle, combining optical diagnostics with AI-based image analysis.</p>
          <div className="hero-actions"><Link className="button button-light" href="/analyzer">Launch analyzer <span>↗</span></Link><Link className="text-button" href="/methodology">Read methodology <span>→</span></Link></div>
          <div className="hero-meta">{metrics.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        </div>
        <div className="hero-visual" aria-label="Stylized Schlieren visualization"><div className="visual-label">SCHLIEREN FRAME 0142 <span>● REC</span></div><div className="flow-visual"><div className="nozzle-shape" /><div className="shock shock-one" /><div className="shock shock-two" /><div className="shock shock-three" /><div className="flow-streak streak-a" /><div className="flow-streak streak-b" /><div className="flow-streak streak-c" /></div><div className="visual-label bottom-label"><span>Δρ / ρ∞</span><span>HIGH CONTRAST</span><span>02:14:08</span></div></div>
      </section>
      <section className="content-section intro-section"><div className="section-index">01 / CONTEXT</div><div><h2>When air moves faster than sound, <span>density becomes visible.</span></h2><p className="body-copy">Supersonic flows contain shock waves, expansion fans and shear layers that cannot be observed with the naked eye. This project makes those structures measurable through Schlieren imaging and a transparent computer vision pipeline.</p></div><div className="metric-strip">{metrics.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></section>
      <section className="dark-band"><div className="content-section"><div className="section-index light-index">02 / WORKFLOW</div><div className="band-heading"><h2>From pixels<br />to <em>patterns.</em></h2><p className="body-copy light-copy">Upload an experimental image, calibrate the scale, inspect every processing stage and compare the physics baseline with the AI prediction.</p></div><div className="workflow-cards"><div><b>01</b><strong>Calibrate</strong><span>Convert pixels to millimetres from the nozzle exit diameter.</span></div><div><b>02</b><strong>Process</strong><span>Enhance contrast, detect edges and extract shock geometry.</span></div><div><b>03</b><strong>Compare</strong><span>Place Mach estimates and uncertainty side by side.</span></div></div><Link className="button button-light" href="/analyzer">Start with an image <span>↗</span></Link></div></section>
    </main>
  );
}
