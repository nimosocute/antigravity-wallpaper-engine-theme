#!/usr/bin/env python3
"""
Manages a dedicated, invisible Wallpaper Engine DirectX 11 window (-playInWindow "AGY_BG")
on WinSta0\\Default so Antigravity streams 100% authentic Wallpaper Engine Scene shaders,
particles (snow, water ripples, steam, puppet meshes), and custom project.json properties
via Windows Graphics Capture (window:<hwnd>:0) WITHOUT ever changing or touching the
user's desktop monitor wallpapers (Monitor0 / Monitor1).
"""

from __future__ import annotations

import ctypes
import json
import re
import sys
import time
from pathlib import Path

kernel32 = ctypes.windll.kernel32
user32 = ctypes.windll.user32


class STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb", ctypes.c_ulong),
        ("lpReserved", ctypes.c_wchar_p),
        ("lpDesktop", ctypes.c_wchar_p),
        ("lpTitle", ctypes.c_wchar_p),
        ("dwX", ctypes.c_ulong),
        ("dwY", ctypes.c_ulong),
        ("dwXSize", ctypes.c_ulong),
        ("dwYSize", ctypes.c_ulong),
        ("dwXCountChars", ctypes.c_ulong),
        ("dwYCountChars", ctypes.c_ulong),
        ("dwFillAttribute", ctypes.c_ulong),
        ("dwFlags", ctypes.c_ulong),
        ("wShowWindow", ctypes.c_ushort),
        ("cbReserved2", ctypes.c_ushort),
        ("lpReserved2", ctypes.c_void_p),
        ("hStdInput", ctypes.c_void_p),
        ("hStdOutput", ctypes.c_void_p),
        ("hStdError", ctypes.c_void_p),
    ]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("hProcess", ctypes.c_void_p),
        ("hThread", ctypes.c_void_p),
        ("dwProcessId", ctypes.c_ulong),
        ("dwThreadId", ctypes.c_ulong),
    ]


user32.OpenDesktopW.argtypes = [ctypes.c_wchar_p, ctypes.c_ulong, ctypes.c_bool, ctypes.c_ulong]
user32.OpenDesktopW.restype = ctypes.c_void_p
user32.SetThreadDesktop.argtypes = [ctypes.c_void_p]
user32.SetThreadDesktop.restype = ctypes.c_bool
user32.FindWindowExW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p]
user32.FindWindowExW.restype = ctypes.c_void_p
user32.GetWindowLongW.argtypes = [ctypes.c_void_p, ctypes.c_int]
user32.GetWindowLongW.restype = ctypes.c_long
user32.SetWindowLongW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_long]
user32.SetWindowLongW.restype = ctypes.c_long
user32.SetWindowPos.argtypes = [
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_uint,
]
user32.SetWindowPos.restype = ctypes.c_bool
user32.SetLayeredWindowAttributes.argtypes = [
    ctypes.c_void_p,
    ctypes.c_ulong,
    ctypes.c_ubyte,
    ctypes.c_ulong,
]
user32.SetLayeredWindowAttributes.restype = ctypes.c_bool
user32.PostMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_size_t]
user32.PostMessageW.restype = ctypes.c_bool


def attach_default_desktop() -> None:
    hdesk = user32.OpenDesktopW("Default", 0, False, 0x01FF)
    if hdesk:
        user32.SetThreadDesktop(hdesk)


def spawn_on_default_desktop(cmd_line: str, cwd: str) -> int:
    si = STARTUPINFOW()
    si.cb = ctypes.sizeof(STARTUPINFOW)
    si.lpDesktop = "WinSta0\\Default"
    pi = PROCESS_INFORMATION()
    buf = ctypes.create_unicode_buffer(cmd_line)
    ok = kernel32.CreateProcessW(
        None, buf, None, None, False, 0x01000000, None, cwd, ctypes.byref(si), ctypes.byref(pi)
    )
    if not ok:
        ok = kernel32.CreateProcessW(
            None, buf, None, None, False, 0, None, cwd, ctypes.byref(si), ctypes.byref(pi)
        )
    if ok:
        kernel32.CloseHandle(pi.hProcess)
        kernel32.CloseHandle(pi.hThread)
        return int(pi.dwProcessId)
    return 0


def ensure_unpaused_when_maximized(we_dir: Path) -> None:
    cfg_path = we_dir / "config.json"
    if not cfg_path.is_file():
        return
    try:
        text = cfg_path.read_text(encoding="utf-8")
        updated = re.sub(r'"playbackmaximized"\s*:\s*"pause"', '"playbackmaximized" : "run"', text)
        updated = re.sub(r'"playbackfullscreen"\s*:\s*"stop"', '"playbackfullscreen" : "run"', updated)
        if updated != text:
            cfg_path.write_text(updated, encoding="utf-8")
    except Exception:
        pass


def is_we_running() -> bool:
    return bool(
        user32.FindWindowExW(0, 0, "WPEEventWindow", None)
        or user32.FindWindowExW(0, 0, "WPETrayWindow", None)
    )


def find_agy_bg_window() -> int:
    hwnd = user32.FindWindowExW(0, 0, "WPEOverlappedWallpaper", "AGY_BG")
    if not hwnd:
        hwnd = user32.FindWindowExW(0, 0, "WPEOverlappedWallpaper", None)
    return int(hwnd or 0)


def close_agy_bg_window() -> None:
    w = 0
    while True:
        w = user32.FindWindowExW(0, w, "WPEOverlappedWallpaper", None)
        if not w:
            break
        user32.PostMessageW(w, 0x0010, 0, 0)  # WM_CLOSE


