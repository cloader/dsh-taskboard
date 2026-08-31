/**
 * Board styles, injected as one global stylesheet with dsh-atb- prefixed
 * classes. Colors ride the shell's --dsw-* design tokens where available so
 * the board follows the active theme/skin; urgency accents are the fixed
 * red/purple/blue of the protocol.
 *
 * @module dsh-taskboard/client/styles
 */

/** The stylesheet text. */
export const STYLES = `
.dsh-atb-entry {
  display: flex; align-items: center; gap: 8px; position: relative;
  width: calc(100% - 8px); margin: 2px 4px; padding: 6px 10px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-text-secondary, inherit); font: inherit; font-size: 13px;
  cursor: pointer; text-align: left;
}
.dsh-atb-entry:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); color: var(--dsw-text-primary, inherit); }
.dsh-atb-entry[data-active="true"] { background: var(--dsw-active, rgba(128,128,128,.18)); color: var(--dsw-text-primary, inherit); font-weight: 500; }
.dsh-atb-entry svg { flex: none; }
/* Status strip on the entry row's right: todo|in_progress|in_review counts. */
.dsh-atb-entry-stats {
  margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; line-height: 1; color: var(--dsw-text-secondary, gray);
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: help;
}
.dsh-atb-entry-sep { opacity: .5; }
/* Each rolling count wears its status color (todo blue | in_progress orange |
   in_review purple); the separators stay in the strip's neutral gray. */
.dsh-atb-roll[data-stat="todo"] { color: #3e63dd; }
.dsh-atb-roll[data-stat="in_progress"] { color: #d9822b; }
.dsh-atb-roll[data-stat="in_review"] { color: #8e4ec6; }
/* One rolling number: fixed one-line window, overflow hidden. */
.dsh-atb-roll {
  position: relative; display: inline-block; overflow: hidden;
  height: 12px; min-width: 1ch; text-align: center; vertical-align: middle;
}
.dsh-atb-rn { display: block; height: 12px; line-height: 12px; text-align: center; }
/* The incoming value sits just outside the window (below for up-scroll). */
.dsh-atb-rn-next { position: absolute; left: 0; right: 0; top: 100%; }
.dsh-atb-roll[data-dir="down"] .dsh-atb-rn-next { top: auto; bottom: 100%; }
.dsh-atb-roll .dsh-atb-rn { transition: transform .3s cubic-bezier(.25, .1, .25, 1); }
.dsh-atb-roll[data-anim="1"][data-dir="up"] .dsh-atb-rn { transform: translateY(-100%); }
.dsh-atb-roll[data-anim="1"][data-dir="down"] .dsh-atb-rn { transform: translateY(100%); }
@media (prefers-reduced-motion: reduce) {
  .dsh-atb-roll .dsh-atb-rn { transition: none; }
}

/* 0.4.3: collapsed rail. Collapsing the sidebar narrows it to an icon rail
 * (layout frame carries data-sidebar-collapsed; the sidebar root toggles its
 * CSS-Module *_collapsed class — dual signals, per the 0.4.2 shell doctrine).
 * The entry then mirrors the native rail geometry (36×36 icon button, no
 * label/stats) — matches .hHd-Xa_collapsed .hHd-Xa_newSession. */
[data-sidebar-collapsed] [data-dsh-atb-entry],
[class*="_collapsed"] [data-dsh-atb-entry] {
  width: 36px; height: 36px; min-width: 36px;
  margin: 0 0 12px; padding: 0;
  justify-content: center; gap: 0; text-align: center;
}
[data-sidebar-collapsed] [data-dsh-atb-entry] .dsh-atb-entry-label,
[data-sidebar-collapsed] [data-dsh-atb-entry] .dsh-atb-entry-stats,
[class*="_collapsed"] [data-dsh-atb-entry] .dsh-atb-entry-label,
[class*="_collapsed"] [data-dsh-atb-entry] .dsh-atb-entry-stats { display: none; }
/* Native rail icons render ~16-20px; scale ours up from 14px to read at parity. */
[data-sidebar-collapsed] [data-dsh-atb-entry] svg,
[class*="_collapsed"] [data-dsh-atb-entry] svg { width: 16px; height: 16px; }

.dsh-atb-search { width: 130px; }
.dsh-atb-badge[data-kind="stale"] { background: rgba(217,130,43,.15); color: #d9822b; }

/* Triple-generation column matching — dev shell's data-pane pane, the
 * official layout shell's CSS-Module hashed centerCol (0.4.2), or DSH
 * Desktop's non-compat extended frame surface (0.5.2, see board-mount.tsx). */
html[data-dsh-atb-active] [data-pane="conversation"] > *:not([data-dsh-atb-view]),
html[data-dsh-atb-active] [class*="centerCol"] > *:not([data-dsh-atb-view]),
html[data-dsh-atb-active] .dshDesktopConversationSurface > *:not([data-dsh-atb-view]) { display: none !important; }
.dsh-atb-view { display: none; }
html[data-dsh-atb-active] .dsh-atb-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.dsh-atb-board { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 12px 16px; gap: 10px; box-sizing: border-box; }
.dsh-atb-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dsh-atb-title { font-size: 15px; font-weight: 600; margin: 0; }
.dsh-atb-count { font-size: 12px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-ver {
  font-size: 11px; color: var(--dsw-text-secondary, gray);
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer;
  text-decoration: none;
  padding: 1px 9px; border-radius: 999px;
  background: var(--dsw-bg-inset, rgba(128,128,128,.1));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.22));
  transition: border-color .12s ease, color .12s ease;
}
.dsh-atb-ver:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.6)); color: inherit; }
.dsh-atb-spacer { flex: 1; }
.dsh-atb-select, .dsh-atb-input {
  font: inherit; font-size: 12.5px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-border, var(--dsw-alias-border-l2, rgba(128,128,128,.35)));
  background: var(--dsw-alias-bg-module-platform, var(--dsw-bg-elevated, var(--dsw-bg, transparent)));
  color: var(--dsw-alias-label-primary, var(--dsw-text-primary, inherit));
  color-scheme: light dark;
}
.dsh-atb-select option,
.dsh-atb-modal-body select option {
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-module-platform, #252830));
  color: var(--dsw-alias-label-primary, var(--dsw-text-primary, #e6e8eb));
}
body[data-ds-dark-theme] .dsh-atb-board,
body[data-ds-dark-theme] .dsh-atb-modal,
body[data-ds-dark-theme] .dsh-atb-select,
body[data-ds-dark-theme] .dsh-atb-input,
body[data-ds-dark-theme] .dsh-atb-modal-body select,
body[data-ds-dark-theme] .dsh-atb-modal-body input,
body[data-ds-dark-theme] .dsh-atb-modal-body textarea {
  color-scheme: dark;
}
body[data-ds-dark-theme] .dsh-atb-select option,
body[data-ds-dark-theme] .dsh-atb-modal-body select option {
  background: #252830;
  color: #e6e8eb;
}
@media (prefers-color-scheme: dark) {
  .dsh-atb-select,
  .dsh-atb-input,
  .dsh-atb-modal-body select,
  .dsh-atb-modal-body input,
  .dsh-atb-modal-body textarea {
    color-scheme: dark;
  }
  .dsh-atb-select option,
  .dsh-atb-modal-body select option {
    background: #252830;
    color: #e6e8eb;
  }
}
.dsh-atb-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; padding: 3px 9px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  background: transparent; color: var(--dsw-text-secondary, inherit);
}
.dsh-atb-chip[data-on="true"] { color: #fff; border-color: transparent; }
.dsh-atb-chip[data-urgency="urgent"][data-on="true"] { background: #e5484d; }
.dsh-atb-chip[data-urgency="normal"][data-on="true"] { background: #8e4ec6; }
.dsh-atb-chip[data-urgency="relaxed"][data-on="true"] { background: #3e63dd; }
.dsh-atb-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dsh-atb-dot[data-urgency="urgent"] { background: #e5484d; }
.dsh-atb-dot[data-urgency="normal"] { background: #8e4ec6; }
.dsh-atb-dot[data-urgency="relaxed"] { background: #3e63dd; }
/* Status dots (column heads): one fixed color per lifecycle status, matching
   the detail pane's status pills. Canceled/archived share the resting gray;
   trashed (pending purge) keeps the red of the 待清除 badge. */
.dsh-atb-dot[data-status="backlog"] { background: #8a8f98; }
.dsh-atb-dot[data-status="todo"] { background: #3e63dd; }
.dsh-atb-dot[data-status="in_progress"] { background: #d9822b; }
.dsh-atb-dot[data-status="in_review"] { background: #8e4ec6; }
.dsh-atb-dot[data-status="done"] { background: #2ea043; }
.dsh-atb-dot[data-status="canceled"], .dsh-atb-dot[data-status="archived"] { background: #8a8f98; }
.dsh-atb-dot[data-status="trashed"] { background: #e5484d; }

.dsh-atb-btn {
  font: inherit; font-size: 12.5px; padding: 5px 11px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.08)); color: inherit;
}
.dsh-atb-btn:hover { background: var(--dsw-hover, rgba(128,128,128,.18)); }
.dsh-atb-btn:disabled { opacity: .45; cursor: default; }
.dsh-atb-btn[data-primary="true"] { background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #1f2328)); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff); }
.dsh-atb-btn[data-danger="true"] { color: var(--dsw-alias-state-error-primary, #e5484d); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 45%, transparent); }

.dsh-atb-columns { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 10px; flex: 1; min-height: 0; overflow-x: auto; }

.dsh-atb-detailpanel {
  display: flex; flex-direction: column;
  flex: none; max-height: 55%; min-height: 180px; overflow: hidden;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.25)); border-radius: 12px;
  background: var(--dsw-bg-panel, var(--dsw-bg-elevated, rgba(128,128,128,.05)));
  padding: 10px 12px; box-shadow: 0 -4px 18px rgba(0,0,0,.12);
}
.dsh-atb-detailpanel .dsh-atb-detail { flex: 1; min-height: 0; }
.dsh-atb-column { display: flex; flex-direction: column; min-width: 200px; min-height: 0; border-radius: 10px; background: var(--dsw-bg-inset, rgba(128,128,128,.07)); padding: 8px; gap: 8px; }
.dsh-atb-colhead { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 2px 4px; }
.dsh-atb-colcount { font-size: 11px; font-weight: 400; color: var(--dsw-text-secondary, gray); }
.dsh-atb-cards { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; flex: 1; padding: 2px; }

.dsh-atb-card {
  position: relative; border-radius: 9px; padding: 8px 10px 8px 13px; cursor: pointer;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.1));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.25));
  font-size: 13px; text-align: left; color: inherit; width: 100%; box-sizing: border-box;
}
.dsh-atb-card:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.55)); }
.dsh-atb-card[draggable="true"] { cursor: grab; }
.dsh-atb-card[data-dragging] { opacity: .45; }
.dsh-atb-column[data-dragover] { outline: 2px dashed var(--dsw-border-strong, rgba(128,128,128,.55)); outline-offset: -2px; background: var(--dsw-bg-hover, rgba(128,128,128,.12)); }
.dsh-atb-card::before {
  content: ""; position: absolute; left: 4px; top: 6px; bottom: 6px; width: 3.5px; border-radius: 3px;
}
.dsh-atb-card[data-urgency="urgent"]::before { background: #e5484d; }
.dsh-atb-card[data-urgency="normal"]::before { background: #8e4ec6; }
.dsh-atb-card[data-urgency="relaxed"]::before { background: #3e63dd; }
.dsh-atb-card-title { font-weight: 550; line-height: 1.35; word-break: break-word; }
.dsh-atb-card-meta { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 11px; color: var(--dsw-text-secondary, gray); flex-wrap: wrap; }
.dsh-atb-badge { font-size: 10.5px; padding: 1px 6px; border-radius: 5px; background: rgba(128,128,128,.18); }
.dsh-atb-badge[data-kind="blocked"] { background: rgba(229,72,77,.18); color: #e5484d; }
.dsh-atb-badge[data-kind="scheduled"] { background: rgba(62,99,221,.16); color: #3e63dd; }
.dsh-atb-badge[data-kind="trashed"] { background: rgba(229,72,77,.14); color: #e5484d; text-decoration: line-through; }
.dsh-atb-badge[data-kind="done"] { background: rgba(46,160,67,.16); color: #2ea043; }
.dsh-atb-badge[data-kind="running"] { background: rgba(229,152,42,.16); color: #e69842; }
.dsh-atb-card-session {
  font: inherit; font-size: 10.5px; line-height: 1; padding: 2px 6px; border-radius: 5px;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.3));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.14));
  color: var(--dsw-text-secondary, inherit);
  cursor: pointer; display: inline-flex; align-items: center; gap: 3px;
  transition: all .15s ease;
}
.dsh-atb-card-session:hover {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  background: var(--dsw-hover, rgba(128,128,128,.24));
  color: var(--dsw-alias-label-primary, inherit);
}

/* ---------- card quick review (in_review column) ---------- */
.dsh-atb-quick { display: flex; gap: 6px; margin-top: 7px; }
.dsh-atb-quickbtn {
  flex: 1; font-size: 11.5px; padding: 3px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.3));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.12)); color: inherit;
}
.dsh-atb-quickbtn:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.6)); }
.dsh-atb-quickbtn[data-act="done"] { background: rgba(46,160,67,.14); color: #2ea043; border-color: rgba(46,160,67,.4); }
.dsh-atb-quickbtn[data-act="done"]:hover { background: rgba(46,160,67,.22); }
.dsh-atb-quickbtn[data-act="reject"] { background: rgba(229,152,42,.12); color: #d9822b; border-color: rgba(229,152,42,.4); }
.dsh-atb-quickbtn[data-act="reject"]:hover { background: rgba(229,152,42,.2); }
.dsh-atb-quick-reject { display: flex; gap: 6px; margin-top: 7px; align-items: stretch; }
.dsh-atb-quick-note { flex: 1; min-width: 0; font-size: 11.5px; padding: 3px 8px; }

.dsh-atb-error { font-size: 12px; color: #e5484d; padding: 4px 8px; border-radius: 6px; background: rgba(229,72,77,.1); }
.dsh-atb-empty { font-size: 12px; color: var(--dsw-text-secondary, gray); padding: 10px 4px; }

/* ---------- detail pane (polished) ---------- */
.dsh-atb-detail {
  display: flex; flex-direction: column; gap: 12px; overflow-y: auto; min-height: 0; flex: 1;
  padding: 2px; position: relative;
}
.dsh-atb-detail::before {
  content: ""; position: sticky; top: 0; height: 3px; border-radius: 3px; flex: none;
}
.dsh-atb-detail[data-urgency="urgent"]::before { background: linear-gradient(90deg, #e5484d, rgba(229,72,77,.15)); }
.dsh-atb-detail[data-urgency="normal"]::before { background: linear-gradient(90deg, #8e4ec6, rgba(142,78,198,.15)); }
.dsh-atb-detail[data-urgency="relaxed"]::before { background: linear-gradient(90deg, #3e63dd, rgba(62,99,221,.15)); }

.dsh-atb-detail-head { display: flex; align-items: flex-start; gap: 10px; }
.dsh-atb-detail-titlewrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-detail-titlebar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-atb-detail-titlebar h3 { margin: 0; font-size: 15.5px; line-height: 1.35; word-break: break-word; }
.dsh-atb-detail-close {
  flex: none; width: 26px; height: 26px; border-radius: 7px; border: none; cursor: pointer;
  background: transparent; color: var(--dsw-text-secondary, gray); font-size: 13px; line-height: 1;
}
.dsh-atb-detail-close:hover { background: var(--dsw-hover, rgba(128,128,128,.18)); color: inherit; }
.dsh-atb-detail-topbtns { display: flex; align-items: center; gap: 6px; flex: none; }
.dsh-atb-detail-edit {
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.07)); color: var(--dsw-text-secondary, inherit);
}
.dsh-atb-detail-edit:hover { border-color: var(--dsw-alias-brand-primary, #1f2328); color: var(--dsw-alias-label-primary, inherit); }
.dsh-atb-detail-session {
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.1));
  color: var(--dsw-alias-label-primary, inherit);
  display: inline-flex; align-items: center; gap: 4px;
}
.dsh-atb-detail-session:hover {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  background: var(--dsw-hover, rgba(128,128,128,.22));
}

.dsh-atb-statuspill {
  flex: none; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; letter-spacing: .02em;
}
.dsh-atb-statuspill[data-status="backlog"] { background: rgba(128,128,128,.18); color: var(--dsw-text-secondary, #888); }
.dsh-atb-statuspill[data-status="todo"] { background: rgba(62,99,221,.15); color: #3e63dd; }
.dsh-atb-statuspill[data-status="in_progress"] { background: rgba(230,152,66,.16); color: #d9822b; }
.dsh-atb-statuspill[data-status="in_review"] { background: rgba(142,78,198,.16); color: #8e4ec6; }
.dsh-atb-statuspill[data-status="done"] { background: rgba(46,160,67,.16); color: #2ea043; }
.dsh-atb-statuspill[data-status="canceled"], .dsh-atb-statuspill[data-status="archived"] { background: rgba(128,128,128,.14); color: var(--dsw-text-secondary, #888); }

.dsh-atb-detail-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-chip2 {
  display: inline-flex; align-items: center; gap: 4px; font-size: 11px; line-height: 1;
  padding: 3px 8px; border-radius: 6px;
  background: var(--dsw-bg-inset, rgba(128,128,128,.09)); color: var(--dsw-text-secondary, #999);
}
button.dsh-atb-chip2.dsh-atb-chip-btn {
  font: inherit; border: 1px solid var(--dsw-border, rgba(128,128,128,.25)); cursor: pointer;
}
button.dsh-atb-chip2.dsh-atb-chip-btn:hover {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-hover, rgba(128,128,128,.2));
}
.dsh-atb-chip2-icon { font-size: 10.5px; opacity: .85; }
.dsh-atb-chip2[data-tone="urgent"] { background: rgba(229,72,77,.15); color: #e5484d; }
.dsh-atb-chip2[data-tone="normal"] { background: rgba(142,78,198,.14); color: #a06ce0; }
.dsh-atb-chip2[data-tone="relaxed"] { background: rgba(62,99,221,.13); color: #6d92e8; }
.dsh-atb-detail-sub { font-size: 11.5px; color: var(--dsw-text-secondary, gray); }

.dsh-atb-fieldcard {
  border: 1px solid var(--dsw-border, rgba(128,128,128,.22)); border-radius: 10px;
  padding: 9px 11px; display: flex; flex-direction: column; gap: 5px;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.06));
}
.dsh-atb-fieldcard-label {
  font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
  color: var(--dsw-text-secondary, gray);
}
.dsh-atb-fieldcard[data-kind="prompt"] .dsh-atb-fieldcard-label { color: #8e63c8; }
.dsh-atb-promptbox {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
  background: var(--dsw-bg-inset, rgba(128,128,128,.08)); border-radius: 7px; padding: 8px 10px;
  border: 1px dashed var(--dsw-border, rgba(128,128,128,.25));
}
.dsh-atb-desc { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.55; }

.dsh-atb-detail-actions { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-detail-run {
  font: inherit; font-size: 12px; font-weight: 600; padding: 4px 11px; border-radius: 7px; cursor: pointer;
  border: 1px solid transparent; background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #1f2328)); color: var(--dsw-alias-label-primary-foreground, #fff);
  transition: filter .12s ease;
}
.dsh-atb-detail-run:hover { filter: brightness(1.1); }
.dsh-atb-detail-run[data-danger="true"] { background: rgba(229,72,77,.92); }
.dsh-atb-movebtns { display: flex; gap: 6px; flex-wrap: wrap; }
.dsh-atb-movebtn {
  font: inherit; font-size: 12px; padding: 4px 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.07)); color: var(--dsw-text-secondary, inherit);
  transition: border-color .12s ease, color .12s ease;
}
.dsh-atb-movebtn:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.6)); color: inherit; }
.dsh-atb-movebtn[data-to="done"] { border-color: rgba(46,160,67,.55); color: #2ea043; }
.dsh-atb-movebtn[data-to="done"]:hover { background: rgba(46,160,67,.12); }
.dsh-atb-movebtn[data-to="canceled"], .dsh-atb-movebtn[data-to="archived"] { opacity: .75; }
.dsh-atb-movebtn[data-to="blocked"] { border-color: rgba(229,72,77,.45); }
.dsh-atb-movebtn[data-to="blocked"]:hover { background: rgba(229,72,77,.1); }
.dsh-atb-confirm { display: inline-flex; align-items: center; gap: 6px; }
.dsh-atb-confirm-label { font-size: 11.5px; color: var(--dsw-text-secondary, gray); }

.dsh-atb-section { font-size: 13px; display: flex; flex-direction: column; gap: 7px; }
.dsh-atb-section h4 {
  margin: 0; font-size: 11px; color: var(--dsw-text-secondary, gray);
  text-transform: uppercase; letter-spacing: .05em; display: flex; align-items: center; gap: 6px;
}
.dsh-atb-count2 {
  font-size: 10px; font-weight: 600; padding: 0 6px; border-radius: 999px; line-height: 16px;
  background: var(--dsw-bg-inset, rgba(128,128,128,.14)); color: var(--dsw-text-secondary, gray);
}
.dsh-atb-empty2 { font-size: 12px; color: var(--dsw-text-secondary, gray); padding: 8px 0; }

.dsh-atb-commentlist { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-bubble { display: flex; gap: 8px; }
.dsh-atb-bubble-avatar {
  flex: none; width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; background: var(--dsw-bg-inset, rgba(128,128,128,.12));
}
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-avatar { background: rgba(142,78,198,.15); }
.dsh-atb-bubble-main {
  flex: 1; min-width: 0; border-radius: 10px; padding: 6px 10px;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.08));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.18));
}
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-main { border-color: rgba(142,78,198,.3); background: rgba(142,78,198,.07); }
.dsh-atb-bubble-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
.dsh-atb-bubble-meta b { font-size: 11.5px; font-weight: 600; color: var(--dsw-text-primary, inherit); }
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-meta b { color: #a06ce0; }
.dsh-atb-bubble-meta span { font-size: 10.5px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-bubble-body { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }

.dsh-atb-composer { display: flex; gap: 7px; align-items: flex-end; margin-top: 2px; }
.dsh-atb-composer-input {
  flex: 1; font: inherit; font-size: 12.5px; line-height: 1.5; padding: 7px 10px; border-radius: 9px;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg, transparent); color: inherit; resize: vertical; min-height: 38px;
}
.dsh-atb-composer-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary, #1f2328); }
.dsh-atb-composer-send {
  flex: none; font: inherit; font-size: 12.5px; padding: 7px 14px; border-radius: 9px; cursor: pointer;
  border: 1px solid transparent; background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #1f2328)); color: var(--dsw-alias-label-primary-foreground, #fff);
}
.dsh-atb-composer-send:disabled { opacity: .4; cursor: default; }

.dsh-atb-execlist { display: flex; flex-direction: column; gap: 5px; }
.dsh-atb-exec-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px;
  padding: 5px 9px; border-radius: 8px;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.07));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.16));
}
.dsh-atb-exec-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: rgba(128,128,128,.5); }
.dsh-atb-exec-dot[data-outcome="succeeded"] { background: #2ea043; box-shadow: 0 0 0 3px rgba(46,160,67,.15); }
.dsh-atb-exec-dot[data-outcome="failed"] { background: #e5484d; box-shadow: 0 0 0 3px rgba(229,72,77,.15); }
.dsh-atb-exec-dot[data-outcome="running"] { background: #d9822b; box-shadow: 0 0 0 3px rgba(217,130,43,.18); animation: dsh-atb-pulse 1.6s ease-in-out infinite; }
@keyframes dsh-atb-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.dsh-atb-exec-trigger { font-size: 11px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-exec-outcome { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 5px; }
.dsh-atb-exec-outcome[data-outcome="succeeded"] { background: rgba(46,160,67,.15); color: #2ea043; }
.dsh-atb-exec-outcome[data-outcome="failed"] { background: rgba(229,72,77,.14); color: #e5484d; }
.dsh-atb-exec-outcome[data-outcome="running"] { background: rgba(217,130,43,.15); color: #d9822b; }
.dsh-atb-exec-outcome[data-outcome="cancelled"] { background: rgba(128,128,128,.15); color: var(--dsw-text-secondary, gray); }
.dsh-atb-exec-time { font-size: 11px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-exec-session {
  font: inherit; font-size: 11px; color: var(--dsw-text-secondary, gray);
  background: none; border: none; padding: 0; cursor: pointer;
}
.dsh-atb-exec-session:hover { color: var(--dsw-alias-brand-primary, inherit); text-decoration: underline dotted; }
.dsh-atb-exec-error { flex-basis: 100%; font-size: 11px; color: #e5484d; word-break: break-all; }

.dsh-atb-dangerzone {
  display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px;
  border-top: 1px dashed var(--dsw-border, rgba(128,128,128,.25));
}

/* ---------- task form modal (create + edit, polished) ---------- */
.dsh-atb-modal-backdrop {
  position: fixed; inset: 0; z-index: 80;
  background: var(--dsw-alias-bg-mask-drop, rgba(28,30,36,.4)); backdrop-filter: var(--dsw-mask-blur, blur(2px));
  display: flex; align-items: center; justify-content: center;
  animation: dsh-atb-fade .14s ease;
}
@keyframes dsh-atb-fade { from { opacity: 0; } }
.dsh-atb-modal {
  width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 80px);
  display: flex; flex-direction: column; overflow: hidden; border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.18));
  animation: dsh-atb-pop .16s ease;
}
@keyframes dsh-atb-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
.dsh-atb-modal-head {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
}
.dsh-atb-modal-headicon {
  flex: none; width: 30px; height: 30px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; background: var(--dsw-alias-brand-primary, #1f2328); color: var(--dsw-alias-label-primary-foreground, #fff);
}
.dsh-atb-modal-headtext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dsh-atb-modal-headtext h3 { margin: 0; font-size: 15px; line-height: 1.3; }
.dsh-atb-modal-headtext p { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary, gray); }
.dsh-atb-modal-close {
  flex: none; width: 26px; height: 26px; border-radius: 7px; border: none; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-tertiary, gray); font-size: 13px; line-height: 1;
}
.dsh-atb-modal-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18)); color: var(--dsw-alias-label-primary, inherit); }

.dsh-atb-modal-body {
  padding: 13px 16px; overflow-y: auto;
  display: grid; grid-template-columns: 1fr 1fr; gap: 11px 10px;
}
.dsh-atb-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.dsh-atb-field[data-span="full"] { grid-column: 1 / -1; }
.dsh-atb-field-label {
  display: flex; align-items: center; gap: 3px;
  font-size: 11px; font-weight: 600; letter-spacing: .03em;
  color: var(--dsw-alias-label-secondary, gray);
}
.dsh-atb-req { color: var(--dsw-alias-state-error-primary, #e5484d); font-style: normal; }
.dsh-atb-modal-body input, .dsh-atb-modal-body textarea, .dsh-atb-modal-body select {
  font: inherit; font-size: 13px; padding: 7px 10px; border-radius: 8px;
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: var(--dsw-specific-input-major, transparent); color: var(--dsw-alias-label-primary, inherit);
  transition: border-color .12s ease, box-shadow .12s ease;
}
.dsh-atb-modal-body textarea { min-height: 64px; resize: vertical; }
.dsh-atb-modal-body input:focus, .dsh-atb-modal-body textarea:focus, .dsh-atb-modal-body select:focus {
  outline: none; border-color: var(--dsw-alias-brand-primary, #1f2328);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 18%, transparent);
}
.dsh-atb-modal-body .dsh-atb-input-bad { border-color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-modal-body .dsh-atb-input-bad:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 20%, transparent); }

.dsh-atb-urgency-picker { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.dsh-atb-urgency-opt {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 8px 10px; border-radius: 9px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; color: inherit;
  transition: border-color .12s ease, background .12s ease;
}
.dsh-atb-urgency-name { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
.dsh-atb-urgency-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-urgency-opt:hover { border-color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.6)); }
.dsh-atb-urgency-opt[data-on="true"][data-urgency="urgent"] { border-color: rgba(229,72,77,.65); background: rgba(229,72,77,.1); }
.dsh-atb-urgency-opt[data-on="true"][data-urgency="normal"] { border-color: rgba(142,78,198,.65); background: rgba(142,78,198,.1); }
.dsh-atb-urgency-opt[data-on="true"][data-urgency="relaxed"] { border-color: rgba(62,99,221,.65); background: rgba(62,99,221,.1); }

.dsh-atb-mode-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.dsh-atb-mode-opt {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 8px 10px; border-radius: 9px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; color: inherit;
  transition: border-color .12s ease, background .12s ease;
}
.dsh-atb-mode-name { font-size: 12.5px; font-weight: 600; }
.dsh-atb-mode-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-mode-opt:hover { border-color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.6)); }
.dsh-atb-mode-opt[data-on="true"] { border-color: var(--dsw-alias-brand-primary, #1f2328); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 8%, transparent); }

.dsh-atb-cron-presets { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-cron-preset {
  font: inherit; font-size: 11px; padding: 2px 9px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
}
.dsh-atb-cron-preset:hover { border-color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.6)); color: inherit; }
.dsh-atb-cron-preset[data-on="true"] { border-color: transparent; background: var(--dsw-alias-brand-primary, #1f2328); color: var(--dsw-alias-label-primary-foreground, #fff); }
.dsh-atb-cron-next { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }

.dsh-atb-modal-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.04));
}
.dsh-atb-modal-hint { flex: 1; min-width: 0; font-size: 11.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-modal-hint[data-tone="bad"] { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-modal-footbtns { display: flex; gap: 8px; }

.dsh-atb-secondary { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-link { color: var(--dsw-alias-state-business-primary, #3e63dd); cursor: pointer; text-decoration: none; }
.dsh-atb-link:hover { text-decoration: underline; }

/* ---------- alert modal ---------- */
.dsh-atb-alert-backdrop {
  position: fixed; inset: 0; z-index: 90;
  background: var(--dsw-alias-bg-mask-drop, rgba(28,30,36,.4)); backdrop-filter: var(--dsw-mask-blur, blur(2px));
  display: flex; align-items: center; justify-content: center;
  animation: dsh-atb-fade .12s ease;
}
.dsh-atb-alert {
  min-width: 280px; max-width: 380px; padding: 20px 24px; border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.18));
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  animation: dsh-atb-pop .14s ease;
}
.dsh-atb-alert-icon { font-size: 28px; line-height: 1; }
.dsh-atb-alert-msg {
  font-size: 13.5px; line-height: 1.55; text-align: center;
  word-break: break-word; white-space: pre-wrap;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-atb-alert .dsh-atb-btn { padding: 6px 28px; font-size: 13px; }

/* ---------- 0.3.0 isolation ---------- */
.dsh-atb-isolation-note { display: block; margin-top: 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-mode-picker[data-disabled="true"] .dsh-atb-mode-opt { cursor: not-allowed; opacity: .55; }
.dsh-atb-iso-none { font-size: 12.5px; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-facts { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 8px; }
.dsh-atb-iso-fact { font-size: 11.5px; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-fact b { font-weight: 600; color: var(--dsw-alias-state-business-primary, #3e63dd); }
.dsh-atb-iso-commits { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.dsh-atb-iso-commit { display: flex; gap: 8px; font-size: 11.5px; align-items: baseline; }
.dsh-atb-iso-commit code {
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
  color: var(--dsh-alias-state-business-primary, #3e63dd); flex-shrink: 0;
}
.dsh-atb-iso-commit span { word-break: break-all; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-more { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-iso-nocommit { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, gray); margin-bottom: 8px; }
.dsh-atb-iso-dirty {
  font-size: 11.5px; color: var(--dsw-alias-state-error-primary, #e5484d);
  background: rgba(229,72,77,.09); border: 1px solid rgba(229,72,77,.35);
  border-radius: 8px; padding: 6px 10px; margin-bottom: 8px;
}
.dsh-atb-iso-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-atb-iso-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }

/* ---------- 0.3.0 diagnostics ---------- */
.dsh-atb-diag { max-width: 520px; width: min(520px, 92vw); }
.dsh-atb-diag-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.dsh-atb-diag-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 6px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.04));
}
.dsh-atb-diag-item b { font-size: 18px; font-weight: 700; }
.dsh-atb-diag-item span { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-diag-item[data-bad="true"] b { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-diag-sec h4 { margin: 0 0 8px; font-size: 12.5px; }
.dsh-atb-diag-orphans { display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-diag-orphan {
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 7px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
}
.dsh-atb-diag-orphan-path { font-size: 11.5px; font-family: ui-monospace, Consolas, monospace; word-break: break-all; }

/* ---------- 0.4.0 checklist ---------- */
.dsh-atb-cke { display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-cke-row { display: flex; align-items: center; gap: 8px; }
.dsh-atb-cke-box { flex-shrink: 0; width: 15px; height: 15px; cursor: pointer; }
.dsh-atb-cke-text {
  flex: 1; min-width: 0; font-size: 12.5px; padding: 6px 9px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3));
  background: var(--dsw-alias-bg-layer-1, transparent); color: inherit;
}
.dsh-atb-cke-del {
  flex-shrink: 0; border: none; background: none; cursor: pointer; padding: 4px;
  color: var(--dsw-alias-label-tertiary, gray); font-size: 12px; border-radius: 6px;
}
.dsh-atb-cke-del:hover { color: var(--dsw-alias-state-error-primary, #e5484d); background: rgba(229,72,77,.08); }
.dsh-atb-cke-add {
  align-self: flex-start; border: 1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,.4));
  background: none; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer;
  font-size: 11.5px; padding: 5px 12px; border-radius: 8px;
}
.dsh-atb-cke-add:hover { color: var(--dsw-alias-state-business-primary, #3e63dd); border-color: var(--dsw-alias-state-business-primary, #3e63dd); }
.dsh-atb-cke-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }

.dsh-atb-cl-progress { margin-left: 8px; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-cl-progress[data-tone="bad"] { color: var(--dsw-alias-state-error-primary, #e5484d); font-weight: 600; }
.dsh-atb-cl-items { display: flex; flex-direction: column; gap: 5px; }
.dsh-atb-cl-item {
  display: flex; align-items: baseline; gap: 9px; padding: 6px 9px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.03)); cursor: pointer;
}
.dsh-atb-cl-item:hover { border-color: var(--dsw-alias-border-l2, rgba(128,128,128,.4)); }
.dsh-atb-cl-item input { flex-shrink: 0; transform: translateY(1px); cursor: pointer; }
.dsh-atb-cl-item[data-checked="true"] .dsh-atb-cl-text { text-decoration: line-through; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-cl-item[data-alert="true"] {
  border-color: rgba(229,72,77,.45); background: rgba(229,72,77,.06);
}
.dsh-atb-cl-text { flex: 1; min-width: 0; font-size: 12.5px; word-break: break-word; }
.dsh-atb-cl-meta { flex-shrink: 0; font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.dsh-atb-cl-note { max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-secondary, inherit); }

/* ---------- 0.4.0 report ---------- */
.dsh-atb-rpt-summary { font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
.dsh-atb-rpt-sec { margin-bottom: 8px; }
.dsh-atb-rpt-label { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); margin-bottom: 4px; }
.dsh-atb-rpt-list { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.55; word-break: break-all; }
.dsh-atb-rpt-risk {
  font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
  color: var(--dsw-alias-state-warn-primary, #f5a524);
  background: rgba(245,165,36,.08); border: 1px solid rgba(245,165,36,.3);
  border-radius: 8px; padding: 6px 10px;
}

/* ---------- 0.4.0 diff viewer ---------- */
.dsh-atb-iso-commit { display: flex; flex-direction: column; gap: 3px; }
.dsh-atb-iso-commit-btn {
  display: flex; gap: 8px; font-size: 11.5px; align-items: baseline; text-align: left;
  border: none; background: none; padding: 2px 4px; margin: 0 -4px; border-radius: 6px; cursor: pointer;
  color: inherit; width: fit-content; max-width: 100%;
}
.dsh-atb-iso-commit-btn:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); }
.dsh-atb-iso-commit-btn code {
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
  color: var(--dsw-alias-state-business-primary, #3e63dd); flex-shrink: 0;
}
.dsh-atb-iso-commit-btn span { word-break: break-all; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-commit[data-open="true"] > .dsh-atb-iso-commit-btn code { font-weight: 700; }
.dsh-atb-iso-dirty { display: flex; flex-direction: column; gap: 6px;
  font-size: 11.5px; color: var(--dsw-alias-state-error-primary, #e5484d);
  background: rgba(229,72,77,.09); border: 1px solid rgba(229,72,77,.35);
  border-radius: 8px; padding: 6px 10px; margin-bottom: 8px;
}
.dsh-atb-iso-dirty-toggle { border: none; background: none; cursor: pointer; padding: 0; text-align: left; color: inherit; font-size: inherit; }
.dsh-atb-iso-dirty-files { display: flex; flex-direction: column; gap: 2px; }
.dsh-atb-iso-dirty-file {
  border: none; background: none; cursor: pointer; text-align: left; padding: 1px 2px;
  font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); border-radius: 4px; word-break: break-all;
}
.dsh-atb-iso-dirty-file:hover { background: rgba(128,128,128,.1); color: var(--dsw-alias-state-business-primary, #3e63dd); }
.dsh-atb-iso-dirty-file code { font-family: ui-monospace, Consolas, monospace; font-size: 10px; margin-right: 6px; }
.dsh-atb-diffview { margin-top: 6px; border-radius: 8px; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); }
.dsh-atb-diffview-head { display: flex; align-items: center; gap: 10px; padding: 5px 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); }
.dsh-atb-diffview-title { font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
  color: var(--dsw-alias-state-business-primary, #3e63dd); word-break: break-all; }
.dsh-atb-diffview-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-diffview-error { padding: 8px 10px; font-size: 11.5px; color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-diffview-pre {
  margin: 0; padding: 8px 10px; max-height: 340px; overflow: auto;
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; line-height: 1.5;
  white-space: pre; color: var(--dsw-alias-label-secondary, inherit);
}

/* ---------- 0.4.0 new-task menu + template manager + import ---------- */
.dsh-atb-newmenu { position: relative; display: inline-flex; }
.dsh-atb-newmenu-backdrop { position: fixed; inset: 0; z-index: 40; }
.dsh-atb-newmenu-list {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 41; min-width: 180px;
  display: flex; flex-direction: column; padding: 5px; border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.18));
}
.dsh-atb-newmenu-opt {
  border: none; background: none; text-align: left; cursor: pointer; padding: 7px 10px;
  font-size: 12.5px; color: inherit; border-radius: 7px; white-space: nowrap;
}
.dsh-atb-newmenu-opt:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.1)); }
.dsh-atb-newmenu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l2, rgba(128,128,128,.25)); }

.dsh-atb-tplm { max-width: 600px; width: min(600px, 92vw); }
.dsh-atb-tplm .dsh-atb-modal-body,
.dsh-atb-set .dsh-atb-modal-body,
.dsh-atb-diag .dsh-atb-modal-body,
.dsh-atb-imp .dsh-atb-modal-body {
  display: flex; flex-direction: column; gap: 10px;
}
.dsh-atb-tplm-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.dsh-atb-tplm-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.02));
}
.dsh-atb-tplm-name {
  flex: 0 0 150px; width: 150px; max-width: 150px; font-size: 12.5px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3));
  background: var(--dsw-alias-bg-layer-1, transparent); color: inherit;
  box-sizing: border-box;
}
.dsh-atb-tplm-meta {
  flex: 1; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-tertiary, gray);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-atb-tplm-btns { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.dsh-atb-imp { max-width: 600px; width: min(600px, 92vw); }
.dsh-atb-imp-picker { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.dsh-atb-imp-picker input[type="file"] { font-size: 12px; }
.dsh-atb-imp-filename { font-size: 11.5px; color: var(--dsw-alias-state-business-primary, #3e63dd); word-break: break-all; }
.dsh-atb-imp-note { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); margin-bottom: 10px; }
.dsh-atb-imp-error { font-size: 12px; color: var(--dsw-alias-state-error-primary, #e5484d); margin-bottom: 8px; }
.dsh-atb-imp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.dsh-atb-imp-stat {
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 9px 6px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
}
.dsh-atb-imp-stat b { font-size: 17px; font-weight: 700; }
.dsh-atb-imp-stat span { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-imp-stat[data-tone="ok"] b { color: var(--dsw-alias-state-success-primary, #30a46c); }
.dsh-atb-imp-stat[data-tone="warn"] b { color: var(--dsw-alias-state-warn-primary, #f5a524); }
.dsh-atb-imp-stat[data-tone="bad"] b { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-imp-sec h4 { margin: 0 0 6px; font-size: 12px; }
.dsh-atb-imp-sec { margin-bottom: 10px; }
.dsh-atb-imp-list { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
.dsh-atb-imp-row {
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 5px 9px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2));
}
.dsh-atb-imp-row[data-tone="bad"] { border-color: rgba(229,72,77,.35); }
.dsh-atb-imp-row-title { font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-atb-imp-row-status { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); flex-shrink: 0; }
.dsh-atb-imp-result { font-size: 12px; color: var(--dsw-alias-state-success-primary, #30a46c); margin-top: 10px; }
.dsh-atb-badge[data-kind="checklist"] { color: var(--dsw-alias-label-secondary, inherit); }
/* ---------- 0.5.0 board settings ---------- */
.dsh-atb-set { max-width: 460px; width: min(460px, 92vw); }
.dsh-atb-set .dsh-atb-mode-picker { margin-top: 8px; }
.dsh-atb-set .dsh-atb-isolation-note { margin-top: 10px; }

/* ---------- 0.5.5 SlashPromptInput & Permission Picker ---------- */
.dsh-atb-perm-picker { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 4px; }
.dsh-atb-perm-opt {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 8px 10px; border-radius: 9px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; color: inherit;
  transition: border-color .12s ease, background .12s ease;
}
.dsh-atb-perm-name { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; }
.dsh-atb-perm-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); line-height: 1.35; }
.dsh-atb-perm-opt:hover { border-color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.6)); }
.dsh-atb-perm-opt[data-on="true"] {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 9%, transparent);
}

.dsh-atb-prompt-wrap {
  display: flex; flex-direction: column; gap: 6px; position: relative; width: 100%;
  border-radius: 9px; transition: border-color .12s ease;
}
.dsh-atb-prompt-wrap[data-drag-over="true"] {
  outline: 2px dashed var(--dsw-alias-brand-primary, #1f2328);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 6%, transparent);
}
.dsh-atb-prompt-inner { position: relative; width: 100%; }
.dsh-atb-prompt-input {
  width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; line-height: 1.5;
  padding: 7px 10px; border-radius: 8px; resize: vertical; min-height: 68px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: var(--dsw-specific-input-major, transparent); color: var(--dsw-alias-label-primary, inherit);
}
.dsh-atb-prompt-input:focus {
  outline: none; border-color: var(--dsw-alias-brand-primary, #1f2328);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 18%, transparent);
}

/* Slash Autocomplete Popup */
.dsh-atb-slash-popup {
  position: absolute; left: 0; bottom: calc(100% + 6px); width: 100%; max-height: 240px; z-index: 100;
  display: flex; flex-direction: column; overflow: hidden; border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.28));
  box-shadow: var(--dsw-shadow-lv3, 0 10px 28px rgba(0,0,0,.22));
}
.dsh-atb-slash-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.15));
  background: var(--dsw-alias-bg-elevated, rgba(128,128,128,.06));
}
.dsh-atb-slash-title { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary, gray); }
.dsh-atb-slash-hint { font-size: 10px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-slash-list { overflow-y: auto; max-height: 200px; display: flex; flex-direction: column; padding: 4px; }
.dsh-atb-slash-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px;
  cursor: pointer; font-size: 12px; transition: background .1s ease;
}
.dsh-atb-slash-item[data-active="true"], .dsh-atb-slash-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14));
}
.dsh-atb-slash-badge {
  font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; flex-shrink: 0;
}
.dsh-atb-slash-badge[data-kind="command"] { background: rgba(217,130,43,.15); color: #d9822b; }
.dsh-atb-slash-badge[data-kind="skill"] { background: rgba(142,78,198,.15); color: #a06ce0; }
.dsh-atb-slash-name { font-weight: 600; font-family: monospace; font-size: 12.5px; }
.dsh-atb-slash-param { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); font-family: monospace; }
.dsh-atb-slash-desc { font-size: 11px; color: var(--dsw-alias-label-secondary, gray); margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }

/* Image Rail */
.dsh-atb-img-rail {
  display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, rgba(128,128,128,.07));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
}
.dsh-atb-img-rail-label { font-size: 10.5px; font-weight: 600; color: var(--dsw-alias-label-secondary, gray); }
.dsh-atb-img-list { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-atb-img-card {
  display: flex; align-items: center; gap: 6px; padding: 3px 6px 3px 4px; border-radius: 6px;
  background: var(--dsw-alias-bg-overlay, #fff); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
}
.dsh-atb-img-thumb { width: 28px; height: 28px; object-fit: cover; border-radius: 4px; cursor: zoom-in; }
.dsh-atb-img-name { font-size: 11px; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-atb-img-del {
  border: none; background: transparent; cursor: pointer; color: var(--dsw-alias-label-tertiary, gray);
  font-size: 11px; padding: 2px 4px; border-radius: 4px; line-height: 1;
}
.dsh-atb-img-del:hover { background: rgba(229,72,77,.15); color: #e5484d; }

/* Prompt Foot Toolbar */
.dsh-atb-prompt-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-atb-prompt-tip { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-prompt-tip code { font-size: 10.5px; padding: 1px 4px; border-radius: 4px; background: rgba(128,128,128,.14); }
.dsh-atb-prompt-imgbtn {
  font: inherit; font-size: 11px; padding: 3px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3));
  background: var(--dsw-alias-bg-elevated, rgba(128,128,128,.08));
  color: var(--dsw-alias-label-secondary, inherit); flex-shrink: 0;
}
.dsh-atb-prompt-imgbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18)); }

/* Detail Markdown & Images */
.dsh-atb-markdown-body { display: flex; flex-direction: column; gap: 8px; white-space: pre-wrap; word-break: break-word; }
.dsh-atb-detail-img-wrap { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
.dsh-atb-detail-img {
  max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2));
  cursor: zoom-in; background: rgba(0,0,0,.02);
}
.dsh-atb-detail-img-caption { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); font-style: italic; }

/* Lightbox Modal */
.dsh-atb-lightbox-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.75); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: dsh-atb-fade .14s ease;
}
.dsh-atb-lightbox-content {
  position: relative; max-width: 90vw; max-height: 90vh;
  display: flex; align-items: center; justify-content: center;
}
.dsh-atb-lightbox-img {
  max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px;
  box-shadow: 0 16px 40px rgba(0,0,0,.45);
}
.dsh-atb-lightbox-close {
  position: absolute; top: -14px; right: -14px; width: 32px; height: 32px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.3); background: rgba(20,20,20,.85); color: #fff;
  font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.dsh-atb-lightbox-close:hover { background: #e5484d; border-color: transparent; }
`

