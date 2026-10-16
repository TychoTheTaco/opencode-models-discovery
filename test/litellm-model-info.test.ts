import { describe, it, expect } from 'vitest'
import { createLiteLLMEnricher } from '../src/utils/model-info/litellm'

function enrich(modelInfo: Record<string, unknown>) {
  return createLiteLLMEnricher({ data: [{ model_name: 'test-model', model_info: modelInfo }] })
    .enrich({ id: 'test-model' }, { filterNonChat: true })
}

describe('native LiteLLM enricher', () => {
  it('maps and normalizes modalities', () => {
    expect(enrich({ modalities: { input: ['TEXT', 'speech', ' image ', 'Text'], output: ['Text'] } }).modalities)
      .toEqual({ input: ['text', 'audio', 'image'], output: ['text'] })
  })

  it('derives image input from supports_vision', () => {
    expect(enrich({ supports_vision: true }).modalities).toEqual({ input: ['text', 'image'], output: ['text'] })
  })

  it('derives video input from supports_video_input', () => {
    expect(enrich({ supports_video_input: true }).modalities).toEqual({ input: ['text', 'video'], output: ['text'] })
  })

  it('combines vision and video capability flags', () => {
    expect(enrich({ supports_vision: true, supports_video_input: true }).modalities)
      .toEqual({ input: ['text', 'image', 'video'], output: ['text'] })
  })

  it('prefers declared modalities over capability flags', () => {
    expect(enrich({ modalities: { input: ['text'] }, supports_vision: true, supports_video_input: true }).modalities)
      .toEqual({ input: ['text'], output: ['text'] })
  })

  it('defaults a missing modality side to text', () => {
    expect(enrich({ modalities: { input: ['text', 'image'] } }).modalities)
      .toEqual({ input: ['text', 'image'], output: ['text'] })
  })

  it('ignores a declared modality side with no supported values', () => {
    expect(enrich({ modalities: { input: ['text', 'hologram'], output: ['hologram'] } }).modalities).toBeUndefined()
  })

  describe('reasoning variants', () => {
    it('honors explicit tier flags and defaults common tiers', () => {
      const result = enrich({
        supports_reasoning: true,
        supported_openai_params: ['reasoning_effort'],
        supports_none_reasoning_effort: true,
        supports_minimal_reasoning_effort: true,
        supports_low_reasoning_effort: true,
        supports_medium_reasoning_effort: false,
        supports_high_reasoning_effort: true,
        supports_xhigh_reasoning_effort: true,
        supports_max_reasoning_effort: true,
      })
      expect(result.reasoning).toBe(true)
      expect(Object.keys(result.variants as object)).toEqual(['none', 'minimal', 'low', 'high', 'xhigh', 'max'])
    })

    it('does not create variants without reasoning_effort support', () => {
      expect(enrich({ supports_reasoning: true }).variants).toBeUndefined()
    })
  })

  describe('token limits', () => {
    it('maps explicit max_input_tokens and max_output_tokens', () => {
      expect(enrich({ max_input_tokens: 200000, max_output_tokens: 8192 }).limit).toEqual({
        context: 200000,
        input: 200000,
        output: 8192,
      })
    })

    it('treats max_tokens as output limit when strictly less than max_input_tokens', () => {
      expect(enrich({ max_input_tokens: 32768, max_tokens: 4096 }).limit).toEqual({
        context: 32768,
        input: 32768,
        output: 4096,
      })
    })

    it('bounds output to default limit when max_tokens equals max_input_tokens', () => {
      expect(enrich({ max_input_tokens: 128000, max_tokens: 128000 }).limit).toEqual({
        context: 128000,
        input: 128000,
        output: 32000,
      })
    })

    it('bounds output to default limit when only large max_tokens is provided', () => {
      expect(enrich({ max_tokens: 250000 }).limit).toEqual({
        context: 250000,
        output: 32000,
      })
    })

    it('sets output to context when only small max_tokens is provided', () => {
      expect(enrich({ max_tokens: 4096 }).limit).toEqual({
        context: 4096,
        output: 4096,
      })
    })

    it('bounds explicit max_output_tokens to context limit if provider reports larger output than context', () => {
      expect(enrich({ max_input_tokens: 16000, max_output_tokens: 32000 }).limit).toEqual({
        context: 16000,
        input: 16000,
        output: 16000,
      })
    })

    it('prefers explicit max_output_tokens over max_tokens', () => {
      expect(enrich({ max_input_tokens: 200000, max_output_tokens: 8192, max_tokens: 4096 }).limit).toEqual({
        context: 200000,
        input: 200000,
        output: 8192,
      })
    })

    it('does not set limit when no usable numbers are provided', () => {
      expect(enrich({}).limit).toBeUndefined()
      expect(enrich({ max_tokens: -1, max_input_tokens: 0 }).limit).toBeUndefined()
    })
  })

  it('skips non-chat models when requested', () => {
    const enricher = createLiteLLMEnricher({ data: [{ model_name: 'embed', model_info: { mode: 'embedding' } }] })
    expect(enricher.enrich({ id: 'embed' }, { filterNonChat: true })).toEqual({ skip: true })
    expect(enricher.enrich({ id: 'embed' }, { filterNonChat: false })).toEqual({})
  })
})
