/**
 * 50 WEB DESIGN templates (the "web design" half of the
 * user's examples request): semantic HTML pages, modern CSS
 * stylesheets and design-token systems. Created as .html / .css files
 * that open in Praxis' sandboxed live preview (View ▸ Preview).
 *
 * Bodies are literal (no naming tokens) — HTML/CSS have their own
 * naming conventions (classes, custom properties) that should not be
 * restyled from the Python naming preferences.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Web Design";

const ex = (
    id: string, label: string, description: string, sub: string,
    baseName: string, extension: string, body: string,
) => mkExample("web", id, label, description, CAT, sub, baseName, extension, () => body);

export const WEB_DESIGN_EXAMPLES: FileExample[] = [
    ex("webd-ex-001", "Semantic HTML page", "header / nav / main / article / aside / footer — the document outline browsers and screen readers navigate by.", "HTML pages", "semantic_page", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Semantic page skeleton</title>
</head>
<body>
  <header>
    <h1>The Observatory</h1>
    <nav aria-label="Primary">
      <ul>
        <li><a href="#tonight">Tonight's sky</a></li>
        <li><a href="#reports">Reports</a></li>
        <li><a href="#about">About</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <article id="tonight">
      <h2>Tonight's sky</h2>
      <p>Semantic elements are not decoration: assistive technology uses
         them to build the page outline, and search engines weigh them.</p>
      <section>
        <h3>Best targets</h3>
        <ul>
          <li>M31 — the Andromeda galaxy</li>
          <li>M13 — the great globular cluster</li>
        </ul>
      </section>
      <figure>
        <img src="https://placehold.co/480x240?text=night+sky" alt="Illustration of the night sky">
        <figcaption>Fig. 1 — A placeholder sky chart.</figcaption>
      </figure>
    </article>

    <aside>
      <h2>Seeing conditions</h2>
      <p>Transparency 4/5 · Seeing 3/5 · Moon 12%</p>
    </aside>
  </main>

  <footer>
    <p><small>&copy; 2026 The Observatory · <a href="#top">Back to top</a></small></p>
  </footer>
</body>
</html>
`),

    ex("webd-ex-002", "Personal resume page", "A print-friendly single-column resume: contact row, sections, definition-list skills.", "HTML pages", "resume", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ada Fielding — Resume</title>
  <style>
    body { font: 16px/1.55 Georgia, serif; margin: 2rem auto; max-width: 42rem; padding: 0 1rem; }
    h1, h2 { font-family: Verdana, sans-serif; }
    h2 { border-bottom: 2px solid #333; padding-bottom: .2rem; margin-top: 2rem; }
    .contact a { margin-right: .8rem; }
    dl.skills { display: grid; grid-template-columns: 8rem 1fr; row-gap: .3rem; }
    dt { font-weight: bold; }
    ul { padding-left: 1.2rem; }
    @media print { body { margin: 0; max-width: none; } a { color: inherit; text-decoration: none; } }
  </style>
</head>
<body>
  <h1>Ada Fielding</h1>
  <p class="contact">
    <a href="mailto:ada@example.com">ada@example.com</a>
    <a href="tel:+15550100">+1 555 0100</a>
    <span>Rotterdam, NL</span>
  </p>

  <h2>Experience</h2>
  <h3>Senior Data Engineer — Tide Analytics (2021–present)</h3>
  <ul>
    <li>Built the streaming ingestion pipeline (1.2B events/day).</li>
    <li>Cut batch window from 6h to 40min with incremental models.</li>
  </ul>
  <h3>Data Analyst — Noord Research (2018–2021)</h3>
  <ul><li>Owned the quarterly forecasting model and its dashboards.</li></ul>

  <h2>Skills</h2>
  <dl class="skills">
    <dt>Languages</dt><dd>Python, SQL, TypeScript</dd>
    <dt>Platforms</dt><dd>Spark, Airflow, Postgres, S3</dd>
    <dt>Practices</dt><dd>CI/CD, data contracts, dbt</dd>
  </dl>

  <h2>Education</h2>
  <p>MSc Statistics — Erasmus University, 2018</p>
</body>
</html>
`),

    ex("webd-ex-003", "Portfolio gallery", "A responsive image gallery with figure captions, ready for grid CSS.", "HTML pages", "portfolio_gallery", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Work — Studio Ninebark</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: #1a1a1a; }
    header { padding: 4rem 1rem 2rem; text-align: center; }
    h1 { font-weight: 300; letter-spacing: .3em; text-transform: uppercase; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; padding: 1rem; }
    figure { margin: 0; background: #f4f4f2; }
    img { width: 100%; display: block; aspect-ratio: 4 / 3; object-fit: cover; }
    figcaption { padding: .6rem .8rem; font-size: .85rem; color: #666; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <header>
    <h1>Studio Ninebark</h1>
    <p>landscape · product · editorial</p>
  </header>
  <main class="gallery">
    <figure>
      <img src="https://placehold.co/400x300?text=Dunes" alt="Dune series, shot at dusk">
      <figcaption><span>Dunes</span><span>2025</span></figcaption>
    </figure>
    <figure>
      <img src="https://placehold.co/400x300?text=Fjord" alt="Fjord study in blue hour">
      <figcaption><span>Fjord study</span><span>2025</span></figcaption>
    </figure>
    <figure>
      <img src="https://placehold.co/400x300?text=Ceramics" alt="Still life, ceramics">
      <figcaption><span>Ceramics</span><span>2024</span></figcaption>
    </figure>
    <figure>
      <img src="https://placehold.co/400x300?text=Seed+heads" alt="Seed heads against dark cloth">
      <figcaption><span>Seed heads</span><span>2024</span></figcaption>
    </figure>
  </main>
</body>
</html>
`),

    ex("webd-ex-004", "Pricing table", "Three plans with a highlighted tier, feature lists and CTA buttons.", "HTML pages", "pricing_table", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pricing — Windmill CI</title>
  <style>
    :root { --ink: #16323f; --accent: #0e7c66; --muted: #5b6b73; }
    body { font-family: system-ui, sans-serif; margin: 0; background: #f6f8f8; color: var(--ink); }
    .wrap { max-width: 960px; margin: 0 auto; padding: 3rem 1rem; }
    h1 { text-align: center; font-size: 2rem; }
    .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 2rem; }
    .plan { background: #fff; border: 1px solid #e3e8e8; border-radius: 12px; padding: 1.5rem; }
    .plan.featured { border: 2px solid var(--accent); box-shadow: 0 12px 30px -18px rgba(14,124,102,.55); }
    .plan h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .price { font-size: 2.2rem; margin: .4rem 0 .2rem; }
    .price small { font-size: .9rem; color: var(--muted); }
    ul { padding: 0 0 0 0; list-style: none; margin: 1rem 0; }
    li { padding: .35rem 0; border-bottom: 1px dashed #e3e8e8; }
    .cta { display: block; text-align: center; padding: .7rem; border-radius: 8px;
           background: var(--accent); color: #fff; text-decoration: none; font-weight: 600; }
    .plan:not(.featured) .cta { background: #e7efed; color: var(--accent); }
    .badge { float: right; background: var(--accent); color: #fff; font-size: .7rem;
             padding: .15rem .5rem; border-radius: 99px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Simple, build-friendly pricing</h1>
    <section class="plans">
      <div class="plan">
        <h2>Hobby</h2>
        <p class="price">$0 <small>/ month</small></p>
        <ul><li>1 concurrent build</li><li>Public projects</li><li>Community support</li></ul>
        <a class="cta" href="#">Start free</a>
      </div>
      <div class="plan featured">
        <h2>Team <span class="badge">Popular</span></h2>
        <p class="price">$29 <small>/ month</small></p>
        <ul><li>8 concurrent builds</li><li>Private projects</li><li>Priority queue</li><li>Slack support</li></ul>
        <a class="cta" href="#">Choose Team</a>
      </div>
      <div class="plan">
        <h2>Scale</h2>
        <p class="price">$99 <small>/ month</small></p>
        <ul><li>Unlimited builds</li><li>Self-hosted runners</li><li>Audit log + SSO</li></ul>
        <a class="cta" href="#">Talk to us</a>
      </div>
    </section>
  </div>
</body>
</html>
`),

    ex("webd-ex-005", "Contact form", "An accessible form: labels, fieldsets, hints, required states and a submit row.", "HTML pages", "contact_form", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contact — Bramble Tea Co.</title>
  <style>
    form { max-width: 30rem; margin: 2rem auto; display: grid; gap: 1rem; font-family: system-ui, sans-serif; }
    label { font-weight: 600; font-size: .9rem; display: block; margin-bottom: .25rem; }
    .hint { color: #667; font-weight: 400; font-size: .8rem; }
    input, select, textarea { width: 100%; padding: .6rem .7rem; border: 1px solid #cfd6d6;
      border-radius: 8px; font: inherit; box-sizing: border-box; }
    input:focus, textarea:focus { outline: 2px solid #0e7c66; outline-offset: 1px; border-color: #0e7c66; }
    .actions { display: flex; gap: .8rem; align-items: center; }
    button { padding: .7rem 1.4rem; border: 0; border-radius: 8px; background: #0e7c66; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .req { color: #b3261e; }
  </style>
</head>
<body>
  <form action="#" method="post">
    <fieldset>
      <legend>Say hello</legend>
      <p>
        <label for="name">Name <span class="req">*</span></label>
        <input id="name" name="name" required autocomplete="name">
      </p>
      <p>
        <label for="email">Email <span class="req">*</span></label>
        <input id="email" name="email" type="email" required autocomplete="email">
      </p>
      <p>
        <label for="topic">Topic</label>
        <select id="topic" name="topic">
          <option>Wholesale</option>
          <option>Order problem</option>
          <option>Just a nice note</option>
        </select>
      </p>
      <p>
        <label for="msg">Message <span class="hint">(up to 500 characters)</span></label>
        <textarea id="msg" name="message" rows="5" maxlength="500" required></textarea>
      </p>
      <div class="actions">
        <button type="submit">Send message</button>
        <span class="hint">We reply within two working days.</span>
      </div>
    </fieldset>
  </form>
</body>
</html>
`),

    ex("webd-ex-006", "Blog post layout", "article with time, address (author), pull quote and footnotes.", "HTML pages", "blog_post", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reading the tide tables — Journal</title>
  <style>
    body { font: 18px/1.7 Charter, Georgia, serif; margin: 0; }
    article { max-width: 40rem; margin: 0 auto; padding: 3rem 1.25rem; }
    h1 { font-size: 1.9rem; line-height: 1.25; margin-bottom: .5rem; }
    .meta { color: #777; font-family: system-ui, sans-serif; font-size: .85rem; }
    blockquote { margin: 1.5rem 0; padding: .2rem 0 .2rem 1.2rem; border-left: 4px solid #0e7c66; font-style: italic; }
    .footnotes { font-size: .9rem; border-top: 1px solid #ddd; margin-top: 2.5rem; padding-top: 1rem; }
  </style>
</head>
<body>
  <article>
    <h1>Reading the tide tables</h1>
    <p class="meta">
      By <address style="display:inline">M. Okonkwo</address> ·
      <time datetime="2026-03-14">March 14, 2026</time> · 7 min read
    </p>

    <p>Every harbor publishes them, and almost nobody reads them right.
       The tide table is a forecast, not a promise — it is the sum of a
       dozen astronomical cycles, printed as if they were one number.</p>

    <blockquote>
      The tide does not rise; the water merely stops falling.
    </blockquote>

    <p>The spring tides follow syzygy — the alignment of sun and moon —
       roughly every fourteen days.<sup><a href="#fn1">1</a></sup> When
       the alignment is new moon, the morning boat ramp floods; when it
       is full moon, the evening one does.</p>

    <section class="footnotes">
      <ol>
        <li id="fn1">Formally: the luni-solar diurnal inequality, K1 + O1 constituents.</li>
      </ol>
    </section>
  </article>
</body>
</html>
`),

    ex("webd-ex-007", "Recipe card", "A structured recipe: hero image, meta row (time / yield), ordered steps, unordered ingredients.", "HTML pages", "recipe_card", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Koji butter cookies</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #faf7f2; color: #2b2620; }
    .card { max-width: 34rem; margin: 2rem auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px -30px rgba(0,0,0,.4); }
    .card img { width: 100%; height: 220px; object-fit: cover; }
    .body { padding: 1.4rem 1.6rem 1.8rem; }
    h1 { font-size: 1.5rem; margin: 0 0 .2rem; }
    .meta { display: flex; gap: 1.2rem; color: #8a7f6e; font-size: .85rem; margin-bottom: 1.2rem; }
    h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .12em; color: #8a7f6e; }
    ul, ol { padding-left: 1.3rem; line-height: 1.7; }
    ol li { margin: .5rem 0; }
    .split { display: grid; grid-template-columns: 1fr 1.6fr; gap: 1.5rem; }
    @media (max-width: 520px) { .split { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <article class="card">
    <img src="https://placehold.co/640x260?text=cookies" alt="Stack of golden cookies">
    <div class="body">
      <h1>Koji butter cookies</h1>
      <p class="meta"><span>⏱ 25 min</span><span>Makes 24</span><span>Butter, brown, sweet</span></p>
      <div class="split">
        <section>
          <h2>Ingredients</h2>
          <ul>
            <li>230 g butter, softened</li>
            <li>180 g brown sugar</li>
            <li>2 tbsp koji paste</li>
            <li>300 g flour</li>
            <li>1 tsp baking soda</li>
          </ul>
        </section>
        <section>
          <h2>Method</h2>
          <ol>
            <li>Cream butter and sugar 4 minutes, until pale.</li>
            <li>Beat in the koji paste and one egg.</li>
            <li>Fold in flour and soda; rest 30 minutes cold.</li>
            <li>Roll 20 g balls; bake 12 min at 180 °C.</li>
          </ol>
        </section>
      </div>
    </div>
  </article>
</body>
</html>
`),

    ex("webd-ex-008", "FAQ with details/summary", "Native accordions — zero JavaScript, keyboard accessible by default.", "HTML pages", "faq_accordion", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FAQ — Larch Analytics</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #fbfbfa; margin: 0; }
    main { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
    h1 { font-weight: 600; }
    details { border: 1px solid #e4e4e0; border-radius: 10px; background: #fff; margin: .6rem 0; }
    summary { padding: 1rem 1.1rem; cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; }
    summary::after { content: "+"; color: #0e7c66; font-weight: 700; }
    details[open] summary::after { content: "–"; }
    details p { margin: 0; padding: 0 1.1rem 1.1rem; color: #454743; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1>Frequently asked</h1>
    <details open>
      <summary>Do you store my data?</summary>
      <p>No. Everything runs in your browser session; refreshes clear the
         workspace. Exports are the only persistence.</p>
    </details>
    <details>
      <summary>Can I import CSV from Excel?</summary>
      <p>Yes — UTF-8 and legacy encodings both work; the delimiter is
         auto-detected per file.</p>
    </details>
    <details>
      <summary>Is there a keyboard shortcut list?</summary>
      <p>Press <kbd>?</kbd> anywhere in the app to open the cheat sheet.</p>
    </details>
    <details>
      <summary>Why does the first load take a moment?</summary>
      <p>The statistics engine is compiled on first visit and cached by
         the browser afterwards.</p>
    </details>
  </main>
</body>
</html>
`),

    ex("webd-ex-009", "Data table", "A sortable-looking data table with caption, scope attributes and numeric alignment.", "HTML pages", "data_table", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Runway lengths</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    table { border-collapse: collapse; width: 100%; max-width: 44rem; font-size: .92rem; }
    caption { text-align: left; font-weight: 600; padding-bottom: .6rem; }
    th, td { padding: .55rem .8rem; border-bottom: 1px solid #e5e5e5; text-align: left; }
    th { background: #f2f4f3; font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr:hover { background: #f7faf9; }
    tfoot td { font-weight: 600; border-top: 2px solid #333; }
  </style>
</head>
<body>
  <table>
    <caption>Runway options for the coastal strip</caption>
    <thead>
      <tr>
        <th scope="col">Site</th>
        <th scope="col">Surface</th>
        <th scope="col" class="num">Length&nbsp;(m)</th>
        <th scope="col" class="num">Stopway&nbsp;(m)</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>A</td><td>Asphalt</td><td class="num">2 400</td><td class="num">120</td></tr>
      <tr><td>B</td><td>Treated gravel</td><td class="num">1 850</td><td class="num">0</td></tr>
      <tr><td>C</td><td>Asphalt</td><td class="num">3 100</td><td class="num">200</td></tr>
    </tbody>
    <tfoot>
      <tr><td colspan="2">Longest</td><td class="num">3 100</td><td class="num">200</td></tr>
    </tfoot>
  </table>
</body>
</html>
`),

    ex("webd-ex-010", "Login card", "A centered auth card with floating labels and a password toggle hook point.", "HTML pages", "login_card", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — Kestrel</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
           font-family: system-ui, sans-serif; background: radial-gradient(circle at 30% 20%, #123a33, #0d1f1c 70%); }
    .card { width: min(92vw, 22rem); background: #fff; border-radius: 18px; padding: 2rem 2rem 1.6rem;
            box-shadow: 0 30px 60px -30px rgba(0,0,0,.6); }
    .logo { width: 40px; height: 40px; border-radius: 10px; background: #0e7c66; color: #fff;
            display: grid; place-items: center; font-weight: 700; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 .2rem; }
    .sub { color: #78807d; font-size: .88rem; margin: 0 0 1.4rem; }
    .field { margin-bottom: 1rem; }
    .field label { font-size: .8rem; font-weight: 600; color: #4b5350; }
    input { width: 100%; box-sizing: border-box; padding: .65rem .75rem; margin-top: .25rem;
            border: 1px solid #cfd5d2; border-radius: 9px; font: inherit; }
    input:focus { outline: 2px solid #0e7c66; border-color: transparent; }
    .row { display: flex; justify-content: space-between; align-items: center; font-size: .82rem; }
    button { width: 100%; margin-top: 1.2rem; padding: .75rem; border: 0; border-radius: 9px;
             background: #0e7c66; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <form class="card" action="#" method="post">
    <div class="logo" aria-hidden="true">K</div>
    <h1>Welcome back</h1>
    <p class="sub">Sign in to your Kestrel workspace.</p>
    <div class="field">
      <label for="email">Email</label>
      <input id="email" type="email" name="email" autocomplete="username" required>
    </div>
    <div class="field">
      <label for="pw">Password</label>
      <input id="pw" type="password" name="password" autocomplete="current-password" required minlength="8">
    </div>
    <div class="row">
      <label><input type="checkbox"> Remember me</label>
      <a href="#">Forgot password?</a>
    </div>
    <button type="submit">Sign in</button>
  </form>
</body>
</html>
`),

    ex("webd-ex-011", "Hero section", "The above-the-fold pattern: headline, sub, dual CTA and a trust row.", "HTML pages", "hero_section", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Halcyon — ship calmer releases</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    .hero { padding: 5rem 1.5rem 4rem; text-align: center;
            background: linear-gradient(180deg, #eef6f4, #fff); }
    .kicker { display: inline-block; background: #dcEDE8; color: #0b5f50; font-size: .78rem;
              font-weight: 700; letter-spacing: .14em; text-transform: uppercase; padding: .3rem .8rem;
              border-radius: 99px; margin-bottom: 1.2rem; }
    h1 { font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1.1; margin: 0 auto .8rem; max-width: 18ch; }
    .sub { color: #55605c; font-size: clamp(1rem, 2vw, 1.2rem); max-width: 46ch; margin: 0 auto 2rem; }
    .cta { display: inline-block; padding: .85rem 1.6rem; border-radius: 10px; text-decoration: none; font-weight: 700; margin: 0 .4rem; }
    .cta.primary { background: #0e7c66; color: #fff; }
    .cta.ghost { color: #0e7c66; border: 1.5px solid #0e7c66; }
    .trust { margin-top: 2.5rem; color: #8b9490; font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; }
  </style>
</head>
<body>
  <section class="hero">
    <span class="kicker">Now with feature flags</span>
    <h1>Ship calmer releases, on purpose.</h1>
    <p class="sub">Halcyon wraps your deploy pipeline in rollbacks, flags and
       quiet hours — so Friday afternoons stop being a bet.</p>
    <a class="cta primary" href="#">Start free</a>
    <a class="cta ghost" href="#">Watch the 4-min tour</a>
    <p class="trust">Trusted by 340+ release teams</p>
  </section>
</body>
</html>
`),

    ex("webd-ex-012", "Timeline", "A vertical timeline with alternating sides and date markers — pure CSS.", "HTML pages", "timeline", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Project timeline</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #fbfbfa; margin: 0; padding: 2rem 1rem; }
    h1 { text-align: center; }
    .timeline { position: relative; max-width: 46rem; margin: 2rem auto; }
    .timeline::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: #cfd6d2; }
    .event { position: relative; width: 50%; padding: 0 1.6rem 2rem; box-sizing: border-box; }
    .event:nth-child(odd) { left: 0; text-align: right; }
    .event:nth-child(even) { left: 50%; }
    .event::after { content: ""; position: absolute; top: .3rem; width: 13px; height: 13px; border-radius: 50%;
                    background: #0e7c66; border: 3px solid #fff; box-shadow: 0 0 0 2px #0e7c66; }
    .event:nth-child(odd)::after { right: -8px; }
    .event:nth-child(even)::after { left: -8px; }
    .date { font-size: .75rem; font-weight: 700; color: #0e7c66; letter-spacing: .08em; }
    .event h3 { margin: .2rem 0; }
    .event p { margin: 0; color: #5b645f; font-size: .9rem; }
    @media (max-width: 640px) {
      .timeline::before { left: 10px; }
      .event, .event:nth-child(odd), .event:nth-child(even) { width: 100%; left: 0; text-align: left; padding-left: 2.2rem; }
      .event:nth-child(odd)::after, .event:nth-child(even)::after { left: 3px; right: auto; }
    }
  </style>
</head>
<body>
  <h1>Wetland restoration — 2026</h1>
  <div class="timeline">
    <div class="event">
      <div class="date">JAN</div><h3>Hydrology survey</h3>
      <p>Nine monitoring wells installed; baseline water table logged.</p>
    </div>
    <div class="event">
      <div class="date">MAR</div><h3>Earthworks</h3>
      <p>Two old drains breached and the scrapes re-profiled.</p>
    </div>
    <div class="event">
      <div class="date">JUN</div><h3>First breeding season</h3>
      <p>Lapwing territories up from 3 to 11.</p>
    </div>
    <div class="event">
      <div class="date">SEP</div><h3>Public path opens</h3>
      <p>Boardwalk and two hides completed.</p>
    </div>
  </div>
</body>
</html>
`),

    ex("webd-ex-013", "Landing page skeleton", "A complete page flow: header, hero, features, quote, CTA band, footer.", "HTML pages", "landing_page", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quarry — notebooks for fieldwork</title>
  <style>
    :root { --ink: #20262a; --paper: #fffdf8; --moss: #33695a; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; color: var(--ink); background: var(--paper); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem;
             border-bottom: 1px solid #e8e2d6; }
    .brand { font-weight: 800; letter-spacing: .02em; }
    nav a { margin-left: 1.2rem; color: var(--ink); text-decoration: none; }
    .hero { text-align: center; padding: 4.5rem 1.5rem 5rem; background: #f4efe6; }
    .hero h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 .6rem; }
    .hero p { max-width: 48ch; margin: 0 auto 1.6rem; color: #55605a; }
    .btn { display: inline-block; background: var(--moss); color: #fff; padding: .8rem 1.5rem;
           border-radius: 9px; text-decoration: none; font-weight: 700; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1.5rem;
                padding: 3rem 1.5rem; max-width: 68rem; margin: auto; }
    .feature h3 { margin: 0 0 .3rem; }
    .feature p { margin: 0; color: #5b645e; font-size: .95rem; }
    blockquote { text-align: center; font-style: italic; padding: 2.5rem 1.5rem; background: #f4efe6; }
    .cta-band { text-align: center; padding: 3.5rem 1.5rem; }
    footer { padding: 2rem 1.5rem; text-align: center; color: #8a8375; font-size: .85rem;
             border-top: 1px solid #e8e2d6; }
  </style>
</head>
<body>
  <header>
    <span class="brand">QUARRY</span>
    <nav>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a class="btn" style="padding:.5rem 1rem" href="#">Try it</a>
    </nav>
  </header>

  <section class="hero">
    <h1>Field notes that survive the field.</h1>
    <p>Waterproof thinking in a waterproof notebook. Grids, tally sheets,
       sketch pages — designed with ecologists, geologists and one very
       patient ornithologist.</p>
    <a class="btn" href="#">Start a free project</a>
  </section>

  <section class="features" id="features">
    <div class="feature"><h3>Rite-in-the-rain paper</h3><p>Works with pencil, soaked. Ask the waders team.</p></div>
    <div class="feature"><h3>Pre-printed tally grids</h3><p>Birds, plants, traffic — count without recounting.</p></div>
    <div class="feature"><h3>Scan-to-sheets</h3><p>Phone-scan a page; the QR corner files it.</p></div>
  </section>

  <blockquote>“The only notebook our river survey has ever finished.” — I. Vasquez, hydrologist</blockquote>

  <section class="cta-band">
    <h2>Season starts soon.</h2>
    <p><a class="btn" href="#">Order the starter kit</a></p>
  </section>

  <footer>Quarry Field Supplies · Dawson City, YK · <a href="#">hello@quarry.example</a></footer>
</body>
</html>
`),

    ex("webd-ex-014", "Product card", "An e-commerce product card: image, price, rating, variant swatches, add-to-cart.", "HTML pages", "product_card", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Merino base layer</title>
  <style>
    body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f3f4f2; font-family: system-ui, sans-serif; }
    .card { width: min(94vw, 21rem); background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 48px -32px rgba(0,0,0,.35); }
    .card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
    .info { padding: 1.1rem 1.2rem 1.3rem; }
    .cat { font-size: .72rem; letter-spacing: .16em; text-transform: uppercase; color: #98a09a; }
    h1 { font-size: 1.15rem; margin: .25rem 0; }
    .rating { color: #c9a13b; font-size: .85rem; }
    .rating span { color: #7a827c; margin-left: .3rem; }
    .price { font-size: 1.35rem; font-weight: 700; margin: .5rem 0 .2rem; }
    .price s { color: #a5aba6; font-weight: 400; font-size: .95rem; margin-left: .5rem; }
    .swatches { display: flex; gap: .5rem; margin: .8rem 0; }
    .swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1.5px #d4d8d4; cursor: pointer; }
    .swatch[aria-pressed="true"] { box-shadow: 0 0 0 2.5px #2c6e5b; }
    button { width: 100%; padding: .8rem; margin-top: .5rem; border: 0; border-radius: 10px;
             background: #2c6e5b; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    button:hover { background: #245849; }
  </style>
</head>
<body>
  <article class="card">
    <img src="https://placehold.co/420x420?text=base+layer" alt="Merino base layer, oat color">
    <div class="info">
      <p class="cat">Layers · Thermal</p>
      <h1>Featherweight merino base layer</h1>
      <p class="rating">★★★★☆ <span>4.6 (218)</span></p>
      <p class="price">$89 <s>$109</s></p>
      <div class="swatches" role="group" aria-label="Color">
        <button class="swatch" style="background:#e7ddc9" aria-pressed="true" aria-label="Oat"></button>
        <button class="swatch" style="background:#37403b" aria-pressed="false" aria-label="Slate"></button>
        <button class="swatch" style="background:#7c3f2d" aria-pressed="false" aria-label="Rust"></button>
      </div>
      <button type="button">Add to cart</button>
    </div>
  </article>
</body>
</html>
`),

    ex("webd-ex-015", "Event page", "A conference one-pager: date block, schedule, speakers grid, sponsor strip.", "HTML pages", "event_page", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signals Conf 2026</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; color: #e8f0ec; background: #10201b; }
    .top { padding: 3rem 1.5rem 2.5rem; text-align: center; }
    .date { font-size: .8rem; letter-spacing: .3em; color: #7fc8a9; }
    h1 { font-size: clamp(2.2rem, 6vw, 3.6rem); margin: .4rem 0 .6rem; }
    .when { display: flex; justify-content: center; gap: 2rem; margin: 1.5rem 0; }
    .when div { text-align: center; }
    .when .n { font-size: 2rem; font-weight: 800; color: #7fc8a9; }
    .when .l { font-size: .7rem; letter-spacing: .2em; text-transform: uppercase; color: #9db5a8; }
    .cta { display: inline-block; background: #7fc8a9; color: #10201b; font-weight: 800; padding: .8rem 2rem; border-radius: 10px; text-decoration: none; }
    section { max-width: 60rem; margin: 0 auto; padding: 2rem 1.5rem; }
    h2 { color: #7fc8a9; font-size: .8rem; letter-spacing: .25em; text-transform: uppercase; }
    .schedule { list-style: none; padding: 0; border-left: 2px solid #2a473c; }
    .schedule li { padding: .6rem 0 .6rem 1.2rem; position: relative; }
    .schedule li::before { content: ""; position: absolute; left: -6px; top: 1.1rem; width: 10px; height: 10px; border-radius: 50%; background: #7fc8a9; }
    .time { color: #9db5a8; font-variant-numeric: tabular-nums; margin-right: .8rem; }
    .speakers { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; }
    .speaker { background: #173028; border-radius: 12px; padding: 1rem; text-align: center; }
    .speaker .ava { width: 56px; height: 56px; border-radius: 50%; background: #2a473c; display: grid; place-items: center; margin: 0 auto .5rem; font-weight: 700; }
    .sponsors { text-align: center; color: #6e8f7f; font-size: .85rem; padding-bottom: 3rem; }
  </style>
</head>
<body>
  <div class="top">
    <p class="date">SEPTEMBER 3–4 · PORTLAND + ONLINE</p>
    <h1>Signals Conf</h1>
    <p>Two days about the unglamorous parts of data engineering.</p>
    <div class="when">
      <div><div class="n">62</div><div class="l">talks</div></div>
      <div><div class="n">4</div><div class="l">workshops</div></div>
      <div><div class="n">900</div><div class="l">seats</div></div>
    </div>
    <a class="cta" href="#">Get a ticket</a>
  </div>

  <section>
    <h2>Day one — highlights</h2>
    <ul class="schedule">
      <li><span class="time">09:30</span>Keynote: The batch that cried streaming</li>
      <li><span class="time">11:00</span>Schema drift: a field guide</li>
      <li><span class="time">14:15</span>Backfills without regret</li>
      <li><span class="time">17:00</span>Lightning talks &amp; coffee</li>
    </ul>
  </section>

  <section>
    <h2>Speakers</h2>
    <div class="speakers">
      <div class="speaker"><div class="ava">RA</div><strong>R. Aoyama</strong><br><small>Backfill Labs</small></div>
      <div class="speaker"><div class="ava">TK</div><strong>T. Kessler</strong><br><small>Lakehouse EU</small></div>
      <div class="speaker"><div class="ava">MD</div><strong>M. Diallo</strong><br><small>Creek Analytics</small></div>
      <div class="speaker"><div class="ava">SO</div><strong>S. Okoye</strong><br><small>Northwind</small></div>
    </div>
  </section>

  <p class="sponsors">Sponsored by Duct, Fjord &amp; Ledger · code of conduct · accessibility info</p>
</body>
</html>
`),

    ex("webd-ex-016", "Sticky nav with anchor scroll", "A page with a sticky navigation bar, scrollspy-ready sections and smooth scrolling.", "HTML pages", "sticky_nav", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Field manual</title>
  <style>
    html { scroll-behavior: smooth; scroll-padding-top: 4rem; }
    body { margin: 0; font-family: system-ui, sans-serif; }
    nav { position: sticky; top: 0; z-index: 10; display: flex; gap: 1.5rem;
          background: rgba(255,253,248,.92); backdrop-filter: blur(6px);
          border-bottom: 1px solid #e6e0d2; padding: .9rem 1.5rem; }
    nav a { color: #4d5a52; text-decoration: none; font-weight: 600; font-size: .9rem; }
    nav a:hover { color: #2c6e5b; }
    section { max-width: 44rem; margin: 0 auto; padding: 3.5rem 1.25rem 2rem; }
    section:nth-of-type(even) { background: #faf7f0; }
    h2 { margin-top: 0; color: #2c6e5b; }
    p { line-height: 1.65; color: #43504a; }
  </style>
</head>
<body>
  <nav aria-label="Sections">
    <a href="#packing">Packing</a>
    <a href="#weather">Weather</a>
    <a href="#safety">Safety</a>
    <a href="#checklist">Checklist</a>
  </nav>

  <section id="packing">
    <h2>Packing</h2>
    <p>Weight on the hips, not the shoulders. The heaviest items sit
       between the shoulder blades, close to the spine's neutral axis.</p>
  </section>
  <section id="weather">
    <h2>Weather</h2>
    <p>Read the forecast for the ridge, not the trailhead — summertime
       valley fog often means an inversion and a clear summit.</p>
  </section>
  <section id="safety">
    <h2>Safety</h2>
    <p>Leave the plan with two people, with a hard turnaround time.
       Turnaround times are decided at home, not at the crux.</p>
  </section>
  <section id="checklist">
    <h2>Checklist</h2>
    <p>Map · compass · headlamp · shelter · water · first aid · fire ·
       whistle · sun protection.</p>
  </section>
</body>
</html>
`),

    ex("webd-ex-017", "404 page", "A friendly error page: big type, a search box and links back into the site.", "HTML pages", "not_found_page", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page not found — Fjord Books</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; text-align: center;
           font-family: Georgia, serif; background: #f7f5f0; color: #2d2a24; padding: 2rem; }
    .code { font-family: ui-monospace, monospace; font-size: clamp(4rem, 18vw, 8rem); font-weight: 700;
            line-height: 1; color: #c9c2b2; margin: 0; }
    h1 { font-size: 1.4rem; margin: .6rem 0 .4rem; }
    p { color: #6c675c; max-width: 36ch; margin: 0 auto 1.6rem; }
    form { display: flex; max-width: 22rem; margin: 0 auto 1.4rem; }
    input { flex: 1; padding: .65rem .8rem; border: 1px solid #cfc8b8; border-radius: 8px 0 0 8px; font: inherit; }
    button { padding: .65rem 1rem; border: 0; background: #2d2a24; color: #fff; border-radius: 0 8px 8px 0; font: inherit; cursor: pointer; }
    .links a { display: inline-block; margin: 0 .6rem; color: #2d2a24; }
  </style>
</head>
<body>
  <main>
    <p class="code">404</p>
    <h1>This shelf is empty.</h1>
    <p>The page moved, or the address has a typo — the catalogue below
       can probably find what you were after.</p>
    <form action="/search" role="search">
      <input type="search" name="q" placeholder="Search the catalogue…" aria-label="Search">
      <button type="submit">Search</button>
    </form>
    <p class="links">
      <a href="/">Home</a> ·
      <a href="/new">New arrivals</a> ·
      <a href="/help">Help</a>
    </p>
  </main>
</body>
</html>
`),

    ex("webd-ex-018", "Email template", "A table-based, e-mail-client-safe template: preheader, hero button, columns.", "HTML pages", "email_template", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your weekly route report</title>
</head>
<body style="margin:0; background:#f0f2f0; font-family: Arial, Helvetica, sans-serif; color:#243038;">
  <!-- preheader: the inbox preview line -->
  <div style="display:none; max-height:0; overflow:hidden;">Five climbs, two rest days, one new grade.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding: 24px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:#203a34; color:#eef4f1; padding:18px 28px; font-weight:bold; letter-spacing:.05em;">
            SENDISTEIN
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px 8px;">
            <h1 style="margin:0 0 10px; font-size:22px;">Your week on the wall</h1>
            <p style="margin:0 0 18px; color:#5a6660; font-size:14px; line-height:1.6;">
              You logged <strong>5 climbing days</strong> and sent
              <strong>3 problems</strong> at your limit. The endurance block
              is clearly landing.
            </p>
            <a href="#" style="display:inline-block; background:#2c6e5b; color:#ffffff; padding:12px 22px;
               border-radius:6px; text-decoration:none; font-weight:bold; font-size:14px;">
              Open the full report
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="48%" style="font-size:13px; color:#5a6660;">
                  <strong style="display:block; font-size:18px; color:#203a34;">18h 40m</strong>
                  total wall time
                </td>
                <td width="4%">&nbsp;</td>
                <td width="48%" style="font-size:13px; color:#5a6660;">
                  <strong style="display:block; font-size:18px; color:#203a34;">6A+</strong>
                  best flash this week
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f2f5f3; padding:16px 28px; font-size:12px; color:#8a938d;">
            You receive this because you track sessions in Sendistein.
            <a href="#" style="color:#2c6e5b;">Unsubscribe</a> ·
            <a href="#" style="color:#2c6e5b;">Preferences</a>
          </td>
        </tr>
      </table>

    </td></tr>
  </table>
</body>
</html>
`),

    ex("webd-ex-019", "Newsletter archive", "An issue list with dates and tags — a content-site index pattern.", "HTML pages", "newsletter_archive", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Archive — The Slow Beam</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #fcfcf9; color: #26292a; }
    main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.25rem; }
    h1 { font-weight: 800; letter-spacing: -.01em; }
    .issue { display: flex; gap: 1rem; align-items: baseline; padding: 1rem 0; border-bottom: 1px solid #e8e8e0; }
    .issue time { font-variant-numeric: tabular-nums; color: #98a099; font-size: .8rem; white-space: nowrap; }
    .issue a { color: #26292a; text-decoration: none; font-weight: 600; }
    .issue a:hover { color: #2c6e5b; }
    .tag { font-size: .68rem; border: 1px solid #ccd6cf; color: #5c6a62; border-radius: 99px; padding: .1rem .55rem; margin-left: auto; white-space: nowrap; }
    .stats { color: #8b948d; font-size: .85rem; margin-top: 1.2rem; }
  </style>
</head>
<body>
  <main>
    <h1>The Slow Beam</h1>
    <p class="stats">A weekly letter about radio, listening and patience · 128 issues</p>

    <div class="issue">
      <time datetime="2026-11-06">2026-11-06</time>
      <a href="#">Listening to the static between stations</a>
      <span class="tag">field notes</span>
    </div>
    <div class="issue">
      <time datetime="2026-10-30">2026-10-30</time>
      <a href="#">A half-hour with a broken converter</a>
      <span class="tag">repair</span>
    </div>
    <div class="issue">
      <time datetime="2026-10-23">2026-10-23</time>
      <a href="#">Numbers stations: the logistics of mystery</a>
      <span class="tag">history</span>
    </div>
    <div class="issue">
      <time datetime="2026-10-16">2026-10-16</time>
      <a href="#">Why FM sounds warm (it's math)</a>
      <span class="tag">theory</span>
    </div>
    <div class="issue">
      <time datetime="2026-10-09">2026-10-09</time>
      <a href="#">Antenna on the roof, finally</a>
      <span class="tag">projects</span>
    </div>
  </main>
</body>
</html>
`),

    ex("webd-ex-020", "Documentation page", "API docs pattern: sidebar TOC, inline code, a code block and a parameter table.", "HTML pages", "docs_page", ".html",
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GET /tides — Harbour API</title>
  <style>
    body { display: flex; font-family: system-ui, sans-serif; margin: 0; color: #232a27; }
    aside { width: 220px; border-right: 1px solid #e4e9e5; padding: 1.5rem; font-size: .85rem; }
    aside h3 { font-size: .7rem; text-transform: uppercase; letter-spacing: .15em; color: #8a948d; }
    aside a { display: block; color: #2c6e5b; text-decoration: none; padding: .25rem 0; }
    main { max-width: 52rem; padding: 2rem 2.5rem; line-height: 1.6; }
    code { background: #eef3ef; border-radius: 4px; padding: .1rem .35rem; font-size: .9em;
           font-family: ui-monospace, monospace; }
    pre { background: #16211c; color: #d7e6dd; padding: 1rem 1.2rem; border-radius: 10px; overflow: auto; }
    pre code { background: none; color: inherit; padding: 0; }
    table { border-collapse: collapse; width: 100%; font-size: .9rem; }
    th, td { text-align: left; padding: .5rem .7rem; border-bottom: 1px solid #e4e9e5; }
    th { background: #f5f8f5; }
    .method { font-weight: 800; color: #fff; background: #2c6e5b; padding: .2rem .6rem; border-radius: 5px; font-size: .8rem; }
  </style>
</head>
<body>
  <aside>
    <h3>Reference</h3>
    <a href="#stations">Stations</a>
    <a href="#tides">Tides</a>
    <a href="#currents">Currents</a>
    <h3>Guides</h3>
    <a href="#auth">Authentication</a>
    <a href="#errors">Error codes</a>
  </aside>
  <main>
    <h1><span class="method">GET</span> /v1/tides</h1>
    <p>Returns the predicted high / low waters for a station, in local time.</p>

    <h2>Parameters</h2>
    <table>
      <tr><th>Name</th><th>Type</th><th>Description</th></tr>
      <tr><td><code>station</code></td><td>string</td><td>Station id, e.g. <code>nl-rot-2</code>. Required.</td></tr>
      <tr><td><code>days</code></td><td>integer</td><td>1–14, default 2.</td></tr>
      <tr><td><code>unit</code></td><td>string</td><td><code>m</code> or <code>ft</code>, default <code>m</code>.</td></tr>
    </table>

    <h2>Example</h2>
    <pre><code>curl "https://api.harbour.example/v1/tides?station=nl-rot-2&amp;days=1" \\
  -H "Authorization: Bearer $HARBOUR_TOKEN"</code></pre>

    <h2>Response</h2>
    <pre><code>{
  "station": "nl-rot-2",
  "unit": "m",
  "events": [
    { "type": "high", "time": "2026-11-14T03:12+01:00", "height": 2.31 },
    { "type": "low",  "time": "2026-11-14T09:40+01:00", "height": 0.55 }
  ]
}</code></pre>
  </main>
</body>
</html>
`),

    ex("webd-ex-021", "Modern CSS reset", "The sane baseline: box-sizing, margin zero, media defaults, form font inheritance.", "CSS stylesheets", "reset", ".css",
        `/* Modern reset — the minimal baseline every project deserves.
   Based on the patterns popularized by the "modern reset" school:
   inheritance-first, opinion-free about typography scale. */

