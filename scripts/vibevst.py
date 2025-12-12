#!/usr/bin/env python3
"""
VibeVST CLI - The "Vibe Coding" interface for VST development
Usage: vibevst <command> [options]
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

try:
    import click
    from rich.console import Console
    from rich.panel import Panel
    from rich.syntax import Syntax
except ImportError:
    print("Installing required dependencies...")
    subprocess.run([sys.executable, "-m", "pip", "install", "click", "rich"], check=True)
    import click
    from rich.console import Console
    from rich.panel import Panel
    from rich.syntax import Syntax

console = Console()

# =============================================================================
# Configuration
# =============================================================================
JUCE_PATH = os.environ.get("JUCE_PATH", "/opt/JUCE")
JUCE_MODULES_PATH = os.environ.get("JUCE_MODULES_PATH", f"{JUCE_PATH}/modules")

# =============================================================================
# Templates
# =============================================================================

CMAKE_TEMPLATE = '''cmake_minimum_required(VERSION 3.22)

project({project_name} VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find JUCE
find_package(JUCE CONFIG REQUIRED)

# Add the plugin target
juce_add_plugin({project_name}
    COMPANY_NAME "{company_name}"
    IS_SYNTH {is_synth}
    NEEDS_MIDI_INPUT {needs_midi}
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE {manufacturer_code}
    PLUGIN_CODE {plugin_code}
    FORMATS VST3 Standalone
    PRODUCT_NAME "{display_name}"
)

# Generate JUCE header
juce_generate_juce_header({project_name})

# Source files
target_sources({project_name}
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
)

# Add DSP sources if they exist
file(GLOB_RECURSE DSP_SOURCES "Source/DSP/*.cpp")
if(DSP_SOURCES)
    target_sources({project_name} PRIVATE ${{DSP_SOURCES}})
endif()

# Add GUI sources if they exist
file(GLOB_RECURSE GUI_SOURCES "Source/GUI/*.cpp")
if(GUI_SOURCES)
    target_sources({project_name} PRIVATE ${{GUI_SOURCES}})
endif()

# Include directories
target_include_directories({project_name}
    PRIVATE
        Source
        Source/DSP
        Source/GUI
)

# JUCE compile definitions
target_compile_definitions({project_name}
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

# Link JUCE modules
target_link_libraries({project_name}
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_opengl
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)
'''

PROCESSOR_TEMPLATE = '''#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
{class_name}AudioProcessor::{class_name}AudioProcessor()
     : AudioProcessor (BusesProperties()
                       .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                       .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{{
}}

{class_name}AudioProcessor::~{class_name}AudioProcessor()
{{
}}

//==============================================================================
const juce::String {class_name}AudioProcessor::getName() const
{{
    return JucePlugin_Name;
}}

bool {class_name}AudioProcessor::acceptsMidi() const
{{
   #if JucePlugin_WantsMidiInput
    return true;
   #else
    return false;
   #endif
}}

bool {class_name}AudioProcessor::producesMidi() const
{{
   #if JucePlugin_ProducesMidiOutput
    return true;
   #else
    return false;
   #endif
}}

bool {class_name}AudioProcessor::isMidiEffect() const
{{
   #if JucePlugin_IsMidiEffect
    return true;
   #else
    return false;
   #endif
}}

double {class_name}AudioProcessor::getTailLengthSeconds() const
{{
    return 0.0;
}}

int {class_name}AudioProcessor::getNumPrograms()
{{
    return 1;
}}

int {class_name}AudioProcessor::getCurrentProgram()
{{
    return 0;
}}

void {class_name}AudioProcessor::setCurrentProgram (int index)
{{
    juce::ignoreUnused (index);
}}

const juce::String {class_name}AudioProcessor::getProgramName (int index)
{{
    juce::ignoreUnused (index);
    return {{}};
}}

void {class_name}AudioProcessor::changeProgramName (int index, const juce::String& newName)
{{
    juce::ignoreUnused (index, newName);
}}

//==============================================================================
void {class_name}AudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{{
    // Initialize DSP here
    juce::ignoreUnused (sampleRate, samplesPerBlock);
}}

void {class_name}AudioProcessor::releaseResources()
{{
    // Release DSP resources here
}}

bool {class_name}AudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
     && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;

    return true;
}}

void {class_name}AudioProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                              juce::MidiBuffer& midiMessages)
{{
    juce::ignoreUnused (midiMessages);

    juce::ScopedNoDenormals noDenormals;
    auto totalNumInputChannels  = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    // Clear any output channels that don't have input data
    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());

    // Your DSP code here
    // Example: pass-through (do nothing to the audio)
}}

//==============================================================================
bool {class_name}AudioProcessor::hasEditor() const
{{
    return true;
}}

juce::AudioProcessorEditor* {class_name}AudioProcessor::createEditor()
{{
    return new {class_name}AudioProcessorEditor (*this);
}}

//==============================================================================
void {class_name}AudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{{
    // Save plugin state here
    juce::ignoreUnused (destData);
}}

void {class_name}AudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{{
    // Restore plugin state here
    juce::ignoreUnused (data, sizeInBytes);
}}

//==============================================================================
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{{
    return new {class_name}AudioProcessor();
}}
'''

PROCESSOR_HEADER_TEMPLATE = '''#pragma once

#include <JuceHeader.h>

//==============================================================================
class {class_name}AudioProcessor  : public juce::AudioProcessor
{{
public:
    //==============================================================================
    {class_name}AudioProcessor();
    ~{class_name}AudioProcessor() override;

    //==============================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //==============================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    //==============================================================================
    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    //==============================================================================
    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;

    //==============================================================================
    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

private:
    //==============================================================================
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR ({class_name}AudioProcessor)
}};
'''

EDITOR_TEMPLATE = '''#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
{class_name}AudioProcessorEditor::{class_name}AudioProcessorEditor ({class_name}AudioProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p)
{{
    // Set plugin window size
    setSize (600, 400);
    
    // Set resizable with constraints
    setResizable (true, true);
    setResizeLimits (400, 300, 1200, 800);
}}

{class_name}AudioProcessorEditor::~{class_name}AudioProcessorEditor()
{{
}}

//==============================================================================
void {class_name}AudioProcessorEditor::paint (juce::Graphics& g)
{{
    // Fill background
    g.fillAll (juce::Colour (0xff1a1a2e));

    // Draw title
    g.setColour (juce::Colours::white);
    g.setFont (juce::FontOptions (24.0f));
    g.drawFittedText ("{display_name}", getLocalBounds().reduced (20), juce::Justification::centredTop, 1);
    
    // Draw subtitle
    g.setColour (juce::Colours::grey);
    g.setFont (juce::FontOptions (14.0f));
    g.drawFittedText ("Generated with VibeVST", getLocalBounds().reduced (20), juce::Justification::centredBottom, 1);
}}

void {class_name}AudioProcessorEditor::resized()
{{
    // Layout child components here
    auto bounds = getLocalBounds().reduced (20);
    
    // Example: reserve top area for title
    auto titleArea = bounds.removeFromTop (40);
    
    // The remaining 'bounds' can be used for GUI components
    juce::ignoreUnused (titleArea);
}}
'''

EDITOR_HEADER_TEMPLATE = '''#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

//==============================================================================
class {class_name}AudioProcessorEditor  : public juce::AudioProcessorEditor
{{
public:
    explicit {class_name}AudioProcessorEditor ({class_name}AudioProcessor&);
    ~{class_name}AudioProcessorEditor() override;

    //==============================================================================
    void paint (juce::Graphics&) override;
    void resized() override;

private:
    {class_name}AudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR ({class_name}AudioProcessorEditor)
}};
'''


# =============================================================================
# CLI Commands
# =============================================================================

@click.group()
@click.version_option(version="1.0.0")
def cli():
    """🎹 VibeVST - AI-Powered VST Plugin Development"""
    pass


@cli.command()
@click.argument("name")
@click.option("--synth", is_flag=True, help="Create a synthesizer plugin (generates audio)")
@click.option("--company", default="VibeVST", help="Company/Developer name")
def init(name: str, synth: bool, company: str):
    """Initialize a new VST plugin project
    
    Example: vibevst init "MyAwesomeSynth" --synth
    """
    # Sanitize project name
    project_name = "".join(c for c in name if c.isalnum() or c == "_")
    class_name = project_name.replace("_", "")
    display_name = name
    
    # Generate unique codes (4 characters each)
    manufacturer_code = f'"{company[:4].upper().ljust(4, "X")}"'
    plugin_code = f'"{project_name[:4].upper().ljust(4, "X")}"'
    
    project_path = Path.cwd() / project_name
    
    console.print(Panel(
        f"[bold cyan]Creating VST Plugin Project[/bold cyan]\n\n"
        f"📁 Project: [green]{project_name}[/green]\n"
        f"📍 Location: [yellow]{project_path}[/yellow]\n"
        f"🎹 Type: [magenta]{'Synthesizer' if synth else 'Effect'}[/magenta]",
        title="🎸 VibeVST Init"
    ))
    
    # Create directory structure
    dirs = [
        project_path / "Source",
        project_path / "Source" / "DSP",
        project_path / "Source" / "GUI",
        project_path / "Resources",
    ]
    
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
        console.print(f"  [green]✓[/green] Created {d.relative_to(project_path)}/")
    
    # Template variables
    template_vars = {
        "project_name": project_name,
        "class_name": class_name,
        "display_name": display_name,
        "company_name": company,
        "is_synth": "TRUE" if synth else "FALSE",
        "needs_midi": "TRUE" if synth else "FALSE",
        "manufacturer_code": manufacturer_code,
        "plugin_code": plugin_code,
    }
    
    # Generate CMakeLists.txt
    cmake_content = CMAKE_TEMPLATE.format(**template_vars)
    (project_path / "CMakeLists.txt").write_text(cmake_content)
    console.print("  [green]✓[/green] Generated CMakeLists.txt")
    
    # Generate PluginProcessor
    processor_content = PROCESSOR_TEMPLATE.format(**template_vars)
    processor_header = PROCESSOR_HEADER_TEMPLATE.format(**template_vars)
    (project_path / "Source" / "PluginProcessor.cpp").write_text(processor_content)
    (project_path / "Source" / "PluginProcessor.h").write_text(processor_header)
    console.print("  [green]✓[/green] Generated Source/PluginProcessor.cpp")
    console.print("  [green]✓[/green] Generated Source/PluginProcessor.h")
    
    # Generate PluginEditor
    editor_content = EDITOR_TEMPLATE.format(**template_vars)
    editor_header = EDITOR_HEADER_TEMPLATE.format(**template_vars)
    (project_path / "Source" / "PluginEditor.cpp").write_text(editor_content)
    (project_path / "Source" / "PluginEditor.h").write_text(editor_header)
    console.print("  [green]✓[/green] Generated Source/PluginEditor.cpp")
    console.print("  [green]✓[/green] Generated Source/PluginEditor.h")
    
    # Create placeholder files for DSP and GUI folders
    (project_path / "Source" / "DSP" / ".gitkeep").touch()
    (project_path / "Source" / "GUI" / ".gitkeep").touch()
    
    console.print()
    console.print(Panel(
        f"[bold green]✅ Project Created Successfully![/bold green]\n\n"
        f"Next steps:\n"
        f"  [cyan]1.[/cyan] cd {project_name}\n"
        f"  [cyan]2.[/cyan] Use AI agent to add DSP/GUI code\n"
        f"  [cyan]3.[/cyan] vibevst build\n"
        f"  [cyan]4.[/cyan] Find your VST3 in build/{project_name}_artefacts/",
        title="🎉 Success"
    ))


@cli.command()
@click.option("--config", default="Release", type=click.Choice(["Debug", "Release"]))
@click.option("--clean", is_flag=True, help="Clean build directory first")
def build(config: str, clean: bool):
    """Build the VST plugin in the current directory"""
    
    cmakelists = Path.cwd() / "CMakeLists.txt"
    if not cmakelists.exists():
        console.print("[red]Error:[/red] No CMakeLists.txt found in current directory")
        console.print("Run [cyan]vibevst init <name>[/cyan] first, or cd into a project folder.")
        sys.exit(1)
    
    build_dir = Path.cwd() / "build"
    
    if clean and build_dir.exists():
        console.print("[yellow]Cleaning build directory...[/yellow]")
        shutil.rmtree(build_dir)
    
    console.print(Panel(
        f"[bold cyan]Building VST Plugin[/bold cyan]\n\n"
        f"📁 Directory: [green]{Path.cwd()}[/green]\n"
        f"⚙️  Config: [yellow]{config}[/yellow]",
        title="🔨 VibeVST Build"
    ))
    
    # Configure
    console.print("\n[bold]Step 1: Configuring CMake...[/bold]")
    configure_cmd = [
        "cmake", "-B", "build", 
        "-G", "Ninja",
        f"-DCMAKE_BUILD_TYPE={config}",
        f"-DJUCE_DIR={JUCE_PATH}"
    ]
    result = subprocess.run(configure_cmd, cwd=Path.cwd())
    if result.returncode != 0:
        console.print("[red]❌ CMake configuration failed[/red]")
        sys.exit(1)
    
    # Build
    console.print("\n[bold]Step 2: Building...[/bold]")
    build_cmd = ["cmake", "--build", "build", "--config", config, "-j"]
    result = subprocess.run(build_cmd, cwd=Path.cwd())
    if result.returncode != 0:
        console.print("[red]❌ Build failed[/red]")
        sys.exit(1)
    
    console.print("\n[bold green]✅ Build completed successfully![/bold green]")
    
    # Find the output
    artefacts = list(build_dir.rglob("*.vst3"))
    if artefacts:
        console.print("\n[bold]Output files:[/bold]")
        for a in artefacts:
            console.print(f"  📦 {a}")


@cli.command()
@click.argument("prompt", nargs=-1, required=True)
@click.option("--model", default="claude-sonnet-4-20250514", help="Anthropic model to use")
def vibe(prompt: tuple, model: str):
    """Start an AI coding session with your prompt
    
    Example: vibevst vibe "Add a lowpass filter with cutoff parameter"
    """
    prompt_text = " ".join(prompt)
    
    console.print(Panel(
        f"[bold cyan]Starting AI Coding Session[/bold cyan]\n\n"
        f"🤖 Model: [green]{model}[/green]\n"
        f"💬 Prompt: [yellow]{prompt_text[:100]}{'...' if len(prompt_text) > 100 else ''}[/yellow]",
        title="🎸 VibeVST Vibe Mode"
    ))
    
    # Check for API key
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    
    if not anthropic_key:
        console.print("[red]Error:[/red] No API key found!")
        console.print("Set [cyan]ANTHROPIC_API_KEY[/cyan] environment variable.")
        sys.exit(1)
    
    # Prepare context for the AI
    context = f"""You are helping develop a JUCE VST3 plugin. 
