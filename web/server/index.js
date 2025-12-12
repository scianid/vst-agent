import express from 'express'
import cors from 'cors'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)
const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Plugin storage directory
const PLUGINS_DIR = process.env.PLUGINS_DIR || '/home/dev/MyPlugins'

// =============================================================================
// VST Code Generation Prompt for Claude Code
// =============================================================================
const GENERATION_PROMPT = `You are creating a JUCE VST3 plugin. Create the following files:
1. Source/PluginProcessor.h - Audio processor header
2. Source/PluginProcessor.cpp - Audio processor implementation with actual DSP
3. Source/PluginEditor.h - GUI editor header  
4. Source/PluginEditor.cpp - GUI editor with controls

IMPORTANT:
- Use JUCE 7 API syntax
- Use modern C++20 features
- Include all necessary #includes
- Implement actual DSP processing, not pass-through
- Create a functional GUI with knobs/sliders for parameters
- Use juce::AudioProcessorValueTreeState for parameters`

// =============================================================================
// API Routes
// =============================================================================

// Generate plugin code using Claude Code CLI (with streaming logs)
app.post('/api/generate/stream', async (req, res) => {
  const { prompt, apiKey, projectName } = req.body

  console.log('=== Generate Request (Streaming) ===')
  console.log('Project:', projectName)
  console.log('Prompt:', prompt)
  console.log('API Key received:', apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)} (length: ${apiKey.length})` : 'NONE')

  if (!prompt || !apiKey || !projectName) {
    console.log('Error: Missing required fields')
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    // Create project directory structure
    const projectDir = path.join(PLUGINS_DIR, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source', 'DSP'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source', 'GUI'), { recursive: true })

    sendEvent('log', { message: `📁 Created project directory: ${projectName}/` })
    sendEvent('log', { message: '📁 Created Source/, Source/DSP/, Source/GUI/' })

    // Generate CMakeLists.txt
    const cmakeContent = generateCMakeLists(projectName)
    await fs.writeFile(path.join(projectDir, 'CMakeLists.txt'), cmakeContent)
    sendEvent('log', { message: `📄 Created CMakeLists.txt (${formatBytes(cmakeContent.length)})` })

    // Create CLAUDE.md
    const claudeContext = `# ${projectName} - VST3 Plugin

## Project Structure
- Source/PluginProcessor.h - Audio processor header
- Source/PluginProcessor.cpp - Audio processor with DSP
- Source/PluginEditor.h - GUI editor header
- Source/PluginEditor.cpp - GUI editor implementation

## Build System
Using JUCE 7 with CMake. JUCE is installed at /opt/JUCE.

## Requirements
- C++20
- JUCE 7 API
- Working DSP implementation (not pass-through)
- Functional GUI with parameter controls
`
    await fs.writeFile(path.join(projectDir, 'CLAUDE.md'), claudeContext)
    sendEvent('log', { message: '📄 Created CLAUDE.md' })

    // Full prompt for Claude Code
    const fullPrompt = `${GENERATION_PROMPT}

Create a VST3 plugin called "${projectName}" with this description:
${prompt}

Generate all the source files in the Source/ directory. Make sure the code is complete and compilable.`

    sendEvent('log', { message: '🤖 Starting Claude Code CLI...' })
    sendEvent('claude', { message: '--- Claude Code Output ---' })

    // Run Claude Code CLI with streaming JSON output and verbose/debug mode
    // We run 'node' directly on the CLI script to avoid path/symlink issues
    const claudeScriptPath = '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'
    
    console.log(`🚀 Spawning: node ${claudeScriptPath}`)
    
    const claudeProcess = spawn('node', [
      claudeScriptPath,
      '-p', fullPrompt,
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--no-session-persistence',
      '--verbose',
      '-d',
      '--dangerously-skip-permissions'
    ], {
      cwd: projectDir,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: apiKey,
        FORCE_COLOR: '1', // Force color output (sometimes helps with TTY detection)
        CI: '1' // Sometimes helps tools behave in non-interactive mode
      }
    })

    let stdout = ''
    let stderr = ''

    claudeProcess.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      // Log raw output to server console for debugging
      console.log('Claude stdout chunk:', text.substring(0, 100) + (text.length > 100 ? '...' : ''))
      
      // Parse streaming JSON and send relevant info to UI
      text.split('\n').forEach(line => {
        if (!line.trim()) return
        try {
          const json = JSON.parse(line)
          if (json.type === 'assistant' && json.message?.content) {
            // Assistant message with content
            json.message.content.forEach(c => {
              if (c.type === 'text' && c.text) {
                sendEvent('claude', { message: c.text })
              } else if (c.type === 'tool_use') {
                sendEvent('claude', { message: `🔧 Using tool: ${c.name}` })
              }
            })
          } else if (json.type === 'result') {
            sendEvent('claude', { message: `✅ ${json.subtype || 'Done'}` })
          } else if (json.type === 'error' || json.error) {
             sendEvent('claude_error', { message: json.error?.message || json.error || 'Unknown error' })
          }
        } catch {
          // Not JSON, send raw text
          if (line.trim()) {
            // Only send if it doesn't look like a partial JSON line
            if (!line.trim().startsWith('{')) {
               sendEvent('claude', { message: line.substring(0, 200) })
            }
          }
        }
      })
    })

    claudeProcess.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      console.log('Claude stderr:', text)
      text.split('\n').forEach(line => {
        if (line.trim()) {
          sendEvent('claude_error', { message: line })
        }
      })
    })

    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        console.log('Claude exited with code:', code)
        if (code === 0) {
          resolve(code)
        } else {
          // Send the error to UI before rejecting
          sendEvent('claude_error', { message: `Claude Code exited with code ${code}` })
          if (stderr) {
            sendEvent('claude_error', { message: `stderr: ${stderr.substring(0, 500)}` })
          }
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`))
        }
      })
      claudeProcess.on('error', (err) => {
        sendEvent('claude_error', { message: `Process error: ${err.message}` })
        reject(err)
      })
    })

    sendEvent('log', { message: '--- End Claude Code Output ---' })

    // Scan created files
    const files = []
    const fileDetails = []
    
    async function scanDirectory(dir, relativePath = '') {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
          
          if (entry.isDirectory()) {
            if (entry.name !== 'build' && !entry.name.startsWith('.')) {
              await scanDirectory(fullPath, relPath)
            }
          } else {
            const stat = await fs.stat(fullPath)
            const lines = await countLines(fullPath)
            files.push(relPath)
            fileDetails.push({ path: relPath, size: stat.size, lines })
            sendEvent('file', { path: relPath, size: formatBytes(stat.size), lines })
          }
        }
      } catch (e) {
        // Directory doesn't exist yet
      }
    }
    
    await scanDirectory(projectDir)

    const totalSize = fileDetails.reduce((sum, f) => sum + f.size, 0)
    const totalLines = fileDetails.reduce((sum, f) => sum + f.lines, 0)

    sendEvent('complete', { 
      success: true, 
      projectName,
      files,
      fileDetails,
      summary: {
        totalFiles: files.length,
        totalSize: formatBytes(totalSize),
        totalLines
      }
    })

    res.end()

  } catch (error) {
    console.error('Generation error:', error)
    sendEvent('error', { message: error instanceof Error ? error.message : 'Generation failed' })
    res.end()
  }
})

