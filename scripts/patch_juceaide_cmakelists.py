from __future__ import annotations

from pathlib import Path

FILE = Path("/opt/JUCE/extras/Build/juceaide/CMakeLists.txt")

PATCH_BLOCK = """if(DEFINED JUCE_TOOL_JUCEAIDE)
    message(STATUS \"Using provided juceaide: ${JUCE_TOOL_JUCEAIDE}\")

    add_executable(juceaide IMPORTED GLOBAL)
    set_target_properties(juceaide PROPERTIES IMPORTED_LOCATION \"${JUCE_TOOL_JUCEAIDE}\")
    add_executable(juce::juceaide ALIAS juceaide)

    get_filename_component(_juce_juceaide_name \"${JUCE_TOOL_JUCEAIDE}\" NAME)
    set(JUCE_JUCEAIDE_NAME \"${_juce_juceaide_name}\" CACHE INTERNAL \"The name of the juceaide program\")
elseif(JUCE_BUILD_HELPER_TOOLS)"""


def main() -> int:
    text = FILE.read_text(encoding="utf-8")

    if "DEFINED JUCE_TOOL_JUCEAIDE" in text or "Using provided juceaide:" in text:
        print("Already patched:", FILE)
        return 0

    marker = "if(JUCE_BUILD_HELPER_TOOLS)"
    if marker not in text:
        raise SystemExit(f"Marker not found: {marker}")

    text = text.replace(marker, PATCH_BLOCK, 1)
    FILE.write_text(text, encoding="utf-8")
    print("Patched:", FILE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