The JUCE framework is located at {JUCE_PATH}.
Use JUCE 7 syntax and modern C++20 features.

Project structure:
- Source/PluginProcessor.cpp - Audio processing callback
- Source/PluginEditor.cpp - GUI code
- Source/DSP/ - Put DSP classes here (filters, oscillators, etc.)
- Source/GUI/ - Put custom GUI components here

User's request: {prompt_text}
"""
    
    # Launch aider with context
    try:
        aider_cmd = [
            "aider",
            "--model", model,
            "--message", context,
            "--no-git",
        ]
        subprocess.run(aider_cmd, cwd=Path.cwd())
    except FileNotFoundError:
        console.print("[yellow]Aider not found, falling back to simple mode...[/yellow]")
        console.print(f"\n[bold]Context for your AI assistant:[/bold]\n")
        console.print(Syntax(context, "text", theme="monokai"))


@cli.command()
def info():
    """Show environment information"""
    console.print(Panel(
        f"[bold cyan]VibeVST Environment Info[/bold cyan]\n\n"
        f"🔧 JUCE Path: [green]{JUCE_PATH}[/green]\n"
        f"📦 JUCE Modules: [green]{JUCE_MODULES_PATH}[/green]\n"
        f"🐍 Python: [yellow]{sys.version.split()[0]}[/yellow]\n"
        f"🔑 Anthropic Key: [{'green' if os.environ.get('ANTHROPIC_API_KEY') else 'red'}]"
        f"{'Set' if os.environ.get('ANTHROPIC_API_KEY') else 'Not Set'}[/]",
        title="ℹ️ Info"
    ))


@cli.command()
def templates():
    """List available plugin templates"""
    console.print(Panel(
        "[bold cyan]Available Templates[/bold cyan]\n\n"
        "[green]Effect[/green] (default)\n"
        "  Basic audio effect plugin with stereo I/O\n"
        "  Usage: vibevst init \"MyEffect\"\n\n"
        "[magenta]Synth[/magenta]\n"
        "  Synthesizer plugin with MIDI input\n"
        "  Usage: vibevst init \"MySynth\" --synth\n\n"
        "[yellow]Coming Soon:[/yellow]\n"
        "  • Spectral Analyzer\n"
        "  • Multi-band Processor\n"
        "  • Sampler",
        title="📋 Templates"
    ))


if __name__ == "__main__":
    cli()
