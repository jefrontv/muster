<?php

declare(strict_types=1);

require __DIR__ . '/inc/release.php';

$base = base_url();
$release = latest_release();
$version = $release['version'] ?? null;
$published = $release['published'] ?? null;

$title = 'Muster \u{2014} desktop IDE for parallel coding agents';
$description = 'Run several coding agents at once, with team tasks, WordPress imports and deploys '
    . 'built in. Download and install guide for the efront team.';

header('Content-Type: text/html; charset=utf-8');
// Short cache: the only thing that changes between deploys is the release number.
header('Cache-Control: public, max-age=300');
// Internal tool — keep it out of search indexes.
header('X-Robots-Tag: noindex, nofollow');
?>
<!doctype html>
<html lang="en" class="no-js">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Muster — desktop IDE for parallel coding agents</title>
    <meta name="description" content="<?= e($description) ?>" />
    <meta name="robots" content="noindex, nofollow" />
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
          <a href="#model"><span class="idx">02</span><span>How it works</span></a>
          <a href="#chat-sec"><span class="idx">03</span><span>Chat</span></a>
          <a href="#agents-sec"><span class="idx">04</span><span>Agents</span></a>
          <a href="#sites-sec"><span class="idx">05</span><span>Sites</span></a>
          <a href="#tasks-sec"><span class="idx">06</span><span>Tasks</span></a>
          <a href="#review"><span class="idx">07</span><span>Review</span></a>
          <a href="#workbench"><span class="idx">08</span><span>Workbench</span></a>
          <a href="#automations"><span class="idx">09</span><span>Automations</span></a>
          <a href="#install"><span class="idx">10</span><span>Install</span></a>
          <a href="#updates"><span class="idx">11</span><span>Updates</span></a>
          <a href="#spec"><span class="idx">12</span><span>Spec</span></a>
          <a href="#agents"><span class="idx">13</span><span>MCP</span></a>
          <a href="#trouble"><span class="idx">14</span><span>Trouble</span></a>
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
              A desktop app for running several coding agents at once — with your team's tasks,
              WordPress imports and deploys, terminals and code review in the same window. Ask in
              Chat or run them across branches in Code; either way the sidebar shows which agent has
              stopped and needs attention.
            </p>

            <dl class="figures">
              <div>
                <dt>Agents supported</dt>
                <dd><span data-count="19">19</span></dd>
              </div>
              <div>
                <dt>Task trackers</dt>
                <dd><span data-count="5">5</span></dd>
              </div>
              <div>
                <dt>Tools for agents</dt>
                <dd><span data-count="25">25</span></dd>
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
              <a class="btn bare" href="#install">Install steps →</a>
            </div>

            <!-- Decorative recreation of the app window: rail, terminal, status strip. -->
            <div class="app" aria-hidden="true" data-app>
              <div class="app-bar">
                <span class="bd r"></span><span class="bd y"></span><span class="bd g"></span>
                <span class="app-name">Muster</span>
                <span class="app-tab"><span class="app-tab-dot"></span> fix/cart-total — Claude Code</span>
              </div>
              <div class="app-body">
                <aside class="app-rail">
                  <p class="app-k">Projects</p>
                  <ul class="app-tree" data-app-tree></ul>
                  <p class="app-k">Sites</p>
                  <ul class="app-sites">
                    <li><span class="app-site-dot"></span>roads-australia</li>
                    <li><span class="app-site-dot"></span>orleton-om</li>
                  </ul>
                </aside>
                <div class="app-term">
                  <div class="app-lines" data-app-lines></div>
                  <div class="app-statusline">
                    <span class="as-model">Sonnet 5 · high</span>
                    <span class="as-ctx">ctx <i class="as-bar"><b data-app-ctx></b></i> <span data-app-pct>4%</span></span>
                    <span class="as-env">env master</span>
                    <span class="as-agents">← 1 agent</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 02 the model -->
        <section class="panel" id="model">
          <header class="phead">
            <p class="strip"><span class="strip-n">02</span> The model</p>
            <h2>How workspaces work</h2>
            <p class="phead-note">
              Agents sharing one working tree overwrite each other's edits. Muster gives each run its
              own git worktree, so they can't touch the same files.
            </p>
          </header>

          <div class="phases" data-phases>
            <ol class="phase-list">
              <li class="phase" data-phase="0">
                <span class="phase-n">Phase 01</span>
                <h3>Muster creates the workspace</h3>
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
                  hook-reported status. Several can run at once without touching each other's files.
                </p>
              </li>
              <li class="phase" data-phase="2">
                <span class="phase-n">Phase 03</span>
                <h3>You review whoever finished</h3>
                <p>
                  When an agent stops — done, blocked, or asking something — its row lights up in the
                  sidebar. The others keep running while you deal with it.
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

        <!-- ======================================================= 03 chat -->
        <section class="panel" id="chat-sec">
          <header class="phead">
            <p class="strip"><span class="strip-n">03</span> Chat</p>
            <h2>Two modes: Chat and Code</h2>
            <p class="phead-note">
              Code mode is the workspace-and-terminal view above. Chat mode is the same agents
              without the terminal — threads in a sidebar, replies streaming in, and no branch or
              checkout to think about. The tabs sit at the top of the window; Chat is on by default.
            </p>
          </header>

          <div class="feature">
            <div class="feature-copy">
              <ul class="ticks">
                <li>Threads per workspace, renamed and searched from the sidebar</li>
                <li>Pick the model and its effort level per thread</li>
                <li>Slash commands work the same as they do in the terminal</li>
                <li>Drop in files and images — they attach to the message as chips</li>
                <li>Approvals ask once, with a full-access option when you trust the run</li>
                <li>Dictation types straight into the composer</li>
              </ul>
            </div>

            <!-- Decorative recreation of a chat thread. -->
            <div class="mock chat" aria-hidden="true">
              <div class="mock-bar">
                Chat · roads-australia
                <span class="env-pill">Claude</span>
                <span class="mock-n">thinking</span>
              </div>
              <ul class="chat-rows">
                <li class="chat-you">
                  <span class="chat-who">You</span>
                  <span class="chat-msg">Why is the cart total wrong on staging?</span>
                  <span class="chat-chip">#657 Sections Syncer</span>
                </li>
                <li class="chat-agent">
                  <span class="chat-who">Claude</span>
                  <span class="chat-msg">Checked the totals helper — tax is applied twice for…</span>
                </li>
              </ul>
              <div class="chat-foot"><span class="dim">⌘↵ to send · /commands · ⇧ to dictate</span></div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 04 agents -->
        <section class="panel" id="agents-sec">
          <header class="phead">
            <p class="strip"><span class="strip-n">04</span> Agents</p>
            <h2>19 CLI agents, tracked live</h2>
            <p class="phead-note">
              Each agent runs as a session with real state — working, waiting on you, done — reported
              by hooks installed into the agent's own config, not guessed from terminal output. The
              status bar tracks your plan usage for each provider you're signed into.
            </p>
          </header>

          <div class="feature">
            <div class="feature-copy">
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
              <ul class="ticks">
                <li>Dashboard shows every agent's current tool step</li>
                <li>Rows light up when an agent needs an answer</li>
                <li>Sessions resume — history survives a window close</li>
                <li>Per-provider usage meters in the status bar</li>
              </ul>
            </div>

            <!-- Decorative recreation of the agent dashboard. -->
            <div class="mock agentboard" aria-hidden="true">
              <div class="mock-bar">Agents <span class="mock-n" data-agent-count>4 running</span></div>
              <ul class="arow-list" data-agent-rows></ul>
              <div class="usage-strip">
                <span class="us"><i>claude</i><b class="us-bar"><u data-us="34"></u></b>34%</span>
                <span class="us"><i>codex</i><b class="us-bar"><u data-us="12"></u></b>12%</span>
                <span class="us hide-sm"><i>gemini</i><b class="us-bar"><u data-us="61"></u></b>61%</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 04 sites -->
        <section class="panel" id="sites-sec">
          <header class="phead">
            <p class="strip"><span class="strip-n">05</span> Sites</p>
            <h2>WordPress imports and deploys</h2>
            <p class="phead-note">
              Each site keeps its environments, SSH credentials and per-branch targets. The branch
              you have checked out decides where a run goes; if it matches no environment, the run
              refuses to start instead of guessing production.
            </p>
          </header>

          <div class="feature flip">
            <div class="feature-copy">
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
                  <p class="mini">Local stacks</p>
                  <ul class="ticks">
                    <li>LocalWP, MAMP, plain or Agent Local</li>
                  </ul>
                </div>
              </div>
              <ul class="ticks">
                <li>Live logs stream while a run executes, grouped by stage</li>
                <li>The local database is snapshotted before an import, and restorable after</li>
                <li>WP-CLI quick actions for the jobs you run by hand</li>
                <li>Runs started by an agent show the same logs</li>
                <li>Long runs can post their result to Slack</li>
                <li>Credentials stored per environment in the keychain</li>
              </ul>
            </div>

            <!-- Decorative recreation of a deploy run. -->
            <div class="mock runlog" aria-hidden="true">
              <div class="mock-bar">
                deploy · roads-australia
                <span class="env-pill">staging</span>
                <span class="mock-n" data-run-state>running</span>
              </div>
              <ul class="run-steps" data-run-steps>
                <li data-step><span class="rs-m"></span>Git pull on server</li>
                <li data-step><span class="rs-m"></span>Clear server cache</li>
                <li data-step><span class="rs-m"></span>Deploy theme dist</li>
              </ul>
              <div class="run-tail" data-run-tail></div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 05 tasks -->
        <section class="panel" id="tasks-sec">
          <header class="phead">
            <p class="strip"><span class="strip-n">06</span> Tasks</p>
            <h2>Your tracker, in the sidebar</h2>
            <p class="phead-note">
              ActiveCollab by default, with Jira, Linear, GitHub and GitLab a toggle away. My Work lists what
              is assigned to you; open a project to see every task under its own lists, with labels,
              assignee avatars and who created it.
            </p>
          </header>

          <div class="feature">
            <div class="feature-copy">
              <ul class="ticks">
                <li>Start a workspace straight from a task — branch and context prefilled</li>
                <li>Or discuss it in Chat, with the task attached as context</li>
                <li>Comment on the task without leaving the app</li>
                <li>Labels and priorities shown as your tracker sets them</li>
                <li>What's due shows as a badge, with the day's tasks one click from the hero</li>
                <li>New assignments appear as they land</li>
              </ul>
            </div>

            <!-- Decorative recreation of the project task list. -->
            <div class="mock tasks" aria-hidden="true">
              <div class="tasks-bar"><span class="tasks-back">←</span> Dev Portal <span class="tasks-n">47</span></div>
              <p class="tasks-group">Backlog <span>9</span></p>
              <ul class="tasks-rows">
                <li><span class="tid">#728</span><span class="ttl">Improve visibility of tasks in report</span></li>
                <li>
                  <span class="tid">#698</span><span class="ttl">Closed Captions embed integration</span>
                  <span class="tlab lab-y">Coming up</span>
                </li>
                <li class="sel">
                  <span class="tid">#657</span><span class="ttl">Sections Syncer</span>
                  <span class="tlab lab-o">Medium priority</span>
                  <span class="tav">JV</span>
                </li>
              </ul>
              <p class="tasks-group">Current discussion <span>6</span></p>
              <ul class="tasks-rows">
                <li>
                  <span class="tid">#721</span><span class="ttl">Transfer GET vars when redirecting</span>
                  <span class="tlab lab-g">To be discussed</span>
                  <span class="tav">RM</span>
                </li>
                <li><span class="tid">#643</span><span class="ttl">Site Downloader: skip directories</span><span class="tlab lab-r">On hold</span></li>
              </ul>
              <div class="tasks-foot"><span class="tasks-cta">▸ Start work on #657</span><span class="dim">creates workspace · fix/sections-syncer</span></div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 06 review -->
        <section class="panel" id="review">
          <header class="phead">
            <p class="strip"><span class="strip-n">07</span> Review</p>
            <h2>Read the diff, comment, open the PR</h2>
            <p class="phead-note">
              Every workspace has a diff view of what its agent changed. Leave a comment on a line
              and send it to the agent as its next instruction. When it's right, open the pull
              request from the app — GitHub, GitLab, Bitbucket, Gitea or Azure DevOps.
            </p>
          </header>

          <div class="feature flip">
            <div class="feature-copy">
              <ul class="ticks">
                <li>Side-by-side or unified, per file</li>
                <li>Line comments go back to the agent as instructions</li>
                <li>PR title and description drafted from the change</li>
                <li>Works with your provider's PR template</li>
              </ul>
            </div>

            <!-- Decorative recreation of the diff view. -->
            <div class="mock diff" aria-hidden="true">
              <div class="mock-bar">src/cart/totals.ts <span class="mock-n">+6 −3</span></div>
              <ul class="diff-lines">
                <li class="ctx"><span class="dn">41</span>const subtotal = lines.reduce(sum, 0)</li>
                <li class="del"><span class="dn">42</span>const total = round(subtotal * tax)</li>
                <li class="add"><span class="dn">42</span>const total = subtotal * tax</li>
                <li class="add"><span class="dn">43</span>return { total: round(total) }</li>
              </ul>
              <div class="diff-comment" data-diff-comment>
                <p class="dc-a"><span class="tav">JV</span> line 42</p>
                <p class="dc-t">Round once at the end, not per step — cents drift otherwise.</p>
                <p class="dc-send">↩ Sent to Claude Code</p>
              </div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 07 workbench -->
        <section class="panel" id="workbench">
          <header class="phead">
            <p class="strip"><span class="strip-n">08</span> Workbench</p>
            <h2>Terminals, browser and palette</h2>
            <p class="phead-note">
              The rest of the working surface: real split terminals that survive a window close, a
              browser pane for checking the site you're changing, and a command palette over all of
              it.
            </p>
          </header>

          <div class="tiles">
            <article class="tile">
              <h3>Split, persistent terminals</h3>
              <p>
                Split panes with per-pane titles. Local, SSH and remote runtime hosts behave
                identically from the pane's point of view, and sessions survive a window close.
              </p>
            </article>
            <article class="tile">
              <h3>Browser pane</h3>
              <p>
                Open the site next to the agent changing it. Annotate what's wrong on the page and
                send the annotation to the agent.
              </p>
            </article>
            <article class="tile">
              <h3>Dictation</h3>
              <p>
                Speak instead of typing. Transcription lands in whatever field has focus — the chat
                composer, a commit message, a task comment.
              </p>
            </article>
            <article class="tile">
              <h3>Command palette</h3>
              <p>
                <kbd>⌘J</kbd> jumps to any workspace, task or action. Recently used entries come
                first.
              </p>
            </article>
          </div>
        </section>

        <!-- ======================================================= 08 automations -->
        <section class="panel" id="automations">
          <header class="phead">
            <p class="strip"><span class="strip-n">09</span> Automations</p>
            <h2>Agents on a schedule</h2>
            <p class="phead-note">
              An automation is a prompt, a project and a schedule. Muster starts the agent run
              unattended, keeps the full history, and can require a precheck to pass before anything
              starts.
            </p>
          </header>

          <div class="feature">
            <div class="feature-copy">
              <ul class="ticks">
                <li>Cron or picker schedules, with a grace window for missed runs</li>
                <li>Every run keeps its transcript and result</li>
                <li>Prechecks gate the run — fail fast, start nothing</li>
                <li>Manual "run now" whenever you need it early</li>
              </ul>
            </div>

            <!-- Decorative recreation of two automation cards. -->
            <div class="mock autos" aria-hidden="true">
              <div class="auto-card">
                <p class="auto-name">Dependency audit <span class="auto-when">Mon 09:00</span></p>
                <p class="auto-runs"><span class="ar ok"></span><span class="ar ok"></span><span class="ar ok"></span><span class="ar bad"></span><span class="ar ok"></span> <span class="dim">last 5 runs</span></p>
              </div>
              <div class="auto-card">
                <p class="auto-name">Stale branch report <span class="auto-when">Daily 07:30</span></p>
                <p class="auto-runs"><span class="ar ok"></span><span class="ar ok"></span><span class="ar ok"></span><span class="ar ok"></span><span class="ar ok"></span> <span class="dim">last 5 runs</span></p>
              </div>
            </div>
          </div>
        </section>

        <!-- ======================================================= 04 install -->
        <section class="panel" id="install">
          <header class="phead">
            <p class="strip"><span class="strip-n">10</span> Install</p>
            <h2>Four steps, once per Mac</h2>
            <p class="phead-note">
              Step three is a Terminal command; what it does and why is explained under it.
            </p>
          </header>

          <ol class="steps" data-steps>
            <span class="steps-line" aria-hidden="true"><i data-steps-fill></i></span>

            <li class="step">
              <div class="step-n">1</div>
              <div class="step-b">
                <h3>Download the build for your Mac</h3>
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
                    installed. You only run it once — updates arriving through the app are not
                    quarantined.
                  </p>
                </div>
              </div>
            </li>

            <li class="step">
              <div class="step-n">4</div>
              <div class="step-b">
                <h3>Open it and set up</h3>
                <p>
                  First launch asks for a default agent, a theme, and which integrations to connect.
                  All of it can be changed later in Settings.
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
            <p class="strip"><span class="strip-n">11</span> Updates</p>
            <h2>Updates</h2>
          </header>

          <div class="tiles">
            <article class="tile">
              <h3>Checked in the background</h3>
              <p>
                Muster checks for a newer build periodically and offers it when one is ready. Nothing
                installs until you approve the restart.
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
              <h3>No quarantine step for updates</h3>
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
            <p class="strip"><span class="strip-n">12</span> Spec</p>
            <h2>Technical details</h2>
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
            <p class="strip"><span class="strip-n">13</span> For agents</p>
            <h2>The MCP server</h2>
            <p class="phead-note">
              Muster ships an MCP server. An agent working in a checkout gets 25 tools to inspect and
              operate that site, with the same guard rails as the UI.
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
            <p class="strip"><span class="strip-n">14</span> Trouble</p>
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
