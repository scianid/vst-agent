# =============================================================================
# VibeVST: Localhost AI Plugin Environment
# Multi-stage Dockerfile for VST3 development with JUCE and AI coding agents
# =============================================================================

FROM ubuntu:22.04 AS base

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# =============================================================================
# Layer 1: Base Linux Toolchain
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build essentials
    build-essential \
    gcc-12 \
    g++-12 \
    clang-15 \
    # CMake and Ninja
    cmake \
    ninja-build \
    # Version control
    git \
    curl \
    wget \
    ca-certificates \
    # Package config
    pkg-config \
    # Cross-compilation for Windows
    mingw-w64 \
    # Utilities
    zip \
    unzip \
    # Configure MinGW to use POSIX threading model (required for std::mutex in JUCE)
    && update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix \
    && update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix \
    # Set GCC 12 as default
    && update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-12 100 \
    && update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-12 100 \
    && update-alternatives --install /usr/bin/clang clang /usr/bin/clang-15 100 \
    && update-alternatives --install /usr/bin/clang++ clang++ /usr/bin/clang++-15 100 \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Layer 1.5: MacOS Cross-Compilation Toolchain (osxcross)
# =============================================================================
# Install dependencies for osxcross
RUN apt-get update && apt-get install -y --no-install-recommends \
    patch \
    libssl-dev \
    liblzma-dev \
    libxml2-dev \
    xz-utils \
    bzip2 \
    cpio \
    libbz2-dev \
    zlib1g-dev \
    llvm-dev \
    uuid-dev \
    python3 \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Setup osxcross environment variables
ENV OSXCROSS_PATH=/opt/osxcross
ENV PATH="${OSXCROSS_PATH}/target/bin:${PATH}"

# Clone, download SDK, and build osxcross
RUN git clone https://github.com/tpoechtrager/osxcross.git ${OSXCROSS_PATH} \
    && cd ${OSXCROSS_PATH} \
    # Download MacOSX 11.3 SDK
    && wget -P tarballs/ https://github.com/joseluisq/macosx-sdks/releases/download/11.3/MacOSX11.3.sdk.tar.xz \
    # Build (UNATTENDED=1 avoids prompts)
    && UNATTENDED=1 ./build.sh \
    # Cleanup
    && rm -rf ${OSXCROSS_PATH}/tarballs/* \
    && rm -rf ${OSXCROSS_PATH}/build

# =============================================================================
# Layer 2: Audio & GUI Dependencies for JUCE
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # ALSA Audio
    libasound2-dev \
    libjack-jackd2-dev \
    # X11 GUI Libraries
    libx11-dev \
    libxrandr-dev \
    libxinerama-dev \
    libxcursor-dev \
    libxi-dev \
    libxext-dev \
    libxcomposite-dev \
    # OpenGL for hardware-accelerated rendering
    libgl1-mesa-dev \
    libglu1-mesa-dev \
    mesa-common-dev \
    # Font rendering
    libfreetype6-dev \
    libfontconfig1-dev \
    # Networking
    libcurl4-openssl-dev \
    # WebKit (for JUCE WebBrowserComponent)
    libwebkit2gtk-4.0-dev \
    # GTK (optional JUCE backend)
    libgtk-3-dev \
    # Ladspa (Linux Audio plugins)
    ladspa-sdk \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Layer 3: JUCE Framework
# =============================================================================
ENV JUCE_PATH=/opt/JUCE
ENV JUCE_MODULES_PATH=/opt/JUCE/modules

# Clone JUCE 7.x (latest stable)
RUN git clone --depth 1 --branch 7.0.12 https://github.com/juce-framework/JUCE.git ${JUCE_PATH} \
    && cd ${JUCE_PATH} \
    # Build Projucer and other tools (optional but useful)
    && cmake -B cmake-build -DCMAKE_BUILD_TYPE=Release \
             -DJUCE_BUILD_EXTRAS=ON \
             -DJUCE_BUILD_EXAMPLES=OFF \
    && cmake --build cmake-build --target Projucer --parallel $(nproc) \
    # Make Projucer available system-wide
    && ln -sf ${JUCE_PATH}/cmake-build/extras/Projucer/Projucer_artefacts/Release/Projucer /usr/local/bin/Projucer \
    # Clean up build artifacts to save space
    && rm -rf ${JUCE_PATH}/cmake-build \
    # Fix VST3 SDK Windows.h casing for MinGW cross-compilation
    && sed -i 's/#include <Windows.h>/#include <windows.h>/g' ${JUCE_PATH}/modules/juce_audio_processors/format_types/VST3_SDK/public.sdk/samples/vst-utilities/moduleinfotool/source/main.cpp

# Set CMake to find JUCE automatically
ENV CMAKE_PREFIX_PATH=${JUCE_PATH}

# =============================================================================
# Layer 4: Python & AI Agent Environment
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    # Upgrade pip
    && python3 -m pip install --upgrade pip

# Install AI coding agents and tools (Anthropic only)
RUN pip3 install --no-cache-dir \
    # Aider - AI pair programming
    aider-chat \
    # Code generation utilities
    anthropic \
    # Development tools
    rich \
    click \
    pyyaml \
    jinja2

# =============================================================================
# Layer 5: Node.js for Web UI and Claude Code CLI
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    # Install Claude Code CLI globally
    && npm install -g @anthropic-ai/claude-code

# =============================================================================
# Layer 5: Development User & Environment Setup
# =============================================================================
# Create non-root user for development
RUN useradd -m -s /bin/bash dev \
    && mkdir -p /home/dev/MyPlugins \
    && chown -R dev:dev /home/dev

# Copy CLI tools and scripts
COPY --chown=dev:dev scripts/ /opt/vibevst/
RUN chmod +x /opt/vibevst/*.py /opt/vibevst/*.sh 2>/dev/null || true

# Add vibevst to PATH
ENV PATH="/opt/vibevst:${PATH}"

# Create symlink for the main CLI
RUN ln -sf /opt/vibevst/vibevst.py /usr/local/bin/vibevst

# =============================================================================
# Runtime Configuration
# =============================================================================
WORKDIR /home/dev/MyPlugins

# JUCE global paths
ENV JUCE_GLOBAL_MODULE_PATH=${JUCE_MODULES_PATH}

# Entrypoint
COPY --chown=dev:dev scripts/entrypoint.sh /opt/vibevst/entrypoint.sh
RUN chmod +x /opt/vibevst/entrypoint.sh

USER dev

ENTRYPOINT ["/opt/vibevst/entrypoint.sh"]
CMD ["/bin/bash"]
