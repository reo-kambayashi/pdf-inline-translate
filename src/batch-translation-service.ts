import { TranslationProviderManager } from './translation-provider-manager';
import { TranslationHistoryManager } from './translation-history-manager';
import { TranslationResult } from './translation-provider';
import { Editor, Notice } from 'obsidian';
import { splitTextForBatch } from './utils';
import { UIManager } from './ui/ui-manager';

export interface BatchTranslationItem {
    id: string;
    text: string;
    sourceLang?: string;
    translated?: string;
    error?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface BatchTranslationJob {
    id: string;
    items: BatchTranslationItem[];
    targetLang: string;
    createdAt: number;
    completedAt?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    results: TranslationResult[];
}

export class BatchTranslationService {
    private jobs: Map<string, BatchTranslationJob> = new Map();

    constructor(
        private providerManager: TranslationProviderManager,
        private historyManager: TranslationHistoryManager,
        private uiManager: UIManager,
    ) {}

    /**
     * Create a new batch translation job
     */
    createJob(texts: string[], targetLang: string): BatchTranslationJob {
        const jobId = this.generateId();
        const items: BatchTranslationItem[] = texts.map((text, index) => ({
            id: `${jobId}-${index}`,
            text,
            status: 'pending',
        }));

        const job: BatchTranslationJob = {
            id: jobId,
            items,
            targetLang,
            createdAt: Date.now(),
            status: 'pending',
            progress: 0,
            results: [],
        };

        this.jobs.set(jobId, job);
        return job;
    }

    /**
     * Execute a batch translation job
     */
    async executeJob(jobId: string, maxConcurrency: number = 3): Promise<BatchTranslationJob> {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }

        job.status = 'processing';
        const totalItems = job.items.length;
        let completedItems = 0;

        // Process items in batches to control concurrency
        for (let i = 0; i < job.items.length; i += maxConcurrency) {
            const batch = job.items.slice(i, i + maxConcurrency);

            // Process batch concurrently
            const promises = batch.map(async (item) => {
                if (job.status === 'failed') return; // Stop if job was cancelled

                try {
                    item.status = 'processing';
                    const result = await this.providerManager.translate(
                        item.text,
                        job.targetLang,
                        item.sourceLang,
                    );

                    if (result.success) {
                        item.translated = result.text;
                        item.status = 'completed';
                        job.results.push(result);

                        // Add to history
                        this.historyManager.addToHistory(
                            item.text,
                            result.text,
                            job.targetLang,
                            item.sourceLang,
                            result.model,
                        );
                    } else {
                        item.error = result.error || 'Unknown error';
                        item.status = 'failed';
                    }
                } catch (error) {
                    item.error = error.message || 'Translation failed';
                    item.status = 'failed';
                } finally {
                    completedItems++;
                    job.progress = Math.round((completedItems / totalItems) * 100);
                }
            });

            await Promise.all(promises);
        }

        job.status = 'completed';
        job.completedAt = Date.now();

        return job;
    }

    /**
     * Get a batch translation job by ID
     */
    getJob(jobId: string): BatchTranslationJob | undefined {
        return this.jobs.get(jobId);
    }

    /**
     * Get all batch translation jobs
     */
    getAllJobs(): BatchTranslationJob[] {
        return Array.from(this.jobs.values());
    }

    /**
     * Cancel a batch translation job
     */
    cancelJob(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (job) {
            job.status = 'failed'; // Use 'failed' status to indicate cancellation
            return true;
        }
        return false;
    }

    /**
     * Clear completed jobs
     */
    clearCompletedJobs(): number {
        const initialSize = this.jobs.size;
        const now = Date.now();

        // Remove jobs older than 24 hours that are completed
        for (const [jobId, job] of this.jobs) {
            if (
                job.status === 'completed' &&
                job.completedAt &&
                now - job.completedAt > 24 * 60 * 60 * 1000
            ) {
                this.jobs.delete(jobId);
            }
        }

        return initialSize - this.jobs.size;
    }

    /**
     * Generate a unique ID for a batch job
     */
    private generateId(): string {
        return `batch_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    }

    public initiateBatchTranslationFromEditor(editor: Editor, targetLanguage: string) {
        const selectedText = editor.getSelection();
        if (selectedText) {
            const segments = splitTextForBatch(selectedText);

            if (segments.length === 0) {
                new Notice('No text segments to translate');
                return;
            }

            if (segments.length === 1) {
                this.uiManager.openTranslationInPopup(segments[0], {});
                return;
            }

            const job = this.createJob(segments, targetLanguage);

            new Notice(`Starting batch translation of ${segments.length} segments...`);

            void this.executeJob(job.id, 2)
                .then((result) => {
                    new Notice(
                        `Batch translation completed: ${result.results.length} translations`,
                    );
                })
                .catch((error) => {
                    console.error('Batch translation failed:', error);
                    new Notice('Batch translation failed. See console for details.');
                });
        } else {
            new Notice('Please select text to translate in batch');
        }
    }
}
