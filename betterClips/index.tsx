/*
 * BetterClips - Discord Clips bitrate above the stock 100% limit, per window/screen, plus tidy file names.
 * Copyright (c) 2026 UrikRait
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 *
 * Discord keeps clipsQuality.bitratePercent in ClipsStore and turns it into kbps in the media engine:
 *     function er(e){ if(e!=null) return Math.round(6e3*Math.min(100,Math.max(10,e))/100) }
 * Every path that applies clip settings (setClipsSource, setClipsQualitySettings) goes through it,
 * so the patch only removes the 100 cap. The plugin then writes the wanted percent into ClipsStore
 * with Discord's own CLIPS_SETTINGS_UPDATE action, and ClipsManager re-applies the encoder settings
 * without a restart. A percent is remembered per game and applied when that game is launched.
 * Measured at 2560x1440: 100% ~ 15 Mbps, 400% ~ 60 Mbps (scales linearly).
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import definePlugin, { defineDefault, OptionType, PluginNative } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { FluxDispatcher, Menu, Modal, openModal, RunningGameStore, showToast, useState } from "@webpack/common";

const ClipsStore = findStoreLazy("ClipsStore");
const Native = VencordNative.pluginHelpers.BetterClips as PluginNative<typeof import("./native")>;

const MIN = 25, MAX = 800, STEP = 25;
const MBPS_PER_PERCENT = 0.15;   // ~15 Mbps at 100% for 1440p60 recordings

const clamp = (p: number) => Math.min(MAX, Math.max(MIN, Math.round(p)));
const mbps = (p: number) => Math.round(p * MBPS_PER_PERCENT);

const settings = definePluginSettings({
    defaultPercentStock: {
        type: OptionType.NUMBER,
        description: "Bitrate % for windows/screens without their own value (100 = Discord's stock, ~15 Mbps at 1440p)",
        default: 100,
    },
    organizeClips: {
        type: OptionType.BOOLEAN,
        description: "Save clips as <Game>/<Game>_YYYY-MM-DD_HH-mm-ss.mp4 and screens under Рабочий стол/<Экран N>/",
        default: true,
    },
    clipFolders: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    games: {
        type: OptionType.COMPONENT,
        component: ErrorBoundary.wrap(() => <GamesEditor />),
        default: defineDefault<Record<string, number>>({}),
    },
});

function percentFor(game: string | null) {
    const g = settings.store.games ?? {};
    return clamp(game != null && g[game] != null ? g[game] : Number(settings.store.defaultPercentStock) || 100);
}

function currentPercent(): number | undefined {
    return ClipsStore?.getSettings?.()?.clipsQuality?.bitratePercent;
}

/** Write the percent into ClipsStore; Discord's ClipsManager re-applies the encoder settings. */
function applyPercent(p: number) {
    const q = ClipsStore?.getSettings?.()?.clipsQuality;
    if (!q || q.bitratePercent === p) return;
    FluxDispatcher.dispatch({ type: "CLIPS_SETTINGS_UPDATE", settings: { clipsQuality: { ...q, bitratePercent: p } } });
}

function saveForGame(game: string, p: number) {
    if (game === "default") { settings.store.defaultPercentStock = clamp(p); if (visibleGameName() == null) applyPercent(clamp(p)); return; }
    settings.store.games = { ...(settings.store.games ?? {}), [game]: clamp(p) };
    if (activeKey() === game) applyPercent(clamp(p));
}

function activeKey(): string | null {
    return streaming && pendingStreamKey ? pendingStreamKey : visibleGameName();
}

function visibleGameName(): string | null {
    return RunningGameStore.getVisibleGame()?.name ?? null;
}

function PercentControl({ value, onChange }: { value: number; onChange(v: number): void; }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="range" min={MIN} max={MAX} step={STEP} value={value} style={{ flex: 1 }}
                onChange={e => onChange(Number(e.currentTarget.value))} />
            <input type="number" min={MIN} max={MAX} step={STEP} value={value}
                style={{ width: 72, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--background-modifier-accent)", background: "var(--input-background)", color: "var(--text-normal)" }}
                onChange={e => onChange(Number(e.currentTarget.value))} />
            <Paragraph style={{ width: 110 }}>% ≈ {mbps(value)} Mbps</Paragraph>
        </div>
    );
}

