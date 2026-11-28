#!/usr/bin/env node
'use strict';

/**
 * Antigravity Custom Theme Daemon (Windows / macOS / Linux)
 * Connects to Antigravity CDP (DevToolsActivePort), injects dist/theme_payload.js,
 * persists user theme preferences in theme_config.json, and hot-reloads on rebuild.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

if (typeof globalThis.WebSocket !== 'function') {
    console.error('[theme-daemon] Node.js >= 22 with built-in WebSocket is required.');
    process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PAYLOAD_PATH = path.join(DIST_DIR, 'theme_payload.js');
const LOG_FILE = path.join(ROOT_DIR, 'daemon.log');
const DEFAULT_CONFIG = {};

const MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
};

let mediaServer = null;
let mediaPort = 0;

function resolveWeWorkshopDir() {
    if (process.env.AGY_WE_WORKSHOP_DIR && fs.existsSync(process.env.AGY_WE_WORKSHOP_DIR)) {
        return process.env.AGY_WE_WORKSHOP_DIR;
    }

    const candidates = [];
    if (process.platform === 'win32') {
        try {
            const regOut = execFileSync(
                'reg',
                ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
                { encoding: 'utf8', timeout: 1500, windowsHide: true }
            );
            const m = regOut.match(/SteamPath\s+REG_SZ\s+(.+)/i);
            if (m && m[1]) {
                const steamRoot = m[1].trim().replace(/\//g, '\\');
                candidates.push(path.join(steamRoot, 'steamapps', 'workshop', 'content', '431960'));
                const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
                if (fs.existsSync(vdfPath)) {
                    const vdf = fs.readFileSync(vdfPath, 'utf8');
                    for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
                        const libPath = match[1].replace(/\\\\/g, '\\');
                        candidates.push(path.join(libPath, 'steamapps', 'workshop', 'content', '431960'));
                    }
                }
            }
        } catch (_) {}

        for (const drive of ['C:', 'D:', 'E:', 'F:']) {
            candidates.push(path.join(drive, 'Program Files (x86)', 'Steam', 'steamapps', 'workshop', 'content', '431960'));
            candidates.push(path.join(drive, 'Program Files', 'Steam', 'steamapps', 'workshop', 'content', '431960'));
            candidates.push(path.join(drive, 'SteamLibrary', 'steamapps', 'workshop', 'content', '431960'));
            candidates.push(path.join(drive, 'Steam', 'steamapps', 'workshop', 'content', '431960'));
        }
    } else {
        const home = os.homedir();
        candidates.push(path.join(home, '.local', 'share', 'Steam', 'steamapps', 'workshop', 'content', '431960'));
        candidates.push(path.join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'workshop', 'content', '431960'));
    }

    const seen = new Set();
    for (const c of candidates) {
        const norm = path.normalize(c);
        if (seen.has(norm)) continue;
        seen.add(norm);
        if (fs.existsSync(norm)) return norm;
    }
    return null;
}

let weCache = null;
let weCacheDirMtime = 0;

function parseImageDimensionsFromSlice(slice, mime) {
    try {
        if (mime === 'image/png' && slice.length >= 24) {
            const w = slice.readUInt32BE(16);
            const h = slice.readUInt32BE(20);
            if (w >= 64 && w <= 16384 && h >= 64 && h <= 16384) return { width: w, height: h };
        }
        if (mime === 'image/jpeg' && slice.length > 16) {
            let i = 2;
            while (i + 9 < slice.length) {
                if (slice[i] !== 0xff) {
                    i++;
                    continue;
                }
                const marker = slice[i + 1];
                if (marker === 0xff) {
                    i++;
                    continue;
                }
                if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
                    const h = slice.readUInt16BE(i + 5);
                    const w = slice.readUInt16BE(i + 7);
                    if (w >= 64 && w <= 16384 && h >= 64 && h <= 16384) return { width: w, height: h };
                    break;
                }
                if (marker === 0xd8 || marker === 0xd9) break;
                const segLen = slice.readUInt16BE(i + 2);
                if (segLen < 2) break;
                i += 2 + segLen;
            }
        }
    } catch (_) {}
    return null;
}

function inspectScenePkg(pkgPath) {
    let fd = null;
    try {
        const stat = fs.statSync(pkgPath);
        if (!stat.isFile() || stat.size < 64) return null;
        fd = fs.openSync(pkgPath, 'r');
        const hdrBuf = Buffer.alloc(Math.min(65536, stat.size));
        const hdrRead = fs.readSync(fd, hdrBuf, 0, hdrBuf.length, 0);
        if (hdrRead < 16) return null;

        let pos = 0;
        const verLen = hdrBuf.readUInt32LE(pos);
        pos += 4;
        if (verLen > 64 || pos + verLen + 4 > hdrRead) return null;
        pos += verLen;
        const entryCount = hdrBuf.readUInt32LE(pos);
        pos += 4;
        if (entryCount > 5000) return null;

        const entries = [];
        let hasPuppetWarp = false;
        for (let i = 0; i < entryCount; i++) {
            if (pos + 4 > hdrRead) return null;
            const nameLen = hdrBuf.readUInt32LE(pos);
            pos += 4;
            if (nameLen > 512 || pos + nameLen + 8 > hdrRead) return null;
            const name = hdrBuf.toString('utf8', pos, pos + nameLen);
            pos += nameLen;
            const ofs = hdrBuf.readUInt32LE(pos);
            const sz = hdrBuf.readUInt32LE(pos + 4);
            pos += 8;
            if (name.endsWith('.mdl') || name.includes('puppet')) hasPuppetWarp = true;
            entries.push({ name, ofs, sz });
        }

        const dataBase = pos;
        let sceneDims = null;
        try {
            const sjEntry = entries.find((e) => e.name === 'scene.json');
            if (sjEntry && sjEntry.sz > 10 && sjEntry.sz < 524288 && dataBase + sjEntry.ofs + sjEntry.sz <= stat.size) {
                const sjHead = Buffer.alloc(Math.min(4096, sjEntry.sz));
                const sr = fs.readSync(fd, sjHead, 0, sjHead.length, dataBase + sjEntry.ofs);
                const sjStr = sjHead.toString('utf8', 0, sr);
                const mProj = sjStr.match(/"orthogonalprojection"\s*:\s*\{[^}]*"height"\s*:\s*(\d+)[^}]*"width"\s*:\s*(\d+)/)
                    || sjStr.match(/"orthogonalprojection"\s*:\s*\{[^}]*"width"\s*:\s*(\d+)[^}]*"height"\s*:\s*(\d+)/);
                if (mProj) {
                    const isHeightFirst = sjStr.indexOf('"height"') < sjStr.indexOf('"width"');
                    const h = Number(isHeightFirst ? mProj[1] : mProj[2]);
                    const w = Number(isHeightFirst ? mProj[2] : mProj[1]);
                    if (w >= 640 && h >= 480) sceneDims = { width: w, height: h };
                }
            }
        } catch (_) {}

        entries.sort((a, b) => b.sz - a.sz);
        const peekBuf = Buffer.alloc(16384);
        const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const jpgMagic = Buffer.from([0xff, 0xd8, 0xff]);
        const ftypMagic = Buffer.from('ftyp', 'ascii');

        for (const e of entries.slice(0, 12)) {
            if (e.sz < 25000) continue;
            const absStart = dataBase + e.ofs;
            if (absStart >= stat.size) continue;
            const toRead = Math.min(peekBuf.length, e.sz, stat.size - absStart);
            const r = fs.readSync(fd, peekBuf, 0, toRead, absStart);
            const slice = peekBuf.subarray(0, r);

            const ftypIdx = slice.indexOf(ftypMagic);
            if (ftypIdx >= 4 && ftypIdx < 256) {
                const startOfs = absStart + ftypIdx - 4;
                const len = Math.min(e.sz - (ftypIdx - 4), stat.size - startOfs);
                return { mediaKind: 'video', mime: 'video/mp4', offset: startOfs, length: len, dims: sceneDims, hasPuppetWarp };
            }

            const pngIdx = slice.indexOf(pngMagic);
            if (pngIdx !== -1) {
                const startOfs = absStart + pngIdx;
                const len = Math.min(e.sz - pngIdx, stat.size - startOfs);
                const dims = sceneDims || parseImageDimensionsFromSlice(slice.subarray(pngIdx), 'image/png');
                return { mediaKind: 'image', mime: 'image/png', offset: startOfs, length: len, dims, hasPuppetWarp };
            }

            const jpgIdx = slice.indexOf(jpgMagic);
            if (jpgIdx !== -1) {
                const startOfs = absStart + jpgIdx;
                const len = Math.min(e.sz - jpgIdx, stat.size - startOfs);
                const dims = sceneDims || parseImageDimensionsFromSlice(slice.subarray(jpgIdx), 'image/jpeg');
                return { mediaKind: 'image', mime: 'image/jpeg', offset: startOfs, length: len, dims, hasPuppetWarp };
            }
        }
        return null;
    } catch (_) {
        return null;
    } finally {
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            } catch (_) {}
        }
    }
}

function parseSceneManifestFromPkg(pkgPath, fallbackTitle = '') {
    let fd = null;
    const manifest = {
        ok: true,
        parallax: 1.0,
        windStrength: 0.45,
        waterStrength: 0.0,
        shimmerStrength: 0.35,
        particles: [],
    };
    try {
        const stat = fs.statSync(pkgPath);
        if (!stat.isFile() || stat.size < 64) return manifest;
        fd = fs.openSync(pkgPath, 'r');
        const hdrBuf = Buffer.alloc(Math.min(65536, stat.size));
        const hdrRead = fs.readSync(fd, hdrBuf, 0, hdrBuf.length, 0);
        if (hdrRead < 16) return manifest;

        let pos = 0;
        const verLen = hdrBuf.readUInt32LE(pos);
        pos += 4;
        if (verLen > 64 || pos + verLen + 4 > hdrRead) return manifest;
        pos += verLen;
        const entryCount = hdrBuf.readUInt32LE(pos);
        pos += 4;
        if (entryCount > 5000) return manifest;

        const entries = [];
        for (let i = 0; i < entryCount; i++) {
            if (pos + 4 > hdrRead) break;
            const nameLen = hdrBuf.readUInt32LE(pos);
            pos += 4;
            if (nameLen > 512 || pos + nameLen + 8 > hdrRead) break;
            const name = hdrBuf.toString('utf8', pos, pos + nameLen);
            pos += nameLen;
            const ofs = hdrBuf.readUInt32LE(pos);
            const sz = hdrBuf.readUInt32LE(pos + 4);
            pos += 8;
            entries.push({ name, ofs, sz });
        }
        const dataBase = pos;
        const sjEntry = entries.find((e) => e.name === 'scene.json');
        if (!sjEntry || sjEntry.sz <= 0 || sjEntry.sz > 5 * 1024 * 1024) return manifest;

        const sjBuf = Buffer.alloc(sjEntry.sz);
        fs.readSync(fd, sjBuf, 0, sjEntry.sz, dataBase + sjEntry.ofs);
        const sj = JSON.parse(sjBuf.toString('utf8').replace(/^\uFEFF/, ''));

        let windHits = 0;
        let waterHits = 0;
        let shimmerHits = 0;
        const pSet = new Set();

        const objs = Array.isArray(sj.objects) ? sj.objects : [];
        const allText = `${fallbackTitle} ${ objs.map((o) => `${o.name || ''} ${o.particle || ''}`).join(' ') }`.toLowerCase();

        for (const o of objs) {
            const effs = Array.isArray(o.effects) ? o.effects : [];
            for (const ef of effs) {
                const efName = `${ef.file || ''} ${ef.name || ''}`.toLowerCase();
                if (/foliage|sway|shake|wind|hair|cloth/.test(efName)) windHits++;
                if (/water|wave|ripple|flow|ocean|river|lake|sea/.test(efName)) waterHits++;
                if (/shimmer|shine|pulse|glow|bloom|light|bokeh|ray/.test(efName)) shimmerHits++;
            }
            if (o.particle || o.name) {
                const pName = `${o.name || ''} ${o.particle || ''}`.toLowerCase();
                if (/ember|spark|fire|ash|火|烬/.test(pName)) pSet.add('ember');
                if (/snow|winter|ice|雪/.test(pName)) pSet.add('snow');
                if (/rain|storm|drop|雨/.test(pName)) pSet.add('rain');
                if (/leaf|leaves|petal|flower|sakura|cherry|blossom|樱|叶|花/.test(pName)) pSet.add('petal');
                if (/star|blink|shoot|meteor|cosmic|night|星/.test(pName)) pSet.add('star');
                if (/shaft|ray|sun|beam|光|阳/.test(pName)) pSet.add('lightshaft');
                if (/dust|mote|fog|mist|cloud|smoke|尘|雾|云/.test(pName)) pSet.add('dust');
            }
        }

        if (/forest|spring|tree|flower|wind|樱|春|林|花/.test(allText) && pSet.size === 0) {
            pSet.add('petal');
            pSet.add('lightshaft');
        }
        if (/night|star|cosmic|witcher|hole|dark|夜|星/.test(allText) && pSet.size === 0) {
            pSet.add('star');
            pSet.add('dust');
        }
        if (pSet.size === 0) {
            pSet.add('dust');
            pSet.add('star');
        }

        manifest.windStrength = Math.min(1.25, 0.35 + windHits * 0.18);
        manifest.waterStrength = waterHits > 0 ? Math.min(1.2, 0.32 + waterHits * 0.22) : 0.18;
        manifest.shimmerStrength = Math.min(1.2, 0.3 + shimmerHits * 0.2);
        manifest.particles = Array.from(pSet);
        return manifest;
    } catch (_) {
        manifest.particles = ['dust', 'star'];
        return manifest;
    } finally {
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            } catch (_) {}
        }
    }
}

function weFloatColorToHex(str) {
    const parts = String(str || '').trim().split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
        const toHex = (v) => Math.max(0, Math.min(255, Math.round((v <= 1 ? v * 255 : v)))).toString(16).padStart(2, '0');
        return `#${toHex(parts[0])}${toHex(parts[1])}${toHex(parts[2])}`;
    }
    return '#19191d';
}

function loadWeSavedUserProperties(wsDir) {
    const byId = {};
    try {
        const cfgPath = path.resolve(wsDir, '..', '..', '..', 'common', 'wallpaper_engine', 'config.json');
        if (!fs.existsSync(cfgPath)) return byId;
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        for (const [topKey, topVal] of Object.entries(cfg)) {
            if (topKey.startsWith('?') || !topVal || typeof topVal !== 'object') continue;
            const wprops = topVal.wproperties;
            if (!wprops || typeof wprops !== 'object') continue;
            for (const [wpPath, monMap] of Object.entries(wprops)) {
                const m = wpPath.replace(/\\/g, '/').match(/\/431960\/(\d+)\//);
                if (!m || !monMap || typeof monMap !== 'object') continue;
                const monProps = monMap.Monitor0 || monMap.Monitor1 || Object.values(monMap)[0];
                if (monProps && typeof monProps === 'object') {
                    byId[m[1]] = monProps;
                }
            }
        }
    } catch (_) {}
    return byId;
}

function extractAuthorName(title, desc, id) {
    const t = String(title || '');
    const d = String(desc || '');
    const mBy = t.match(/\bby\s+([A-Za-z0-9_\u4e00-\u9fa5 -]{2,28})$/i);
    if (mBy) return mBy[1].trim();
    const mPipe = t.match(/\|\s*([A-Za-z0-9_\u4e00-\u9fa5 ._-]{2,24})$/);
    if (mPipe) return mPipe[1].trim();
    const mBrk = d.match(/【([^】]{2,20})】/);
    if (mBrk) return mBrk[1].trim();
    const mDash = t.match(/-([A-Za-z0-9_\u4e00-\u9fa5]{2,18})\d*$/);
    if (mDash) return mDash[1].trim();
    if (/wlop/i.test(t) || /wlop/i.test(d)) return 'WLOP';
    const seed = Number(String(id).slice(-3)) || 100;
    return `Workshop_${seed}`;
}

function formatResolutionLabel(dims, title) {
    const t = String(title || '').toLowerCase();
    if (dims && dims.width && dims.height) {
        let w = dims.width;
        let h = dims.height;
        if (w === 5160 && h === 2160) {
            return '3440 x 1440';
        }
        const is4k = w >= 3800 || h >= 2100 || t.includes('4k');
        return is4k ? `${w} x ${h} - 4K` : `${w} x ${h}`;
    }
    if (t.includes('3440') || t.includes('ultrawide') || t.includes('widescreen')) return '3440 x 1440';
    return '3840 x 2160 - 4K';
}

function scanWallpaperEngineItems(forceRefresh = false) {
    const wsDir = resolveWeWorkshopDir();
    if (!wsDir) return { workshopDir: null, items: [] };

    try {
        const dirMtime = fs.statSync(wsDir).mtimeMs;
        if (!forceRefresh && weCache && weCacheDirMtime === dirMtime) {
            return weCache;
        }
        weCacheDirMtime = dirMtime;
    } catch (_) {}

    const savedWeById = loadWeSavedUserProperties(wsDir);
    const items = [];
    let entries = [];
    try {
        entries = fs.readdirSync(wsDir, { withFileTypes: true });
    } catch (_) {
        return { workshopDir: wsDir, items: [] };
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = entry.name;
        const itemDir = path.join(wsDir, id);
        const origPjPath = path.join(itemDir, '.agy_orig_project.json');
        const pjPath = fs.existsSync(origPjPath) ? origPjPath : path.join(itemDir, 'project.json');
        if (!fs.existsSync(pjPath)) continue;
        try {
            const raw = fs.readFileSync(pjPath, 'utf8').replace(/^\uFEFF/, '');
            const data = JSON.parse(raw);
            const rawType = String(data.type || 'scene').toLowerCase();
            if (rawType !== 'video' && rawType !== 'web' && rawType !== 'scene') continue;

            let previewFile = String(data.preview || '').replace(/\\/g, '/');
            if (!previewFile || !fs.existsSync(path.resolve(itemDir, previewFile))) {
                const fallback = ['preview.gif', 'preview.jpg', 'preview.png', 'preview.webp'].find((f) =>
                    fs.existsSync(path.join(itemDir, f))
                );
                previewFile = fallback || '';
            }

            let mtimeMs = 0;
            let totalBytes = 0;
            try {
                mtimeMs = fs.statSync(itemDir).mtimeMs;
                for (const f of fs.readdirSync(itemDir)) {
                    if (f === '.agy_orig_project.json') continue;
                    try {
                        const st = fs.statSync(path.join(itemDir, f));
                        if (st.isFile()) totalBytes += st.size;
                    } catch (_) {}
                }
            } catch (_) {}
            const sizeMb = `${Math.max(1, Math.round(totalBytes / (1024 * 1024)))} MB`;

            let schemeColor = '#19191d';
            const customProps = [];
            try {
                const rawProps = data && data.general && data.general.properties;
                if (rawProps && typeof rawProps === 'object') {
                    if (rawProps.schemecolor && rawProps.schemecolor.value) {
                        schemeColor = weFloatColorToHex(rawProps.schemecolor.value);
                    }
                    for (const [k, p] of Object.entries(rawProps)) {
                        if (!p || typeof p !== 'object' || k === 'schemecolor') continue;
                        const pType = String(p.type || '').toLowerCase();
                        if (!['bool', 'slider', 'combo', 'color'].includes(pType)) continue;
                        const rawText = String(p.text || k);
                        if (/<img\b|<a\s+href/i.test(rawText) || /^ahref/i.test(k)) continue;
                        const label = rawText.replace(/<[^>]+>/g, '').trim() || k;
                        if (label.startsWith('ui_browse_')) continue;
                        customProps.push({
                            key: k,
                            text: label,
                            type: pType,
                            value: pType === 'color' ? weFloatColorToHex(p.value) : p.value,
                            min: p.min !== undefined ? Number(p.min) : 0,
                            max: p.max !== undefined ? Number(p.max) : 100,
                            step: p.step !== undefined ? Number(p.step) : (p.max !== undefined && Number(p.max) <= 2 ? 0.05 : 1),
                            options: Array.isArray(p.options) ? p.options : [],
                            order: Number(p.order) || 100,
                        });
                    }
                    customProps.sort((a, b) => a.order - b.order);
                }
            } catch (_) {}

            const supportsAudio = Boolean(data && data.general && data.general.supportsaudioprocessing);
            const titleStr = String(data.title || id).trim();
            const author = extractAuthorName(titleStr, data.description || '', id);
            const subCount = (Number(String(id).slice(-4)) % 450) + 18;
            const savedWeProps = savedWeById[id] || {};

            const tags = [];
            if (Array.isArray(data.tags)) {
                for (const tg of data.tags) {
                    if (tg && !tags.includes(String(tg))) tags.push(String(tg));
                }
            }
            if (supportsAudio && !tags.includes('Audio responsive')) tags.push('Audio responsive');
            const ratingRaw = String(data.contentrating || 'Everyone');
            if (ratingRaw === 'Questionable') tags.push('PG13 - Parental guidance');
            else if (ratingRaw === 'Mature') tags.push('R - Mature');
            else tags.push('G - All ages');
            if (customProps.length > 0 && !tags.includes('Customizable')) tags.push('Customizable');

            if (rawType === 'video' || rawType === 'web') {
                const relFile = String(data.file || '').replace(/\\/g, '/');
                if (!relFile) continue;
                const fullFile = path.resolve(itemDir, relFile);
                if (!fullFile.startsWith(itemDir) || !fs.existsSync(fullFile)) continue;
                try {
                    mtimeMs = Math.max(mtimeMs, fs.statSync(fullFile).mtimeMs);
                } catch (_) {}
                items.push({
                    id,
                    type: rawType,
                    category: rawType,
                    title: titleStr,
                    author,
                    subCount,
                    sizeMb,
                    resolution: formatResolutionLabel(null, titleStr),
                    tags,
                    schemeColor,
                    supportsAudio,
                    savedWeProps,
                    relFile,
                    previewFile,
                    customProps,
                    mtimeMs,
                });
            } else {
                const pkgPath = path.join(itemDir, 'scene.pkg');
                const pkgInfo = fs.existsSync(pkgPath) ? inspectScenePkg(pkgPath) : null;
                if (pkgInfo && pkgInfo.hasPuppetWarp && !tags.includes('Puppet Warp')) {
                    tags.push('Puppet Warp');
                }
                const resolution = formatResolutionLabel(pkgInfo ? pkgInfo.dims : null, titleStr);
                if (pkgInfo) {
                    try {
                        mtimeMs = Math.max(mtimeMs, fs.statSync(pkgPath).mtimeMs);
                    } catch (_) {}
                    items.push({
                        id,
                        type: pkgInfo.mediaKind === 'video' ? 'video' : 'image',
                        category: pkgInfo.mediaKind === 'video' ? 'scene-video' : 'scene',
                        title: titleStr,
                        author,
                        subCount,
                        sizeMb,
                        resolution,
                        tags,
                        schemeColor,
                        supportsAudio,
                        savedWeProps,
                        relFile: `__pkg__`,
                        previewFile,
                        pkgSlice: pkgInfo,
                        customProps,
                        mtimeMs,
                    });
                } else if (previewFile) {
                    items.push({
                        id,
                        type: 'image',
                        category: 'scene',
                        title: titleStr,
                        author,
                        subCount,
                        sizeMb,
                        resolution,
                        tags,
                        schemeColor,
                        supportsAudio,
                        savedWeProps,
                        relFile: previewFile,
                        previewFile,
                        customProps,
                        mtimeMs,
                    });
                }
            }
        } catch (_) {}
    }

    items.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));

    weCache = { workshopDir: wsDir, items };
    return weCache;
}

function startMediaServer() {
    if (mediaServer) return;
    mediaServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        const pathname = parsedUrl.pathname;

        if (pathname === '/api/we/list') {
            const force = parsedUrl.searchParams.get('refresh') === '1';
            const result = scanWallpaperEngineItems(force);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify(result));
            return;
        }

        if (pathname === '/api/we/activate-scene') {
            const id = String(parsedUrl.searchParams.get('id') || '').trim();
            const props = String(parsedUrl.searchParams.get('props') || '').trim();
            const vol = parsedUrl.searchParams.get('volume');
            const slot = String(parsedUrl.searchParams.get('slot') || '').trim();
            const wsDir = resolveWeWorkshopDir();
            if (!wsDir || !/^[a-zA-Z0-9_-]+$/.test(id)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'Invalid workshop dir or scene id' }));
                return;
            }
            const scriptPy = path.join(ROOT_DIR, 'scripts', 'activate_we_scene.py');
            const pyCandidates = ['C:\\Python314\\python.exe', 'python', 'python3'];
            const pyExe = pyCandidates.find((p) => p === 'python' || p === 'python3' || fs.existsSync(p)) || 'python';
            const args = id === 'close'
                ? [scriptPy, wsDir, 'close', slot]
                : [scriptPy, wsDir, id, props || '', vol !== null && vol !== '' ? String(Math.max(0, Math.min(100, Math.round(Number(vol) || 0)))) : '', slot || 'AGY_BG'];
            execFile(pyExe, args, { timeout: 25000, windowsHide: true }, (err, stdout, stderr) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: stderr || err.message }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
                res.end(String(stdout || '').trim() || JSON.stringify({ ok: false, error: 'Empty output' }));
            });
            return;
        }

        if (pathname === '/api/we/set-volume') {
            const vol = Math.max(0, Math.min(100, Math.round(Number(parsedUrl.searchParams.get('volume') || 0) || 0)));
            const wsDir = resolveWeWorkshopDir() || ROOT_DIR;
            const scriptPy = path.join(ROOT_DIR, 'scripts', 'activate_we_scene.py');
            const pyCandidates = ['C:\\Python314\\python.exe', 'python', 'python3'];
            const pyExe = pyCandidates.find((p) => p === 'python' || p === 'python3' || fs.existsSync(p)) || 'python';
            execFile(pyExe, [scriptPy, wsDir, 'volume', String(vol)], { timeout: 5000, windowsHide: true }, (err, stdout) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: err.message }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
                res.end(String(stdout || '').trim() || JSON.stringify({ ok: true, volume: vol }));
            });
            return;
        }

        if (pathname === '/api/we/media-data') {
            const id = String(parsedUrl.searchParams.get('id') || '').trim();
            const relFile = String(parsedUrl.searchParams.get('file') || '').trim();
            const wsDir = resolveWeWorkshopDir();
            if (!wsDir || !/^[a-zA-Z0-9_-]+$/.test(id) || !relFile) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false }));
                return;
            }
            const cacheDir = path.join(ROOT_DIR, '.codex_media_cache');
            const transcodeToMp4 = (inputPath, outMp4Path, cleanupInput) => {
                globalThis.__agyTranscodeJobs = globalThis.__agyTranscodeJobs || new Map();
                const existingJob = globalThis.__agyTranscodeJobs.get(outMp4Path);
                if (existingJob) return existingJob;
                const job = new Promise((resolve) => {
                    try {
                        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
                        const tmpOut = `${outMp4Path}.tmp.mp4`;
                        execFile(
                            'ffmpeg',
                            [
                                '-y', '-i', inputPath,
                                '-vf', "scale='min(1920,iw)':-2",
                                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '24',
                                '-maxrate', '3.5M', '-bufsize', '7M',
                                '-c:a', 'aac', '-b:a', '96k',
                                '-fs', '22M', '-movflags', '+faststart',
                                tmpOut,
                            ],
                            { timeout: 40000, windowsHide: true },
                            (err) => {
                                if (cleanupInput) {
                                    try { fs.unlinkSync(inputPath); } catch (_) {}
                                }
                                if (err || !fs.existsSync(tmpOut)) {
                                    try { fs.unlinkSync(tmpOut); } catch (_) {}
                                    resolve(false);
                                    return;
                                }
                                try {
                                    fs.renameSync(tmpOut, outMp4Path);
                                    resolve(true);
                                } catch (_) {
                                    resolve(false);
                                }
                            }
                        );
                    } catch (_) {
                        if (cleanupInput) {
                            try { fs.unlinkSync(inputPath); } catch (_) {}
                        }
                        resolve(false);
                    }
                }).finally(() => {
                    globalThis.__agyTranscodeJobs.delete(outMp4Path);
                });
                globalThis.__agyTranscodeJobs.set(outMp4Path, job);
                return job;
            };
            const sendFileAsDataUrl = (filePath, mime) => {
                const buf = fs.readFileSync(filePath);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }));
            };
            try {
                if (relFile === '__pkg__') {
                    const catalog = scanWallpaperEngineItems(false);
                    const found = catalog.items.find((x) => x.id === id && x.pkgSlice);
                    const pkgPath = path.join(wsDir, id, 'scene.pkg');
                    if (!found || !fs.existsSync(pkgPath)) {
                        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false }));
                        return;
                    }
                    if (found.pkgSlice.length <= 24 * 1024 * 1024) {
                        const fd = fs.openSync(pkgPath, 'r');
                        const buf = Buffer.alloc(found.pkgSlice.length);
                        fs.readSync(fd, buf, 0, buf.length, found.pkgSlice.offset);
                        fs.closeSync(fd);
                        const mime = found.pkgSlice.mime || 'application/octet-stream';
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }));
                        return;
                    }
                    if (found.pkgSlice.mediaKind === 'video') {
                        const cachedMp4 = path.join(cacheDir, `${id}_pkg.mp4`);
                        if (fs.existsSync(cachedMp4) && fs.statSync(cachedMp4).size <= 26 * 1024 * 1024) {
                            sendFileAsDataUrl(cachedMp4, 'video/mp4');
                            return;
                        }
                        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
                        const tmpSrc = path.join(cacheDir, `${id}_pkg.src.mp4`);
                        const readStream = fs.createReadStream(pkgPath, {
                            start: found.pkgSlice.offset,
                            end: found.pkgSlice.offset + found.pkgSlice.length - 1,
                        });
                        const writeStream = fs.createWriteStream(tmpSrc);
                        readStream.pipe(writeStream);
                        writeStream.on('finish', () => {
                            transcodeToMp4(tmpSrc, cachedMp4, true).then((ok) => {
                                if (ok && fs.existsSync(cachedMp4)) {
                                    sendFileAsDataUrl(cachedMp4, 'video/mp4');
                                } else {
                                    res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                                    res.end(JSON.stringify({ ok: false }));
                                }
                            });
                        });
                        writeStream.on('error', () => {
                            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ ok: false }));
                        });
                        return;
                    }
                    res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false }));
                    return;
                }
                const itemDir = path.join(wsDir, id);
                const fullPath = path.resolve(itemDir, relFile);
                if (!fullPath.startsWith(itemDir) || !fs.existsSync(fullPath)) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false }));
                    return;
                }
                const stat = fs.statSync(fullPath);
                const ext = path.extname(fullPath).toLowerCase();
                if (stat.size > 24 * 1024 * 1024) {
                    if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) {
                        const cachedMp4 = path.join(cacheDir, `${id}_vid.mp4`);
                        if (fs.existsSync(cachedMp4) && fs.statSync(cachedMp4).size <= 26 * 1024 * 1024) {
                            sendFileAsDataUrl(cachedMp4, 'video/mp4');
                            return;
                        }
                        transcodeToMp4(fullPath, cachedMp4, false).then((ok) => {
                            if (ok && fs.existsSync(cachedMp4)) {
                                sendFileAsDataUrl(cachedMp4, 'video/mp4');
                            } else {
                                res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                                res.end(JSON.stringify({ ok: false, error: 'Too large' }));
                            }
                        });
                        return;
                    }
                    res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'Too large' }));
                    return;
                }
                const mime = MIME_TYPES[ext] || 'application/octet-stream';
                sendFileAsDataUrl(fullPath, mime);
                return;
            } catch (_) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false }));
                return;
            }
        }

        if (pathname === '/api/we/open-folder') {
            const id = String(parsedUrl.searchParams.get('id') || '').trim();
            const wsDir = resolveWeWorkshopDir();
            if (!wsDir || !/^[a-zA-Z0-9_-]+$/.test(id)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false }));
                return;
            }
            const targetDir = path.join(wsDir, id);
            if (fs.existsSync(targetDir)) {
                try {
                    execFile('explorer.exe', [targetDir], { windowsHide: false }, () => {});
                } catch (_) {}
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (pathname === '/api/we/scene-manifest') {
            const id = String(parsedUrl.searchParams.get('id') || '').trim();
            const wsDir = resolveWeWorkshopDir();
            if (!wsDir || !/^[a-zA-Z0-9_-]+$/.test(id)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'Invalid workshop dir or scene id' }));
                return;
            }
            const catalog = scanWallpaperEngineItems(false);
            const found = catalog.items.find((x) => x.id === id);
            const pkgPath = path.join(wsDir, id, 'scene.pkg');
            const manifest = parseSceneManifestFromPkg(pkgPath, found ? found.title : '');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
            res.end(JSON.stringify(manifest));
            return;
        }

        if (pathname === '/api/theme/kill') {
            const mode = parsedUrl.searchParams.get('mode') || 'session';
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, mode }));
            setTimeout(() => {
                if (mode === 'uninstall') {
                    const pluginDir = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'antigravity-custom-theme-plugin');
                    try {
                        if (fs.existsSync(pluginDir)) fs.rmSync(pluginDir, { recursive: true, force: true });
                    } catch (_) {}
                }
                shutdown(`User requested kill (${mode})`);
            }, 150);
            return;
        }

        if (pathname.startsWith('/we/')) {
            const wsDir = resolveWeWorkshopDir();
            if (!wsDir) {
                res.writeHead(404);
                res.end('Workshop dir not found');
                return;
            }
            const rest = pathname.slice(4);
            const slashIdx = rest.indexOf('/');
            if (slashIdx <= 0) {
                res.writeHead(400);
                res.end('Bad path');
                return;
            }
            const id = rest.slice(0, slashIdx);
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
                res.writeHead(400);
                res.end('Invalid id');
                return;
            }
            let relPath;
            try {
                relPath = decodeURIComponent(rest.slice(slashIdx + 1));
            } catch (_) {
                res.writeHead(400);
                res.end('Invalid encoding');
                return;
            }

            if (relPath === '__pkg__') {
                const catalog = scanWallpaperEngineItems(false);
                const found = catalog.items.find((x) => x.id === id && x.pkgSlice);
                const pkgPath = path.join(wsDir, id, 'scene.pkg');
                if (!found || !fs.existsSync(pkgPath)) {
                    res.writeHead(404);
                    res.end('PKG slice not found');
                    return;
                }
                const sliceOffset = found.pkgSlice.offset;
                const total = found.pkgSlice.length;
                const contentType = found.pkgSlice.mime || 'application/octet-stream';
                const range = req.headers.range;
                if (range) {
                    const match = String(range).match(/bytes=(\d*)-(\d*)/);
                    if (match) {
                        const start = match[1] ? parseInt(match[1], 10) : 0;
                        const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
                        if (start >= total || start > end) {
                            res.writeHead(416, { 'Content-Range': `bytes */${total}` });
                            res.end();
                            return;
                        }
                        res.writeHead(206, {
                            'Content-Range': `bytes ${start}-${end}/${total}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': end - start + 1,
                            'Content-Type': contentType,
                            'Cache-Control': 'public, max-age=3600',
                        });
                        if (req.method === 'HEAD') {
                            res.end();
                            return;
                        }
                        const stream = fs.createReadStream(pkgPath, { start: sliceOffset + start, end: sliceOffset + end });
                        res.on('close', () => stream.destroy());
                        stream.on('error', () => res.destroy());
                        stream.pipe(res);
                        return;
                    }
                }
                res.writeHead(200, {
                    'Accept-Ranges': 'bytes',
                    'Content-Length': total,
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600',
                });
                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }
                const stream = fs.createReadStream(pkgPath, { start: sliceOffset, end: sliceOffset + total - 1 });
                res.on('close', () => stream.destroy());
                stream.on('error', () => res.destroy());
                stream.pipe(res);
                return;
            }

            const itemDir = path.resolve(wsDir, id);
            const fullPath = path.resolve(itemDir, relPath);
            if (!fullPath.startsWith(itemDir + path.sep) && fullPath !== itemDir) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            let stat;
            try {
                stat = fs.statSync(fullPath);
                if (!stat.isFile()) {
                    res.writeHead(404);
                    res.end('Not a file');
                    return;
                }
            } catch (_) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const ext = path.extname(fullPath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const total = stat.size;
            const range = req.headers.range;

            if (range) {
                const match = String(range).match(/bytes=(\d*)-(\d*)/);
                if (match) {
                    const start = match[1] ? parseInt(match[1], 10) : 0;
                    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
                    if (start >= total || start > end) {
                        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
                        res.end();
                        return;
                    }
                    res.writeHead(206, {
                        'Content-Range': `bytes ${start}-${end}/${total}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': end - start + 1,
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=3600',
                    });
                    if (req.method === 'HEAD') {
                        res.end();
                        return;
                    }
                    const stream = fs.createReadStream(fullPath, { start, end });
                    res.on('close', () => stream.destroy());
                    stream.on('error', () => res.destroy());
                    stream.pipe(res);
                    return;
                }
            }

            res.writeHead(200, {
                'Accept-Ranges': 'bytes',
                'Content-Length': total,
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
            });
            if (req.method === 'HEAD') {
                res.end();
                return;
            }
            const stream = fs.createReadStream(fullPath);
            res.on('close', () => stream.destroy());
            stream.on('error', () => res.destroy());
            stream.pipe(res);
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    });

    mediaServer.listen(0, '127.0.0.1', () => {
        const addr = mediaServer.address();
        mediaPort = addr && typeof addr === 'object' ? addr.port : 0;
        log(`Local Wallpaper Engine media server listening on http://127.0.0.1:${mediaPort}`);
    });
    mediaServer.on('error', (err) => {
        log(`Media server error: ${err.message}`);
    });

    const sidecarPort = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || '', 10);
    if (Number.isFinite(sidecarPort) && sidecarPort > 0) {
        try {
            const scServer = http.createServer((_req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Antigravity Custom Theme Engine Active');
            });
            scServer.listen(sidecarPort, '127.0.0.1', () => {
                log(`Sidecar health port listening on http://127.0.0.1:${sidecarPort}`);
            });
            scServer.on('error', () => {});
        } catch (_) {}
    }
}

function resolvePortFile() {
    if (process.env.AGY_PORT_FILE) {
        return process.env.AGY_PORT_FILE;
    }

    const home = os.homedir();
    let candidates;
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        candidates = [
            path.join(appData, 'antigravity', 'DevToolsActivePort'),
            path.join(appData, 'Antigravity', 'DevToolsActivePort'),
        ];
    } else if (process.platform === 'darwin') {
        const appSupport = path.join(home, 'Library', 'Application Support');
        candidates = [
            path.join(appSupport, 'antigravity', 'DevToolsActivePort'),
            path.join(appSupport, 'Antigravity', 'DevToolsActivePort'),
        ];
    } else {
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
        candidates = [
            path.join(xdgConfig, 'antigravity', 'DevToolsActivePort'),
            path.join(xdgConfig, 'Antigravity', 'DevToolsActivePort'),
        ];
    }

    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) {
            fs.writeFileSync(LOG_FILE, '');
        }
        fs.appendFileSync(LOG_FILE, line);
    } catch (_) {}
    if (process.stdout.isTTY || process.env.AGY_DAEMON_STDOUT === '1') {
        process.stdout.write(line);
    }
}

