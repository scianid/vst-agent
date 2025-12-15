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
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Plugin storage directory
const PLUGINS_DIR = process.env.PLUGINS_DIR || '/home/dev/MyPlugins'

// Helper to append logs to project
async function appendLog(projectDir, entry) {
  try {
    const logDir = path.join(projectDir, '.vibevst')
    await fs.mkdir(logDir, { recursive: true })
    const logFile = path.join(logDir, 'logs.jsonl')
    await fs.appendFile(logFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry
    }) + '\n')
  } catch (e) {
    console.error('Failed to save log:', e)
  }
}

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

  const projectDir = path.join(PLUGINS_DIR, projectName)

  // Check if project exists to determine if this is a new project or an update
  let isUpdate = false
  try {
    await fs.access(path.join(projectDir, 'CMakeLists.txt'))
    isUpdate = true
  } catch {}

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type, data) => {
    const payload = { type, ...data }
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
    appendLog(projectDir, payload)
  }

  // Log the user prompt to the history
  sendEvent('user_prompt', { message: prompt })

  try {
    if (!isUpdate) {
      // Create project directory structure
      await fs.mkdir(projectDir, { recursive: true })
      await fs.mkdir(path.join(projectDir, '.vibevst'), { recursive: true })
      await fs.writeFile(path.join(projectDir, '.vibevst', 'prompt.txt'), prompt)
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
    } else {
      sendEvent('log', { message: `📂 Updating existing project: ${projectName}` })
    }

    // Full prompt for Claude Code
    let fullPrompt = ''
    if (!isUpdate) {
      fullPrompt = `${GENERATION_PROMPT}

Create a VST3 plugin called "${projectName}" with this description:
${prompt}

Generate all the source files in the Source/ directory. Make sure the code is complete and compilable.`
    } else {
      // For updates, we just pass the prompt as a modification request
      fullPrompt = `The user wants to modify the project:
${prompt}

Analyze the existing files and make the necessary changes. Ensure the code remains compilable.`
    }

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
      },
      stdio: ['ignore', 'pipe', 'pipe'] // Explicitly set stdio
    })

    let stdout = ''
    let stderr = ''

    // Handle stdout
    claudeProcess.stdout.setEncoding('utf8')
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

    // Handle stderr
    claudeProcess.stderr.setEncoding('utf8')
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
    await fs.mkdir(path.join(projectDir, '.vibevst'), { recursive: true })
    await fs.writeFile(path.join(projectDir, '.vibevst', 'prompt.txt'), prompt)
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