function GameModal({ game, modalProps }: { game: string; modalProps: RenderModalProps; }) {
    const [value, setValue] = useState(percentFor(game));
    return (
        <Modal
            {...modalProps}
            title={`Clips bitrate · ${game}`}
            subtitle="Remembered for this game and applied every time it starts. 100% is Discord's stock maximum."
            actions={[
                { text: "Cancel", variant: "secondary", onClick: modalProps.onClose },
                {
                    text: "Save", variant: "primary", onClick: () => {
                        saveForGame(game, value);
                        showToast({ text: `${game}: clips ${clamp(value)}% (~${mbps(clamp(value))} Mbps)` });
                        modalProps.onClose();
                    }
                }
            ]}
        >
            <PercentControl value={value} onChange={v => setValue(v)} />
        </Modal>
    );
}

const openGameModal = (game: string) => openModal(props => <GameModal game={game} modalProps={props} />);

function GamesEditor() {
    const [, force] = useState(0);
    const games = settings.store.games ?? {};
    const running = visibleGameName();
    const names = Object.keys(games).sort();
    return (
        <section>
            <HeadingSecondary>Per-game bitrate</HeadingSecondary>
            <Paragraph style={{ marginBottom: 8 }}>
                Active now: {currentPercent() ?? "?"}%{running ? ` (${running})` : ""}. Games are added when you set a value for them.
            </Paragraph>
            {running && games[running] == null && (
                <Button size="small" style={{ marginBottom: 8 }} onClick={() => openGameModal(running)}>Set for {running}</Button>
            )}
            {names.length === 0 && <Paragraph>No games yet. Launch a game and click the notification, or use the button above.</Paragraph>}
            {names.map(name => (
                <div key={name} style={{ margin: "8px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Paragraph style={{ fontWeight: 600 }}>{name}{name === running ? " · running" : ""}</Paragraph>
                        <Button size="small" variant="dangerSecondary" onClick={() => {
                            const { [name]: _, ...rest } = settings.store.games; settings.store.games = rest; force(x => x + 1);
                        }}>Remove</Button>
                    </div>
                    <PercentControl value={games[name]} onChange={v => { saveForGame(name, v); force(x => x + 1); }} />
                </div>
            ))}
        </section>
    );
}


const PRESETS = [100, 200, 300, 400, 500, 600, 800];

/** Dropdown under every window/screen tile in the Go Live source picker. */
function TileBitrate({ source }: { source: { id?: string; name?: string; }; }) {
    const key = sourceKey(source);
    const saved = key ? settings.store.games?.[key] : undefined;
    const [value, setValue] = useState<number | undefined>(saved);
    if (!key) return null;
    const shown = value ?? percentFor(null);
    const options = Array.from(new Set([...PRESETS, shown])).sort((a, b) => a - b);
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
        <select
            title={`Clips bitrate for ${key}${value == null ? " (default)" : ""}`}
            value={shown}
            onClick={stop} onMouseDown={stop} onKeyDown={stop}
            onChange={e => { const p = Number(e.currentTarget.value); setValue(p); saveForGame(key, p); }}
            style={{
                marginLeft: "auto", flexShrink: 0, fontSize: 12, padding: "1px 4px", borderRadius: 4, cursor: "pointer",
                border: "1px solid var(--background-modifier-accent)", background: "var(--background-secondary)",
                color: value == null ? "var(--text-muted)" : "var(--text-normal)"
            }}
        >
            {options.map(p => <option key={p} value={p}>{`clips ${p}% · ${mbps(p)} Mbps${value == null && p === shown ? " (default)" : ""}`}</option>)}
        </select>
    );
}


/** Extra submenu in the Go Live "stream-options" popup (gear next to "Go Live"): clips bitrate bound to the
 *  window/screen selected in that modal (falls back to the running game). */
const streamOptionsPatch: NavContextMenuPatchCallback = children => {
    const game = sourceKey(goLiveSource);
    if (!game) return;                       // nothing selected yet: the tiles carry their own dropdowns
    const cur = percentFor(game);
    const label = `Clips bitrate · ${game}`;
    const pick = (p: number) => {
        saveForGame(game, p);
        showToast({ text: `${game}: clips ${p}% (~${mbps(p)} Mbps)` });
    };
    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem id="clips-bitrate" label={label} subtext={`${cur}% ≈ ${mbps(cur)} Mbps`}>
            {PRESETS.map(p => (
                <Menu.MenuRadioItem key={p} group="clips-bitrate" id={`clips-bitrate-${p}`}
                    label={`${p}%  ·  ~${mbps(p)} Mbps${p === 100 ? "  (Discord stock)" : ""}`}
                    checked={cur === p} action={() => pick(p)} />
            ))}
            <Menu.MenuSeparator />
            <Menu.MenuItem id="clips-bitrate-custom" label={PRESETS.includes(cur) ? "Custom…" : `Custom… (${cur}%)`}
                action={() => openGameModal(game)} />
        </Menu.MenuItem>
    );
};


