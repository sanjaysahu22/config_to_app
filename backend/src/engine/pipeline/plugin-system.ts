import type { MasterConfig as PipelineMasterConfig } from './combiner'

export type MasterConfig = PipelineMasterConfig

export type FileMap = Record<string, string>

export interface FeatureContext {
  featureName: string
  config: MasterConfig
  existingFiles: FileMap
  warnings: string[]
}

export type FeatureTransform = (files: FileMap, config: MasterConfig, context: FeatureContext) => FileMap | Promise<FileMap>
export type FeatureValue = Record<string, string> | string

export interface FeatureDefinition {
  name: string
  description?: string
  transformFrontendFiles?: FeatureTransform
  transformBackendFiles?: FeatureTransform
  transformDbFiles?: FeatureTransform
  extraFiles?: FeatureValue | ((config: MasterConfig, context: FeatureContext) => FeatureValue | Promise<FeatureValue>)
  previewScript?: string | ((config: MasterConfig, context: FeatureContext) => string | Promise<string>)
}
