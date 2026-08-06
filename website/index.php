<?php

declare(strict_types=1);

require __DIR__ . '/inc/release.php';

$base = base_url();
$release = latest_release();
$version = $release['version'] ?? null;
$published = $release['published'] ?? null;

$title = 'Muster \u{2014} desktop IDE for parallel coding agents';
$description = 'Run coding agents across git worktrees, with WordPress imports, deploys and '
    . 'ActiveCollab tasks. Download and install guide for the efront team.';

header('Content-Type: text/html; charset=utf-8');
// Short cache: the only thing that changes between deploys is the release number.
header('Cache-Control: public, max-age=300');
?>
<!doctype html>
<html lang="en" class="no-js">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Muster — desktop IDE for parallel coding agents</title>
    <meta name="description" content="<?= e($description) ?>" />
    <meta name="color-scheme" content="dark light" />
    <link rel="icon" href="assets/logo.svg" type="image/svg+xml" />

    <!-- Link preview for Slack and anywhere else the URL gets pasted. og:image must be absolute,
         so it is set at runtime from the page's own origin — the site has no fixed host yet. -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Muster" />
    <meta property="og:title" content="<?= e($title) ?>" />
    <meta property="og:description" content="<?= e($description) ?>" />
    <meta property="og:image" content="<?= e($base) ?>assets/og.png" />
    <meta property="og:url" content="<?= e($base) ?>" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <link
      rel="preload"
      href="assets/fonts/Geist-Variable.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    <link rel="stylesheet" href="styles.css" />
    <script>
      document.documentElement.classList.remove('no-js')
      document.documentElement.classList.add('js')
    </script>
  </head>

  <body>
    <a class="skip" href="#install">Skip to installation</a>

    <!-- Status bar: mirrors the app's own titlebar, and carries the facts a teammate needs up front. -->
    <div class="statusbar">
      <div class="statusbar-in">
        <span class="sb-brand">
          <img src="assets/logo.svg" width="18" height="18" alt="" />
          <b>Muster</b>
        </span>
        <span class="sb-div hide-sm" aria-hidden="true"></span>
        <span class="sb-item hide-sm"><i>build</i> internal · efront</span>
        <span class="sb-div hide-sm" aria-hidden="true"></span>
        <span class="sb-item hide-sm"><i>platform</i> macOS 12+</span>
        <span class="sb-div hide-sm" aria-hidden="true"></span>
<?php if ($version !== null): ?>
        <span class="sb-item sb-version hide-sm" data-version><i>version</i> <b><?= e($version) ?></b></span>
<?php else: ?>
        <span class="sb-item sb-version hide-sm" data-version hidden><i>version</i> <b>&mdash;</b></span>
