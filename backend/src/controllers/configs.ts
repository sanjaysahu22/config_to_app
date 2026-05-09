import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { pool } from '../db';
// Adjust import path according to your structure if combinatorial file exports these types
import { generateComponent } from '../engine/frontend/frontend_generator';
import { buildPreviewHTML } from '../engine/pipeline/preview-builder';
import { MasterConfig } from '../engine/pipeline/combiner';

export const generateByConfig = async (req: AuthRequest, res: Response) => {
  try {
    const config = req.body as MasterConfig; // Parse config
    const userId = req.user!.userId;
    
    // Process config using the generator
    const result = generateComponent(config);
    
    // Build preview HTML
    let previewHtml;
    try {
        previewHtml = buildPreviewHTML({
            code: result.code,
            componentName: result.componentName,
            tailwind: true,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        previewHtml = `<html><body><pre style="color:red">Preview build failed: ${message}</pre></body></html>`;
    }

    // Store in Database
    const { rows } = await pool.query(
      'INSERT INTO user_configs (user_id, config_data) VALUES ($1, $2) RETURNING id, created_at',
      [userId, JSON.stringify(config)]
    );
    res.json({ 
      success: true,
      message: 'Config processed', 
      id: rows[0].id, 
      data: config,
      componentName: result.componentName,
      code: result.code,
      previewHtml,
      files: result.files,
      warnings: result.warnings,
      npmPackages: result.imports
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to generate by config: ${message}` });
  }
};

export const generateByPrompt = async (req: AuthRequest, res: Response) => {
  try {
    const { prompt } = req.body;
    const userId = req.user!.userId;
    // In real app: send prompt to LLM -> get JSON config back -> generate -> store
    const aiConfigStruct = { generatedFrom: prompt, component: { name: 'App' } };
    
    // Store in history
    const { rows } = await pool.query(
      'INSERT INTO user_configs (user_id, config_data) VALUES ($1, $2) RETURNING id',
      [userId, JSON.stringify(aiConfigStruct)]
    );
    res.json({ message: 'Prompt received', prompt, id: rows[0].id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate by prompt' });
  }
};

export const getAllConfigs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { rows } = await pool.query('SELECT id, config_data, created_at FROM user_configs WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json({ configs: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve configs' });
  }
};

export const getConfigById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { rows } = await pool.query('SELECT config_data FROM user_configs WHERE id = $1 AND user_id = $2', [id, userId]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'Config not found' });
    res.json({ config: rows[0].config_data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve config' });
  }
};