/** Style element id (stable since 0.1.x: hook for tests and debugging). */
const STYLE_ID = 'dsh-taskboard-styles'

/**
 * Ownership tag for the shell's client-module bookkeeping. The web shell
 * claims every UNTAGGED `<style>` for whichever plugin module materializes
 * next (claimStyles in dsh-client-modules), and the client HMR driver
 * deletes `<style>` tags by this attribute on every rebuilt entry
 * (removeOwnedStyles in dsh-client-hmr).
 */
const PLUGIN_ID = 'dsh-taskboard'

/** Per-stylesheet identity, mirroring the shell's own data-plugin-css. */
const CSS_TAG = 'dsh-taskboard/styles'

/**
 * Ensure the stylesheet lives in <head>: create when absent, re-attach when
 * removed, always carry the ownership tags.
 *
 * 0.4.4 fix (field report: CSS randomly dropped, board renders as unstyled
 * HTML until refresh): injection runs from cordis apply(), which resolves
 * AFTER this module's materialization, so the old untagged <style> could be
 * claimed by ANY sibling plugin module that materialized later (observed
 * with lazily-materializing profile bundles). That sibling's next HMR
 * rebuild then deleted OUR stylesheet, and the old module-level `injected`
 * flag blocked re-injection until a full page refresh. Pre-tagging pins
 * ownership to this plugin: sibling claims skip tagged styles, and only
 * THIS plugin's rebuild removes it — the fresh apply re-injects. Idempotency
 * is DOM-based for the same reason: a module flag cannot see removals,
 * getElementById can. A found element is re-tagged too, so a leftover
 * pre-0.4.4 element adopted across a hot swap heals its ownership.
 */
export function injectStyles(): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID)
  if (style === null) {
    style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    document.head.append(style)
  }
  style.dataset.plugin = PLUGIN_ID
  style.dataset.pluginCss = CSS_TAG
}