function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

function acquirePidLock() {
    if (fs.existsSync(PID_FILE)) {
        const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
        if (existingPid && existingPid !== process.pid && isPidAlive(existingPid)) {
            log(`Another daemon instance is already running (PID ${existingPid}). Exiting.`);
            process.exit(0);
        }
    }
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

function removePidLock() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        }
    } catch (_) {}
}

function readConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                return { ...DEFAULT_CONFIG, ...parsed };
            }
        }
    } catch (err) {
        log(`Failed reading theme_config.json: ${err.message}`);
    }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(next) {
    try {
        const merged = { ...readConfig(), ...next };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
        return merged;
    } catch (err) {
        log(`Failed saving theme_config.json: ${err.message}`);
        return null;
    }
}

let missingPayloadLogged = false;
function buildInjectedSource() {
    if (!fs.existsSync(PAYLOAD_PATH)) {
        if (!missingPayloadLogged) {
            log(`Payload not built yet (${PAYLOAD_PATH}). Run: python scripts/build_payload.py`);
            missingPayloadLogged = true;
        }
        return null;
    }
    missingPayloadLogged = false;

    const cfgJson = JSON.stringify(readConfig());
    const mediaBase = mediaPort ? `http://127.0.0.1:${mediaPort}` : '';
    const payloadCode = fs.readFileSync(PAYLOAD_PATH, 'utf8');
    return `window.__AGY_INITIAL_CONFIG__ = ${cfgJson};\nwindow.__AGY_MEDIA_BASE__ = ${JSON.stringify(mediaBase)};\n${payloadCode}`;
}

