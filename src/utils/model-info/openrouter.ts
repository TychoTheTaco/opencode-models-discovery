import type { ModelEnricher } from '../../core/model-enrichment'
import { createModelLimits } from '../../core/model-types'

const SUPPORTED_MODALITIES = new Set(['text', 'audio', 'image', 'video', 'pdf'])
const SUPPORTED_REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function usableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function nonNegativeCostPerMillion(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : undefined

  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) return undefined
  const perMillion = parsed * 1_000_000
  return Number.isFinite(perMillion) ? Number(perMillion.toPrecision(15)) : undefined
}

function modalities(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const result = [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .map((item) => item === 'speech' ? 'audio' : item)
    .filter((item) => SUPPORTED_MODALITIES.has(item)))]

  return result.length > 0 ? result : undefined
}

function reasoningVariants(value: unknown): Record<string, { reasoningEffort: string }> | undefined {
  const reasoning = record(value)
  if (!Array.isArray(reasoning?.supported_efforts)) return undefined

  const variants: Record<string, { reasoningEffort: string }> = {}
  for (const effort of reasoning.supported_efforts) {
    if (typeof effort !== 'string') continue
    const normalized = effort.trim().toLowerCase()
    if (SUPPORTED_REASONING_EFFORTS.has(normalized)) {
      variants[normalized] = { reasoningEffort: normalized }
    }
  }

  return Object.keys(variants).length > 0 ? variants : undefined
}

export function createOpenRouterEnricher(_data: unknown): ModelEnricher {
  return {
    enrich(model) {
      const result: Record<string, unknown> = {}
      const name = model.name
      if (typeof name === 'string' && name.trim().length > 0) {
        result.metadataName = name.trim()
      }

      const context = usableNumber(model.context_length) ? model.context_length : undefined
      const topProvider = record(model.top_provider)
      const output = usableNumber(topProvider?.max_completion_tokens)
        ? topProvider.max_completion_tokens
        : undefined
      if (context) {
        result.limit = createModelLimits(context, output)
      }

      const architecture = record(model.architecture)
      const inputModalities = modalities(architecture?.input_modalities)
      const outputModalities = modalities(architecture?.output_modalities)
      if (inputModalities || outputModalities) {
        result.modalities = {
          ...(inputModalities ? { input: inputModalities } : {}),
          ...(outputModalities ? { output: outputModalities } : {}),
        }
      }

      const pricing = record(model.pricing)
      const input = nonNegativeCostPerMillion(pricing?.prompt)
      const outputCost = nonNegativeCostPerMillion(pricing?.completion)
      const cacheRead = nonNegativeCostPerMillion(pricing?.input_cache_read)
      const cacheWrite = nonNegativeCostPerMillion(pricing?.input_cache_write)
      if (input !== undefined && outputCost !== undefined) {
        result.cost = {
          input,
          output: outputCost,
          ...(cacheRead !== undefined ? { cache_read: cacheRead } : {}),
          ...(cacheWrite !== undefined ? { cache_write: cacheWrite } : {}),
        }
      }

      const supportedParameters = Array.isArray(model.supported_parameters)
        ? model.supported_parameters.filter((item): item is string => typeof item === 'string')
        : []
      if (supportedParameters.includes('tools') || supportedParameters.includes('tool_choice')) {
        result.toolCall = true
      }
      if (supportedParameters.length > 0) {
        result.temperature = supportedParameters.includes('temperature')
      }

      const reasoning = record(model.reasoning)
      const variants = reasoningVariants(reasoning)
      if (variants) result.variants = variants
      if (reasoning?.mandatory === true || reasoning?.default_enabled === true || variants) {
        result.reasoning = true
      }

      return result
    },
  }
}