*,
*::before,
*::after {
  box-sizing: border-box;          /* width means border-box width */
}

* {
  margin: 0;                       /* spacing is designed, not defaulted */
}

html {
  -moz-text-size-adjust: none;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;          /* mobile Safari zoom control */
}

body {
  line-height: 1.5;                /* WCAG-friendly default */
  -webkit-font-smoothing: antialiased;
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;                 /* media never overflows */
}

input, button, textarea, select {
  font: inherit;                   /* forms stop shrinking text */
}

p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;       /* long words can't push layouts */
}

ul[role='list'], ol[role='list'] { /* Safari strips list styles on role */
  list-style: none;
  padding: 0;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`),

    ex("webd-ex-022", "Flexbox layout sheet", "Classic flex patterns as utility classes: navbar, toolbar, card row, sticky footer.", "CSS stylesheets", "flexbox_layout", ".css",
        `/* Flexbox patterns — the four layouts that cover 90% of pages. */

/* 1. The horizontal nav: brand left, links right. */
.nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.nav .brand { margin-right: auto; }        /* pushes the rest right */

/* 2. Toolbar: wraps on narrow screens. */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  align-items: center;
}
.toolbar .spacer { margin-left: auto; }    /* pins the trailing item */

/* 3. Equal-height card row. */
.cards {
  display: flex;
  gap: 1rem;
}
.cards > * {
  flex: 1 1 240px;                         /* grow, shrink, base */
}
.cards > * footer {
  margin-top: auto;                        /* pinned to card bottom */
  display: flex;
  justify-content: flex-end;
}