<?php endif; ?>
        <span class="sb-live"><span class="sb-pulse" aria-hidden="true"></span> auto-update on</span>
      </div>
    </div>

    <div class="frame">
      <!-- Fixed index column: the console's left rail. -->
      <aside class="index" aria-label="Contents">
        <div class="index-top">
          <img src="assets/logo.svg" width="44" height="44" alt="Muster" />
          <p class="index-name">Muster</p>
          <p class="index-tag">Agent IDE &amp; site console</p>
        </div>

        <nav class="index-nav">
          <a href="#overview"><span class="idx">01</span><span>Overview</span></a>
          <a href="#model"><span class="idx">02</span><span>The model</span></a>
          <a href="#capabilities"><span class="idx">03</span><span>Capabilities</span></a>
          <a href="#install"><span class="idx">04</span><span>Install</span></a>
          <a href="#updates"><span class="idx">05</span><span>Updates</span></a>
          <a href="#spec"><span class="idx">06</span><span>Spec</span></a>
          <a href="#agents"><span class="idx">07</span><span>For agents</span></a>
          <a href="#trouble"><span class="idx">08</span><span>Trouble</span></a>
        </nav>

        <div class="index-foot">
          <a
            class="index-dl"
            href="https://github.com/jefrontv/muster/releases/latest/download/muster-macos-arm64.dmg"
          >
            Download
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 1v9m0 0 3.5-3.5M8 10 4.5 6.5M2 13h12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </a>
          <a class="index-src" href="https://github.com/jefrontv/muster">Source ↗</a>
        </div>
      </aside>

      <main class="stack">
        <!-- ======================================================= 01 overview -->
        <section class="panel hero" id="overview">
          <canvas class="lanes" aria-hidden="true"></canvas>
          <div class="blueprint" aria-hidden="true"></div>

          <div class="hero-in">
            <p class="strip"><span class="strip-n">01</span> Overview</p>

            <h1 class="display">
              <span class="line"><span>Muster</span></span>
            </h1>

            <p class="lede">
              A desktop IDE for running coding agents across git worktrees, with WordPress site
              imports and deploys and ActiveCollab tasks built in. Each agent works in its own
              checkout, so parallel jobs never touch the same files, and the sidebar shows which one
              has stopped and needs a human.
            </p>

            <dl class="figures">
              <div>
                <dt>Agents supported</dt>
                <dd><span data-count="19">19</span></dd>
              </div>
              <div>
                <dt>Worktrees</dt>
                <dd><span data-count="1">1</span><i>per agent</i></dd>
              </div>
              <div>
                <dt>Tools for agents</dt>
                <dd><span data-count="25">25</span></dd>
              </div>
              <div>
                <dt>Install steps</dt>
                <dd><span data-count="4">4</span><i>once per Mac</i></dd>
              </div>
            </dl>

            <div class="cta">
              <a
                class="btn primary magnetic"
                href="https://github.com/jefrontv/muster/releases/latest/download/muster-macos-arm64.dmg"
              >
                <span>Apple Silicon build</span>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M8 1v9m0 0 3.5-3.5M8 10 4.5 6.5M2 13h12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </a>
              <a
                class="btn ghost"
                href="https://github.com/jefrontv/muster/releases/latest/download/muster-macos-x64.dmg"
                >Intel build</a
              >
              <a class="btn bare" href="#install">Read the install steps →</a>
            </div>
          </div>
        </section>

        <!-- ======================================================= 02 the model -->
        <section class="panel" id="model">
          <header class="phead">
            <p class="strip"><span class="strip-n">02</span> The model</p>
            <h2>One branch, one checkout, one agent</h2>
            <p class="phead-note">
              Agents collide when they share a working tree: two edits to one file, one of them lost.
              Muster's answer is boringly mechanical — give each run its own checkout, so isolation is
              a property of the filesystem rather than a promise.
            </p>
          </header>

          <div class="phases" data-phases>
            <ol class="phase-list">
              <li class="phase" data-phase="0">
                <span class="phase-n">Phase 01</span>
                <h3>Muster creates the worktree</h3>
                <p>
                  A workspace is a real <code>git worktree</code> on a branch you choose, in its own
                  directory, with your setup script run against it. Nothing is copied by hand and
                  nothing is shared with your main checkout.
                </p>
              </li>
              <li class="phase" data-phase="1">
                <span class="phase-n">Phase 02</span>
                <h3>The agent works in it, alone</h3>
                <p>
                  Your CLI agent launches inside that directory with its own terminal and
                  hook-reported status. Four can run at once and none can overwrite another, because
                  none can see another's files.
                </p>
              </li>
              <li class="phase" data-phase="2">
                <span class="phase-n">Phase 03</span>
                <h3>You review whoever finished</h3>
                <p>
                  When an agent stops — done, blocked, or asking something — its row lights up. That
                  is the queue: attend to whoever answered while the rest keep moving.
                </p>
              </li>
            </ol>

            <div class="board" aria-hidden="true">
              <div class="board-bar">
                <span class="bd"></span><span class="bd"></span><span class="bd"></span>
                <span class="board-title">Workspaces</span>
                <span class="board-count" data-board-count>4 active</span>
              </div>
              <ul class="board-rows" data-board-rows></ul>
              <div class="board-foot">
                <span>Waiting on you</span>
                <b data-board-queue>0</b>
              </div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 03 capabilities -->
        <section class="panel" id="capabilities">
          <header class="phead">
            <p class="strip"><span class="strip-n">03</span> Capabilities</p>
            <h2>What is actually in the app</h2>
          </header>

          <div class="cap-grid">
            <article class="cap">
              <p class="cap-k">Agents</p>
              <h3>Nineteen CLI agents, first class</h3>
              <p>
                Each runs as a tracked session with live state — working, waiting, blocked, done —
                reported through installed hooks rather than guessed from terminal output.
              </p>
              <ul class="chips">
                <li>Claude Code</li>
                <li>Codex</li>
                <li>Gemini</li>
                <li>Copilot</li>
                <li>Cursor</li>
                <li>Amp</li>
                <li>OpenCode</li>
                <li>Aider</li>
                <li>Droid</li>
                <li>Grok</li>
                <li>Devin</li>
                <li>Hermes</li>
                <li>Pi</li>
                <li>OMP</li>
                <li>Antigravity</li>
                <li class="more">+4</li>
              </ul>
            </article>

            <article class="cap">
              <p class="cap-k">Sites</p>
              <h3>Imports and deploys, per environment</h3>
              <p>
                Each site keeps its environments, SSH credentials and per-branch targets. The branch
                you have checked out decides where a run goes; a branch matching nothing refuses
                rather than guessing production.
              </p>
              <div class="split">
                <div>
                  <p class="mini">Import steps</p>
                  <ul class="ticks">
                    <li>Pull/import server DB</li>
                    <li>Pull server files</li>
                    <li>WP upload rewrite</li>
                    <li>WP search replace</li>
                  </ul>
                </div>
                <div>
                  <p class="mini">Deploy steps</p>
                  <ul class="ticks">
                    <li>Git pull on server</li>
                    <li>Clear server cache</li>
                    <li>Deploy theme dist</li>
                  </ul>
                </div>
              </div>
            </article>

            <article class="cap">
              <p class="cap-k">Tasks</p>
              <h3>ActiveCollab, in the sidebar</h3>
              <p>
                My Work lists what is assigned to you, grouped by project. Open a project to see
                every task under its own task lists, with assignee avatars and who created it. Start
                a workspace from a task and the branch and context arrive prefilled.
              </p>
            </article>

            <article class="cap">
              <p class="cap-k">Terminals</p>
              <h3>Real PTYs, split and persistent</h3>
              <p>
                Split panes, per-pane titles, sessions that survive a window close. Local, SSH and
                remote runtime hosts behave identically from the pane's point of view.
              </p>
            </article>
          </div>
        </section>

        <!-- ======================================================= 04 install -->
        <section class="panel" id="install">
          <header class="phead">
            <p class="strip"><span class="strip-n">04</span> Install</p>
            <h2>Four steps, once per Mac</h2>
            <p class="phead-note">
              Step three looks alarming and is not. What it does, and why it is needed, is spelled
              out underneath it.
            </p>
          </header>

          <ol class="steps" data-steps>
            <span class="steps-line" aria-hidden="true"><i data-steps-fill></i></span>

            <li class="step">
              <div class="step-n">1</div>
              <div class="step-b">
                <h3>Take the build that matches your Mac</h3>
                <p>
                  Apple Silicon (M1 and later) or Intel. Unsure? Apple menu →
                  <strong>About This Mac</strong> → look for <em>Chip</em> or <em>Processor</em>.
                </p>
                <div class="dl-row">
                  <a
                    class="btn primary sm"
                    href="https://github.com/jefrontv/muster/releases/latest/download/muster-macos-arm64.dmg"
                    >Apple Silicon .dmg</a
                  >
                  <a
                    class="btn ghost sm"
                    href="https://github.com/jefrontv/muster/releases/latest/download/muster-macos-x64.dmg"
                    >Intel .dmg</a
                  >
                </div>
              </div>
            </li>

            <li class="step">
              <div class="step-n">2</div>
              <div class="step-b">
                <h3>Drag Muster into Applications</h3>
                <p>
                  Open the <code>.dmg</code> and drag the app across. Installing elsewhere works, but
                  the command in step three assumes <code>/Applications</code>.
                </p>
              </div>
            </li>

            <li class="step">
              <div class="step-n">3</div>
              <div class="step-b">
                <h3>Clear the download quarantine</h3>
                <p>Paste this into Terminal and press Return. Success prints nothing at all.</p>
                <div class="cmd">
                  <code><span class="pr" aria-hidden="true">$</span> xattr -cr /Applications/Muster.app</code>
                  <button class="copy" type="button" data-copy="xattr -cr /Applications/Muster.app">
                    Copy
                  </button>
                </div>
                <div class="note">
                  <p class="note-k">Why this is needed</p>
                  <p>
                    Muster is signed with our own certificate rather than a paid Apple Developer ID.
                    macOS attaches a quarantine flag to anything downloaded from the internet and
                    refuses to open code it cannot trace back to Apple, so the app reports itself as
                    damaged. <code>xattr -cr</code> removes that flag from the copy you just
                    installed. It changes nothing inside the app, and you never run it again — updates
                    arriving through the app are not quarantined.
                  </p>
                </div>
              </div>
            </li>

            <li class="step">
              <div class="step-n">4</div>
              <div class="step-b">
                <h3>Open it and connect what you use</h3>
                <p>
                  First launch covers your default agent, the theme, and the integrations worth wiring
                  now. Everything is changeable later in Settings.
                </p>
                <ul class="ticks two">
                  <li>Pick a default agent</li>
                  <li>Connect GitHub (<code>gh</code>)</li>
                  <li>Connect Bitbucket</li>
                  <li>Import existing sites</li>
                </ul>
              </div>
            </li>
          </ol>
        </section>

        <!-- ======================================================= 05 updates -->
        <section class="panel" id="updates">
          <header class="phead">
            <p class="strip"><span class="strip-n">05</span> Updates</p>
            <h2>Updates install themselves</h2>
          </header>

          <div class="tiles">
            <article class="tile">
              <h3>Checked in the background</h3>
              <p>
                Muster looks for a newer build periodically and offers it when one is ready. You
                approve the restart — nothing is swapped underneath you.
              </p>
            </article>
            <article class="tile">
              <h3>Or check on demand</h3>
              <p>
                Hold <kbd>⌥</kbd>, open the Help menu in the sidebar, choose
                <strong>Check for updates</strong>.
              </p>
            </article>
            <article class="tile">
              <h3>No quarantine step again</h3>
              <p>
                Quarantine applies only to files you download yourself. In-app updates are verified
                against the installed signature and need no Terminal command.
              </p>
            </article>
          </div>
        </section>

        <!-- ======================================================= 06 spec -->
        <section class="panel" id="spec">
          <header class="phead">
            <p class="strip"><span class="strip-n">06</span> Spec</p>
            <h2>The technical detail</h2>
          </header>

          <div class="table-wrap">
            <table class="spec">
              <tbody>
