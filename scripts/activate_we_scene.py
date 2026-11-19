#!/usr/bin/env python3
"""
Activates a Wallpaper Engine Scene (project.json) in wallpaper64.exe on WinSta0\\Default,
ensures wallpaper64 does not pause when Antigravity is maximized, detaches
WPEDesktopDX11Window from WorkerW as a bottom-most borderless popup window so
Windows Graphics Capture (Chromium getUserMedia window:<hwnd>:0) can stream its
live 60fps DirectX 11 swapchain directly into Antigravity.
"""

from __future__ import annotations

import ctypes
import json
import os
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


class RECT(ctypes.Structure):
    _fields_ = [
        ("L", ctypes.c_long),
        ("T", ctypes.c_long),
        ("R", ctypes.c_long),
        ("B", ctypes.c_long),
    ]


user32.OpenDesktopW.argtypes = [ctypes.c_wchar_p, ctypes.c_ulong, ctypes.c_bool, ctypes.c_ulong]
user32.OpenDesktopW.restype = ctypes.c_void_p
user32.SetThreadDesktop.argtypes = [ctypes.c_void_p]
user32.SetThreadDesktop.restype = ctypes.c_bool
user32.FindWindowExW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p]
user32.FindWindowExW.restype = ctypes.c_void_p
user32.SetParent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
user32.SetParent.restype = ctypes.c_void_p
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
user32.GetWindowRect.argtypes = [ctypes.c_void_p, ctypes.POINTER(RECT)]
user32.GetWindowRect.restype = ctypes.c_bool


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
    # Try CREATE_BREAKAWAY_FROM_JOB (0x01000000) first so WE survives helper exit
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


def find_dx11_window() -> int:
    # 1. Check top-level first (if already detached)
    top = user32.FindWindowExW(0, 0, "WPEDesktopDX11Window", None)
    if top:
        return int(top)

    # 2. Check inside Progman -> WorkerW
    progman = user32.FindWindowExW(0, 0, "Progman", None)
    if progman:
        w = 0
        while True:
            w = user32.FindWindowExW(progman, w, "WorkerW", None)
            if not w:
                break
            dx = user32.FindWindowExW(w, 0, "WPEDesktopDX11Window", None)
            if dx:
                return int(dx)

    # 3. Check all top-level WorkerW windows
    w = 0
    while True:
        w = user32.FindWindowExW(0, w, "WorkerW", None)
        if not w:
            break
        dx = user32.FindWindowExW(w, 0, "WPEDesktopDX11Window", None)
        if dx:
            return int(dx)
    return 0


def is_we_running() -> bool:
    return bool(
        user32.FindWindowExW(0, 0, "WPEEventWindow", None)
        or user32.FindWindowExW(0, 0, "WPETrayWindow", None)
    )


def promote_dx11_for_wgc(dx11: int) -> None:
    GWL_STYLE = -16
    GWL_EXSTYLE = -20
    WS_CHILD = 0x40000000
    WS_POPUP = -0x80000000
    WS_VISIBLE = 0x10000000
    WS_EX_TOOLWINDOW = 0x00000080
    WS_EX_NOACTIVATE = 0x08000000

    r = RECT()
    user32.GetWindowRect(dx11, ctypes.byref(r))
    w = max(1280, r.R - r.L)
    h = max(720, r.B - r.T)

    st = user32.GetWindowLongW(dx11, GWL_STYLE)
    ex = user32.GetWindowLongW(dx11, GWL_EXSTYLE)
    user32.SetParent(dx11, 0)
    user32.SetWindowLongW(dx11, GWL_STYLE, (st & ~WS_CHILD) | WS_POPUP | WS_VISIBLE)
    user32.SetWindowLongW(dx11, GWL_EXSTYLE, ex | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE)
    # HWND_BOTTOM = 1, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW = 0x0010 | 0x0020 | 0x0040
    user32.SetWindowPos(dx11, 1, 0, 0, w, h, 0x0010 | 0x0020 | 0x0040)


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Usage: activate_we_scene.py <workshop_dir> <item_id_or_cmd>"}))
        return

    ws_dir = Path(sys.argv[1]).resolve()
    action = sys.argv[2].strip()
    we_dir = ws_dir.parent.parent.parent / "common" / "wallpaper_engine"
    exe = we_dir / "wallpaper64.exe"
    if not exe.is_file():
        exe = we_dir / "wallpaper32.exe"
    if not exe.is_file():
        print(json.dumps({"ok": False, "error": f"Wallpaper Engine executable not found at {we_dir}"}))
        return

    attach_default_desktop()
    ensure_unpaused_when_maximized(we_dir)

    if action in ("play", "pause", "stop"):
        if is_we_running():
            spawn_on_default_desktop(f'"{exe}" -control {action}', str(we_dir))
        print(json.dumps({"ok": True, "action": action}))
        return

    project_json = ws_dir / action / "project.json"
    if not project_json.is_file():
        print(json.dumps({"ok": False, "error": f"project.json not found: {project_json}"}))
        return

    if not is_we_running():
        spawn_on_default_desktop(f'"{exe}"', str(we_dir))
        for _ in range(15):
            time.sleep(0.2)
            if is_we_running():
                break

    spawn_on_default_desktop(
        f'"{exe}" -control openWallpaper -file "{project_json}"',
        str(we_dir),
    )
    time.sleep(0.65)

    dx11 = 0
    for _ in range(20):
        dx11 = find_dx11_window()
        if dx11:
            break
        time.sleep(0.15)

    if not dx11:
        print(json.dumps({"ok": False, "error": "WPEDesktopDX11Window not found after openWallpaper"}))
        return

    promote_dx11_for_wgc(dx11)
    spawn_on_default_desktop(f'"{exe}" -control play', str(we_dir))
    print(
        json.dumps(
            {
                "ok": True,
                "hwnd": dx11,
                "sourceId": f"window:{dx11}:0",
            }
        )
    )


if __name__ == "__main__":
    main()