def cloak_agy_bg_window(hwnd: int) -> None:
    GWL_STYLE = -16
    GWL_EXSTYLE = -20
    WS_CAPTION = 0x00C00000
    WS_THICKFRAME = 0x00040000
    WS_SYSMENU = 0x00080000
    WS_POPUP = -0x80000000
    WS_EX_TOOLWINDOW = 0x00000080
    WS_EX_NOACTIVATE = 0x08000000
    WS_EX_TRANSPARENT = 0x00000020
    WS_EX_LAYERED = 0x00080000
    WS_EX_APPWINDOW = 0x00040000

    st = user32.GetWindowLongW(hwnd, GWL_STYLE)
    ex = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    user32.SetWindowLongW(hwnd, GWL_STYLE, (st & ~(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU)) | WS_POPUP)
    user32.SetWindowLongW(
        hwnd,
        GWL_EXSTYLE,
        (ex | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED) & ~WS_EX_APPWINDOW,
    )
    # Alpha = 1/255: 100% invisible on desktop & click-through, while WGC captures 100% full-brightness D3D11 swapchain!
    user32.SetLayeredWindowAttributes(hwnd, 0, 1, 2)
    user32.SetWindowPos(hwnd, 1, 0, 0, 1920, 1080, 0x0010 | 0x0020 | 0x0040)


def hex_to_we_color(hex_str: str) -> str:
    s = str(hex_str or "").strip().lstrip("#")
    if len(s) == 6:
        try:
            r = int(s[0:2], 16) / 255.0
            g = int(s[2:4], 16) / 255.0
            b = int(s[4:6], 16) / 255.0
            return f"{r:.5f} {g:.5f} {b:.5f}"
        except Exception:
            pass
    return "0.15 0.15 0.18"


def apply_properties_to_project_json(item_dir: Path, props_json: str) -> bool:
    """
    Preserves a pristine backup of project.json in .agy_orig_project.json, applies any
    user property overrides (custom project.json properties, __audioprocessing, __schemecolor)
    into project.json, and returns True if project.json changed on disk.
    """
    pj_path = item_dir / "project.json"
    orig_path = item_dir / ".agy_orig_project.json"
    if not pj_path.is_file():
        return False

    try:
        if not orig_path.is_file():
            orig_path.write_bytes(pj_path.read_bytes())

        base_raw = orig_path.read_text(encoding="utf-8-sig")
        pj = json.loads(base_raw)
        general = pj.setdefault("general", {})
        props_dict = general.setdefault("properties", {})

        if props_json:
            overrides = json.loads(props_json)
            if isinstance(overrides, dict):
                for k, v in overrides.items():
                    if k == "__audioprocessing":
                        general["supportsaudioprocessing"] = bool(v)
                    elif k == "__schemecolor" and isinstance(v, str):
                        sc = props_dict.setdefault(
                            "schemecolor",
                            {"order": 0, "text": "ui_browse_properties_scheme_color", "type": "color"},
                        )
                        sc["value"] = hex_to_we_color(v) if v.startswith("#") else v
                    elif k in props_dict and isinstance(props_dict[k], dict):
                        props_dict[k]["value"] = v

        new_text = json.dumps(pj, ensure_ascii=False, indent="\t")
        old_text = pj_path.read_text(encoding="utf-8-sig")
        if new_text != old_text:
            pj_path.write_text(new_text, encoding="utf-8")
            return True
    except Exception:
        pass
    return False


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Usage: activate_we_scene.py <workshop_dir> <item_id|close> [props_json]"}))
        return

    ws_dir = Path(sys.argv[1]).resolve()
    action = sys.argv[2].strip()
    props_json = sys.argv[3].strip() if len(sys.argv) > 3 else ""

    attach_default_desktop()

    if action == "close":
        close_agy_bg_window()
        print(json.dumps({"ok": True, "closed": True}))
        return

    we_dir = ws_dir.parent.parent.parent / "common" / "wallpaper_engine"
    exe = we_dir / "wallpaper64.exe"
    if not exe.is_file():
        exe = we_dir / "wallpaper32.exe"
    if not exe.is_file():
        print(json.dumps({"ok": False, "error": f"Wallpaper Engine executable not found at {we_dir}"}))
        return

    ensure_unpaused_when_maximized(we_dir)

    item_dir = ws_dir / action
    project_json = item_dir / "project.json"
    if not project_json.is_file():
        print(json.dumps({"ok": False, "error": f"project.json not found: {project_json}"}))
        return

    pj_changed = apply_properties_to_project_json(item_dir, props_json)

    if not is_we_running():
        spawn_on_default_desktop(f'"{exe}"', str(we_dir))
        for _ in range(15):
            time.sleep(0.2)
            if is_we_running():
                break

    existing_hwnd = find_agy_bg_window()
    if existing_hwnd and (pj_changed or props_json):
        # Force wallpaper64.exe to reload the updated project.json properties into AGY_BG
        close_agy_bg_window()
        for _ in range(15):
            time.sleep(0.08)
            if not find_agy_bg_window():
                break

    cmd = (
        f'"{exe}" -control openWallpaper -file "{project_json}" '
        f'-playInWindow "AGY_BG" -width 1920 -height 1080 -borderless'
    )
    spawn_on_default_desktop(cmd, str(we_dir))
    time.sleep(0.35)

    hwnd = 0
    for _ in range(25):
        hwnd = find_agy_bg_window()
        if hwnd:
            break
        time.sleep(0.12)

    if not hwnd:
        print(json.dumps({"ok": False, "error": "WPEOverlappedWallpaper AGY_BG window not created"}))
        return

    cloak_agy_bg_window(hwnd)
    print(
        json.dumps(
            {
                "ok": True,
                "hwnd": hwnd,
                "sourceId": f"window:{hwnd}:0",
            }
        )
    )


if __name__ == "__main__":
    main()
