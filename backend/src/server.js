require('ts-node/register');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://configtoapp-production.up.railway.app',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
  ],
};

app.use(cors(corsOptions));
app.use(express.json());

// 1. Initialize DB pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dynamic_db'
});

// Keep generated runtimes outside backend/ so nodemon does not restart mid-request.
const PROJECTS_DIR = path.join(__dirname, '../../generated-projects');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFileMap(baseDir, files) {
  for (const [relativePath, content] of Object.entries(files || {})) {
    const fullPath = path.join(baseDir, relativePath);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}

function pickRunnableBackendFiles(allFiles) {
  const backendFiles = {};
  for (const [filePath, content] of Object.entries(allFiles || {})) {
    if (!filePath.startsWith('backend/')) continue;
    backendFiles[filePath.replace(/^backend\//, '')] = content;
  }
  return backendFiles;
}

async function startServer() {
    try {
        // Map auth and config generator routes using our new structure
        const apiRouter = require('./routes/api').default;
        app.use('/api', apiRouter);

        // Add generate endpoint
        app.post('/api/generate', async (req, res) => {
            try {
                const warnings = [];
                const { validateAndCorrectConfig } = require('./engine/pipeline/aiValidator');

                const validationResult = await validateAndCorrectConfig(req.body);
                let config = req.body;

                if (validationResult.status === 'error') {
                  return res.status(400).json({ error: validationResult.message, code: null, previewHtml: null });
                }

                if (validationResult.status === 'corrected' && validationResult.json) {
                  config = validationResult.json;
                  warnings.push(`AI corrected config: ${validationResult.message}`);
                } else if (validationResult.status === 'skipped') {
                  warnings.push(validationResult.message);
                }

                const { generateComponent } = require('./engine/frontend/frontend_generator');
                const { combineGenerators } = require('./engine/pipeline/combiner');
                const { buildPreviewHTML } = require('./engine/pipeline/preview-builder');
                const { spawnGeneratedServer } = require('./services/processManager');
                
                // Get the frontend-only result to extract the raw generated 'code' for the preview builder
                const frontendResult = generateComponent(config);
                // Get the fullstack combined files
                const combinedResult = combineGenerators(config);

                // Materialize and run generated backend so preview can call real APIs.
                const projectHash = crypto
                  .createHash('sha1')
                  .update(JSON.stringify(req.body))
                  .digest('hex')
                  .slice(0, 10);
                const projectId = `preview-${projectHash}`;
                const projectDir = path.join(PROJECTS_DIR, projectId);
                const runtimeDir = path.join(projectDir, 'backend');
                ensureDir(projectDir);
                const backendFiles = pickRunnableBackendFiles(combinedResult.allFiles);
                if (!Object.keys(backendFiles).length) {
                  throw new Error('No generated backend files found for preview runtime');
                }
                writeFileMap(runtimeDir, backendFiles);

                process.env.GENERATED_DATABASE_URL =
                  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dynamic_db';

                let generatedPort = null;
                let runtimeWarnings = [];
                try {
                  generatedPort = await spawnGeneratedServer(projectId, runtimeDir, { installDeps: true });
                } catch (spawnErr) {
                  const msg = spawnErr instanceof Error ? spawnErr.message : String(spawnErr);
                  runtimeWarnings.push(`[runtime] Generated backend failed to start: ${msg}`);
                }
                
                // Build preview HTML
                let previewHtml;
                try {
                    previewHtml = buildPreviewHTML({
                        code: frontendResult.code,
                        componentName: frontendResult.componentName,
                        tailwind: true,
                        apiBaseUrl: generatedPort ? `http://localhost:${generatedPort}` : '',
                        enableMockApi: !generatedPort,
                    });
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    previewHtml = `<html><body><pre style="color:red">Preview build failed: ${message}</pre></body></html>`;
                }

                res.json({
                    success: true,
                    componentName: frontendResult.componentName,
                    code: frontendResult.code,
                    previewHtml,
                    files: {
                      frontend: combinedResult.files.frontend,
                      backend: combinedResult.files.backend,
                      database: combinedResult.files.database,
                      root: combinedResult.files.root,
                    },
                    warnings: [...warnings, ...frontendResult.warnings, ...combinedResult.warnings, ...runtimeWarnings],
                    npmPackages: combinedResult.packages.frontend,
                    generatedServer: {
                      projectId,
                      port: generatedPort,
                      running: !!generatedPort,
                    }
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                res.status(500).json({ error: `Generator error: ${message}`, code: null, previewHtml: null });
            }
        });

        // 5. Boot Up
        const port = process.env.PORT || 3001;
        app.listen(port, () => {
            console.log(`🚀 Dynamic Backend running on http://localhost:${port}`);
        });

    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}

startServer();