/* 4. Sticky footer page shell. */
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.page main { flex: 1; }

/* Centering utility — the famous three lines. */
.center-absolute {
  display: flex;
  align-items: center;
  justify-content: center;
}
`),

    ex("webd-ex-023", "CSS Grid layout sheet", "Named areas, auto-fit grids and the holy-grail layout — grid as a page language.", "CSS stylesheets", "grid_layout", ".css",
        `/* Grid patterns — page scaffolding as a declaration. */

/* The holy grail: header, sidebar, content, footer. */
.holy-grail {
  display: grid;
  grid-template:
    "header header" 56px
    "side   main  " 1fr
    "footer footer" 40px / 220px 1fr;
  min-height: 100vh;
}
.holy-grail > header { grid-area: header; }
.holy-grail > aside  { grid-area: side; }
.holy-grail > main   { grid-area: main; }
.holy-grail > footer { grid-area: footer; }

@media (max-width: 720px) {
  .holy-grail {
    grid-template:
      "header" auto
      "main  " 1fr
      "side  " auto
      "footer" auto / 1fr;
  }
}

/* The responsive card wall — no media queries needed. */
.card-wall {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

/* A 12-column page grid with a max measure. */
.page-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1rem;
  max-width: 72rem;
  margin-inline: auto;
}
.page-grid .article { grid-column: span 8; }
.page-grid .rail    { grid-column: span 4; }
@media (max-width: 900px) {
  .page-grid .article, .page-grid .rail { grid-column: 1 / -1; }
}