// ---------- clip file names and folders ----------
const DESKTOP = "Рабочий стол";
const SCREEN_RE = /^(экран|screen|display|монитор|дисплей)\s*\d+$/i;
const safe = (x: string) => x.replace(/[<>:"/\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "Clip";
const pad = (n: number) => String(n).padStart(2, "0");

function clipParts(meta: { applicationName?: string; }): string[] {
    const name = (meta?.applicationName ?? "").trim();
    const streamedScreen = streaming && pendingStreamKey?.startsWith("Screen · ") ? pendingStreamKey.slice(9) : null;
    if (!name || SCREEN_RE.test(name) || (streamedScreen && name === streamedScreen)) return [DESKTOP, safe(name || streamedScreen || "Экран")];
    return [safe(name)];
}

function clipFileName(meta: { applicationName?: string; createdAt?: number; id: string; }) {
    if (!settings.store.organizeClips) return `${safe(meta.applicationName ?? "").slice(0, 20)}_${meta.id}.mp4`;
    const d = new Date(meta.createdAt ?? Date.now());
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `${clipParts(meta).at(-1)}_${stamp}.mp4`;
}

const joinAll = (fm: any, base: string, parts: string[]) => parts.reduce((p, x) => fm.join(p, x), base);

/** Subfolder for a clip (only for the normal storage folder, not Discord's auto-clip candidate folder). */
async function clipDir(fm: any, base: string, meta: { applicationName?: string; }) {
    if (!settings.store.organizeClips || base !== ClipsStore?.getSettings?.()?.storageLocation) return base;
    const parts = clipParts(meta);
    let dir = base;
    for (const part of parts) {
        dir = fm.join(dir, part);
        await fm.createDirectoryIfNotExists?.(dir, false);
    }
    const rel = parts.join("/");
    if (!(settings.store.clipFolders ?? []).includes(rel)) settings.store.clipFolders = [...(settings.store.clipFolders ?? []), rel];
    return dir;
}

/** Gallery loader: Discord only reads the storage folder itself, so also read the folders this plugin made. */
async function loadAll(native: any, base: string) {
    const out = [...(await native.clips.loadClipsDirectory(base) ?? [])];
    if (base !== ClipsStore?.getSettings?.()?.storageLocation) return out;
    // every subfolder on disk (also ones the user made by hand), plus the ones the plugin remembers
    let rels: string[] = [];
    try { rels = await Native.listClipFolders(base); } catch { /* native helper unavailable */ }
    for (const rel of new Set([...rels, ...(settings.store.clipFolders ?? [])]))
        out.push(...(await native.clips.loadClipsDirectory(joinAll(native.fileManager, base, rel.split("/"))) ?? []));
    return out;
}

let lastGame: string | null | undefined;

/** Go Live modal state, captured from Discord's own context hook (see the second patch). */
let goLiveSource: { id?: string; name?: string; } | null | undefined;
let pendingStreamKey: string | null = null;
let streaming = false;

/** Settings key for a Go Live source: a window by its name (Apex's window is "Apex Legends", same as the game),
 *  a whole screen as "Screen · <name>". */
function sourceKey(src: { id?: string; name?: string; } | null | undefined): string | null {
    if (!src?.name) return null;
    return src.id?.startsWith("screen") ? `Screen · ${src.name}` : src.name;
}

function captureGoLiveState(state: any) {
    goLiveSource = state?.selectedSource;
    const k = sourceKey(goLiveSource);
    if (k) pendingStreamKey = k;
    return state;
}

function onGamesChanged() {
    const game = visibleGameName();
    if (game === lastGame) return;
    lastGame = game;
    const p = percentFor(game);
    applyPercent(p);
}

migratePluginSettings("BetterClips", "ClipsBitrate");

export default definePlugin({
    name: "BetterClips",
    description: "Higher-quality Discord Clips: bitrate above the stock limit per window/screen (set right in the Go Live picker), clips saved as Game/Game_date.mp4",
    authors: [{ name: "UrikRait", id: 302423509508947969n }],
    settings,
    patches: [
        {
            find: "6e3*Math.min(100,Math.max(10,",
            replacement: {
                match: /Math\.round\(6e3\*Math\.min\(100,Math\.max\(10,(\i)\)\)\/100\)/,
                replace: "Math.round(6e3*Math.max(10,$1)/100)",
            },
        },
        {
            // clip file name + per-game / per-screen subfolder:
            // let D=`${sanitize(g.applicationName.substring(0,20))}_${g.id}.mp4`,b=a.A.fileManager.join(m,D)
            find: "saveClipEx({filepath:",
            replacement: {
                match: /let (\i)=`\$\{\(0,\i\.\i\)\((\i)\.applicationName\.substring\(0,20\)\)\}_\$\{\2\.id\}\.mp4`,(\i)=(\i\.\i)\.fileManager\.join\((\i),\1\)/,
                replace: "let $1=$self.clipFileName($2),$3=($5=await $self.clipDir($4.fileManager,$5,$2),$4.fileManager.join($5,$1))",
            },
        },
        {
            // clips gallery: also load the plugin's subfolders
            find: ".clips.loadClipsDirectory(",
            replacement: {
                match: /let (\i)=await (\i\.\i)\.clips\.loadClipsDirectory\((\i)\)/,
                replace: "let $1=await $self.loadAll($2,$3)",
            },
        },
        {
            // Go Live source tile label: [icon, name] -> [icon, name, <TileBitrate/>]
            find: "hoverCTA",
            replacement: {
                match: /(\(0,(\i)\.jsx\)\(\i,\{source:(\i)\}\),\(0,\i\.jsx\)\(\i\.\i,\{variant:"text-sm\/medium",className:\i\.\i,children:\i\}\))\]/,
                replace: "$1,(0,$2.jsx)($self.TileBitrate,{source:$3})]",
            },
        },
        {
            // Go Live modal context hook: function eD(){return[l.useContext(eL),l.useContext(eU)]}
            find: "Using uninitialized GoLiveModalContextDispatch",
            replacement: {
                match: /(function \i\(\)\{return\[)(\i\.useContext\(\i\))(,\i\.useContext\(\i\)\]\})/,
                replace: "$1$self.captureGoLiveState($2)$3",
            },
        },
    ],
    captureGoLiveState,
    clipFileName,
    clipDir,
    loadAll,
    TileBitrate: ErrorBoundary.wrap(TileBitrate, { noop: true }),
    flux: {
        RUNNING_GAMES_CHANGE() { if (!streaming) onGamesChanged(); },
        STREAM_START(e: { sourceId?: string; sourceName?: string; pid?: number | null; }) {
            // Starting from a tile's hover button skips the modal state, so take the source from the action:
            // screens/windows carry sourceId + sourceName ("screen:..." for screens); a window that belongs to a
            // running game is converted to just { pid }.
            streaming = true;
            let key: string | null = sourceKey({ id: e?.sourceId, name: e?.sourceName });
            if (key == null && e?.pid != null) {
                const g = (RunningGameStore as any).getGameForPID?.(e.pid);
                key = g?.name ?? null;
            }
            if (key == null) key = pendingStreamKey;
            pendingStreamKey = key;
            applyPercent(percentFor(key));
        },
        STREAM_STOP() { streaming = false; lastGame = undefined; onGamesChanged(); },
        STREAM_DELETE() { streaming = false; lastGame = undefined; onGamesChanged(); },
    },
    contextMenus: {
        "stream-options": streamOptionsPatch,
    },
    start() {
        lastGame = undefined;
        setTimeout(onGamesChanged, 3000);
    },
    stop() {
        applyPercent(100);
    },
});
