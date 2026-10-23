/*
 * Copyright (c) 2026 UrikRait
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * BetterClips native helper (runs in Discord's main process).
 * Lists subfolders of the clips folder so the gallery can show clips the user sorted into folders by hand.
 */

import { IpcMainInvokeEvent } from "electron";
import { readdir } from "fs/promises";
import { join, relative } from "path";

/** Relative paths of all subfolders (up to `depth` levels), skipping hidden ones like ".autoclip-cache". */
export async function listClipFolders(_: IpcMainInvokeEvent, base: string, depth = 3): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string, level: number) {
        if (level > depth) return;
        let entries;
        try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (!e.isDirectory() || e.name.startsWith(".")) continue;
            const full = join(dir, e.name);
            out.push(relative(base, full).split("\\").join("/"));
            await walk(full, level + 1);
        }
    }
    await walk(base, 1);
    return out;
}