function getPortInfo() {
    const portFile = resolvePortFile();
    if (!fs.existsSync(portFile)) return null;
    const lines = fs
        .readFileSync(portFile, 'utf8')
        .trim()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    const port = parseInt(lines[0], 10);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { port, token: lines[1] || '' };
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 2000 }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
        req.on('error', reject);
    });
}

const sessions = new Map();
let lastPort = null;
let reloadTimer = null;
let hasEverAttached = false;
let consecutivePortFailures = 0;
let totalScans = 0;
let cdpSelfHealAttempted = false;

function ensureWindowsShortcutsAndRelaunchIfNeeded() {
    if (process.platform !== 'win32' || cdpSelfHealAttempted) return;
    cdpSelfHealAttempted = true;
    try {
        const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$wsh = New-Object -ComObject WScript.Shell
$shortcuts = @(
    "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Antigravity.lnk",
    "$env:APPDATA\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar\\Antigravity.lnk",
    "$env:USERPROFILE\\Desktop\\Antigravity.lnk"
)
foreach ($p in $shortcuts) {
    if (Test-Path $p) {
        $sc = $wsh.CreateShortcut($p)
        if ($sc.Arguments -notmatch 'remote-debugging-port') {
            $sc.Arguments = ('--remote-debugging-port=0 ' + $sc.Arguments).Trim()
            $sc.Save()
        }
    }
}
$mainProc = Get-CimInstance Win32_Process -Filter "Name = 'Antigravity.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch 'register_loader' -and $_.CommandLine -notmatch 'mcp_entry' } | Select-Object -First 1
if ($mainProc -and $mainProc.CommandLine -notmatch 'remote-debugging-port') {
    $ageSec = ((Get-Date) - $mainProc.CreationDate).TotalSeconds
    if ($mainProc.CommandLine -match '--updated' -or $ageSec -lt 35) {
        $exe = "$env:LOCALAPPDATA\\Programs\\antigravity\\Antigravity.exe"
        if (Test-Path $exe) {
            Stop-Process -Name Antigravity -Force
            Start-Sleep -Milliseconds 600
            Start-Process -FilePath $exe -ArgumentList '--remote-debugging-port=0'
        }
    }
}
`;
        execFileSync('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript], {
            timeout: 7000,
            windowsHide: true,
        });
        log('Verified Windows shortcuts carry --remote-debugging-port=0.');
    } catch (err) {
        log(`Shortcut self-heal check error: ${err.message}`);
    }
}

function createSession(target) {
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    const session = { id: target.id, ws, target };
    sessions.set(target.id, session);

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== 1) {
                reject(new Error('WebSocket is not open'));
                return;
            }
            const id = nextId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    session.reinject = async () => {
        const src = buildInjectedSource();
        if (!src) return;
        try {
            await send('Runtime.evaluate', { expression: src, awaitPromise: false });
        } catch (_) {}
    };

    ws.addEventListener('message', async (event) => {
        let msg;
        try {
            msg = JSON.parse(String(event.data));
        } catch (_) {
            return;
        }

        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
            else p.resolve(msg.result);
            return;
        }

        if (msg.method === 'Runtime.bindingCalled' && msg.params && msg.params.name === 'agyBridgeCall') {
            try {
                const req = JSON.parse(msg.params.payload || '{}');
                const reqId = req.reqId;
                const reqPath = String(req.path || '');
                if (reqId && reqPath.startsWith('/') && mediaPort) {
                    http.get(`http://127.0.0.1:${mediaPort}${reqPath}`, (r) => {
                        let body = '';
                        r.on('data', (c) => { body += c; });
                        r.on('end', () => {
                            send('Runtime.evaluate', {
                                expression: `window.__AGY_BRIDGE_RESOLVE__&&window.__AGY_BRIDGE_RESOLVE__(${JSON.stringify(reqId)},${JSON.stringify(body)})`,
                                awaitPromise: false,
                            }).catch(() => {});
                        });
                    }).on('error', (err) => {
                        send('Runtime.evaluate', {
                            expression: `window.__AGY_BRIDGE_RESOLVE__&&window.__AGY_BRIDGE_RESOLVE__(${JSON.stringify(reqId)},${JSON.stringify(JSON.stringify({ ok: false, error: err.message }))})`,
                            awaitPromise: false,
                        }).catch(() => {});
                    });
                }
            } catch (_) {}
            return;
        }

        if (msg.method === 'Runtime.bindingCalled' && msg.params && msg.params.name === 'agySaveThemeConfig') {
            try {
                const payload = JSON.parse(msg.params.payload || '{}');
                const prevJson = JSON.stringify(readConfig());
                const saved = saveConfig(payload);
                const nextJson = JSON.stringify(saved);
                if (prevJson !== nextJson) {
                    const syncExpr = `window.__ANTIGRAVITY_SYNC_EXTERNAL_CONFIG__&&window.__ANTIGRAVITY_SYNC_EXTERNAL_CONFIG__(${nextJson})`;
                    for (const other of sessions.values()) {
                        if (other.id !== target.id) {
                            other.send('Runtime.evaluate', { expression: syncExpr, awaitPromise: false }).catch(() => {});
                        }
                    }
                }
            } catch (err) {
                log(`Config binding error: ${err.message}`);
            }
            return;
        }

        if (msg.method === 'Page.frameNavigated' && msg.params && msg.params.frame && !msg.params.frame.parentId) {
            await session.reinject();
        }
    });

    ws.addEventListener('open', async () => {
        try {
            await send('Page.enable');
            await send('Runtime.enable');
            try {
                await send('Page.setBypassCSP', { enabled: true });
            } catch (_) {}
            try {
                await send('Runtime.addBinding', { name: 'agySaveThemeConfig' });
                await send('Runtime.addBinding', { name: 'agyBridgeCall' });
            } catch (_) {}

            const src = buildInjectedSource();
            if (src) {
                await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
                await send('Runtime.evaluate', { expression: src, awaitPromise: false });
            }
            hasEverAttached = true;
            consecutivePortFailures = 0;
            log(`Attached target ${target.id} (${target.url})`);
        } catch (err) {
            log(`Attach error for ${target.id}: ${err.message}`);
        }
    });

    const cleanup = () => {
        for (const p of pending.values()) {
            p.reject(new Error('WebSocket closed'));
        }
        pending.clear();
        sessions.delete(target.id);
    };
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
}

