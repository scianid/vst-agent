# 🎹 VibeVST: Localhost AI Plugin Environment

**VibeVST** is a containerized development environment designed to replicate the "Lovable" or "Cursor" experience for audio plugin development. It provides a complete, pre-configured sandbox to prompt, generate, compile, and build VST3 plugins using JUCE, all on your local machine.

Stop fighting with C++ dependency chains. Just prompt, build, and play.

-----

## 🐳 Dockerfile Specification (What's Inside)

To enable "vibe coding" for audio plugins, the Docker image is built on a layered architecture containing the following components:

### 1\. Base Layer: Linux Toolchain

  * **OS:** Ubuntu 22.04 LTS (stable base).
  * **Compilers:** GCC 12+ / Clang 15+ (Required for C++20 support used in modern JUCE).
  * **Build System:** CMake 3.25+ and Ninja (Faster than Make/MSBuild).

### 2\. Audio & GUI Dependencies

[cite_start]The container includes all low-level Linux libraries required to compile JUCE[cite: 5]:

  * `libasound2-dev` (ALSA Audio)
  * `libx11-dev`, `libxrandr-dev`, `libxinerama-dev`, `libxcursor-dev` (GUI rendering)
  * `libfreetype6-dev` (Font rendering)
  * `libcurl4-openssl-dev` (Networking)

### 3\. The JUCE Framework

  * **Location:** `/opt/JUCE`
  * [cite_start]**Version:** JUCE 7.0+ (Pre-cloned and configured)[cite: 5].
  * **Configuration:** Global paths set so CMake can find JUCE modules automatically.

### 4\. The "Vibe" Layer (AI Agent)

  * **Python Environment:** Python 3.10+ with `pip`.
  * **AI CLI Tools:** Pre-installed generic AI coding agents (e.g., `aider-chat`, `gpt-engineer`, or your custom scripts).
  * **API Configuration:** Environment variables for `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.

-----

## 🚀 Getting Started

### Prerequisites

1.  **Docker Desktop** installed and running.
2.  **API Key** (OpenAI or Anthropic) for the generative coding agent.

### Installation

1.  **Clone the Repository**

    ```bash
    git clone https://github.com/yourusername/vibevst-docker.git
    cd vibevst-docker
    ```

2.  **Build the Image**

    ```bash
    docker build -t vibevst-env .
    ```

3.  **Run the Container**
    Mount your local folder to keep your generated plugins persistent:

    ```bash
    docker run -it \
      -v $(pwd)/MyPlugins:/home/dev/MyPlugins \
      -e OPENAI_API_KEY="sk-..." \
      vibevst-env
    ```

-----

## ⚡ The "Prompt-to-VST" Workflow

Once inside the container, follow this workflow to go from idea to VST3.

### Step 1: Initialize the Project

[cite_start]Use the built-in scaffold command to create the folder structure similar to professional plugins[cite: 4]:

```bash
# Creates Source/DSP, Source/GUI, and CMakeLists.txt
vibevst init "MyNewSynth"
```

### Step 2: Vibe Coding (The Prompt)

Run the AI agent to generate the code.
*Example Prompt:*

> [cite_start]"Create a spectral analyzer plugin called 'VisualEyes'. It needs a Quad-panel layout. In the DSP folder, create an FFTAnalyzer class. In the GUI folder, create a SpectrogramComponent that uses a 'Plasma' color map. Make sure to use JUCE 7 syntax." [cite: 2, 3, 16]

The agent will populate:

  * `Source/DSP/FFTAnalyzer.h`
  * `Source/GUI/SpectrogramComponent.cpp`
  * `PluginProcessor.cpp`

### Step 3: Build & Compile

Instead of opening Visual Studio, we use the headless CMake flow. This compiles the VST3 inside the Linux container.

```bash
cd MyNewSynth
cmake -B build -G Ninja
cmake --build build --config Release
```

### Step 4: Extract & Test

The compiled VST3 file will appear in your mounted local folder:
`./MyPlugins/MyNewSynth/build/VisualEyes.vst3`

  * **Linux Users:** Copy to `~/.vst3`
  * **Windows/Mac Users:** Use the "Cross-Compile" flag (if configured) or simply use the generated Source code (`Source/`) and `CMakeLists.txt` to build locally on your host OS using the Docker-generated code.

-----

## 📂 Expected Output Structure

The environment is tuned to generate projects matching industry standards, identical to the "VisualEyes" reference:

```text
ProjectName/
├── CMakeLists.txt              # Build configuration (replaces .jucer/.sln)
├── Source/
│   ├── DSP/
[cite_start]│   │   ├── FFTAnalyzer.cpp     # Generated DSP logic [cite: 3]
│   │   └── ...
│   ├── GUI/
[cite_start]│   │   ├── Spectrogram.cpp     # Generated UI code [cite: 3]
│   │   └── ...
│   ├── PluginProcessor.cpp     # Audio callback
[cite_start]│   └── PluginEditor.cpp        # Main Layout [cite: 10]
```

-----

## 🔧 Troubleshooting & Tips

  * **"Missing JuceHeader.h":** The Docker container sets `JUCE_GLOBAL_PATHS` automatically. [cite_start]If the AI agent hallucinates a local path, remind it: *"Use the global JUCE module path at /opt/JUCE/modules"*[cite: 6].
  * **Real-time Preview:** Docker cannot easily output audio.
      * *Workflow:* Generate Code -\> Compile -\> Move VST to Host DAW -\> Test -\> Repeat.
  * [cite_start]**Complex GUI:** For things like 60 FPS spectrograms[cite: 2], ask the agent to "Use OpenGLContext" for hardware acceleration, which is supported in the headers provided.

-----

## 📜 License

MIT License.
**Generated Plugins:** You own 100% of the code generated within VibeVST.

-----

### Would you like me to generate the actual `Dockerfile` code based on this specification now?


--------------


Restart  vite in docker:

docker exec vibevst pkill -f vite; Start-Sleep -Seconds 2; docker exec -d vibevst bash -c "cd /home/dev/web && npx vite --host 0.0.0.0 --port 5173 > /tmp/vite.log 2>&1"; Start-Sleep -Seconds 3; docker exec vibevst cat /tmp/vite.log


RESTART DOCKER

docker restart vibevst && docker logs vibevst --tail 50 -f