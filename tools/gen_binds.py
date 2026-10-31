#!/usr/bin/env python3
"""Build public/data/binds.json from EDRefCard's binding metadata (MIT, vendored in
tools/sources/edrefcard) and the game's DeviceMappings.xml.

Run:  python3 tools/gen_binds.py
"""
from __future__ import annotations

import importlib.util
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "sources" / "edrefcard"
OUT = ROOT / "public" / "data" / "binds.json"


def load_bindings_data():
    spec = importlib.util.spec_from_file_location("bindingsData", SRC / "bindingsData.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # plain data module: dicts only
    return mod


def group_of(cid: str, meta: dict) -> str:
    g = meta.get("Group")
    if g:
        return g
    if cid.endswith("_Buggy"):
        return "SRV"
    if cid.startswith("Humanoid"):
        return "OnFoot"
    return "Misc"


def humanize(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name).replace("_", " ").strip()


GAMEPADS = {"GamePad", "XB360 Pad", "DualShock4", "Playstation3Controller", "Logitech710WirelessGamepad",
            "GioteckPS3WiredController", "SaitekP2500RumbleForce", "SaitekP2600RumbleForce", "XterminatorDualControl",
            "SaitekCyborgEvoWireless"}
NICE = {
    "GamePad": "Manette (Xbox / XInput)",
    "XB360 Pad": "Manette Xbox 360",
    "DualShock4": "Manette PlayStation 4",
    "Playstation3Controller": "Manette PlayStation 3",
    "Keyboard": "Clavier",
    "Mouse": "Souris",
    "OculusTouch": "Oculus Touch",
    "T16000M": "Thrustmaster T.16000M",
    "T16000MTHROTTLE": "Thrustmaster TWCS Throttle",
    "T16000MFCS": "Thrustmaster T.16000M FCS",
    "ThrustMasterWarthogJoystick": "Thrustmaster Warthog (manche)",
    "ThrustMasterWarthogThrottle": "Thrustmaster Warthog (manette des gaz)",
    "ThrustMasterHOTAS4": "Thrustmaster T.Flight HOTAS 4",
    "ThrustMasterTFlightHOTASX": "Thrustmaster T.Flight HOTAS X",
    "TFlightHotasOne": "Thrustmaster T.Flight HOTAS One",
    "SaitekX52": "Saitek X52",
    "SaitekX52Pro": "Saitek X52 Pro",
    "SaitekX55Joystick": "Saitek X55 (manche)",
    "SaitekX55Throttle": "Saitek X55 (manette des gaz)",
    "SaitekX56Joystick": "Logitech/Saitek X56 (manche)",
    "SaitekX56Throttle": "Logitech/Saitek X56 (manette des gaz)",
    "LogitechExtreme3DPro": "Logitech Extreme 3D Pro",
}
# Vendor IDs for devices the game doesn't name (it writes VID+PID, e.g. 231D0200).
VENDORS = {"231D": "VKB", "3344": "Virpil", "044F": "Thrustmaster", "06A3": "Saitek", "0738": "Mad Catz / Saitek",
           "046D": "Logitech", "068E": "CH Products", "045E": "Microsoft", "054C": "Sony", "28DE": "Valve",
           "1234": "vJoy", "16C0": "Arduino / DIY", "03EB": "Atmel / DIY", "2341": "Arduino", "1DD2": "Leo Bodnar",
           "0483": "STMicro / DIY", "10F5": "Turtle Beach", "3570": "WinWing", "4098": "WinWing", "294B": "Snake Byte"}


def main() -> None:
    data = load_bindings_data()
    controls = {}
    for cid, meta in data.controls.items():
        controls[cid] = {
            "g": group_of(cid, meta),
            "c": meta.get("Category") or "General",
            "n": meta.get("Name") or humanize(cid),
            "o": meta.get("Order", 999),
        }
    vidpid = {}
    tree = ET.parse(SRC / "DeviceMappings.xml")
    for dev in tree.getroot():
        if dev.tag == "SupportsIcons":
            continue
        pairs = []
        if dev.find("VID") is not None:
            pairs.append((dev.findtext("VID"), dev.findtext("PID")))
        for alt in dev.findall("Alternative"):
            pairs.append((alt.findtext("VID"), alt.findtext("PID")))
        for vid, pid in pairs:
            if vid and pid:
                vidpid[(vid + pid).upper()] = dev.tag
    names = sorted(set(vidpid.values()) | set(NICE))
    devices = {}
    for n in names:
        kind = "keyboard" if n == "Keyboard" else "mouse" if n == "Mouse" else "gamepad" if n in GAMEPADS else "vr" if n == "OculusTouch" else "joystick"
        devices[n] = {"label": NICE.get(n, humanize(n)), "kind": kind}
    # Device templates (EDRefCard): which picture a device uses and where each control's
    # legend box sits on it. Pictures are loaded at runtime from EDRefCard's GitHub, not bundled.
    sizes = {"vkb-kosmosima-scg-left": [3879, 2182], "x45": [5120, 2880]}
    handled = {}
    for name, sd in data.supportedDevices.items():
        for dev in sd["HandledDevices"]:
            handled.setdefault(dev, sd["Template"])
    templates = {}
    for dev, detail in data.hotasDetails.items():
        tpl = handled.get(dev)
        if not tpl or tpl == "keyboard":
            continue
        boxes = {}
        for key, box in detail.items():
            if isinstance(box, dict) and "x" in box:
                boxes[key] = [box["x"], box["y"], box["width"], box.get("height", 54)]
        templates[dev] = {"name": detail.get("displayName", dev), "image": tpl, "size": sizes.get(tpl, [3840, 2160]), "boxes": boxes}
    payload = {
        "templates": templates,
        "templateBase": "https://raw.githubusercontent.com/richardbuckle/EDRefCard/" + (SRC / "COMMIT").read_text().strip() + "/www/res/",
        "controls": controls,
        "keymap": data.keymap,
        "devices": devices,
        "vidpid": vidpid,
        "vendors": VENDORS,
        "credits": "Noms des commandes : EDRefCard (Richard Buckle, MIT). Correspondance des périphériques : DeviceMappings.xml du jeu.",
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"controls={len(controls)} devices={len(devices)} vidpid={len(vidpid)} -> {OUT}")


if __name__ == "__main__":
    main()