let codexPort = null;
let codexPortFailures = 0;
let codexProbeInFlight = false;
let lastCodexProbe = 0;
let lastCodexRelaunch = 0;

function getInstallTargets() {
    try {
        const p = path.join(ROOT_DIR, '.install-targets.json');
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed && parsed.targets) && parsed.targets.length) {
                return new Set(parsed.targets.map((t) => String(t).toLowerCase()));
            }
        }
    } catch (_) {}
    return new Set(['antigravity']);
}

function probeCodexPortAsync() {
    if (process.platform !== 'win32' || codexProbeInFlight) return Promise.resolve(codexPort);
    codexProbeInFlight = true;
    return new Promise((resolve) => {
        try {
            const allowRelaunch = getInstallTargets().has('codex') && Date.now() - lastCodexRelaunch > 25000;
            const psScript = allowRelaunch
                ? "$p = Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -EA 0 | Where-Object { (Get-Process -Id $_.OwningProcess -EA 0).ProcessName -match '^ChatGPT|chatgpt-desktop' } | Select-Object -First 1 -ExpandProperty LocalPort; if ($p) { $p } else { $procs = Get-CimInstance Win32_Process -Filter \"Name='ChatGPT.exe' OR Name='chatgpt-desktop.exe'\" -EA 0; $hasFlag = $procs | Where-Object { $_.CommandLine -match 'remote-debugging-port' } | Select-Object -First 1; if (-not $hasFlag) { $main = $procs | Where-Object { $_.Name -eq 'ChatGPT.exe' -and $_.CommandLine -notmatch '--type=' -and $_.CreationDate -lt (Get-Date).AddSeconds(-4) } | Select-Object -First 1; if ($main) { $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\\WindowsApps\\chatgpt-desktop.exe'; if (Test-Path $alias) { Get-Process -Name 'ChatGPT' -EA 0 | ForEach-Object { try { $_.CloseMainWindow() | Out-Null } catch {} }; Start-Sleep -Milliseconds 600; Stop-Process -Name 'ChatGPT' -Force -EA 0; for ($i=0; $i -lt 10 -and (Get-Process -Name 'ChatGPT' -EA 0); $i++) { Start-Sleep -Milliseconds 200 }; Start-Process -FilePath $alias -ArgumentList '--remote-debugging-port=0'; Write-Output 'RELAUNCHED' } } } }"
                : "Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -EA 0 | Where-Object { (Get-Process -Id $_.OwningProcess -EA 0).ProcessName -match '^ChatGPT|chatgpt-desktop' } | Select-Object -First 1 -ExpandProperty LocalPort";
            const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
            execFile(
                'powershell.exe',
                ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
                { encoding: 'utf8', timeout: 7000, windowsHide: true },
                (err, stdout) => {
                    codexProbeInFlight = false;
                    if (err) {
                        resolve(null);
                        return;
                    }
                    const out = String(stdout || '').trim();
                    if (out === 'RELAUNCHED') {
                        lastCodexRelaunch = Date.now();
                        log('Relaunched Codex App with --remote-debugging-port=0 for auto-theming.');
                        resolve(null);
                        return;
                    }
                    const p = parseInt(out, 10);
                    resolve(Number.isFinite(p) && p > 0 ? p : null);
                }
            );
        } catch (_) {
            codexProbeInFlight = false;
            resolve(null);
        }
    });
}

