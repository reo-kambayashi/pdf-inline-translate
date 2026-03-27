import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchTranslationService } from './batch-translation-service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeProviderManager(translateResult = { success: true, text: 'translated', model: 'gemini' }) {
    return { translate: vi.fn().mockResolvedValue(translateResult) };
}

function makeHistoryManager() {
    return { addToHistory: vi.fn() };
}

function makeUIManager() {
    return { openTranslationInPopup: vi.fn() };
}

function makeService(
    providerOverride?: ReturnType<typeof makeProviderManager>,
    historyOverride?: ReturnType<typeof makeHistoryManager>,
    uiOverride?: ReturnType<typeof makeUIManager>,
) {
    const pm = providerOverride ?? makeProviderManager();
    const hm = historyOverride ?? makeHistoryManager();
    const ui = uiOverride ?? makeUIManager();
    return {
        service: new BatchTranslationService(pm as any, hm as any, ui as any),
        pm,
        hm,
        ui,
    };
}

// ---------------------------------------------------------------------------
// createJob
// ---------------------------------------------------------------------------

describe('BatchTranslationService.createJob', () => {
    it('creates a job with the correct number of items', () => {
        const { service } = makeService();
        const job = service.createJob(['a', 'b', 'c'], 'ja');
        expect(job.items).toHaveLength(3);
    });

    it('initialises status=pending and progress=0', () => {
        const { service } = makeService();
        const job = service.createJob(['text'], 'ja');
        expect(job.status).toBe('pending');
        expect(job.progress).toBe(0);
    });

    it('generates a unique ID per job', () => {
        const { service } = makeService();
        const a = service.createJob(['x'], 'ja');
        const b = service.createJob(['x'], 'ja');
        expect(a.id).not.toBe(b.id);
    });

    it('stores the job so getJob retrieves it', () => {
        const { service } = makeService();
        const job = service.createJob(['hello'], 'ja');
        expect(service.getJob(job.id)).toBe(job);
    });
});

// ---------------------------------------------------------------------------
// executeJob
// ---------------------------------------------------------------------------

describe('BatchTranslationService.executeJob', () => {
    it('marks status=completed and progress=100 on full success', async () => {
        const { service } = makeService();
        const job = service.createJob(['a', 'b'], 'ja');
        const result = await service.executeJob(job.id);
        expect(result.status).toBe('completed');
        expect(result.progress).toBe(100);
    });

    it('stores results for successful items', async () => {
        const { service } = makeService();
        const job = service.createJob(['a', 'b'], 'ja');
        const result = await service.executeJob(job.id);
        expect(result.results).toHaveLength(2);
    });

    it('calls historyManager.addToHistory for each successful item', async () => {
        const { service, hm } = makeService();
        const job = service.createJob(['hello', 'world'], 'ja');
        await service.executeJob(job.id);
        expect(hm.addToHistory).toHaveBeenCalledTimes(2);
    });

    it('marks item as failed on translation error', async () => {
        const pm = makeProviderManager({ success: false, text: '', error: 'quota', model: 'gemini' });
        const { service } = makeService(pm);
        const job = service.createJob(['a'], 'ja');
        const result = await service.executeJob(job.id);
        expect(result.items[0].status).toBe('failed');
        expect(result.items[0].error).toBe('quota');
    });

    it('marks job status=failed when all items fail', async () => {
        const pm = makeProviderManager({ success: false, text: '', error: 'err', model: 'gemini' });
        const { service } = makeService(pm);
        const job = service.createJob(['a', 'b'], 'ja');
        const result = await service.executeJob(job.id);
        expect(result.status).toBe('failed');
    });

    it('marks job status=completed when at least one item succeeds', async () => {
        const pm = {
            translate: vi
                .fn()
                .mockResolvedValueOnce({ success: true, text: 'ok', model: 'gemini' })
                .mockResolvedValueOnce({ success: false, text: '', error: 'err', model: 'gemini' }),
        };
        const { service } = makeService(pm);
        const job = service.createJob(['a', 'b'], 'ja');
        const result = await service.executeJob(job.id);
        expect(result.status).toBe('completed');
    });

    it('handles translate() throwing an exception', async () => {
        const pm = { translate: vi.fn().mockRejectedValue(new Error('network error')) };
        const { service } = makeService(pm);
        const job = service.createJob(['a'], 'ja');
        const result = await service.executeJob(job.id);
        expect(result.items[0].status).toBe('failed');
        expect(result.items[0].error).toBe('network error');
    });

    it('throws when jobId does not exist', async () => {
        const { service } = makeService();
        await expect(service.executeJob('nonexistent')).rejects.toThrow('nonexistent');
    });
});

// ---------------------------------------------------------------------------
// cancelJob
// ---------------------------------------------------------------------------

describe('BatchTranslationService.cancelJob', () => {
    it('returns true and sets status=failed for a known job', () => {
        const { service } = makeService();
        const job = service.createJob(['a'], 'ja');
        expect(service.cancelJob(job.id)).toBe(true);
        expect(job.status).toBe('failed');
    });

    it('aborts the job AbortController', () => {
        const { service } = makeService();
        const job = service.createJob(['a'], 'ja');
        service.cancelJob(job.id);
        expect(job.abortController.signal.aborted).toBe(true);
    });

    it('returns false for an unknown jobId', () => {
        const { service } = makeService();
        expect(service.cancelJob('no-such-job')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// clearCompletedJobs
// ---------------------------------------------------------------------------

describe('BatchTranslationService.clearCompletedJobs', () => {
    it('removes completed jobs older than 24 hours', () => {
        const { service } = makeService();
        const job = service.createJob(['a'], 'ja');
        job.status = 'completed';
        job.completedAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago

        const removed = service.clearCompletedJobs();
        expect(removed).toBe(1);
        expect(service.getJob(job.id)).toBeUndefined();
    });

    it('keeps completed jobs newer than 24 hours', () => {
        const { service } = makeService();
        const job = service.createJob(['a'], 'ja');
        job.status = 'completed';
        job.completedAt = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago

        const removed = service.clearCompletedJobs();
        expect(removed).toBe(0);
        expect(service.getJob(job.id)).toBeDefined();
    });

    it('does not remove pending or processing jobs', () => {
        const { service } = makeService();
        const job = service.createJob(['a'], 'ja');
        // job.status is 'pending', no completedAt

        const removed = service.clearCompletedJobs();
        expect(removed).toBe(0);
        expect(service.getJob(job.id)).toBeDefined();
    });

    it('returns the count of removed jobs', () => {
        const { service } = makeService();
        for (let i = 0; i < 3; i++) {
            const j = service.createJob([`text${i}`], 'ja');
            j.status = 'completed';
            j.completedAt = Date.now() - 25 * 60 * 60 * 1000;
        }
        expect(service.clearCompletedJobs()).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// getAllJobs
// ---------------------------------------------------------------------------

describe('BatchTranslationService.getAllJobs', () => {
    it('returns all created jobs', () => {
        const { service } = makeService();
        service.createJob(['a'], 'ja');
        service.createJob(['b'], 'en');
        expect(service.getAllJobs()).toHaveLength(2);
    });
});