// Compile the plugin (streaming)
app.post('/api/compile', async (req, res) => {
  const { projectName, platform = 'linux' } = req.body

  if (!projectName) {
    return res.status(400).json({ error: 'Missing project name' })
  }

  const projectDir = path.join(PLUGINS_DIR, projectName)
  const buildDirName = `build_${platform}`

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type, data) => {
    const payload = { type, ...data }
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
    appendLog(projectDir, payload)
  }

  async function ensureCMakeListsHasHostJuceaideHint() {
    if (platform !== 'windows' && platform !== 'mac') return

    const cmakePath = path.join(projectDir, 'CMakeLists.txt')
    let cmakeContent = ''

    try {
      cmakeContent = await fs.readFile(cmakePath, 'utf-8')
    } catch {
      return
    }

    if (cmakeContent.includes('CMAKE_CROSSCOMPILING') || cmakeContent.includes('JUCE_TOOL_JUCEAIDE')) {
      return
    }

    const hintBlock = `

# If we're cross-compiling, JUCE still needs a host-built juceaide binary.
# When available, point JUCE at a build_host output to avoid JUCE trying to
# bootstrap/build juceaide during the target configure step.
if(CMAKE_CROSSCOMPILING)
    set(_vibevst_host_juceaide_candidates
        "\${CMAKE_SOURCE_DIR}/build_host/JUCE/extras/Build/juceaide/juceaide_artefacts/Release/juceaide"
        "\${CMAKE_SOURCE_DIR}/build_host/JUCE/tools/extras/Build/juceaide/juceaide_artefacts/Release/juceaide"
        "\${CMAKE_SOURCE_DIR}/build_host/JUCE/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide"
        "\${CMAKE_SOURCE_DIR}/build_host/juceaide_artefacts/Release/juceaide")

    foreach(_cand IN LISTS _vibevst_host_juceaide_candidates)
        if(EXISTS "\${_cand}")
            message(STATUS "VibeVST: using host juceaide at \${_cand}")
            set(JUCE_TOOL_JUCEAIDE "\${_cand}" CACHE FILEPATH "Host juceaide" FORCE)
            set(JUCE_HOST_JUCEAIDE "\${_cand}" CACHE FILEPATH "Host juceaide" FORCE)
            set(JUCEAIDE_PATH "\${_cand}" CACHE FILEPATH "Host juceaide" FORCE)
            break()
        endif()
    endforeach()
endif()
`

    const anchor = 'set(CMAKE_CXX_STANDARD_REQUIRED ON)'
    if (cmakeContent.includes(anchor)) {
      cmakeContent = cmakeContent.replace(anchor, `${anchor}${hintBlock}`)
    } else if (cmakeContent.includes('# Add JUCE')) {
      cmakeContent = cmakeContent.replace('# Add JUCE', `${hintBlock}\n# Add JUCE`)
    } else {
      cmakeContent = `${hintBlock}\n${cmakeContent}`
    }

    await fs.writeFile(cmakePath, cmakeContent)
    sendEvent('log', { message: 'Updated CMakeLists.txt to prefer host-built juceaide for cross-compilation.' })
  }

  try {
    // Check if project exists
    await fs.access(projectDir)

    await ensureCMakeListsHasHostJuceaideHint()

    console.log(`Compiling: ${projectName} for ${platform}`)
    sendEvent('log', { message: `Starting compilation for ${platform}...` })

    // Configure with CMake
    const cmakeArgs = [
      '-B', buildDirName,
      '-G', 'Ninja',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_PREFIX_PATH=/opt/JUCE'
    ]

    if (platform === 'windows' || platform === 'mac') {
      // For cross-compilation, we first need to build juceaide for the host (Linux)
      sendEvent('log', { message: 'Building host tools (juceaide) for cross-compilation...' })
      
      const hostBuildDir = 'build_host'
      
      // Clean host build to ensure fresh tools
      try {
          await fs.rm(path.join(projectDir, hostBuildDir), { recursive: true, force: true })
      } catch (e) {}

      const hostArgs = [
        '-B', hostBuildDir,
        '-G', 'Ninja',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DCMAKE_PREFIX_PATH=/opt/JUCE',
        '-DJUCE_BUILD_HELPER_TOOLS=ON', // Explicitly ask for tools
        '-DCMAKE_C_COMPILER=/usr/bin/gcc',
        '-DCMAKE_CXX_COMPILER=/usr/bin/g++'
      ]

      // Configure host
      sendEvent('log', { message: 'Configuring host tools...' })
      // Use clean env for host build to avoid cross-compile vars leaking
      const hostEnv = { ...process.env };
      delete hostEnv.OSXCROSS_ROOT;
      delete hostEnv.OSXCROSS_HOST;
      delete hostEnv.OSXCROSS_TARGET_DIR;
      delete hostEnv.OSXCROSS_TARGET;
      delete hostEnv.OSXCROSS_SDK;
      
      const hostConfigProcess = spawn('cmake', hostArgs, { cwd: projectDir, env: hostEnv })
      
      await new Promise((resolve, reject) => {
        hostConfigProcess.on('close', code => code === 0 ? resolve() : reject(new Error(`Host config failed: ${code}`)))
      })

      // Build juceaide explicitly
      sendEvent('log', { message: 'Compiling host tools...' })
      const hostBuildProcess = spawn('cmake', ['--build', hostBuildDir, '--target', 'juceaide'], { cwd: projectDir, env: hostEnv })
      
      await new Promise((resolve, reject) => {
        hostBuildProcess.on('close', code => code === 0 ? resolve() : reject(new Error(`Host build failed: ${code}`)))
      })

      // Find juceaide
      let juceaidePath = ''
      try {
        // Look for the binary we just built
        const candidates = [
          path.join(projectDir, hostBuildDir, 'juceaide_artefacts', 'Release', 'juceaide'),
          path.join(projectDir, hostBuildDir, 'juceaide_artefacts', 'juceaide'),
          path.join(projectDir, hostBuildDir, 'bin', 'juceaide'),
          // Correct path based on actual build output
          path.join(projectDir, hostBuildDir, 'JUCE', 'extras', 'Build', 'juceaide', 'juceaide_artefacts', 'Release', 'juceaide'),
          // Old path just in case
          path.join(projectDir, hostBuildDir, 'JUCE', 'tools', 'extras', 'Build', 'juceaide', 'juceaide_artefacts', 'Release', 'juceaide')
        ]
        
        for (const p of candidates) {
          try {
            console.log(`Checking for juceaide at: ${p}`)
            await fs.access(p)
            juceaidePath = p
            break
          } catch {
            console.log(`Not found at: ${p}`)
          }
        }
        
        if (juceaidePath) {
           // Ensure executable
           await execAsync(`chmod +x "${juceaidePath}"`)
           sendEvent('log', { message: `Found juceaide at: ${juceaidePath}` })
           // Pass variables with explicit types to ensure CMake picks them up
           cmakeArgs.push(`-DJUCE_TOOL_JUCEAIDE:FILEPATH=${juceaidePath}`)
           cmakeArgs.push(`-DJUCE_HOST_JUCEAIDE:FILEPATH=${juceaidePath}`)
           cmakeArgs.push(`-DJUCEAIDE_PATH:FILEPATH=${juceaidePath}`)
        } else {
           throw new Error('Could not find built juceaide binary')
        }
      } catch (e) {
        console.error('Error finding juceaide:', e)
        sendEvent('log', { message: 'Error: Could not find host juceaide. Cross-compilation will fail.' })
        throw e
      }
    }

    if (platform === 'windows') {
      cmakeArgs.push(
        '-DCMAKE_SYSTEM_NAME=Windows',
        '-DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc',
        '-DCMAKE_CXX_COMPILER=x86_64-w64-mingw32-g++',
        '-DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres',
        // VST3 SDK (and MinGW headers) require a sufficiently new WinAPI level
        // for SHGetKnownFolderPath to be declared.
        '-DCMAKE_C_FLAGS=-D_WIN32_WINNT=0x0602 -DWINVER=0x0602 -DNTDDI_VERSION=0x06020000',
        '-DCMAKE_CXX_FLAGS=-D_WIN32_WINNT=0x0602 -DWINVER=0x0602 -DNTDDI_VERSION=0x06020000',
        '-DJUCE_BUILD_HELPER_TOOLS=OFF', // Disable helper tools for cross-compilation
        '-DCMAKE_EXE_LINKER_FLAGS=-static', // Statically link libraries to avoid missing DLL errors
        '-DCMAKE_SHARED_LINKER_FLAGS=-static',
        '-DCMAKE_MODULE_LINKER_FLAGS=-static'
      )
    } else if (platform === 'mac') {
      cmakeArgs.push(
        '-DCMAKE_TOOLCHAIN_FILE=/opt/osxcross/target/toolchain.cmake',
        '-DCMAKE_OSX_ARCHITECTURES=x86_64',
        '-DJUCE_BUILD_HELPER_TOOLS:BOOL=OFF',
        '-DCMAKE_OSX_SYSROOT=/opt/osxcross/target/SDK/MacOSX11.3.sdk'
      )
    }

    const configureCmd = `cmake ${cmakeArgs.join(' ')}`
    sendEvent('log', { message: `Running: ${configureCmd}` })
    
    // Prepare environment for cross-compilation
    const env = { ...process.env }
    if (platform === 'mac') {
      env.OSXCROSS_ROOT = '/opt/osxcross/target'
      env.OSXCROSS_HOST = 'x86_64-apple-darwin20.4'
      env.OSXCROSS_TARGET_DIR = '/opt/osxcross/target'
      env.OSXCROSS_TARGET = 'darwin20.4'
      env.OSXCROSS_SDK = '/opt/osxcross/target/SDK/MacOSX11.3.sdk'
    } else if (platform === 'windows') {
      // The JUCE VST3 moduleinfo generator is built for the target (Windows) and
      // cannot be executed on the Linux host during cross-compilation.
      // We inject a host-runnable shim named 'juce_vst3_helper' via PATH.
      env.VIBEVST_PROJECT_NAME = projectName
      env.VIBEVST_PROJECT_VERSION = '1.0.0'
      env.VIBEVST_COMPANY_NAME = 'VibeVST'

      const buildDirPath = path.join(projectDir, buildDirName)
      env.PATH = `${buildDirPath}:${env.PATH || ''}`
    }

    const ensureWindowsVst3HelperShim = async () => {
      if (platform !== 'windows') return

      const buildDirPath = path.join(projectDir, buildDirName)
      await fs.mkdir(buildDirPath, { recursive: true })

      const helperPath = path.join(buildDirPath, 'juce_vst3_helper')
      const backupPath = path.join(buildDirPath, 'juce_vst3_helper.bak')

      try {
        await fs.access(helperPath)
        // Don't overwrite a real helper without keeping it around.
        await fs.rename(helperPath, backupPath)
      } catch {}

      const shim = `#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -n "$OUTPUT_FILE" ]]; then
  mkdir -p "$(dirname "$OUTPUT_FILE")"
  cat > "$OUTPUT_FILE" <<JSONEOF
{
  "Name": "\${VIBEVST_PROJECT_NAME:-VST3Plugin}",
  "Version": "\${VIBEVST_PROJECT_VERSION:-1.0.0}",
  "Factory Info": {
    "Vendor": "\${VIBEVST_COMPANY_NAME:-VibeVST}",
    "URL": "",
    "E-Mail": ""
  },
  "Compatibility": {
    "Classes": []
  }
}
JSONEOF
fi

exit 0
`

      await fs.writeFile(helperPath, shim)
      await execAsync(`chmod +x "${helperPath}"`)
    }

    const runConfigure = () => new Promise((resolve, reject) => {
      const configProcess = spawn('cmake', cmakeArgs, {
        cwd: projectDir,
        env
      })

      configProcess.stdout.on('data', (data) => {
        const text = data.toString().trim()
        if (text) sendEvent('log', { message: text })
        console.log(`[CMake] ${text}`)
      })

      configProcess.stderr.on('data', (data) => {
        const text = data.toString().trim()
        if (text) sendEvent('log', { message: text })
        console.log(`[CMake Err] ${text}`)
      })

      configProcess.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`CMake configure failed with code ${code}`))
      })
    })

    try {
      await runConfigure()
    } catch (err) {
      console.log('Configure failed, trying to clean cache...')
      sendEvent('log', { message: 'Configuration failed. Cleaning cache and retrying...' })
      
      try {
        await fs.rm(path.join(projectDir, buildDirName, 'CMakeCache.txt'), { force: true })
        await fs.rm(path.join(projectDir, buildDirName, 'CMakeFiles'), { recursive: true, force: true })
      } catch (e) {
        console.error('Failed to clean cache:', e)
      }
      
      // Retry once
      await runConfigure()
    }

    // Windows cross-compile: ensure the VST3 helper shim exists before building.
    await ensureWindowsVst3HelperShim()

    // Build
    const buildCmd = `cmake --build ${buildDirName} --config Release -j$(nproc)`
    sendEvent('log', { message: `Running: ${buildCmd}` })
    
    const buildProcess = spawn('cmake', ['--build', buildDirName, '--config', 'Release', '-j4'], {
      cwd: projectDir,
      env
    })

    buildProcess.stdout.on('data', (data) => {
      const text = data.toString().trim()
      if (text) sendEvent('log', { message: text })
    })

    buildProcess.stderr.on('data', (data) => {
      const text = data.toString().trim()
      if (text) sendEvent('log', { message: text })
    })

    await new Promise((resolve, reject) => {
      buildProcess.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Build failed with code ${code}`))
      })
    })

    // Find the VST3 output
    // For Windows, it might be in a different path structure or just the VST3 bundle
    const artefactsDir = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'Release', 'VST3')
    let vst3Path = path.join(artefactsDir, `${projectName}.vst3`)

    // Check if VST3 was created
    try {
      await fs.access(vst3Path)
    } catch {
      // Try alternative path
      const altPath = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'VST3')
      try {
        await fs.access(path.join(altPath, `${projectName}.vst3`))
        vst3Path = path.join(altPath, `${projectName}.vst3`)
      } catch {
         // For Windows, sometimes it's just the file in the Release folder?
         // But JUCE usually creates the bundle structure.
      }
    }

    // Check if Standalone was created
    let ext = ''
    if (platform === 'windows') ext = '.exe'
    else if (platform === 'mac') ext = '.app'
    
    const standaloneDir = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'Release', 'Standalone')
    const standalonePath = path.join(standaloneDir, `${projectName}${ext}`)
    let standaloneExists = false
    try {
      await fs.access(standalonePath)
      standaloneExists = true
    } catch {}

    sendEvent('complete', { 
      message: 'Compilation successful!',
      downloadUrl: `/api/download/${projectName}?platform=${platform}&type=vst3`,
      downloadStandaloneUrl: standaloneExists ? `/api/download/${projectName}?platform=${platform}&type=standalone` : null
    })

    res.end()

  } catch (error) {
    console.error('Compile error:', error)
    sendEvent('error', { message: error instanceof Error ? error.message : 'Compilation failed' })
    res.end()
  }
})

// Download the compiled VST3 or Standalone
app.get('/api/download/:projectName', async (req, res) => {
  const { projectName } = req.params
  const { platform = 'linux', type = 'vst3' } = req.query
  const projectDir = path.join(PLUGINS_DIR, projectName)
  const buildDirName = `build_${platform}`

  try {
    let targetPath = ''
    let zipName = ''

    if (type === 'standalone') {
      // Standalone path
      let ext = ''
      if (platform === 'windows') ext = '.exe'
      else if (platform === 'mac') ext = '.app'
      
      const standaloneDir = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'Release', 'Standalone')
      targetPath = path.join(standaloneDir, `${projectName}${ext}`)
      zipName = `${projectName}_${platform}_standalone.zip`
      
      console.log(`[Download] Request for Standalone ${projectName} (${platform})`)
    } else {
      // VST3 path
      const artefactsDir = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'Release', 'VST3')
      targetPath = path.join(artefactsDir, `${projectName}.vst3`)
      zipName = `${projectName}_${platform}.vst3.zip`
      
      console.log(`[Download] Request for VST3 ${projectName} (${platform})`)
    }
    
    console.log(`[Download] Looking for target at: ${targetPath}`)

    try {
      await fs.access(targetPath)
    } catch (e) {
      console.error(`[Download] Target not found at ${targetPath}`)
      
      if (type !== 'standalone') {
        // Fallback for VST3: Try without 'Release' just in case
        const altPath = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'VST3', `${projectName}.vst3`)
        try {
          await fs.access(altPath)
          console.log(`[Download] Found at alternative path: ${altPath}`)
          targetPath = altPath
        } catch {
          return res.status(404).json({ error: 'VST3 not found. Please try compiling again.' })
        }
      } else {
        return res.status(404).json({ error: 'Standalone executable not found. Please try compiling again.' })
      }
    }

    // FIX: Ensure executable permissions for Mac bundles (VST3 and App)
    if (platform === 'mac') {
        try {
            console.log(`[Download] Fixing permissions for Mac bundle: ${targetPath}`);
            // Recursive chmod to ensure the inner binary and folders are executable/readable
            await execAsync(`chmod -R 755 "${targetPath}"`);
            
            // Validate binary type and architecture
            try {
                // Find the actual binary inside the bundle
                // VST3: MyPlugin.vst3/Contents/MacOS/MyPlugin
                // App: MyPlugin.app/Contents/MacOS/MyPlugin
                const binaryName = projectName; 
                const binaryPath = path.join(targetPath, 'Contents', 'MacOS', binaryName);
                
                console.log(`[Download] Validating binary at: ${binaryPath}`);
                
                // Check if binary exists
                try {
                    await fs.access(binaryPath);
                } catch {
                    console.error(`[Download] CRITICAL: Binary not found at ${binaryPath}`);
                    throw new Error('Binary missing from bundle');
                }

                // Check file type using 'file' command
                const { stdout: fileInfo } = await execAsync(`file "${binaryPath}"`);
                console.log(`[Download] Binary info: ${fileInfo.trim()}`);
                
                if (!fileInfo.includes('Mach-O')) {
                    console.warn('[Download] WARNING: File does not appear to be a Mach-O binary!');
                }
            } catch (e) {
                console.log(`[Download] Validation failed: ${e.message}`);
            }

            // Try to ad-hoc sign (helps with Apple Silicon)
            try {
                console.log('[Download] Attempting ad-hoc signature...');
                // Try standard codesign (might be available in some cross-envs)
                await execAsync(`codesign --force --deep -s - "${targetPath}"`);
            } catch (e) {
                // If standard codesign fails, try osxcross specific one if we can guess it
                // But usually xattr -cr is what's needed on the client side
                console.log('[Download] Ad-hoc signing skipped (tools not found or failed)');
            }
        } catch (e) {
            console.error('[Download] Failed to fix permissions:', e);
        }
    }

    // Create a zip of the target
    const zipPath = path.join(projectDir, zipName)
    console.log(`[Download] Zipping ${targetPath} to ${zipPath}`)
    
    // Zip command - use -y to preserve symlinks
    await execAsync(`cd "${path.dirname(targetPath)}" && zip -ry "${zipPath}" "${path.basename(targetPath)}"`)

    res.download(zipPath, zipName)

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

// Get project logs
app.get('/api/projects/:projectName/logs', async (req, res) => {
  const { projectName } = req.params
  const projectDir = path.join(PLUGINS_DIR, projectName)
  const logFile = path.join(projectDir, '.vibevst', 'logs.jsonl')
  
  try {
    const content = await fs.readFile(logFile, 'utf-8')
    const logs = content.trim().split('\n').map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    }).filter(Boolean)
    res.json({ success: true, logs })
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.json({ success: true, logs: [] })
    }
    console.error('Read logs error:', e)
    res.status(500).json({ error: 'Failed to read logs' })
  }
})

// Get list of all projects
app.get('/api/projects', async (req, res) => {
  try {
    console.log('Listing projects from:', PLUGINS_DIR)
    // Ensure plugins directory exists
    await fs.mkdir(PLUGINS_DIR, { recursive: true })
    
    const entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true })
    console.log(`Found ${entries.length} entries`)
    const projects = []
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(PLUGINS_DIR, entry.name)
        try {
          const stats = await fs.stat(projectPath)
          // Check if it looks like a project (has CMakeLists.txt or Source folder)
          const hasCmake = await fs.access(path.join(projectPath, 'CMakeLists.txt')).then(() => true).catch(() => false)
          
          if (hasCmake) {
            projects.push({
              name: entry.name,
              modified: stats.mtime,
              created: stats.birthtime
            })
          } else {
             console.log(`Skipping ${entry.name}: No CMakeLists.txt`)
          }
        } catch (e) {
          console.log(`Error checking ${entry.name}:`, e.message)
        }
      }
    }
    
    console.log(`Returning ${projects.length} projects`)
    // Sort by modified date (newest first)
    projects.sort((a, b) => new Date(b.modified) - new Date(a.modified))
    
    res.json({ success: true, projects })
  } catch (error) {
    console.error('List projects error:', error)
    res.status(500).json({ error: 'Failed to list projects' })
  }
})

// Rename project
app.post('/api/projects/:projectName/rename', async (req, res) => {
  const { projectName } = req.params
  const { newName } = req.body

  if (!newName) {
    return res.status(400).json({ error: 'Missing new name' })
  }

  // Validate new name (alphanumeric + underscores only)
  if (!/^[a-zA-Z0-9_]+$/.test(newName)) {
    return res.status(400).json({ error: 'Invalid name. Use only letters, numbers, and underscores.' })
  }

  const oldDir = path.join(PLUGINS_DIR, projectName)
  const newDir = path.join(PLUGINS_DIR, newName)

  try {
    // Check if new name exists
    try {
      await fs.access(newDir)
      return res.status(400).json({ error: 'Project with this name already exists' })
    } catch {}

    // Rename directory
    await fs.rename(oldDir, newDir)

    // Update CMakeLists.txt
    const cmakePath = path.join(newDir, 'CMakeLists.txt')
    try {
      const cmakeContent = generateCMakeLists(newName)
      await fs.writeFile(cmakePath, cmakeContent)
    } catch (e) {
      console.error('Failed to update CMakeLists.txt:', e)
    }

    // Update CLAUDE.md
    const claudePath = path.join(newDir, 'CLAUDE.md')
    try {
      let claudeContent = await fs.readFile(claudePath, 'utf-8')
      claudeContent = claudeContent.replace(new RegExp(projectName, 'g'), newName)
      await fs.writeFile(claudePath, claudeContent)
    } catch {}

    res.json({ success: true, newName })
  } catch (error) {
    console.error('Rename error:', error)
    res.status(500).json({ error: 'Failed to rename project' })
  }
})

// Delete project
app.delete('/api/projects/:projectName', async (req, res) => {
  const { projectName } = req.params
  const projectDir = path.join(PLUGINS_DIR, projectName)

  try {
    await fs.rm(projectDir, { recursive: true, force: true })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

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

// Save file content
app.put('/api/files/:projectName/content', async (req, res) => {
  const { projectName } = req.params
  const { path: filePath, content } = req.body || {}

  if (!projectName || !filePath || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing project name, file path, or content' })
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
    await fs.writeFile(fullPath, content, 'utf-8')
    const stats = await fs.stat(fullPath)
    res.json({ success: true, size: stats.size, modified: stats.mtime })
  } catch (error) {
    console.error('File write error:', error)
    res.status(500).json({ error: 'Failed to write file' })
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

# If we're cross-compiling, JUCE still needs a host-built juceaide binary.
# When available, point JUCE at the standard build_host output to avoid JUCE
# trying to bootstrap/build juceaide during the target configure step.
if(CMAKE_CROSSCOMPILING)
  set(_vibevst_host_juceaide_candidates
    "\${CMAKE_SOURCE_DIR}/build_host/JUCE/extras/Build/juceaide/juceaide_artefacts/Release/juceaide"
    "\${CMAKE_SOURCE_DIR}/build_host/JUCE/tools/extras/Build/juceaide/juceaide_artefacts/Release/juceaide"
    "\${CMAKE_SOURCE_DIR}/build_host/JUCE/tools/extras/Build/juceaide/juceaide_artefacts/Debug/juceaide"
    "\${CMAKE_SOURCE_DIR}/build_host/juceaide_artefacts/Release/juceaide")

  foreach(_cand IN LISTS _vibevst_host_juceaide_candidates)
    if(EXISTS "\${_cand}")
      message(STATUS "VibeVST: using host juceaide at \${_cand}")
      set(JUCE_TOOL_JUCEAIDE "\${_cand}" CACHE FILEPATH "Host juceaide" FORCE)
      set(JUCE_HOST_JUCEAIDE "\${_cand}" CACHE FILEPATH "Host juceaide" FORCE)
      set(JUCEAIDE_PATH "\${_cand}" CACHE FILEPATH "Host juceaide" FORCE)
      break()
    endif()
  endforeach()
endif()

# Add JUCE
add_subdirectory(/opt/JUCE JUCE)

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
        # juce::juce_recommended_lto_flags # Disabled to prevent cross-compilation linker errors
        juce::juce_recommended_warning_flags
)
`
}

// Get project prompt
app.get('/api/projects/:projectName/prompt', async (req, res) => {
  const { projectName } = req.params
  const projectDir = path.join(PLUGINS_DIR, projectName)
  const promptFile = path.join(projectDir, '.vibevst', 'prompt.txt')
  
  try {
    const prompt = await fs.readFile(promptFile, 'utf-8')
    res.json({ success: true, prompt })
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.json({ success: true, prompt: '' })
    }
    console.error('Read prompt error:', e)
    res.status(500).json({ error: 'Failed to read prompt' })
  }
})