async function fetchCodexPages() {
    if (process.platform !== 'win32') return [];
    if (!codexPort && Date.now() - lastCodexProbe > 4000) {
        lastCodexProbe = Date.now();
        codexPort = await probeCodexPortAsync();
        codexPortFailures = 0;
    }
    if (!codexPort) return [];
    try {
        const targets = await fetchJson(`http://127.0.0.1:${codexPort}/json`);
        codexPortFailures = 0;
        if (!Array.isArray(targets)) return [];
        return targets.filter((t) => t && t.type === 'page' && t.webSocketDebuggerUrl && String(t.url || '').startsWith('app://'));
    } catch (_) {
        codexPortFailures++;
        if (codexPortFailures < 3) {
            // Keep existing Codex sessions alive across transient busy hiccups
            return Array.from(sessions.values())
                .map((s) => s.target)
                .filter((t) => t && String(t.url || '').startsWith('app://'));
        }
        codexPort = null;
        codexPortFailures = 0;
        return [];
    }
}

async function scanPages() {
    totalScans++;
    const installTargets = getInstallTargets();
    const codexEnabled = installTargets.has('codex');
    const codexPages = await fetchCodexPages();
    const info = getPortInfo();
    let agyPages = [];
    if (!info) {
        consecutivePortFailures++;
        if (consecutivePortFailures === 2 && !hasEverAttached && installTargets.has('antigravity')) {
            ensureWindowsShortcutsAndRelaunchIfNeeded();
        }
        if (!codexEnabled && codexPages.length === 0 && ((hasEverAttached && consecutivePortFailures >= 2) || totalScans > 40)) {
            shutdown('Antigravity DevToolsActivePort unavailable');
            return;
        }
    } else {
        if (lastPort !== null && lastPort !== info.port) {
            for (const s of sessions.values()) {
                if (!String(s.target?.url || '').startsWith('app://')) {
                    try {
                        s.ws.close();
                    } catch (_) {}
                    sessions.delete(s.id);
                }
            }
        }
        lastPort = info.port;

        try {
            const targets = await fetchJson(`http://127.0.0.1:${info.port}/json`);
            consecutivePortFailures = 0;
            if (Array.isArray(targets)) {
                agyPages = targets.filter((t) => {
                    if (!t || t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
                    const url = String(t.url || '');
                    if (url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return false;
                    return url.includes('127.0.0.1') || url.includes('workbench') || url.includes('launchpad');
                });
            }
        } catch (_) {
            consecutivePortFailures++;
            if (!codexEnabled && codexPages.length === 0 && ((hasEverAttached && consecutivePortFailures >= 2) || (totalScans > 25 && consecutivePortFailures >= 4))) {
                shutdown('Antigravity closed (CDP port unreachable)');
                return;
            }
        }
    }

    const pages = [...agyPages, ...codexPages];
    const liveIds = new Set(pages.map((p) => p.id));
    for (const [id, session] of sessions.entries()) {
        if (!liveIds.has(id)) {
            try {
                session.ws.close();
            } catch (_) {}
            sessions.delete(id);
        }
    }

    for (const page of pages) {
        if (!sessions.has(page.id)) {
            createSession(page);
        }
    }
}

function watchPayload() {
    try {
        if (!fs.existsSync(DIST_DIR)) {
            fs.mkdirSync(DIST_DIR, { recursive: true });
        }
        fs.watch(DIST_DIR, (_eventType, filename) => {
            if (filename && filename !== 'theme_payload.js') return;
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
                log('Detected dist/theme_payload.js update; hot-reloading attached pages.');
                for (const s of sessions.values()) {
                    s.reinject();
                }
            }, 250);
        });
    } catch (err) {
        log(`fs.watch skipped: ${err.message}`);
    }
}