/* Auto rows keep masonry-ish rhythm for mixed cards. */
.tiled {
  display: grid;
  grid-auto-rows: 8rem;
  grid-auto-flow: dense;
}
.tiled .wide { grid-column: span 2; }
.tiled .tall { grid-row: span 2; }
`),

    ex("webd-ex-024", "Responsive breakpoints", "Mobile-first breakpoints as custom media queries + fluid type via clamp.", "CSS stylesheets", "responsive", ".css",
        `/* Mobile-first responsive utilities. */

:root {
  --bp-sm: 40em;      /* 640px  — large phones */
  --bp-md: 48em;      /* 768px  — tablets */
  --bp-lg: 64em;      /* 1024px — laptops */
  --bp-xl: 80em;      /* 1280px — desktops */
}

/* Fluid type: grows smoothly between the breakpoints. */
h1 { font-size: clamp(1.75rem, 1.2rem + 2.5vw, 3.25rem); }
h2 { font-size: clamp(1.35rem, 1.1rem + 1.2vw, 2rem); }
p  { font-size: clamp(1rem, 0.95rem + 0.3vw, 1.125rem); }

/* Section paddings that breathe with the viewport. */
section { padding: clamp(1.5rem, 4vw, 4rem) clamp(1rem, 3vw, 3rem); }

/* Layout switching, mobile-first: */
.split { display: grid; gap: 1.25rem; }
@media (min-width: 48em) {
  .split { grid-template-columns: 1fr 1fr; }
}
@media (min-width: 64em) {
  .split { grid-template-columns: 2fr 1fr; gap: 2rem; }
}

/* Hide per breakpoint (sparingly!). */
.hide-mobile  { display: none; }
@media (min-width: 48em) {
  .hide-mobile { display: revert; }
  .hide-desktop { display: none; }
}

/* Container-relative units for component sizing: */
.card { padding: 5% 6%; }
.badge { inline-size: max-content; }
`),

    ex("webd-ex-025", "Dark mode variables", "A light/dark theme pair built on custom properties + prefers-color-scheme.", "CSS stylesheets", "dark_mode", ".css",
        `/* Theming with custom properties — one palette, two worlds. */

:root {
  color-scheme: light;
  --bg: #fbfaf7;
  --surface: #ffffff;
  --ink: #22262a;
  --ink-soft: #5b6461;
  --line: #e6e3da;
  --brand: #2c6e5b;
  --brand-ink: #ffffff;
  --shadow: 0 12px 30px -18px rgb(34 38 42 / 0.35);
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #12171a;
    --surface: #1a2125;
    --ink: #e7ebe8;
    --ink-soft: #9aa5a0;
    --line: #2a3338;
    --brand: #58b394;
    --brand-ink: #0f1714;
    --shadow: 0 12px 30px -14px rgb(0 0 0 / 0.6);
  }
}

/* A manual toggle class — wire it to a button if you want both modes
   independent of the OS setting. */
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #12171a;
  --surface: #1a2125;
  --ink: #e7ebe8;
  --ink-soft: #9aa5a0;
  --line: #2a3338;
  --brand: #58b394;
  --brand-ink: #0f1714;
}

body {
  background: var(--bg);
  color: var(--ink);
  transition: background-color .25s ease, color .25s ease;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}

/* Elevation + tint keep contrast legible in BOTH themes. */
.button {
  background: var(--brand);
  color: var(--brand-ink);
}
.button:hover { filter: brightness(1.08); }
`),

    ex("webd-ex-026", "Typography scale sheet", "A modular type scale, measure control and vertical rhythm utilities.", "CSS stylesheets", "typography_scale", ".css",
        `/* Typography system — scale, measure, rhythm. */

:root {
  /* 1.25 ratio ("major third") on a 1rem body. */
  --step--1: clamp(0.83rem, 0.81rem + 0.12vw, 0.89rem);
  --step-0:  clamp(1.00rem, 0.96rem + 0.18vw, 1.08rem);
  --step-1:  clamp(1.25rem, 1.17rem + 0.35vw, 1.38rem);
  --step-2:  clamp(1.56rem, 1.41rem + 0.68vw, 1.79rem);
  --step-3:  clamp(1.95rem, 1.69rem + 1.17vw, 2.33rem);
  --step-4:  clamp(2.44rem, 2.00rem + 1.93vw, 3.02rem);

  --measure: 66ch;            /* the comfortable line length */
  --leading-tight: 1.25;
  --leading-body: 1.6;
  --tracking-tight: -0.015em;
}

body {
  font-size: var(--step-0);
  line-height: var(--leading-body);
}

