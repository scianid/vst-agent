import express from 'express'
import cors from 'cors'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'
import Anthropic from '@anthropic-ai/sdk'

const execAsync = promisify(exec)
const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Plugin storage directory
const PLUGINS_DIR = process.env.PLUGINS_DIR || '/home/dev/MyPlugins'

// =============================================================================
// VST Code Generation Prompt
// =============================================================================
const SYSTEM_PROMPT = `You are an expert JUCE C++ developer specializing in VST3 plugin development.
You will generate complete, working VST3 plugin code based on user descriptions.

IMPORTANT RULES:
1. Generate COMPLETE, compilable C++ code - no placeholders or TODOs
2. Use JUCE 7 API syntax
3. Use modern C++20 features
4. Include all necessary #includes
5. Implement actual DSP processing, not pass-through
6. Create a functional GUI with controls

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "files": [
    {
      "path": "Source/PluginProcessor.h",
      "content": "// complete file content"
    },
    {
      "path": "Source/PluginProcessor.cpp", 
      "content": "// complete file content"
    },
    {
      "path": "Source/PluginEditor.h",
      "content": "// complete file content"
    },
    {
      "path": "Source/PluginEditor.cpp",
      "content": "// complete file content"
    }
  ]
}

Include any additional DSP files in Source/DSP/ if needed.
ONLY output the JSON, no explanations.`

// =============================================================================
// API Routes
// =============================================================================

// Generate plugin code using Anthropic Claude
app.post('/api/generate', async (req, res) => {
  const { prompt, apiKey, projectName } = req.body

  if (!prompt || !apiKey || !projectName) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const anthropic = new Anthropic({ apiKey })

    console.log(`Generating plugin: ${projectName}`)
    console.log(`Prompt: ${prompt}`)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Create a VST3 plugin called "${projectName}" with this description:\n\n${prompt}\n\nGenerate all the source files needed.`
        }
      ]
    })

    // Extract the text content
    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = responseText
    if (responseText.includes('```json')) {
      jsonStr = responseText.split('```json')[1].split('```')[0].trim()
    } else if (responseText.includes('```')) {
      jsonStr = responseText.split('```')[1].split('```')[0].trim()
    }

    const generated = JSON.parse(jsonStr)
    
    // Create project directory
    const projectDir = path.join(PLUGINS_DIR, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source', 'DSP'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source', 'GUI'), { recursive: true })

    // Write generated files
    for (const file of generated.files) {
      const filePath = path.join(projectDir, file.path)
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, file.content)
      console.log(`  Created: ${file.path}`)
    }

    // Generate CMakeLists.txt
    const cmakeContent = generateCMakeLists(projectName)
    await fs.writeFile(path.join(projectDir, 'CMakeLists.txt'), cmakeContent)
    console.log('  Created: CMakeLists.txt')

    res.json({ 
      success: true, 
      projectName,
      files: generated.files.map(f => f.path)
    })

  } catch (error) {
    console.error('Generation error:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Generation failed' 
    })
  }
})

// Compile the plugin
app.post('/api/compile', async (req, res) => {
  const { projectName } = req.body

  if (!projectName) {
    return res.status(400).json({ error: 'Missing project name' })
  }

  const projectDir = path.join(PLUGINS_DIR, projectName)

  try {
    // Check if project exists
    await fs.access(projectDir)

    console.log(`Compiling: ${projectName}`)

    // Configure with CMake
    const configureCmd = `cd "${projectDir}" && cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DJUCE_DIR=/opt/JUCE`
    console.log('Configure:', configureCmd)
    await execAsync(configureCmd)

    // Build
    const buildCmd = `cd "${projectDir}" && cmake --build build --config Release -j$(nproc)`
    console.log('Build:', buildCmd)
    const { stdout, stderr } = await execAsync(buildCmd)

    console.log('Build output:', stdout)
    if (stderr) console.log('Build stderr:', stderr)

    // Find the VST3 output
    const artefactsDir = path.join(projectDir, 'build', `${projectName}_artefacts`, 'Release', 'VST3')
    const vst3Path = path.join(artefactsDir, `${projectName}.vst3`)

    // Check if VST3 was created
    try {
      await fs.access(vst3Path)
    } catch {
      // Try alternative path
      const altPath = path.join(projectDir, 'build', `${projectName}_artefacts`, 'VST3')
      await fs.access(altPath)
    }

    res.json({
      success: true,
      output: 'Build completed successfully',
      downloadUrl: `/api/download/${projectName}`
    })

  } catch (error) {
    console.error('Compile error:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Compilation failed'
    })
  }
})

// Download the compiled VST3
app.get('/api/download/:projectName', async (req, res) => {
  const { projectName } = req.params
  const projectDir = path.join(PLUGINS_DIR, projectName)

  try {
    // Find VST3 bundle
    const possiblePaths = [
      path.join(projectDir, 'build', `${projectName}_artefacts`, 'Release', 'VST3', `${projectName}.vst3`),
      path.join(projectDir, 'build', `${projectName}_artefacts`, 'VST3', `${projectName}.vst3`),
    ]

    let vst3Path = null
    for (const p of possiblePaths) {
      try {
        await fs.access(p)
        vst3Path = p
        break
      } catch {}
    }

    if (!vst3Path) {
      return res.status(404).json({ error: 'VST3 not found' })
    }

    // Create a zip of the VST3 bundle
    const zipPath = path.join(projectDir, `${projectName}.vst3.zip`)
    await execAsync(`cd "${path.dirname(vst3Path)}" && zip -r "${zipPath}" "${projectName}.vst3"`)

    res.download(zipPath, `${projectName}.vst3.zip`)

  } catch (error) {
    console.error('Download error:', error)
    res.status(500).json({ error: 'Download failed' })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// =============================================================================
// Helper Functions
// =============================================================================

function generateCMakeLists(projectName) {
  return `cmake_minimum_required(VERSION 3.22)

project(${projectName} VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find JUCE
find_package(JUCE CONFIG REQUIRED)

# Add the plugin target
juce_add_plugin(${projectName}
    COMPANY_NAME "VibeVST"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Vibe
    PLUGIN_CODE ${projectName.substring(0, 4).toUpperCase().padEnd(4, 'X')}
    FORMATS VST3 Standalone
    PRODUCT_NAME "${projectName}"
)

# Generate JUCE header
juce_generate_juce_header(${projectName})

# Source files
target_sources(${projectName}
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
)

# Add DSP sources if they exist
file(GLOB_RECURSE DSP_SOURCES "Source/DSP/*.cpp")
if(DSP_SOURCES)
    target_sources(${projectName} PRIVATE \${DSP_SOURCES})
endif()

# Add GUI sources if they exist  
file(GLOB_RECURSE GUI_SOURCES "Source/GUI/*.cpp")
if(GUI_SOURCES)
    target_sources(${projectName} PRIVATE \${GUI_SOURCES})
endif()

# Include directories
target_include_directories(${projectName}
    PRIVATE
        Source
        Source/DSP
        Source/GUI
)

# JUCE compile definitions
target_compile_definitions(${projectName}
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

# Link JUCE modules
target_link_libraries(${projectName}
    PRIVATE
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_opengl
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)
`
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeVST API server running on port ${PORT}`)
})