// Check build status
app.get('/api/projects/:projectName/build-status', async (req, res) => {
  const { projectName } = req.params
  const { platform = 'linux' } = req.query
  const projectDir = path.join(PLUGINS_DIR, projectName)
  const buildDirName = `build_${platform}`
  
  console.log(`[BuildStatus] Checking ${projectName} for ${platform}`)

  try {
    // Check for VST3
    const vst3Dir = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'Release', 'VST3')
    const vst3Path = path.join(vst3Dir, `${projectName}.vst3`)
    const altPath = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'VST3', `${projectName}.vst3`)
    
    console.log(`[BuildStatus] Checking VST3 at: ${vst3Path}`)
    
    let vst3Exists = false
    try {
      await fs.access(vst3Path)
      vst3Exists = true
      console.log(`[BuildStatus] Found VST3 at primary path`)
    } catch {
      try {
        console.log(`[BuildStatus] Checking VST3 at alt path: ${altPath}`)
        await fs.access(altPath)
        vst3Exists = true
        console.log(`[BuildStatus] Found VST3 at alt path`)
      } catch (e) {
        console.log(`[BuildStatus] VST3 not found`)
      }
    }

    // Check for Standalone
    let ext = ''
    if (platform === 'windows') ext = '.exe'
    else if (platform === 'mac') ext = '.app'
    
    const standaloneDir = path.join(projectDir, buildDirName, `${projectName}_artefacts`, 'Release', 'Standalone')
    const standalonePath = path.join(standaloneDir, `${projectName}${ext}`)
    
    console.log(`[BuildStatus] Checking Standalone at: ${standalonePath}`)

    let standaloneExists = false
    try {
      await fs.access(standalonePath)
      standaloneExists = true
      console.log(`[BuildStatus] Found Standalone`)
    } catch (e) {
      console.log(`[BuildStatus] Standalone not found`)
    }
    
    res.json({ 
      success: true, 
      compiled: vst3Exists, // Keep for backward compatibility
      vst3Exists,
      standaloneExists,
      downloadUrl: vst3Exists ? `/api/download/${projectName}?platform=${platform}&type=vst3` : null,
      downloadStandaloneUrl: standaloneExists ? `/api/download/${projectName}?platform=${platform}&type=standalone` : null
    })
  } catch (error) {
    console.error('Build status check error:', error)
    res.status(500).json({ error: 'Failed to check build status' })
  }
})

// Clean build artifacts
app.delete('/api/projects/:projectName/build', async (req, res) => {
  const { projectName } = req.params
  const { platform } = req.query

  if (!projectName || !platform) {
    return res.status(400).json({ error: 'Missing project name or platform' })
  }

  const projectDir = path.join(PLUGINS_DIR, projectName)
  const buildDirName = `build_${platform}`
  const buildDir = path.join(projectDir, buildDirName)

  try {
    console.log(`Cleaning build directory: ${buildDir}`)
    await fs.rm(buildDir, { recursive: true, force: true })
    
    appendLog(projectDir, { 
        type: 'info', 
        message: `Cleaned build artifacts for ${platform}` 
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Clean error:', error)
    res.status(500).json({ error: 'Failed to clean build' })
  }
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeVST API server running on port ${PORT}`)
})