h1, h2, h3 {
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  text-wrap: balance;         /* headlines break at nice points */
}
h1 { font-size: var(--step-4); }
h2 { font-size: var(--step-3); }
h3 { font-size: var(--step-2); }
h4 { font-size: var(--step-1); }
small { font-size: var(--step--1); }

p {
  max-width: var(--measure);
  text-wrap: pretty;          /* subtle last-line fixing */
  margin-block: 0 .9em;
}

/* Rhythm helpers on a 4px baseline. */
.flow > * + * { margin-block-start: 1em; }
.flow-lg > * + * { margin-block-start: 1.6em; }

/* Numerals in tables and code line up. */
.tabular { font-variant-numeric: tabular-nums; }

/* Old-style figures for prose, lining for data. */
.prose { font-variant-numeric: oldstyle-nums; }
`),

    ex("webd-ex-027", "Buttons sheet", "Primary/ghost/danger button set with sizes, states and a loading spinner.", "CSS stylesheets", "buttons", ".css",
        `/* Buttons — one base, three intents, three sizes. */

.btn {
  --btn-bg: #2c6e5b;
  --btn-ink: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .5rem;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--btn-bg);
  color: var(--btn-ink);
  font: inherit;
  font-weight: 700;
  line-height: 1;
  padding: .7rem 1.15rem;
  cursor: pointer;
  transition: filter .15s ease, translate .06s ease, box-shadow .15s ease;
}
.btn:hover  { filter: brightness(1.07); box-shadow: 0 6px 16px -10px rgb(0 0 0 / .5); }
.btn:active { translate: 0 1px; }

/* Focus ring visible to keyboards only. */
.btn:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--btn-bg) 55%, white);
  outline-offset: 2px;
}