<?php if ($version !== null): ?>
                <tr>
                  <th scope="row">Current release</th>
                  <td>
                    <span class="num"><?= e($version) ?></span><?php if ($published !== null): ?> &middot; published <?= e($published) ?><?php endif; ?>
                  </td>
                </tr>
<?php endif; ?>
                <tr><th scope="row">Platform</th><td>macOS 12 Monterey or newer</td></tr>
                <tr><th scope="row">Architectures</th><td>Apple Silicon (arm64) and Intel (x64), separate builds</td></tr>
                <tr><th scope="row">Download size</th><td><span class="num">~190</span> MB disk image</td></tr>
                <tr><th scope="row">Code signing</th><td>Signed with our own certificate · not Apple-notarised</td></tr>
                <tr><th scope="row">Gatekeeper</th><td>Needs <code>xattr -cr</code> once per manual install</td></tr>
                <tr><th scope="row">Update channel</th><td>GitHub Releases · verified against the installed signature</td></tr>
                <tr><th scope="row">Agent status</th><td>Installed CLI hooks report state; no scraping of terminal output</td></tr>
                <tr><th scope="row">Remote work</th><td>Local, SSH hosts and remote runtimes</td></tr>
                <tr><th scope="row">Site credentials</th><td>Stored per environment in the macOS keychain</td></tr>
                <tr><th scope="row">Licence</th><td>MIT · internal fork of Orca</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ======================================================= 07 for agents -->
        <section class="panel" id="agents">
          <header class="phead">
            <p class="strip"><span class="strip-n">07</span> For agents</p>
            <h2>Your agent can drive the site tooling</h2>
            <p class="phead-note">
              Muster ships an MCP server, so an agent working in a checkout can inspect and operate
              that site directly — twenty-five tools, behind the same guard rails the buttons use.
            </p>
          </header>

          <div class="tool-groups">
            <article class="tool">
              <p class="cap-k">Discovery</p>
              <p>
                List sites, resolve the one you are standing in, read git status and which
                environment a branch targets.
              </p>
            </article>
            <article class="tool">
              <p class="cap-k">Config</p>
              <p>
                Read and edit site fields, environments, and which import or deploy steps are
                enabled.
              </p>
            </article>
            <article class="tool">
              <p class="cap-k">Runs</p>
              <p>
                Dry-run a plan, then start an import or deploy. An unmatched branch refuses instead
                of falling back to production.
              </p>
            </article>
            <article class="tool">
              <p class="cap-k">Jobs</p>
              <p>
                Poll a run, read its log, cancel it. Logs are shared with the app, so you watch the
                same output the UI shows.
              </p>
            </article>
            <article class="tool">
              <p class="cap-k">SSH</p>
              <p>
                Run a command on the site's server with the stored credential, passwords scrubbed
                from the output.
              </p>
            </article>
          </div>
        </section>

        <!-- ======================================================= 08 trouble -->
        <section class="panel" id="trouble">
          <header class="phead">
            <p class="strip"><span class="strip-n">08</span> Trouble</p>
            <h2>If something goes wrong</h2>
          </header>

          <div class="faq">
            <details>
              <summary>“Muster is damaged and can’t be opened”</summary>
              <div class="faq-b">
                <p>Step three was skipped, or the app was replaced after it. Run it again.</p>
                <div class="cmd">
                  <code><span class="pr" aria-hidden="true">$</span> xattr -cr /Applications/Muster.app</code>
                  <button class="copy" type="button" data-copy="xattr -cr /Applications/Muster.app">
                    Copy
                  </button>
                </div>
              </div>
            </details>

            <details>
              <summary>“Apple cannot check it for malicious software”</summary>
              <div class="faq-b">
                <p>
                  Same cause. If the command has already run, right-click the app and choose
                  <strong>Open</strong> once — macOS remembers that decision for the copy.
                </p>
              </div>
            </details>

            <details>
              <summary>An update downloads but will not install</summary>
              <div class="faq-b">
                <p>
                  macOS only replaces an app with one carrying a matching signature. This happens when
                  the installed copy was built locally rather than downloaded from a release. Take the
                  current build, drag it over the old one, run step three.
                </p>
              </div>
            </details>

            <details>
              <summary><code>xattr: No such file or directory</code></summary>
              <div class="faq-b">
                <p>
                  The app is not at that path. Type <code>xattr -cr</code> and a space, then drag the
                  app into the Terminal window to paste its real location.
                </p>
              </div>
            </details>

            <details>
              <summary>An agent shows no status, or its row disappears</summary>
              <div class="faq-b">
                <p>
                  Status comes from hooks the app installs into each agent's own config. In Settings →
                  Agents, check that <strong>Agent status hooks</strong> is on; with it off, rows fall
                  back to reading terminal titles and can vanish when an agent retitles its tab.
                </p>
              </div>
            </details>

            <details>
              <summary>Something else</summary>
              <div class="faq-b">
                <p>
                  Open an issue with what you did, what happened, and the version from the Help menu.
                </p>
                <p>
                  <a class="link" href="https://github.com/jefrontv/muster/issues"
                    >Report a problem ↗</a
                  >
                </p>
              </div>
            </details>
          </div>
        </section>

        <footer class="foot">
          <div class="foot-in">
            <div>
              <p class="foot-name">Muster</p>
              <p class="foot-note">Internal tool · efront · MIT licensed fork of Orca</p>
            </div>
            <nav aria-label="Links">
              <a href="https://github.com/jefrontv/muster">Source</a>
              <a href="https://github.com/jefrontv/muster/releases">Releases</a>
              <a href="https://github.com/jefrontv/muster/issues">Issues</a>
            </nav>
          </div>
        </footer>
      </main>
    </div>

    <script src="vendor/gsap.min.js" defer></script>
    <script src="vendor/ScrollTrigger.min.js" defer></script>
    <script src="main.js" defer></script>
  </body>
</html>
