import { describe, expect, it } from 'vitest'
import { createOpenRouterEnricher } from '../src/utils/model-info/openrouter'

describe('OpenRouter model info enricher', () => {
  it('extracts inline metadata from an OpenRouter model entry', () => {
    const result = createOpenRouterEnricher(null).enrich({
      id: 'openai/gpt-6.1-sol',
      name: 'OpenAI: GPT-6.1 Sol',
      context_length: 1_048_576,
      architecture: {
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
      },
      pricing: {
        prompt: '0.000002',
        completion: '0.00001',
        input_cache_read: '0.0000001',
        input_cache_write: '0.0000001875',
      },
      top_provider: {
        max_completion_tokens: 65_536,
      },
      supported_parameters: ['temperature', 'tools', 'reasoning_effort'],
      reasoning: {
        mandatory: true,
        supported_efforts: ['low', 'medium', 'high'],
      },
    }, { filterNonChat: true })

    expect(result).toEqual({
      metadataName: 'OpenAI: GPT-6.1 Sol',
      limit: { context: 1_048_576, output: 65_536 },
      modalities: { input: ['text', 'image'], output: ['text'] },
      cost: {
        input: 2,
        output: 10,
        cache_read: 0.1,
        cache_write: 0.1875,
      },
      reasoning: true,
      variants: {
        low: { reasoningEffort: 'low' },
        medium: { reasoningEffort: 'medium' },
        high: { reasoningEffort: 'high' },
      },
      toolCall: true,
      temperature: true,
    })
  })

  it('leaves malformed optional metadata unset', () => {
    const result = createOpenRouterEnricher(null).enrich({
      id: 'provider/model',
      name: '',
      context_length: 0,
      architecture: { input_modalities: ['unsupported'] },
      pricing: { prompt: 'invalid', completion: -1 },
      top_provider: { max_completion_tokens: '8192' },
      reasoning: { supported_efforts: ['ultra'] },
    }, { filterNonChat: true })

    expect(result).toEqual({})
  })
})