/* Intent variants. */
.btn--ghost {
  --btn-bg: transparent;
  --btn-ink: #2c6e5b;
  border-color: currentColor;
}
.btn--danger { --btn-bg: #a53d2f; }
.btn--link   { --btn-bg: transparent; --btn-ink: #2c6e5b; padding-inline: 0; text-decoration: underline; }

/* Sizes. */
.btn--sm { padding: .45rem .8rem;  font-size: .85rem; border-radius: 7px; }
.btn--lg { padding: .95rem 1.6rem; font-size: 1.05rem; }

/* The busy state — pairs with [aria-busy="true"] on the button. */
.btn[aria-busy="true"] { color: transparent; position: relative; pointer-events: none; }
.btn[aria-busy="true"]::after {
  content: "";
  position: absolute;
  width: 1em; height: 1em;
  border: 2.5px solid rgb(255 255 255 / .4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: btn-spin .7s linear infinite;
}
@keyframes btn-spin { to { transform: rotate(1turn); } }

/* Full-width mobile pattern. */
.btn--block { display: flex; width: 100%; }
`),

    ex("webd-ex-028", "Card components", "Four card recipes: flat, outlined, elevated and media — with hover affordances.", "CSS stylesheets", "cards", ".css",
        `/* Cards — four elevations, one anatomy. */

.card {
  display: grid;
  gap: .75rem;
  padding: 1.25rem;
  border-radius: 14px;
  background: #fff;
  max-width: 24rem;
}

/* 1. Flat — quiet lists, dense UIs. */
.card--flat { background: #f3f5f2; }

/* 2. Outlined — the neutral default. */
.card--outline { border: 1px solid #e3e7e2; }

/* 3. Elevated — a single soft shadow, no stacking. */
.card--elevated {
  border: 1px solid #e7ebe7;
  box-shadow: 0 18px 40px -28px rgb(20 32 27 / .35);
}

/* 4. Media card — image header + body + pinned action row. */
.card--media {
  padding: 0;
  overflow: hidden;
  grid-template-areas: "media" "body" "foot";
}
.card--media .media {
  grid-area: media;
  aspect-ratio: 16 / 9;
  width: 100%;
  object-fit: cover;
}
.card--media .body  { grid-area: body;  padding: 1rem 1.25rem 0; }
.card--media .foot  { grid-area: foot;  padding: 0 1.25rem 1.1rem; display: flex; gap: .5rem; }

/* Interactive card: the whole card is the link target. */
.card--link {
  position: relative;
  transition: translate .12s ease, box-shadow .15s ease;
}
.card--link:hover { translate: 0 -3px; box-shadow: 0 22px 44px -26px rgb(20 32 27 / .4); }
.card--link:focus-within { outline: 2px solid #2c6e5b; outline-offset: 3px; }
.card--link .stretched-link::after {
  content: "";
  position: absolute;
  inset: 0;
}

/* Meta row + title clamp. */
.card .meta { display: flex; gap: .8rem; color: #7b857f; font-size: .78rem; }
.card h3 {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`),

    ex("webd-ex-029", "Forms sheet", "Field, label, hint, error and disabled states — with the focus ring done right.", "CSS stylesheets", "forms", ".css",
        `/* Forms — labels above, hints below, errors in words. */

.field {
  display: grid;
  gap: .3rem;
  margin-block-end: 1.1rem;
}

.field > label {
  font-size: .88rem;
  font-weight: 700;
  color: #37423d;
}
.field .hint { font-size: .78rem; color: #77817b; font-weight: 400; }
.field .error {
  font-size: .8rem;
  color: #a53d2f;
  font-weight: 600;
  display: none;                 /* shown only when data-invalid */
}
.field[data-invalid="true"] .error { display: block; }

/* The control itself. */
.field input,
.field select,
.field textarea {
  font: inherit;
  color: #22282a;
  background: #fff;
  border: 1.5px solid #c7cec8;
  border-radius: 9px;
  padding: .6rem .75rem;
  width: 100%;
}
.field textarea { resize: vertical; min-height: 6rem; }

/* One focus ring to rule them all. */
.field :is(input, select, textarea):focus-visible {
  outline: none;
  border-color: #2c6e5b;
  box-shadow: 0 0 0 3px color-mix(in srgb, #2c6e5b 25%, transparent);
}

/* Invalid only after the user touched the field. */
.field[data-invalid="true"] :is(input, select, textarea) {
  border-color: #a53d2f;
  box-shadow: 0 0 0 3px color-mix(in srgb, #a53d2f 18%, transparent);
}

/* Disabled ≠ invisible — communicate it. */
.field :is(input, select, textarea):disabled {
  background: #eef1ee;
  color: #8a938d;
  cursor: not-allowed;
}

/* Checkboxes with a bigger hit area. */
.choice { display: flex; gap: .6rem; align-items: center; font-size: .92rem; }
.choice input { width: 1.1rem; height: 1.1rem; accent-color: #2c6e5b; }

/* The actions row. */
.form-actions {
  display: flex;
  gap: .8rem;
  align-items: center;
  margin-top: 1.6rem;
}
`),

    ex("webd-ex-030", "Navbar sheet", "A responsive navbar: logo, links, active state, and the checkbox-free mobile drawer.", "CSS stylesheets", "navbar", ".css",
        `/* Navbar — desktop row, mobile column, zero JS required
   (pair with a <input type="checkbox" id="nav-toggle"> pattern). */

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: color-mix(in srgb, #fffdf8 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e7e2d6;
}

.nav {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  max-width: 68rem;
  margin-inline: auto;
  padding: .8rem 1.25rem;
}

.nav .brand {
  font-weight: 800;
  letter-spacing: .04em;
  color: #26302b;
  text-decoration: none;
  margin-right: auto;
}

.nav .links { display: flex; gap: 1.1rem; }
.nav .links a {
  color: #4c5751;
  text-decoration: none;
  font-weight: 600;
  font-size: .92rem;
  padding: .35rem .1rem;
  border-bottom: 2px solid transparent;
  transition: color .15s ease, border-color .15s ease;
}
.nav .links a:hover { color: #2c6e5b; }
.nav .links a[aria-current="page"] {
  color: #2c6e5b;
  border-bottom-color: #2c6e5b;
}

/* The hamburger toggle (hidden checkbox). */
.nav-toggle { display: none; }
.nav-toggle-label {
  display: none;
  cursor: pointer;
  padding: .4rem;
  border-radius: 6px;
}
.nav-toggle-label:hover { background: #eef2ed; }
.nav-toggle-label span,
.nav-toggle-label span::before,
.nav-toggle-label span::after {
  display: block;
  width: 22px; height: 2px;
  background: #26302b;
  content: "";
  position: relative;
  transition: transform .2s ease, top .2s ease;
}
.nav-toggle-label span::before { top: -7px; }
.nav-toggle-label span::after  { top: 5px; }

@media (max-width: 640px) {
  .nav-toggle-label { display: block; order: 3; }
  .nav .links {
    display: none;
    flex-direction: column;
    width: 100%;
    padding-top: .8rem;
  }
  .nav-toggle:checked ~ .links { display: flex; }
  .nav { flex-wrap: wrap; }
}
`),

    ex("webd-ex-031", "Sidebar sheet", "A fixed-width app sidebar: sections, active item, badges and a collapse mode.", "CSS stylesheets", "sidebar", ".css",
        `/* App sidebar — sections, active item, badge counts. */

.sidebar {
  width: 248px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #141d19;
  color: #cfd9d2;
  padding: 1rem .8rem;
  gap: .2rem;
}

.sidebar .brand {
  color: #fff;
  font-weight: 800;
  padding: .6rem .7rem 1rem;
  letter-spacing: .05em;
}

.sidebar .section-label {
  font-size: .68rem;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #6c7a72;
  padding: 1rem .7rem .35rem;
}

.sidebar a.item {
  display: flex;
  align-items: center;
  gap: .65rem;
  padding: .55rem .7rem;
  border-radius: 8px;
  color: #cfd9d2;
  text-decoration: none;
  font-size: .92rem;
  position: relative;
}
.sidebar a.item:hover { background: #1d2924; color: #fff; }

.sidebar a.item[aria-current="page"] {
  background: #223530;
  color: #ffffff;
}
.sidebar a.item[aria-current="page"]::before {
  content: "";
  position: absolute;
  left: -0.8rem;
  top: 18%;
  bottom: 18%;
  width: 3px;
  border-radius: 3px;
  background: #58b394;
}

.sidebar .badge {
  margin-left: auto;
  font-size: .68rem;
  font-weight: 700;
  background: #2c4a3f;
  color: #9fe0c3;
  padding: .1rem .5rem;
  border-radius: 99px;
}

.sidebar .foot {
  margin-top: auto;
  padding: .8rem .7rem 0;
  border-top: 1px solid #22302a;
  font-size: .78rem;
  color: #6c7a72;
}

/* Collapsed rail — icons only. */
.sidebar.collapsed { width: 64px; }
.sidebar.collapsed .label, .sidebar.collapsed .badge { display: none; }
.sidebar.collapsed .section-label { text-align: center; }
`),

    ex("webd-ex-032", "Keyframe animations", "Reusable animations: fade-up entrances, pulse, shake and a skeleton shimmer.", "CSS stylesheets", "animations", ".css",
        `/* Keyframes — small, purposeful motion. */

@keyframes fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: none; }
}
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pulse {
  50% { scale: 1.12; opacity: .75; }
}
@keyframes shake {
  10%, 90% { translate: -1px 0; }
  30%, 70% { translate: 3px 0; }
  50% { translate: -4px 0; }
}
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}

/* Entrance with a stagger — set --i per child. */
.stagger > * {
  animation: fade-up .5s cubic-bezier(.2,.7,.3,1) both;
  animation-delay: calc(var(--i, 0) * 70ms);
}

/* A live status dot. */
.dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  background: #2c8a4b;
  animation: pulse 1.8s ease-in-out infinite;
}

/* Invalid input nudge (pair with aria-invalid). */
.shake { animation: shake .4s ease; }

/* Skeleton loading blocks. */
.skeleton {
  border-radius: 8px;
  background: linear-gradient(90deg, #eceeea 25%, #f6f7f4 45%, #eceeea 65%);
  background-size: 200% 100%;
  animation: shimmer 1.3s linear infinite;
}
.skeleton--text { height: .9rem;  margin: .35rem 0; }
.skeleton--title { height: 1.6rem; margin-bottom: .8rem; width: 60%; }
.skeleton--avatar { width: 44px; height: 44px; border-radius: 50%; }

/* Respect the user's motion preference — always. */
@media (prefers-reduced-motion: reduce) {
  [class] { animation: none !important; transition: none !important; }
}
`),

    ex("webd-ex-033", "Transitions and hovers", "Micro-interactions: lifts, underlines, image zooms and a spring-y press.", "CSS stylesheets", "transitions", ".css",
        `/* Transitions — the hover vocabulary of a calm interface. */

/* The default: everything animates position, color and shadow politely. */
:root { --ease-out: cubic-bezier(.2, .7, .3, 1); --t: 180ms; }

.lift {
  transition: translate var(--t) var(--ease-out),
              box-shadow var(--t) var(--ease-out);
}
.lift:hover {
  translate: 0 -4px;
  box-shadow: 0 16px 30px -20px rgb(20 30 25 / .45);
}

/* Underline that draws itself from the left. */
.link-draw {
  text-decoration: none;
  background: linear-gradient(currentColor, currentColor) bottom left / 0% 2px no-repeat;
  transition: background-size var(--t) var(--ease-out);
  padding-bottom: 2px;
}
.link-draw:hover, .link-draw:focus-visible { background-size: 100% 2px; }

/* Media zoom — the mask, not the image, moves the eye. */
.zoom-frame { overflow: hidden; }
.zoom-frame img {
  transition: scale 420ms var(--ease-out);
  display: block;
  width: 100%;
}
.zoom-frame:hover img { scale: 1.06; }

/* Button press with a real spring feel. */
.press { transition: scale 120ms var(--ease-out); }
.press:active { scale: .96; }

/* Reveal a hidden element on parent hover. */
.hover-reveal .extra {
  opacity: 0;
  translate: 0 6px;
  transition: opacity var(--t) var(--ease-out), translate var(--t) var(--ease-out);
}
.hover-reveal:hover .extra,
.hover-reveal:focus-within .extra { opacity: 1; translate: none; }

/* Color-only theme swap transition (put on body). */
.theme-anim { transition: background-color .3s ease, color .3s ease; }
`),

    ex("webd-ex-034", "Shadows and elevation", "A five-step elevation scale in custom properties — one light source, coherent depth.", "CSS stylesheets", "shadows", ".css",
        `/* Elevation — one light source, five planes. */

:root {
  /* All shadows point DOWN; blur and spread grow with height.
     The rgb() base keeps the tokens recolorable per theme. */
  --elevation-1: 0 1px  2px  rgb(23 31 27 / .08);
  --elevation-2: 0 2px  6px  rgb(23 31 27 / .10),
                  0 1px  2px  rgb(23 31 27 / .08);
  --elevation-3: 0 6px 14px -4px rgb(23 31 27 / .12),
                  0 2px  4px  rgb(23 31 27 / .08);
  --elevation-4: 0 14px 30px -8px rgb(23 31 27 / .18),
                  0 4px  8px  rgb(23 31 27 / .07);
  --elevation-5: 0 28px 60px -12px rgb(23 31 27 / .25);
}

/* Dark theme: deeper, softer — light absorbs. */
[data-theme="dark"] {
  --elevation-1: 0 1px 2px rgb(0 0 0 / .4);
  --elevation-2: 0 2px 6px rgb(0 0 0 / .45);
  --elevation-3: 0 6px 16px rgb(0 0 0 / .5);
  --elevation-4: 0 14px 34px rgb(0 0 0 / .55);
  --elevation-5: 0 30px 70px rgb(0 0 0 / .6);
}

/* Map elevations to UI meaning, not to numbers. */
.resting  { box-shadow: var(--elevation-1); }
.raised   { box-shadow: var(--elevation-2); }
.dropdown { box-shadow: var(--elevation-3); }
.drawer   { box-shadow: var(--elevation-4); }
.modal    { box-shadow: var(--elevation-5); }

/* Dialogs get a scrim that matches the depth. */
.scrim { background: rgb(15 20 18 / .45); backdrop-filter: blur(2px); }

/* Hover moves the element UP a plane — never sideways. */
.pop {
  box-shadow: var(--elevation-2);
  transition: box-shadow 160ms ease, translate 160ms ease;
}
.pop:hover {
  box-shadow: var(--elevation-3);
  translate: 0 -2px;
}
`),

    ex("webd-ex-035", "Spacing utilities", "The 4px-baseline spacing scale as margin/padding/gap utilities with logical properties.", "CSS stylesheets", "spacing", ".css",
        `/* Spacing — a 4px baseline, logical properties throughout. */

:root {
  --space-1: 0.25rem;   /*  4px */
  --space-2: 0.5rem;    /*  8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.5rem;    /* 24px */
  --space-6: 2rem;      /* 32px */
  --space-7: 3rem;      /* 48px */
  --space-8: 4rem;      /* 64px */
  --space-9: 6rem;      /* 96px */
}

/* Margin utilities (logical: block = vertical, inline = horizontal). */
.m-1 { margin: var(--space-1); }  .m-2 { margin: var(--space-2); }
.m-4 { margin: var(--space-4); }  .m-6 { margin: var(--space-6); }
.mt-2 { margin-block-start: var(--space-2); }
.mt-4 { margin-block-start: var(--space-4); }
.mt-6 { margin-block-start: var(--space-6); }
.mb-2 { margin-block-end:   var(--space-2); }
.mb-4 { margin-block-end:   var(--space-4); }
.ml-auto { margin-inline-start: auto; }
.mx-auto { margin-inline: auto; }
.my-4  { margin-block: var(--space-4); }
.mx-4  { margin-inline: var(--space-4); }

/* Padding utilities. */
.p-2 { padding: var(--space-2); }  .p-4 { padding: var(--space-4); }
.p-6 { padding: var(--space-6); }
.px-4 { padding-inline: var(--space-4); }
.py-4 { padding-block: var(--space-4); }
.pt-6 { padding-block-start: var(--space-6); }

/* Gap utilities (the modern spacing primitive). */
.gap-1 { gap: var(--space-1); }  .gap-2 { gap: var(--space-2); }
.gap-4 { gap: var(--space-4); }  .gap-6 { gap: var(--space-6); }

/* The stack: space BETWEEN children only — no first/last gaps. */
.stack > * + * { margin-block-start: var(--stack, var(--space-4)); }
.stack-sm { --stack: var(--space-2); }
.stack-lg { --stack: var(--space-6); }

/* Section rhythm. */
.section { padding-block: clamp(var(--space-6), 8vw, var(--space-9)); }
`),

    ex("webd-ex-036", "Table styles", "Readable data tables: sticky header, zebra with taste, numeric columns, row hover.", "CSS stylesheets", "tables", ".css",
        `/* Data tables — for eyes that scan. */

.data-table {
  border-collapse: collapse;
  width: 100%;
  font-size: .92rem;
  font-variant-numeric: tabular-nums;   /* digits line up */
}

.data-table caption {
  text-align: start;
  font-weight: 700;
  padding-block-end: .6rem;
  color: #2a3330;
}

.data-table th {
  position: sticky;                     /* survives long scrolls */
  top: 0;
  background: #f1f4f1;
  text-align: start;
  font-size: .74rem;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #5d6862;
  padding: .6rem .8rem;
  border-block-end: 2px solid #d4dad4;
}

.data-table td {
  padding: .55rem .8rem;
  border-block-end: 1px solid #e8ecea;
  color: #333b37;
}

/* Zebra rows — a whisper, not a stripe. */
.data-table tbody tr:nth-child(even) { background: #fafbfa; }
.data-table tbody tr:hover { background: #eef5f1; }

/* Column semantics, not appearance, drives alignment. */
.data-table td.num, .data-table th.num { text-align: end; }
.data-table td.ctr { text-align: center; }

/* Right-align currency and keep symbols quiet. */
.money { text-align: end; color: #333b37; }
.money .cur { color: #8b958e; font-size: .85em; margin-inline-end: .2rem; }

/* Status cells as inline pills. */
.pill {
  display: inline-block;
  padding: .1rem .55rem;
  border-radius: 99px;
  font-size: .74rem;
  font-weight: 700;
}
.pill--ok    { background: #e3f2e8; color: #256b43; }
.pill--warn  { background: #fdf1dc; color: #96651a; }
.pill--error { background: #fbe7e3; color: #a53d2f; }

/* Wide tables scroll horizontally INSIDE their own pane. */
.table-wrap { overflow-x: auto; border: 1px solid #e8ecea; border-radius: 10px; }
.table-wrap .data-table { border: 0; }
`),

    ex("webd-ex-037", "Print stylesheet", "Print styles done right: hide chrome, expand links, avoid page-break tears.", "CSS stylesheets", "print", ".css",
        `/* Print — the stylesheet every page forgets. */

@media print {
  /* Reset to the paper metaphor. */
  :root { color-scheme: light; }

  body {
    background: #fff !important;
    color: #000 !important;
    font-size: 11.5pt;               /* print points, not pixels */
    line-height: 1.45;
  }

  /* Chrome that makes no sense on paper. */
  nav, aside, footer .links,
  .no-print, [role="navigation"],
  video, audio, iframe {
    display: none !important;
  }

  /* Links: print the destination, keep the text. */
  a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: .85em;
    color: #444;
    word-break: break-all;
  }

  /* Expand collapsed content — hidden answers defeat printouts. */
  details:not([open]) > *:not(summary) { display: block !important; }
  details > summary { font-weight: 700; }

  /* Keep figures and their captions together. */
  figure, blockquote, table, .keep-together {
    break-inside: avoid;
  }
  figcaption { text-align: center; font-style: italic; font-size: .9em; }

  /* Page breaks: headings never dangle at the bottom. */
  h1, h2, h3 { break-after: avoid; }
  hr { border: 0; border-top: 1px solid #999; }

  /* URLs printed in running footers (Chrome). */
  @page {
    margin: 1.6cm;
    @bottom-right { content: counter(page) " / " counter(pages); }
  }

  /* Backgrounds & shadows are meaningless on paper. */
  * { box-shadow: none !important; text-shadow: none !important; }
}
`),

    ex("webd-ex-038", "Accessible focus states", "Focus-visible done properly: strong rings, skip links and never outline:none.", "CSS stylesheets", "focus", ".css",
        `/* Focus — the keyboard user's cursor. Never remove it. */

/* The one rule that cannot be broken:
   :focus { outline: none; }   <-- never this. */

/* Show the ring for KEYBOARD focus only — mouse clicks stay clean. */
:focus-visible {
  outline: 3px solid #174d3e;
  outline-offset: 2px;
  border-radius: 4px;             /* rings follow rounded corners */
}

/* Rings that must live INSIDE overflow-hidden parents. */
.focus-inset:focus-visible {
  outline-offset: -3px;
}

/* High-contrast alternative for overlays. */
.modal :focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
  box-shadow: 0 0 0 6px rgb(23 77 62 / .55);
}

/* The skip link: invisible until focused, then unmissable. */
.skip-link {
  position: absolute;
  top: -100px;
  left: 1rem;
  z-index: 100;
  background: #174d3e;
  color: #fff;
  padding: .7rem 1.1rem;
  border-radius: 0 0 10px 10px;
  font-weight: 700;
  text-decoration: none;
}
.skip-link:focus { top: 0; }      /* plain :focus — it IS the point */

/* Focus traps in dialogs: also dim everything else. */
body:has(dialog[open]) > *:not(dialog) {
  filter: brightness(.9);
}

/* Respect forced-colors (Windows High Contrast): let the OS draw it. */
@media (forced-colors: active) {
  :focus-visible { outline: 3px solid Highlight; }
  .btn { border: 1px solid ButtonText; }
}
`),

    ex("webd-ex-039", "Glassmorphism sheet", "Frosted panels done tastefully: layered translucency with readable contrast.", "CSS stylesheets", "glassmorphism", ".css",
        `/* Glass — translucency that still passes contrast checks. */

.glass {
  /* The three ingredients: blur, tint, hairline. */
  background: rgb(255 255 255 / 55%);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgb(255 255 255 / 60%);
  border-radius: 18px;
  box-shadow: 0 18px 40px -24px rgb(16 32 27 / .35);
}

.glass-dark {
  background: rgb(18 24 26 / 55%);
  border-color: rgb(255 255 255 / 14%);
  color: #f0f4f2;
  box-shadow: 0 18px 44px -20px rgb(0 0 0 / .5);
}

/* Glass needs something colorful BEHIND it — provide the stage. */
.stage {
  background:
    radial-gradient(60% 80% at 20% 10%, #7fc8a9 0%, transparent 60%),
    radial-gradient(50% 70% at 85% 25%, #4b91c9 0%, transparent 55%),
    radial-gradient(70% 90% at 60% 90%, #d9a05b 0%, transparent 60%),
    #101a18;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
}

/* Text ON glass needs a scrim of its own to stay readable. */
.glass .content { background: rgb(255 255 255 / 40%); border-radius: 12px; padding: 1rem 1.2rem; }

/* The nav flavor — sticky + glass is the classic pairing. */
.glass-nav {
  position: sticky;
  top: 1rem;
  display: flex;
  gap: 1.4rem;
  align-items: center;
  padding: .8rem 1.3rem;
  margin: 1rem;
}
.glass-nav a { color: inherit; text-decoration: none; font-weight: 700; font-size: .92rem; }
.glass-nav a:hover { text-decoration: underline; }

/* Graceful degradation: no backdrop-filter -> solid tint. */
@supports not (backdrop-filter: blur(1px)) {
  .glass, .glass-dark { background: rgb(245 248 246 / .92); }
}
`),

    ex("webd-ex-040", "Gradient and mesh backgrounds", "Layered radial gradients as ambient backgrounds — plus the noise trick.", "CSS stylesheets", "gradients", ".css",
        `/* Backgrounds — gradients as atmosphere, not decoration. */

/* The aurora: three overlapping radial blobs, one hue family. */
.aurora {
  background:
    radial-gradient(45rem 30rem at 15% -10%, #1d5c4c 0%, transparent 60%),
    radial-gradient(40rem 28rem at 95% 15%, #173c5e 0%, transparent 55%),
    radial-gradient(50rem 36rem at 60% 110%, #3f6b3a 0%, transparent 60%),
    #0b1512;
  color: #e9f2ee;
}

/* The sunset band — linear, calm, brandy. */
.band {
  background: linear-gradient(160deg, #fdf6ec 0%, #f8e9d7 45%, #eed9c4 100%);
}

/* Mesh: many small radials read as a soft field. */
.mesh {
  background:
    radial-gradient(at 20% 30%, #58b39488 0px, transparent 55%),
    radial-gradient(at 80% 20%, #4b91c977 0px, transparent 55%),
    radial-gradient(at 70% 80%, #d9a05b66 0px, transparent 55%),
    radial-gradient(at 25% 85%, #a34a6455 0px, transparent 55%),
    #f7f8f6;
}

/* The grain trick: an SVG noise layer kills the banding. */
.grain::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: .5;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
}

/* Conic accents for rings and badges. */
.ring {
  background: conic-gradient(from 210deg, #58b394, #4b91c9, #a34a64, #d9a05b, #58b394);
  border-radius: 50%;
  padding: 3px;                    /* use as a wrapper border */
}
.ring > * { border-radius: 50%; background: #fff; }

/* Text gradient — keep it to display type. */
.gradient-text {
  background: linear-gradient(92deg, #16323f, #2c6e5b 55%, #58b394);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
`),

    ex("webd-ex-041", "Color palette tokens", "A complete color system as custom properties: primitive ramp, semantic roles, alpha variants.", "Design systems", "palette_tokens", ".css",
        `/* Color tokens — primitives first, semantics second. Never use
   primitives in components. */

:root {
  /* ── The green ramp (primitive). ── */
  --green-50:  #f2f8f4;
  --green-100: #dcedE3;
  --green-200: #b6dcc4;
  --green-300: #8cc5a4;
  --green-400: #58b394;
  --green-500: #2c8a4b;
  --green-600: #236b3c;
  --green-700: #1c5631;
  --green-800: #164227;
  --green-900: #0f2f1c;

  /* ── Neutral ramp — slightly green-tinted grays. ── */
  --gray-50:  #fafbfa;
  --gray-100: #f1f3f1;
  --gray-200: #e4e8e5;
  --gray-300: #cdd4cf;
  --gray-400: #9aa5a0;
  --gray-500: #6f7a75;
  --gray-600: #525c57;
  --gray-700: #3b4440;
  --gray-800: #262c29;
  --gray-900: #141a17;

  /* ── Semantic roles (what components reference). ── */
  --bg:          var(--gray-50);
  --surface:     #ffffff;
  --surface-alt: var(--green-50);
  --ink:         var(--gray-900);
  --ink-soft:    var(--gray-600);
  --line:        var(--gray-200);

  --accent:        var(--green-600);
  --accent-strong: var(--green-700);
  --accent-ink:    #ffffff;
  --accent-soft:   var(--green-100);

  --danger:        #a53d2f;
  --danger-soft:   #fbe7e3;
  --warning:       #96651a;
  --warning-soft:  #fdf1dc;
  --success:       var(--green-600);
  --success-soft:  var(--green-100);
}

/* Dark theme: roles swap, primitives stay. */
[data-theme="dark"] {
  --bg:          var(--gray-900);
  --surface:     #1c2320;
  --surface-alt: #222b27;
  --ink:         #e8ece9;
  --ink-soft:    var(--gray-400);
  --line:        #2f3833;
  --accent:      var(--green-400);
  --accent-soft: #1d352c;
  --danger:      #e08573;
  --warning:     #d9a05b;
}

/* Alpha workhorses (built, not hand-picked). */
:root {
  --scrim:     rgb(16 24 20 / 45%);
  --overlay:   rgb(255 255 255 / 60%);
  --focus-ring: color-mix(in srgb, var(--accent) 45%, transparent);
}
`),

    ex("webd-ex-042", "Spacing and radius tokens", "The 4px scale, container widths and a three-step radius system.", "Design systems", "spacing_tokens", ".css",
        `/* Spacing + shape tokens — the invisible grid of consistency. */

:root {
  /* ── Space (4px baseline). ── */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --space-8: 4rem;
  --space-9: 6rem;

  /* Semantic aliases — components speak these, not numbers. */
  --space-inline:  var(--space-3);    /* inside a control */
  --space-stack:   var(--space-4);    /* between siblings */
  --space-section: var(--space-7);    /* between sections */
  --space-gutter:  clamp(var(--space-4), 4vw, var(--space-6)); /* page edge */

  /* ── Radii — three is enough. ── */
  --radius-sm: 6px;    /* inputs, chips */
  --radius-md: 10px;   /* buttons, cards */
  --radius-lg: 18px;   /* modals, media */
  --radius-full: 999px;/* pills, avatars */

  /* ── Container widths. ── */
  --measure: 66ch;         /* prose line length */
  --container-tight: 40rem;
  --container-text:   56rem;
  --container-wide:   72rem;
  --container-full:   90rem;
}

/* The container primitive — pairs with the tokens above. */
.container {
  width: min(100% - 2 * var(--space-gutter), var(--container-wide));
  margin-inline: auto;
}
.container--text { width: min(100% - 2 * var(--space-gutter), var(--container-text)); }
.container--wide { width: min(100% - 2 * var(--space-gutter), var(--container-full)); }

/* Fluid section padding that respects the gutter token. */
.section { padding-block: var(--space-section); padding-inline: var(--space-gutter); }

/* Radius usage map — so upgrades stay one-token edits. */
.input { border-radius: var(--radius-sm); }
.btn   { border-radius: var(--radius-md); }
.card  { border-radius: var(--radius-lg); }
.avatar, .pill { border-radius: var(--radius-full); }
`),

    ex("webd-ex-043", "Typography tokens", "Families, the modular scale, weights and the print fallback stack.", "Design systems", "type_tokens", ".css",
        `/* Typography tokens — families, scale, weights. */

:root {
  /* ── Families with real fallbacks. ── */
  --font-sans: "Inter var", "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-serif: "Source Serif 4", Charter, Georgia, "Times New Roman", serif;
  --font-mono: "JetBrains Mono", ui-monospace, "Cascadia Code", Consolas, monospace;

  /* ── The 1.25 modular scale, fluid. ── */
  --step--2: clamp(0.72rem, 0.71rem + 0.06vw, 0.76rem);
  --step--1: clamp(0.83rem, 0.81rem + 0.12vw, 0.89rem);
  --step-0:  clamp(1.00rem, 0.96rem + 0.18vw, 1.08rem);
  --step-1:  clamp(1.25rem, 1.17rem + 0.35vw, 1.38rem);
  --step-2:  clamp(1.56rem, 1.41rem + 0.68vw, 1.79rem);
  --step-3:  clamp(1.95rem, 1.69rem + 1.17vw, 2.33rem);
  --step-4:  clamp(2.44rem, 2.00rem + 1.93vw, 3.02rem);
  --step-5:  clamp(3.05rem, 2.31rem + 3.02vw, 4.02rem);

  /* ── Weights — four, no more. ── */
  --weight-regular: 400;
  --weight-medium:  500;
  --weight-bold:    700;
  --weight-black:   800;

  /* ── Tracking, leading — tuned per role. ── */
  --tracking-body:   normal;
  --tracking-heading: -0.015em;
  --tracking-caps:   0.12em;
  --leading-body:   1.65;
  --leading-heading: 1.18;
  --leading-tight:  1.05;
}

/* Role assignments — components never pick sizes directly. */
h1 { font: var(--weight-black) var(--step-4)/var(--leading-tight) var(--font-sans);
     letter-spacing: var(--tracking-heading); }
h2 { font: var(--weight-bold) var(--step-3)/var(--leading-heading) var(--font-sans); }
h3 { font: var(--weight-bold) var(--step-2)/var(--leading-heading) var(--font-sans); }
h4 { font: var(--weight-medium) var(--step-1)/var(--leading-heading) var(--font-sans); }

body { font: var(--weight-regular) var(--step-0)/var(--leading-body) var(--font-sans); }
.prose p { font-family: var(--font-serif); font-size: var(--step-0); }

code, kbd, pre, .mono { font-family: var(--font-mono); font-size: .92em; }

small, .caption { font-size: var(--step--1); color: inherit; opacity: .78; }

.eyebrow {                    /* the small caps kicker above headlines */
  font-size: var(--step--1);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
}
`),

    ex("webd-ex-044", "Motion tokens", "Duration, easing and choreography tokens — motion as a designed material.", "Design systems", "motion_tokens", ".css",
        `/* Motion tokens — how the interface moves. */

:root {
  /* ── Durations. The shorter, the more "native" it feels. ── */
  --dur-instant: 80ms;    /* hover states, color swaps */
  --dur-fast:    140ms;   /* small transforms, toggles */
  --dur-normal:  220ms;   /* panels, dropdowns */
  --dur-slow:    380ms;   /* drawers, modals */
  --dur-exit:    160ms;   /* things LEAVE faster than they arrive */

  /* ── Easings. ── */
  --ease-out:   cubic-bezier(.2, .7, .3, 1);     /* arrivals */
  --ease-in:    cubic-bezier(.5, 0, .8, .4);     /* exits */
  --ease-spring: cubic-bezier(.34, 1.4, .64, 1); /* playful pop */
  --ease-linear: linear;                          /* spinners only */

  /* ── Distances — motion moves this far, no further. ── */
  --shift-xs: 2px;
  --shift-sm: 6px;
  --shift-md: 14px;
  --shift-lg: 32px;
}

/* The two standard transitions every element can reuse. */
.transition-fast {
  transition-property: color, background-color, border-color, opacity, translate, scale;
  transition-duration: var(--dur-fast);
  transition-timing-function: var(--ease-out);
}
.transition-panel {
  transition: translate var(--dur-normal) var(--ease-out),
              opacity   var(--dur-normal) var(--ease-out);
}

/* Choreography: things that arrive together, stagger slightly. */
.stagger {
  --stagger-step: 60ms;
}
.stagger > * {
  animation: rise var(--dur-normal) var(--ease-out) backwards;
  animation-delay: calc(var(--i, 0) * var(--stagger-step));
}
@keyframes rise {
  from { opacity: 0; translate: 0 var(--shift-md); }
}

/* Motion ALWAYS yields to the user's preference — the non-negotiable. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-instant: 0ms; --dur-fast: 0ms; --dur-normal: 0ms;
    --dur-slow: 0ms;   --dur-exit: 0ms;
  }
  * { animation-iteration-count: 1 !important; }
}
`),

    ex("webd-ex-045", "Elevation tokens", "Depth as a token ladder with semantic slots (dropdown vs modal) and the scrim pair.", "Design systems", "elevation_tokens", ".css",
        `/* Elevation tokens — depth is a system, not a whim. */

:root {
  /* The ladder: one light source, growing blur + distance. */
  --shadow-1: 0 1px 2px rgb(20 28 24 / .10);
  --shadow-2: 0 2px 5px rgb(20 28 24 / .10), 0 1px 2px rgb(20 28 24 / .08);
  --shadow-3: 0 7px 16px -6px rgb(20 28 24 / .14), 0 2px 4px rgb(20 28 24 / .08);
  --shadow-4: 0 16px 34px -10px rgb(20 28 24 / .20), 0 4px 8px rgb(20 28 24 / .07);
  --shadow-5: 0 32px 64px -14px rgb(20 28 24 / .28);

  /* Semantic slots — what a component MEANS decides its height. */
  --elevation-resting:  var(--shadow-1);   /* cards in a grid */
  --elevation-raised:   var(--shadow-2);   /* card on hover */
  --elevation-dropdown: var(--shadow-3);   /* menus, popovers */
  --elevation-drawer:   var(--shadow-4);   /* side sheets */
  --elevation-modal:    var(--shadow-5);   /* dialogs */

  /* Each elevation pairs with a scrim when it covers content. */
  --scrim-dropdown: transparent;            /* menus don't dim */
  --scrim-drawer:   rgb(15 22 19 / .35);
  --scrim-modal:    rgb(15 22 19 / .55);
}

/* Dark mode: shadows deepen, scrims go near-black. */
[data-theme="dark"] {
  --shadow-1: 0 1px 2px rgb(0 0 0 / .5);
  --shadow-2: 0 2px 6px rgb(0 0 0 / .5);
  --shadow-3: 0 7px 18px rgb(0 0 0 / .55);
  --shadow-4: 0 16px 38px rgb(0 0 0 / .6);
  --shadow-5: 0 32px 70px rgb(0 0 0 / .65);
  --scrim-drawer: rgb(0 0 0 / .5);
  --scrim-modal:  rgb(0 0 0 / .7);
}

/* Component slots in action. */
.card       { box-shadow: var(--elevation-resting); }
.card:hover { box-shadow: var(--elevation-raised); }

.dropdown {
  box-shadow: var(--elevation-dropdown);
  border-radius: 12px;
  background: #fff;
}
.drawer + .scrim { background: var(--scrim-drawer); }

dialog.modal {
  box-shadow: var(--elevation-modal);
  border: 0;
  border-radius: 16px;
  padding: 0;
}
.modal::backdrop { background: var(--scrim-modal); backdrop-filter: blur(3px); }

/* Depth travels WITH motion — hover lifts, never sinks. */
.interactive {
  transition: translate var(--dur-fast, 140ms) ease, box-shadow var(--dur-fast, 140ms) ease;
}
.interactive:hover {
  translate: 0 calc(var(--shift-xs, 2px) * -1);
  box-shadow: var(--elevation-raised);
}
`),

    ex("webd-ex-046", "Utility class system", "A tiny, boring, complete utility layer — single-purpose classes with variants.", "Design systems", "utilities", ".css",
        `/* Utilities — one job per class, predictable names, no cleverness. */

/* Display. */
.hidden          { display: none; }
.block           { display: block; }
.inline-block    { display: inline-block; }
.flex            { display: flex; }
.inline-flex     { display: inline-flex; }
.grid            { display: grid; }

/* Flex one-liners. */
.items-center    { align-items: center; }
.items-start     { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-center  { justify-content: center; }
.flex-1          { flex: 1 1 auto; }
.flex-wrap       { flex-wrap: wrap; }

/* Grid one-liners. */
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4, 1rem); }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4, 1rem); }
@media (max-width: 640px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

/* Text. */
.text-center { text-align: center; }
.text-right  { text-align: end; }
.truncate    { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clamp-2     { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.clamp-3     { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.mono        { font-family: ui-monospace, monospace; }
.tabular     { font-variant-numeric: tabular-nums; }

/* Color (semantic tokens only). */
.text-muted    { color: var(--ink-soft, #555); }
.text-accent   { color: var(--accent, #2c6e5b); }
.bg-surface    { background: var(--surface, #fff); }
.bg-accent-soft{ background: var(--accent-soft, #e3f2e8); }

/* Sizing. */
.w-full { width: 100%; }
.h-full { height: 100%; }
.maxw-prose { max-width: 66ch; }
.maxw-wide  { max-width: 72rem; margin-inline: auto; }

/* Position + misc. */
.relative { position: relative; }
.absolute { position: absolute; }
.inset-0  { inset: 0; }
.rounded  { border-radius: var(--radius-md, 10px); }
.rounded-full { border-radius: 999px; }
.overflow-hidden { overflow: hidden; }
.pointer-events-none { pointer-events: none; }
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
`),

    ex("webd-ex-047", "Component tokens sheet", "Tokens for one component end-to-end: alerts — the pattern to copy for every widget.", "Design systems", "component_tokens", ".css",
        `/* Component tokens — the alert widget, fully tokenized.
   Copy this pattern for every component you build: every visual
   decision becomes a custom property the theme can retune. */

:root {
  /* anatomy: space */
  --alert-padding:    var(--space-4, 1rem) var(--space-5, 1.5rem);
  --alert-gap:        var(--space-3, 0.75rem);
  --alert-radius:     var(--radius-md, 10px);
  --alert-icon-size:  1.15rem;

  /* typography */
  --alert-title-size: 0.95rem;
  --alert-body-size:  var(--step--1, 0.875rem);
  --alert-weight:     700;

  /* borders */
  --alert-border-width: 1px;
  --alert-left-bar:    4px;          /* the classic inline left rail */
}

/* Per-intent role tokens — each theme (light/dark/brand) retunes
   these four pairs and the component never changes. */
:root {
  --alert-info-bg:    #e8f1f8;  --alert-info-ink: #1d4a6b;  --alert-info-line: #bcd6e8;
  --alert-ok-bg:      #e3f2e8;  --alert-ok-ink:   #1c5631;  --alert-ok-line:   #b6dcc4;
  --alert-warn-bg:    #fdf1dc;  --alert-warn-ink: #7a5214;  --alert-warn-line: #eed9c4;
  --alert-error-bg:   #fbe7e3;  --alert-error-ink:#8a3226;  --alert-error-line:#ecccc5;
}

[data-theme="dark"] {
  --alert-info-bg:   #16303f;  --alert-info-ink:  #a7cbe0;  --alert-info-line:  #1f4356;
  --alert-ok-bg:     #14301f;  --alert-ok-ink:    #9fe0c3;  --alert-ok-line:    #1d4230;
  --alert-warn-bg:   #382912;  --alert-warn-ink:  #e0bd85;  --alert-warn-line:  #4a3a1c;
  --alert-error-bg:  #3d1c15;  --alert-error-ink: #eaa899;  --alert-error-line: #55261c;
}

/* The component — reads ONLY its own tokens. */
.alert {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--alert-gap);
  padding: var(--alert-padding);
  border-radius: var(--alert-radius);
  border: var(--alert-border-width) solid var(--line);
  border-left-width: var(--alert-left-bar);
}
.alert .icon { font-size: var(--alert-icon-size); line-height: 1; }
.alert .title { font-size: var(--alert-title-size); font-weight: var(--alert-weight); }
.alert .body  { font-size: var(--alert-body-size); opacity: .9; }

.alert--info  { background: var(--alert-info-bg);  color: var(--alert-info-ink);
                border-color: var(--alert-info-line); }
.alert--ok    { background: var(--alert-ok-bg);    color: var(--alert-ok-ink);
                border-color: var(--alert-ok-line); }
.alert--warn  { background: var(--alert-warn-bg);  color: var(--alert-warn-ink);
                border-color: var(--alert-warn-line); }
.alert--error { background: var(--alert-error-bg); color: var(--alert-error-ink);
                border-color: var(--alert-error-line); }
`),

    ex("webd-ex-048", "Breakpoint tokens and container queries", "Named breakpoints plus component-level container queries — layout that follows the container, not the screen.", "Design systems", "breakpoints", ".css",
        `/* Breakpoints — named, and increasingly: containers. */

:root {
  /* Screen breakpoints (page-level layout). */
  --bp-sm:  40em;
  --bp-md:  48em;
  --bp-lg:  64em;
  --bp-xl:  80em;
}

/* Named media queries need @custom-media (build step) — plain ones
   with comments serve plain CSS: */
@media (max-width: 40em)  { /* phone */ }
@media (min-width: 48em)  { /* tablet */ }
@media (min-width: 64em)  { /* laptop */ }

/* ── Container queries: the sidebar card doesn't care about the
      screen — it cares about ITS OWN width. ── */

.card-container {
  container-type: inline-size;
  container-name: card;
}

/* The SAME card component, wide in the main column, stacked in the
   260px sidebar — no JS, no page-level media query. */
@container card (min-width: 480px) {
  .media-card { display: grid; grid-template-columns: 160px 1fr; }
  .media-card img { height: 100%; object-fit: cover; }
}
@container card (max-width: 479px) {
  .media-card { display: block; }
  .media-card img { aspect-ratio: 16 / 9; width: 100%; }
}

/* Type scales with the container too — like a magazine column. */
@container card (width >= 380px) {
  .media-card h3 { font-size: 1.15rem; }
}

/* Style queries (newer browsers): react to a container's --state. */
@container style(--variant: compact) {
  .list-item { padding: var(--space-2, .5rem); }
  .list-item .meta { display: none; }
}
`),

    ex("webd-ex-049", "Light/dark theme toggle stylesheet", "The full three-mode pattern: system default, manual light, manual dark — with no flash.", "Design systems", "theme_toggle", ".css",
        `/* Theme switching — system default + manual override, FOUC-free. */

/* 1. Tokens: light is the base. */
:root {
  color-scheme: light;
  --bg: #fbfaf7;
  --surface: #ffffff;
  --ink: #22262a;
  --line: #e6e3da;
  --accent: #2c6e5b;
}

/* 2. The system-following dark mode. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #12171a;
    --surface: #1a2125;
    --ink: #e7ebe8;
    --line: #2a3338;
    --accent: #58b394;
  }
}

/* 3. The manual overrides (set data-theme on <html>). */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #12171a;
  --surface: #1a2125;
  --ink: #e7ebe8;
  --line: #2a3338;
  --accent: #58b394;
}
/* data-theme="light" simply keeps the base block. */

/* 4. No-flash: run BEFORE paint (inline in <head>):
   <script>
     const saved = localStorage.getItem('theme');
     if (saved) document.documentElement.dataset.theme = saved;
   </script>
   The default (no data-theme) follows the OS. */

/* 5. The toggle button styles itself by theme. */
.theme-toggle {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  border-radius: 999px;
  width: 2.4rem; height: 2.4rem;
  cursor: pointer;
  display: grid; place-items: center;
}

/* 6. Smooth swap — colors crossfade, never snap. */
body {
  background: var(--bg);
  color: var(--ink);
  transition: background-color .3s ease, color .3s ease;
}

/* 7. Diagrams and charts that ship two palettes: */
.chart { --series-1: #2c6e5b; --series-2: #4b91c9; --series-3: #d9a05b; }
:root[data-theme="dark"] .chart,
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .chart { --series-1: #58b394; --series-2: #7cb3e0; --series-3: #e8c48a; }
}
`),

    ex("webd-ex-050", "Base project stylesheet", "The one-file starting point: tokens, base elements, layout primitives — ready to grow.", "Design systems", "base_stylesheet", ".css",
        `/* ── BASE — the 150-line project starter. ─────────────────────────
   Sections: reset → tokens → base elements → layout → utilities. */

/* 1. Reset (compact modern reset). */
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }
html { text-size-adjust: none; }
body { min-height: 100vh; line-height: 1.6; }
img, svg, video { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; }
p, h1, h2, h3 { overflow-wrap: break-word; }

/* 2. Tokens. */
:root {
  --bg: #fbfaf7;
  --surface: #ffffff;
  --ink: #232a27;
  --ink-soft: #5d6862;
  --line: #e6e3da;
  --accent: #2c6e5b;
  --accent-ink: #ffffff;

  --font-sans: system-ui, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, Consolas, monospace;
  --step-0: 1rem;
  --step-1: 1.3rem;
  --step-2: 1.7rem;
  --step-3: 2.3rem;

  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem;
  --space-4: 1rem;   --space-5: 1.5rem; --space-6: 2rem; --space-7: 3rem;

  --radius-md: 10px;
  --shadow-card: 0 12px 30px -22px rgb(20 30 25 / .35);
}

/* 3. Base elements. */
body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: var(--step-0);
  padding-inline: clamp(var(--space-4), 4vw, var(--space-6));
}
a { color: var(--accent); }
a:hover { text-decoration: none; }
h1 { font-size: var(--step-3); line-height: 1.15; letter-spacing: -.01em; }
h2 { font-size: var(--step-2); line-height: 1.25; }
h3 { font-size: var(--step-1); }
code { font-family: var(--font-mono); background: #eef1ee; padding: .1em .35em; border-radius: 4px; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }

/* 4. Layout primitives. */
.container { max-width: 68rem; margin-inline: auto; }
.stack > * + * { margin-block-start: var(--space-4); }
.split { display: grid; gap: var(--space-5); }
@media (min-width: 48em) { .split { grid-template-columns: 1fr 320px; } }
.section { padding-block: var(--space-7); }

/* 5. The one component every project needs on day one. */
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-5);
}
`),

];
