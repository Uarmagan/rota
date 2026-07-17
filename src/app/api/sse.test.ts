import { describe, expect, it, vi } from 'vitest'
import type { SourceBatch } from '../../lib/availability/types'
import { sourceBatchStream } from './sse'

const batch: SourceBatch = {
  source: 'meridian',
  batchIndex: 0,
  isFinal: true,
  options: [],
}

describe('sourceBatchStream', () => {
  it('cancels upstream exactly once before waiting for iterator return', async () => {
    const order: string[] = []
    let finishReturn: (() => void) | undefined
    const iterator = {
      next: () => new Promise<IteratorResult<SourceBatch>>(() => {}),
      return: vi.fn(() => new Promise<IteratorResult<SourceBatch>>((resolve) => {
        order.push('return')
        finishReturn = () => resolve({ done: true, value: undefined })
      })),
    }
    const batches: AsyncIterable<SourceBatch> = {
      [Symbol.asyncIterator]: () => iterator,
    }
    const cancelUpstream = vi.fn(() => order.push('cancel'))
    const response = sourceBatchStream(
      batches,
      new AbortController().signal,
      cancelUpstream,
    )

    const cancellation = response.body?.cancel()
    await vi.waitFor(() => expect(iterator.return).toHaveBeenCalledOnce())

    expect(cancelUpstream).toHaveBeenCalledOnce()
    expect(order).toEqual(['cancel', 'return'])
    finishReturn?.()
    await cancellation
  })

  it('invokes upstream cancellation for direct response-body cancel', async () => {
    const cancelUpstream = vi.fn()
    const response = sourceBatchStream(
      blockedBatches(),
      new AbortController().signal,
      cancelUpstream,
    )

    await response.body?.cancel()

    expect(cancelUpstream).toHaveBeenCalledOnce()
  })

  it('preserves batch and done frames without cancelling on natural completion', async () => {
    const cancelUpstream = vi.fn()
    const response = sourceBatchStream(
      completedBatches(),
      new AbortController().signal,
      cancelUpstream,
    )

    expect(await response.text()).toBe(
      `event: batch\ndata: ${JSON.stringify(batch)}\n\nevent: done\ndata: {}\n\n`,
    )
    expect(cancelUpstream).not.toHaveBeenCalled()
  })
})

async function* completedBatches(): AsyncGenerator<SourceBatch> {
  yield batch
}

function blockedBatches(): AsyncIterable<SourceBatch> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<SourceBatch>>(() => {}),
        return: async () => ({ done: true, value: undefined }),
      }
    },
  }
}
