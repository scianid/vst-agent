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
    # Set GCC 12 as default
    && update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-12 100 \
    && update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-12 100 \
    && update-alternatives --install /usr/bin/clang clang /usr/bin/clang-15 100 \
    && update-alternatives --install /usr/bin/clang++ clang++ /usr/bin/clang++-15 100 \
    && rm -rf /var/lib/apt/lists/*

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
    && rm -rf ${JUCE_PATH}/cmake-build

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

# API Key (to be provided at runtime)
ENV ANTHROPIC_API_KEY=""

# JUCE global paths
ENV JUCE_GLOBAL_MODULE_PATH=${JUCE_MODULES_PATH}

# Entrypoint
COPY --chown=dev:dev scripts/entrypoint.sh /opt/vibevst/entrypoint.sh
RUN chmod +x /opt/vibevst/entrypoint.sh

USER dev

ENTRYPOINT ["/opt/vibevst/entrypoint.sh"]
CMD ["/bin/bash"]