// Generate plugin code using Claude Code CLI (non-streaming fallback)
app.post('/api/generate', async (req, res) => {
  const { prompt, apiKey, projectName } = req.body

  console.log('=== Generate Request ===')
  console.log('Project:', projectName)
  console.log('Prompt:', prompt)

  if (!prompt || !apiKey || !projectName) {
    console.log('Error: Missing required fields')
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // Create project directory structure
    const projectDir = path.join(PLUGINS_DIR, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source', 'DSP'), { recursive: true })
    await fs.mkdir(path.join(projectDir, 'Source', 'GUI'), { recursive: true })

    console.log('📁 Created directory structure:')
    console.log(`   └── ${projectName}/`)
    console.log('       ├── Source/')
    console.log('       │   ├── DSP/')
    console.log('       │   └── GUI/')

    // Generate CMakeLists.txt first so Claude knows the project structure
    const cmakeContent = generateCMakeLists(projectName)
    await fs.writeFile(path.join(projectDir, 'CMakeLists.txt'), cmakeContent)
    console.log(`📄 Created: CMakeLists.txt (${formatBytes(cmakeContent.length)}, ${cmakeContent.split('\n').length} lines)`)

    // Create a CLAUDE.md file with project context
    const claudeContext = `# ${projectName} - VST3 Plugin

## Project Structure
- Source/PluginProcessor.h - Audio processor header
- Source/PluginProcessor.cpp - Audio processor with DSP
- Source/PluginEditor.h - GUI editor header
- Source/PluginEditor.cpp - GUI editor implementation

## Build System
Using JUCE 7 with CMake. JUCE is installed at /opt/JUCE.

## Requirements
- C++20
- JUCE 7 API
- Working DSP implementation (not pass-through)
- Functional GUI with parameter controls
`
    await fs.writeFile(path.join(projectDir, 'CLAUDE.md'), claudeContext)

    // Full prompt for Claude Code
    const fullPrompt = `${GENERATION_PROMPT}

Create a VST3 plugin called "${projectName}" with this description:
${prompt}

Generate all the source files in the Source/ directory. Make sure the code is complete and compilable.`

    console.log('Running Claude Code CLI...')

    // Run Claude Code CLI with the prompt - use -p for prompt mode
    const claudeProcess = spawn('claude', [
      '-p', fullPrompt,
      '--dangerously-skip-permissions'
    ], {
      cwd: projectDir,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: apiKey
      }
    })

    let stdout = ''
    let stderr = ''

    claudeProcess.stdout.on('data', (data) => {
      stdout += data.toString()
      console.log('Claude:', data.toString())
    })

    claudeProcess.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error('Claude stderr:', data.toString())
    })

    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve(code)
        } else {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`))
        }
      })
      claudeProcess.on('error', reject)
    })

    // Check what files were created with detailed stats
    const files = []
    const fileDetails = []
    
    async function scanDirectory(dir, relativePath = '') {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
          
          if (entry.isDirectory()) {
            if (entry.name !== 'build' && !entry.name.startsWith('.')) {
              await scanDirectory(fullPath, relPath)
            }
          } else {
            const stat = await fs.stat(fullPath)
            files.push(relPath)
            fileDetails.push({
              path: relPath,
              size: stat.size,
              lines: await countLines(fullPath),
              created: stat.birthtime
            })
            console.log(`📄 Created: ${relPath} (${formatBytes(stat.size)}, ${await countLines(fullPath)} lines)`)
          }
        }
      } catch (e) {
        // Directory doesn't exist yet
      }
    }
    
    await scanDirectory(projectDir)

    console.log('=== Generation Complete ===')
    console.log(`Total files created: ${files.length}`)
    const totalSize = fileDetails.reduce((sum, f) => sum + f.size, 0)
    const totalLines = fileDetails.reduce((sum, f) => sum + f.lines, 0)
    console.log(`Total size: ${formatBytes(totalSize)}`)
    console.log(`Total lines: ${totalLines}`)
    console.log('Files:', files)

    res.json({ 
      success: true, 
      projectName,
      files,
      fileDetails,
      summary: {
        totalFiles: files.length,
        totalSize: formatBytes(totalSize),
        totalLines
      },
      output: stdout
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
    const configureCmd = `cd "${projectDir}" && cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/opt/JUCE`
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

// Validate API key - makes a minimal request to Anthropic to verify the key works
app.post('/api/validate-key', async (req, res) => {
  const { apiKey } = req.body

  console.log('=== Validate API Key Request ===')
  console.log('API Key received:', apiKey ? `${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 4)} (length: ${apiKey.length})` : 'NONE')

  if (!apiKey) {
    return res.status(400).json({ valid: false, error: 'No API key provided' })
  }

  // Check format
  if (!apiKey.startsWith('sk-ant-api03-')) {
    return res.status(400).json({ 
      valid: false, 
      error: 'Invalid format. Anthropic API keys start with sk-ant-api03-' 
    })
  }

  try {
    // Make a minimal API call to verify the key
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    })

    const data = await response.json()
    console.log('Anthropic response status:', response.status)

    if (response.ok) {
      console.log('API key validated successfully')
      res.json({ valid: true })
    } else if (response.status === 401) {
      console.log('Invalid API key:', data.error?.message)
      res.status(401).json({ 
        valid: false, 
        error: 'Invalid API key. Please check your key and try again.' 
      })
    } else if (response.status === 429) {
      // Rate limited but key is valid
      console.log('Rate limited but key is valid')
      res.json({ valid: true })
    } else {
      console.log('API error:', data.error?.message)
      res.status(response.status).json({ 
        valid: false, 
        error: data.error?.message || 'Failed to validate key' 
      })
    }
  } catch (error) {
    console.error('Validation error:', error)
    res.status(500).json({ 
      valid: false, 
      error: 'Failed to connect to Anthropic API' 
    })
  }
})

// =============================================================================
// File Browser API Routes
// =============================================================================

// Get file tree for a project
app.get('/api/files/:projectName', async (req, res) => {
  const { projectName } = req.params

  if (!projectName) {
    return res.status(400).json({ error: 'Missing project name' })
  }

  const projectDir = path.join(PLUGINS_DIR, projectName)

  try {
    await fs.access(projectDir)
    
    // Recursively build file tree
    const tree = await buildFileTree(projectDir, '')
    
    res.json({ success: true, tree })
  } catch (error) {
    console.error('File tree error:', error)
    res.status(500).json({ error: 'Failed to read project files' })
  }
})

// Get file content
app.get('/api/files/:projectName/content', async (req, res) => {
  const { projectName } = req.params
  const { path: filePath } = req.query

  if (!projectName || !filePath) {
    return res.status(400).json({ error: 'Missing project name or file path' })
  }

  const projectDir = path.join(PLUGINS_DIR, projectName)
  const fullPath = path.join(projectDir, filePath)

  // Security check - ensure path is within project directory
  const resolvedPath = path.resolve(fullPath)
  const resolvedProjectDir = path.resolve(projectDir)
  
  if (!resolvedPath.startsWith(resolvedProjectDir)) {
    return res.status(403).json({ error: 'Access denied' })
  }

  try {
    const content = await fs.readFile(fullPath, 'utf-8')
    const stats = await fs.stat(fullPath)
    
    res.json({ 
      success: true, 
      content,
      size: stats.size,
      modified: stats.mtime
    })
  } catch (error) {
    console.error('File read error:', error)
    res.status(500).json({ error: 'Failed to read file' })
  }
})

// Helper function to build file tree recursively
async function buildFileTree(baseDir, relativePath) {
  const fullPath = relativePath ? path.join(baseDir, relativePath) : baseDir
  const entries = await fs.readdir(fullPath, { withFileTypes: true })
  
  const items = []
  
  for (const entry of entries) {
    const itemRelPath = relativePath ? path.join(relativePath, entry.name) : entry.name
    
    // Skip build directory and hidden files
    if (entry.name === 'build' || entry.name.startsWith('.')) {
      continue
    }
    
    if (entry.isDirectory()) {
      const children = await buildFileTree(baseDir, itemRelPath)
      items.push({
        name: entry.name,
        path: itemRelPath,
        type: 'folder',
        children
      })
    } else {
      const stats = await fs.stat(path.join(fullPath, entry.name))
      items.push({
        name: entry.name,
        path: itemRelPath,
        type: 'file',
        size: stats.size
      })
    }
  }
  
  // Sort: folders first, then files
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  
  return items
}

// =============================================================================
// Helper Functions
// =============================================================================

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Count lines in a file
async function countLines(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content.split('\n').length
  } catch {
    return 0
  }
}

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
