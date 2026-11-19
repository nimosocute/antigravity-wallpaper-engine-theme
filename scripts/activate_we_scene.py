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


try:
    user32.SetProcessDpiAwarenessContext.argtypes = [ctypes.c_void_p]
    user32.SetProcessDpiAwarenessContext.restype = ctypes.c_bool
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except Exception:
    pass
user32.GetSystemMetrics.argtypes = [ctypes.c_int]
user32.GetSystemMetrics.restype = ctypes.c_int
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


def find_agy_bg_window(slot: str = "AGY_BG") -> int:
    hwnd = user32.FindWindowExW(0, 0, "WPEOverlappedWallpaper", slot)
    if not hwnd and slot == "AGY_BG":
        hwnd = user32.FindWindowExW(0, 0, "WPEOverlappedWallpaper", None)
    return int(hwnd or 0)


def close_agy_bg_window(slot: str = "") -> None:
    w = 0
    while True:
        w = user32.FindWindowExW(0, w, "WPEOverlappedWallpaper", slot if slot else None)
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
    # Position completely outside the virtual screen bounds so WGC NEVER captures the user's mouse cursor over AGY_BG.
    user32.SetLayeredWindowAttributes(hwnd, 0, 1, 2)
    off_y = max(3000, int(user32.GetSystemMetrics(77)) + int(user32.GetSystemMetrics(79)) + 1000)
    user32.SetWindowPos(hwnd, 1, 0, off_y, 1920, 1080, 0x0010 | 0x0020 | 0x0040)


def get_we_pids() -> set[int]:
    pids: set[int] = set()
    try:
        import subprocess
        out = subprocess.check_output(
            ["tasklist", "/FI", "IMAGENAME eq wallpaper64.exe", "/FO", "CSV", "/NH"],
            text=True,
            creationflags=0x08000000,
        )
        for line in out.splitlines():
            parts = [p.strip().strip('"') for p in line.split(",")]
            if len(parts) >= 2 and parts[1].isdigit():
                pids.add(int(parts[1]))
    except Exception:
        pass
    try:
        hwnd = user32.FindWindowExW(0, 0, "WPEEventWindow", None) or user32.FindWindowExW(0, 0, "WPETrayWindow", None)
        if hwnd:
            pid = ctypes.c_ulong(0)
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value:
                pids.add(int(pid.value))
    except Exception:
        pass
    return pids