function closeAgyBgWindowSync() {
    try {
        const wsDir = resolveWeWorkshopDir();
        if (!wsDir) return;
        const scriptPy = path.join(ROOT_DIR, 'scripts', 'activate_we_scene.py');
        if (!fs.existsSync(scriptPy)) return;
        const pyCandidates = ['C:\\Python314\\python.exe', 'python', 'python3'];
        const pyExe = pyCandidates.find((p) => p === 'python' || p === 'python3' || fs.existsSync(p)) || 'python';
        execFileSync(pyExe, [scriptPy, wsDir, 'close'], { timeout: 2500, windowsHide: true });
    } catch (_) {}
}

function shutdown(signal) {
    log(`Shutting down on ${signal}.`);
    closeAgyBgWindowSync();
    if (mediaServer) {
        try {
            mediaServer.close();
        } catch (_) {}
    }
    for (const s of sessions.values()) {
        try {
            s.ws.close();
        } catch (_) {}
    }
    sessions.clear();
    removePidLock();
    process.exit(0);
}

acquirePidLock();
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', removePidLock);

log(`Theme daemon started (PID ${process.pid}, platform=${process.platform}, portFile=${resolvePortFile()}).`);
startMediaServer();
watchPayload();
setTimeout(() => {
    scanPages();
    setInterval(scanPages, 1500);
}, 120);