def set_we_audio_volume(volume_pct: int) -> bool:
    vol_norm = max(0.0, min(1.0, float(volume_pct) / 100.0))
    target_pids = get_we_pids()
    if not target_pids:
        return False
    try:
        from ctypes import POINTER, c_float, c_int, c_uint, c_ulong, c_void_p
        import comtypes
        from comtypes import CLSCTX_ALL, COMMETHOD, GUID, IUnknown

        CLSID_MMDeviceEnumerator = GUID("{BCDE0395-E52F-467C-8E3D-C4579291692E}")
        IID_IMMDeviceEnumerator = GUID("{A95664D2-9614-4F35-A746-DE8DB63617E6}")
        IID_IAudioSessionManager2 = GUID("{77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F}")
        IID_IAudioSessionControl2 = GUID("{BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D}")
        IID_ISimpleAudioVolume = GUID("{87CE5498-68D6-44E5-9215-6DA47EF883D8}")

        class IMMDevice(IUnknown):
            _iid_ = GUID("{D666063F-1587-4E43-81F1-B948E807363F}")
            _methods_ = [
                COMMETHOD([], ctypes.HRESULT, "Activate", (["in"], POINTER(GUID), "iid"), (["in"], c_ulong, "dwClsCtx"), (["in"], c_void_p, "pActivationParams"), (["out"], POINTER(c_void_p), "ppInterface")),
            ]

        class IMMDeviceEnumerator(IUnknown):
            _iid_ = IID_IMMDeviceEnumerator
            _methods_ = [
                COMMETHOD([], ctypes.HRESULT, "EnumAudioEndpoints"),
                COMMETHOD([], ctypes.HRESULT, "GetDefaultAudioEndpoint", (["in"], c_uint, "dataFlow"), (["in"], c_uint, "role"), (["out"], POINTER(POINTER(IMMDevice)), "ppEndpoint")),
            ]

        class IAudioSessionControl(IUnknown):
            _iid_ = GUID("{F4B1A599-7266-4319-A8CA-E70ACB11E8CD}")
            _methods_ = [
                COMMETHOD([], ctypes.HRESULT, "GetState", (["out"], POINTER(c_uint), "pRetVal")),
            ]

        class IAudioSessionControl2(IAudioSessionControl):
            _iid_ = IID_IAudioSessionControl2
            _methods_ = [
                COMMETHOD([], ctypes.HRESULT, "GetDisplayName"),
                COMMETHOD([], ctypes.HRESULT, "SetDisplayName"),
                COMMETHOD([], ctypes.HRESULT, "GetIconPath"),
                COMMETHOD([], ctypes.HRESULT, "SetIconPath"),
                COMMETHOD([], ctypes.HRESULT, "GetGroupingParam"),
                COMMETHOD([], ctypes.HRESULT, "SetGroupingParam"),
                COMMETHOD([], ctypes.HRESULT, "RegisterAudioSessionNotification"),
                COMMETHOD([], ctypes.HRESULT, "UnregisterAudioSessionNotification"),
                COMMETHOD([], ctypes.HRESULT, "GetSessionIdentifier"),
                COMMETHOD([], ctypes.HRESULT, "GetSessionInstanceIdentifier"),
                COMMETHOD([], ctypes.HRESULT, "GetProcessId", (["out"], POINTER(c_ulong), "pRetVal")),
            ]

        class IAudioSessionEnumerator(IUnknown):
            _iid_ = GUID("{E2F5BB11-0570-40CA-ACDD-3AA01277DEE8}")
            _methods_ = [
                COMMETHOD([], ctypes.HRESULT, "GetCount", (["out"], POINTER(c_uint), "SessionCount")),
                COMMETHOD([], ctypes.HRESULT, "GetSession", (["in"], c_uint, "SessionCount"), (["out"], POINTER(POINTER(IAudioSessionControl)), "Session")),
            ]

        class IAudioSessionManager2(IUnknown):
            _iid_ = IID_IAudioSessionManager2
            _methods_ = [
                COMMETHOD([], ctypes.HRESULT, "GetAudioSessionControl"),
                COMMETHOD([], ctypes.HRESULT, "GetSimpleAudioVolume"),
                COMMETHOD([], ctypes.HRESULT, "GetSessionEnumerator", (["out"], POINTER(POINTER(IAudioSessionEnumerator)), "SessionEnum")),
            ]

        class ISimpleAudioVolume(IUnknown):
            _iid_ = IID_ISimpleAudioVolume
            _methods_ = [
                COMMETHOD([], ctypes.HRESULT, "SetMasterVolume", (["in"], c_float, "fLevel"), (["in"], c_void_p, "EventContext")),
                COMMETHOD([], ctypes.HRESULT, "GetMasterVolume", (["out"], POINTER(c_float), "pfLevel")),
                COMMETHOD([], ctypes.HRESULT, "SetMute", (["in"], c_int, "bMute"), (["in"], c_void_p, "EventContext")),
            ]

        comtypes.CoInitialize()
        enum = comtypes.CoCreateInstance(CLSID_MMDeviceEnumerator, IMMDeviceEnumerator, CLSCTX_ALL)
        dev = enum.GetDefaultAudioEndpoint(0, 1)
        mgr_ptr = dev.Activate(ctypes.byref(IID_IAudioSessionManager2), CLSCTX_ALL, None)
        mgr = ctypes.cast(mgr_ptr, POINTER(IAudioSessionManager2))
        sess_enum = mgr.GetSessionEnumerator()
        cnt = sess_enum.GetCount()
        updated = False
        for i in range(cnt):
            ctl = sess_enum.GetSession(i)
            ctl2 = ctl.QueryInterface(IAudioSessionControl2)
            pid = int(ctl2.GetProcessId())
            if pid in target_pids:
                sav = ctl.QueryInterface(ISimpleAudioVolume)
                sav.SetMasterVolume(vol_norm, None)
                sav.SetMute(1 if volume_pct <= 0 else 0, None)
                updated = True
        return updated
    except Exception:
        return False


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
        print(json.dumps({"ok": False, "error": "Usage: activate_we_scene.py <workshop_dir> <item_id|close|volume> [props_json|vol] [vol]"}))
        return

    ws_dir = Path(sys.argv[1]).resolve()
    action = sys.argv[2].strip()
    props_json = sys.argv[3].strip() if len(sys.argv) > 3 else ""
    vol_arg = sys.argv[4].strip() if len(sys.argv) > 4 else ""
    slot = sys.argv[5].strip() if len(sys.argv) > 5 and sys.argv[5].strip() else "AGY_BG"

    if action == "volume":
        try:
            v = int(float(props_json)) if props_json else 0
        except Exception:
            v = 0
        ok = set_we_audio_volume(v)
        print(json.dumps({"ok": ok, "volume": v}))
        return

    attach_default_desktop()

    if action == "close":
        close_agy_bg_window(props_json)
        print(json.dumps({"ok": True, "closed": True, "slot": props_json or "all"}))
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

    existing_hwnd = find_agy_bg_window(slot)
    if existing_hwnd and pj_changed:
        # Force wallpaper64.exe to reload the updated project.json properties into this slot
        close_agy_bg_window(slot)
        for _ in range(15):
            time.sleep(0.06)
            if not find_agy_bg_window(slot):
                break

    off_y = max(3000, int(user32.GetSystemMetrics(77)) + int(user32.GetSystemMetrics(79)) + 1000)
    cmd = (
        f'"{exe}" -control openWallpaper -file "{project_json}" '
        f'-playInWindow "{slot}" -x 0 -y {off_y} -width 1920 -height 1080 -borderless'
    )
    spawn_on_default_desktop(cmd, str(we_dir))

    hwnd = 0
    for _ in range(80):
        hwnd = find_agy_bg_window(slot)
        if hwnd:
            break
        time.sleep(0.02)

    if not hwnd:
        print(json.dumps({"ok": False, "error": f"WPEOverlappedWallpaper {slot} window not created"}))
        return

    cloak_agy_bg_window(hwnd)
    # Wait for wallpaper64.exe to finish loading the new scene's first frame & D3D11 swapchain, then re-lock exact 1920x1080
    time.sleep(0.45)
    cloak_agy_bg_window(hwnd)
    try:
        set_we_audio_volume(int(float(vol_arg)) if vol_arg else 0)
    except Exception:
        pass
    print(
        json.dumps(
            {
                "ok": True,
                "hwnd": hwnd,
                "slot": slot,
                "sourceId": f"window:{hwnd}:0",
            }
        )
    )


if __name__ == "__main__":
    main()
